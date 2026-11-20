import { CompanyClientService } from './company-client.service';
import { HttpStatus, Injectable } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import {
  AiRecommendationClientService,
  AiRecommendationCursorStaleError,
  AiRecommendationInvalidResponseError,
  AiRecommendationUnavailableError,
} from './ai-recommendation-client.service';
import { ApiException } from './common';
import {
  JobRecommendationFallbackReason,
  JobRecommendationItemDto,
  JobRecommendationQueryDto,
  JobRecommendationResultDto,
  JobRecommendationSource,
} from './job-recommendation.dto';
import { JobSearchItemDto } from './job-search.dto';
import {
  JobPreferenceState,
  JobRecommendationPreferences,
  ProfileRecommendationClientService,
  ProfileRecommendationUnavailableError,
} from './profile-recommendation-client.service';
import { PrismaService } from './prisma.service';

const RECOMMENDATION_JOB_SELECT = {
  id: true,
  companyId: true,
  title: true,
  description: true,
  salaryMin: true,
  salaryMax: true,
  isNegotiable: true,
  currency: true,
  location: true,
  jobType: true,
  experienceYears: true,
  skills: true,
  deadline: true,
  publishedAt: true,
} satisfies Prisma.JobSelect;

type RecommendationJob = Prisma.JobGetPayload<{
  select: typeof RECOMMENDATION_JOB_SELECT;
}>;

const LATEST_JOB_ORDER = [
  { publishedAt: { sort: 'desc' as const, nulls: 'last' as const } },
  { id: 'asc' as const },
] satisfies Prisma.JobOrderByWithRelationInput[];

// The AI API maps cosine distance [0, 2] into a score [1, 0].
const MIN_CV_MATCH = 0.68;
const CV_SHORTLIST_LIMIT = 50;
const PROFILE_SHORTLIST_LIMIT = 120;
const GENERIC_ROLE_WORDS = new Set(['nhan', 'vien', 'chuyen', 'ky', 'su', 'sinh', 'intern', 'junior', 'senior', 'hoc', 'student', 'staff']);

function normalizeMatchText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

function roleWords(value: string): string[] {
  return [...new Set((normalizeMatchText(value).match(/[\p{L}\p{N}+#]+/gu) ?? [])
    .filter(word => word.length >= 2 && !GENERIC_ROLE_WORDS.has(word)))];
}

@Injectable()
export class JobRecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfileRecommendationClientService,
    private readonly ai: AiRecommendationClientService,
    private readonly companies: CompanyClientService,
  ) {}

  isConfigured(): boolean {
    return this.ai.isConfigured();
  }

  async recommend(
    candidateId: string,
    authorization: string,
    query: JobRecommendationQueryDto,
    now = new Date(),
  ): Promise<JobRecommendationResultDto> {
    if (query.strategy === 'PROFILE_CV') {
      if (query.cursor !== undefined) this.throwCursorStale();
      return this.personalized(candidateId, authorization, query, now);
    }
    if (query.selectedCvId !== undefined) {
      throw new ApiException('VALIDATION_ERROR', 'CV selection requires PROFILE_CV', HttpStatus.BAD_REQUEST);
    }
    const isContinuation = query.cursor !== undefined;
    let cvId: string;
    try {
      const cv = await this.profiles.getPreferredCv(
        candidateId,
        authorization,
      );
      if (!cv) {
        if (isContinuation) this.throwCursorStale();
        return this.preferenceThenLatest(
          candidateId,
          authorization,
          query,
          JobRecommendationFallbackReason.NO_ACTIVE_CV,
          now,
        );
      }
      cvId = cv.cvId;
    } catch (error) {
      if (!(error instanceof ProfileRecommendationUnavailableError)) {
        throw error;
      }
      if (isContinuation) this.throwUnavailable();
      return this.preferenceThenLatest(
        candidateId,
        authorization,
        query,
        JobRecommendationFallbackReason.PROFILE_UNAVAILABLE,
        now,
      );
    }

    let recommendation;
    try {
      recommendation = await this.ai.recommendJobs(cvId, query);
    } catch (error) {
      if (error instanceof AiRecommendationCursorStaleError) {
        if (isContinuation) this.throwCursorStale();
        return this.preferenceThenLatest(
          candidateId,
          authorization,
          query,
          JobRecommendationFallbackReason.AI_RESPONSE_INVALID,
          now,
        );
      }
      if (error instanceof AiRecommendationInvalidResponseError) {
        if (isContinuation) this.throwUnavailable();
        return this.preferenceThenLatest(
          candidateId,
          authorization,
          query,
          JobRecommendationFallbackReason.AI_RESPONSE_INVALID,
          now,
        );
      }
      if (error instanceof AiRecommendationUnavailableError) {
        if (isContinuation) this.throwUnavailable();
        return this.preferenceThenLatest(
          candidateId,
          authorization,
          query,
          JobRecommendationFallbackReason.AI_UNAVAILABLE,
          now,
        );
      }
      throw error;
    }
    if (recommendation.items.length === 0) {
      if (recommendation.reason === null) {
        if (isContinuation) this.throwUnavailable();
        return this.preferenceThenLatest(
          candidateId,
          authorization,
          query,
          JobRecommendationFallbackReason.AI_RESPONSE_INVALID,
          now,
        );
      }
      if (isContinuation) this.throwCursorStale();
      return this.preferenceThenLatest(
        candidateId,
        authorization,
        query,
        JobRecommendationFallbackReason.AI_NOT_READY,
        now,
      );
    }

    const jobs = await this.prisma.job.findMany({
      select: RECOMMENDATION_JOB_SELECT,
      where: {
        ...await this.activeFilters(query, now),
        id: { in: recommendation.items.map(({ jobId }) => jobId) },
      },
    });
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const items = recommendation.items.flatMap(({ jobId, score }) => {
      const job = jobsById.get(jobId);
      return job ? [this.toItem(job, score)] : [];
    });
    if (items.length === 0) {
      if (isContinuation) this.throwCursorStale();
      return this.preferenceThenLatest(
        candidateId,
        authorization,
        query,
        JobRecommendationFallbackReason.AI_RESULTS_STALE,
        now,
      );
    }
    return {
      items,
      nextCursor: recommendation.nextCursor,
      source: JobRecommendationSource.AI,
      fallbackReason: null,
    };
  }

  private async personalized(
    candidateId: string,
    authorization: string,
    query: JobRecommendationQueryDto,
    now: Date,
  ): Promise<JobRecommendationResultDto> {
    const tolerateProfileUnavailable = (error: unknown): null => {
      if (error instanceof ProfileRecommendationUnavailableError) return null;
      throw error;
    };
    const [profile, selection, active] = await Promise.all([
      this.profiles.getMatchingProfile(candidateId, authorization).catch(tolerateProfileUnavailable),
      this.profiles.getCvSelection(candidateId, authorization, query.selectedCvId).catch(tolerateProfileUnavailable),
      this.activeFilters(query, now),
    ]);
    const cv = selection?.selected;
    if (query.selectedCvId && !selection) this.throwUnavailable();
    if (query.selectedCvId && !cv) {
      throw new ApiException('CV_NOT_FOUND', 'The selected CV is not available', HttpStatus.NOT_FOUND);
    }
    const cvCandidates = cv ? await this.ai.recommendJobs(cv.cvId, { ...query, limit: CV_SHORTLIST_LIMIT })
      .catch((error: unknown) => {
        if (error instanceof AiRecommendationUnavailableError || error instanceof AiRecommendationInvalidResponseError || error instanceof AiRecommendationCursorStaleError) return null;
        throw error;
      }) : null;
    const cvScores = new Map(cvCandidates?.items.map(({ jobId, score }) => [jobId, score]));
    const profileSkills = profile?.skills ?? [];
    const skillNames = new Set(profileSkills.map(normalizeMatchText));
    const profileRoles = profile?.roles ?? [];
    const roles = profileRoles.map(roleWords).filter(words => words.length > 0);
    const availableWeight = (cvScores.size ? 0.55 : 0) + (skillNames.size ? 0.3 : 0) + (roles.length ? 0.15 : 0);
    const skillVariants = [...new Set(profileSkills.flatMap(skill => [
      skill, skill.toLowerCase(), skill.toUpperCase(),
      skill.replace(/\b\p{L}/gu, letter => letter.toUpperCase()),
    ]))];
    const titleTerms = [...new Set([
      ...roles.flat(),
      ...profileRoles.flatMap(value => (value.normalize('NFC').match(/[\p{L}\p{N}+#]+/gu) ?? [])
        .filter(word => roleWords(word).length > 0)),
    ])];
    const profileFilters: Prisma.JobWhereInput[] = titleTerms.map(word => ({
      title: { contains: word, mode: 'insensitive' },
    }));
    if (skillVariants.length) profileFilters.push({ skills: { hasSome: skillVariants } });

    const [cvJobs, profileJobs] = await Promise.all([
      cvScores.size ? this.prisma.job.findMany({
        select: RECOMMENDATION_JOB_SELECT, where: { ...active, id: { in: [...cvScores.keys()] } },
      }) : [],
      profileFilters.length ? this.prisma.job.findMany({
        select: RECOMMENDATION_JOB_SELECT,
        where: { AND: [active, { OR: profileFilters }] },
        orderBy: LATEST_JOB_ORDER,
        take: PROFILE_SHORTLIST_LIMIT,
      }) : [],
    ]);
    const jobs = new Map([...cvJobs, ...profileJobs].map(job => [job.id, job]));
    const ranked = [...jobs.values()].flatMap(job => {
      const matched = [...new Map(job.skills.filter(skill => skillNames.has(normalizeMatchText(skill)))
        .map(skill => [normalizeMatchText(skill), skill])).values()];
      const title = new Set(roleWords(job.title));
      const role = roles.some(words => words.every(word => title.has(word)));
      const cvScore = cvScores.get(job.id) ?? 0;
      const cvMatch = cvScore >= MIN_CV_MATCH;
      if (!matched.length && !role && !cvMatch) return [];
      const skillCoverage = matched.length / Math.max(1, new Set(job.skills.map(normalizeMatchText)).size);
      const weight = (cvMatch ? 0.55 * cvScore : 0) + 0.3 * skillCoverage + (role ? 0.15 : 0);
      return [{ job, matched, role, cvMatch, weight }];
    }).sort((a, b) => b.weight - a.weight || b.matched.length - a.matched.length ||
      (b.job.publishedAt?.getTime() ?? 0) - (a.job.publishedAt?.getTime() ?? 0) || a.job.id.localeCompare(b.job.id));

    const limit = Math.min(3, query.limit);
    const matchedItems: JobRecommendationItemDto[] = ranked.slice(0, limit).map(({ job, matched, role, cvMatch, weight }) => ({
      ...this.toItem(job, Math.min(1, weight / availableWeight)),
      match: { skills: matched, role, cv: cvMatch },
    }));
    const remaining = limit - matchedItems.length;
    const supplementalJobs = remaining > 0 ? await this.prisma.job.findMany({
      select: RECOMMENDATION_JOB_SELECT,
      where: { ...active, id: { notIn: matchedItems.map(item => item.id) } },
      orderBy: LATEST_JOB_ORDER,
      take: remaining,
    }) : [];
    return {
      items: [...matchedItems, ...supplementalJobs.map(job => this.toItem(job, null))],
      nextCursor: null,
      source: matchedItems.some(item => item.match?.cv) ? JobRecommendationSource.AI
        : matchedItems.length ? JobRecommendationSource.PREFERENCES : JobRecommendationSource.LATEST,
      fallbackReason: !cv && !profileSkills.length && !roles.length ? JobRecommendationFallbackReason.NO_ACTIVE_CV : null,
      context: {
        cvTitle: cv?.title ?? null,
        selectedCvId: cv?.cvId ?? null,
        cvOptions: selection?.options ?? [],
        cvCompared: cvScores.size > 0,
        profileCompletion: profile?.completion ?? null,
        profileSkills,
      },
    };
  }

  private throwCursorStale(): never {
    throw new ApiException(
      'RECOMMENDATION_CURSOR_STALE',
      'Recommendation cursor is stale',
      HttpStatus.CONFLICT,
    );
  }

  private throwUnavailable(): never {
    throw new ApiException(
      'RECOMMENDATION_UNAVAILABLE',
      'Recommendation service is temporarily unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private async latest(
    query: JobRecommendationQueryDto,
    fallbackReason: JobRecommendationFallbackReason,
    now: Date,
  ): Promise<JobRecommendationResultDto> {
    const jobs = await this.prisma.job.findMany({
      select: RECOMMENDATION_JOB_SELECT,
      where: await this.activeFilters(query, now),
      orderBy: LATEST_JOB_ORDER,
      take: query.limit,
    });
    return {
      items: jobs.map((job) => this.toItem(job, null)),
      nextCursor: null,
      source: JobRecommendationSource.LATEST,
      fallbackReason,
    };
  }

  private async preferenceThenLatest(
    candidateId: string,
    authorization: string,
    query: JobRecommendationQueryDto,
    fallbackReason: JobRecommendationFallbackReason,
    now: Date,
  ): Promise<JobRecommendationResultDto> {
    let preferences: JobRecommendationPreferences;
    try {
      preferences = await this.profiles.getJobPreferences(
        candidateId,
        authorization,
      );
    } catch (error) {
      if (!(error instanceof ProfileRecommendationUnavailableError)) {
        throw error;
      }
      return this.latest(query, fallbackReason, now);
    }

    if (preferences.state !== JobPreferenceState.ENABLED) {
      return this.latest(query, fallbackReason, now);
    }
    const preferenceFilters = this.preferenceFilters(preferences, query);
    if (preferenceFilters.length === 0) {
      return this.latest(query, fallbackReason, now);
    }

    const baseFilters = await this.activeFilters(query, now);
    const result = await this.prisma.$transaction(async (transaction) => {
      const matching = await transaction.job.findMany({
        select: RECOMMENDATION_JOB_SELECT,
        where: {
          AND: [baseFilters, { OR: preferenceFilters }],
        },
        orderBy: LATEST_JOB_ORDER,
        take: query.limit,
      });
      if (matching.length === query.limit) {
        return { jobs: matching, hasPreferenceMatch: true };
      }

      const matchingIds = matching.map(({ id }) => id);
      const latest = await transaction.job.findMany({
        select: RECOMMENDATION_JOB_SELECT,
        where: matchingIds.length === 0
          ? baseFilters
          : {
            AND: [baseFilters, { id: { notIn: matchingIds } }],
          },
        orderBy: LATEST_JOB_ORDER,
        take: query.limit - matching.length,
      });
      return {
        jobs: [...matching, ...latest],
        hasPreferenceMatch: matching.length > 0,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });

    return {
      items: result.jobs.map((job) => this.toItem(job, null)),
      nextCursor: null,
      source: result.hasPreferenceMatch
        ? JobRecommendationSource.PREFERENCES
        : JobRecommendationSource.LATEST,
      fallbackReason,
    };
  }

  private preferenceFilters(
    preferences: JobRecommendationPreferences,
    query: JobRecommendationQueryDto,
  ): Prisma.JobWhereInput[] {
    const filters: Prisma.JobWhereInput[] = preferences.targetRoles.map(
      (role) => ({
        title: {
          equals: role,
          mode: Prisma.QueryMode.insensitive,
        },
      }),
    );

    if (query.location === undefined) {
      filters.push(...preferences.preferredLocations.map((location) => ({
        location: {
          equals: location,
          mode: Prisma.QueryMode.insensitive,
        },
      })));
    }
    if (
      query.jobType === undefined &&
      preferences.preferredJobTypes.length > 0
    ) {
      filters.push({
        jobType: { in: [...preferences.preferredJobTypes] },
      });
    }
    if (
      query.salaryMin === undefined &&
      preferences.minimumSalary !== null
    ) {
      filters.push({
        OR: [
          { isNegotiable: true },
          {
            currency: 'VND',
            salaryMax: {
              gte: new Prisma.Decimal(preferences.minimumSalary),
            },
          },
        ],
      });
    }
    return filters;
  }

  private async activeFilters(
    query: JobRecommendationQueryDto,
    now: Date,
  ): Promise<Prisma.JobWhereInput> {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    return {
      status: JobStatus.PUBLISHED,
      isSuspended: false,
      companyId: { notIn: await this.companies.suspendedCompanyIds() },
      deadline: { gte: today },
      ...(query.location !== undefined
        ? {
          location: {
            equals: query.location,
            mode: Prisma.QueryMode.insensitive,
          },
        }
        : {}),
      ...(query.salaryMin !== undefined
        ? {
          OR: [
            { isNegotiable: true },
            { salaryMax: { gte: query.salaryMin } },
          ],
        }
        : {}),
      ...(query.jobType !== undefined
        ? { jobType: query.jobType }
        : {}),
    };
  }

  private toItem(
    job: RecommendationJob,
    score: number | null,
  ): JobSearchItemDto {
    return {
      id: job.id,
      companyId: job.companyId,
      title: job.title,
      description: job.description,
      salaryMin: job.salaryMin?.toString() ?? null,
      salaryMax: job.salaryMax?.toString() ?? null,
      isNegotiable: job.isNegotiable,
      currency: job.currency,
      location: job.location,
      jobType: job.jobType,
      experienceYears: job.experienceYears,
      skills: job.skills,
      deadline: job.deadline.toISOString().slice(0, 10),
      publishedAt: job.publishedAt?.toISOString() ?? null,
      companyName: null,
      score,
    };
  }
}
