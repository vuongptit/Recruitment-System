import { JobStatus, JobType } from '@prisma/client';
import { AiRecommendationClientService } from './ai-recommendation-client.service';
import { CompanyClientService } from './company-client.service';
import { JobRecommendationService } from './job-recommendation.service';
import { PrismaService } from './prisma.service';
import { ProfileRecommendationClientService } from './profile-recommendation-client.service';

const now = new Date('2026-11-20T00:00:00Z');

function listing(id: string, title: string, skills: string[]) {
  return {
    id, title, skills, companyId: 'company', description: title, location: 'Hà Nội',
    jobType: JobType.FULL_TIME, experienceYears: 2,
    salaryMin: null, salaryMax: null, isNegotiable: true, currency: 'VND',
    deadline: new Date('2099-12-31'), publishedAt: now,
  };
}

describe('JobRecommendationService personalized shortlist', () => {
  const findMany = jest.fn();
  const getMatchingProfile = jest.fn();
  const getCvSelection = jest.fn();
  const recommendJobs = jest.fn();
  const service = new JobRecommendationService(
    { job: { findMany } } as unknown as PrismaService,
    { getMatchingProfile, getCvSelection } as unknown as ProfileRecommendationClientService,
    { recommendJobs } as unknown as AiRecommendationClientService,
    { suspendedCompanyIds: async () => ['suspended-company'] } as unknown as CompanyClientService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('promotes evidence shared by the CV and profile, and omits weak AI items', async () => {
    const combined = listing('combined', 'Java Backend Developer', ['Java', 'Spring Boot']);
    const cvOnly = listing('cv-only', 'Platform Engineer', ['Kubernetes']);
    const profileOnly = listing('profile-only', 'Java Developer', ['Java', 'Docker']);
    const unrelated = listing('unrelated', 'Marketing Manager', ['Marketing']);
    getMatchingProfile.mockResolvedValue({ roles: ['Java Backend'], skills: ['java', 'Spring Boot'], completion: 70 });
    const options = [{ id: 'cv', title: 'backend.pdf' }, { id: 'other-cv', title: 'other.pdf' }];
    getCvSelection.mockResolvedValue({ selected: { cvId: 'cv', title: 'backend.pdf' }, options });
    recommendJobs.mockResolvedValue({ items: [
      { jobId: cvOnly.id, score: 0.9 },
      { jobId: combined.id, score: 0.76 },
      { jobId: unrelated.id, score: 0.58 },
    ] });
    findMany.mockResolvedValueOnce([cvOnly, combined, unrelated]).mockResolvedValueOnce([profileOnly, combined]);

    const result = await service.recommend('candidate', 'Bearer test', { strategy: 'PROFILE_CV', limit: 3, selectedCvId: 'cv' }, now);
    expect(getCvSelection).toHaveBeenCalledWith('candidate', 'Bearer test', 'cv');
    expect(recommendJobs).toHaveBeenCalledWith('cv', expect.objectContaining({ limit: 50 }));
    expect(result.items.map(item => item.id)).toEqual(['combined', 'cv-only', 'profile-only']);
    expect(result.items[0].match).toEqual({ cv: true, role: true, skills: ['Java', 'Spring Boot'] });
    expect(result.items[2]).toMatchObject({ score: 0.15, match: { cv: false, skills: ['Java'] } });
    expect(result.context).toEqual({ cvTitle: 'backend.pdf', selectedCvId: 'cv', cvOptions: options, cvCompared: true, profileCompletion: 70, profileSkills: ['java', 'Spring Boot'] });
    expect(result.nextCursor).toBeNull();
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: JobStatus.PUBLISHED, isSuspended: false, companyId: { notIn: ['suspended-company'] } });
  });

  it('fills the list with up to three eligible recent jobs when evidence is missing', async () => {
    getMatchingProfile.mockResolvedValue(null);
    getCvSelection.mockResolvedValue({ selected: null, options: [] });
    findMany.mockResolvedValue([listing('recent', 'New Job', ['Python'])]);
    const result = await service.recommend('candidate', 'Bearer test', { strategy: 'PROFILE_CV', limit: 3 }, now);
    expect(result.items).toMatchObject([{ id: 'recent', score: null }]);
    expect(result.source).toBe('LATEST');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3, where: expect.objectContaining({ status: JobStatus.PUBLISHED, isSuspended: false }) }));
    expect(recommendJobs).not.toHaveBeenCalled();
  });

  it('appends new jobs after matches and excludes jobs already selected', async () => {
    getMatchingProfile.mockResolvedValue({ roles: [], skills: ['Java'], completion: 80 });
    getCvSelection.mockResolvedValue({ selected: null, options: [] });
    findMany.mockResolvedValueOnce([listing('match', 'Java Developer', ['Java'])])
      .mockResolvedValueOnce([listing('new-1', 'Designer', []), listing('new-2', 'Sales', [])]);
    const result = await service.recommend('candidate', 'Bearer test', { strategy: 'PROFILE_CV', limit: 3 }, now);
    expect(result.items.map(({ id, score }) => [id, score])).toEqual([['match', 1], ['new-1', null], ['new-2', null]]);
    expect(findMany.mock.calls[1][0]).toMatchObject({ take: 2, where: { id: { notIn: ['match'] } } });
  });

  it('rejects an explicit CV outside the current candidate’s active list before calling AI', async () => {
    getMatchingProfile.mockResolvedValue(null);
    getCvSelection.mockResolvedValue({ selected: null, options: [{ id: 'mine', title: 'my-cv.pdf' }] });
    await expect(service.recommend('candidate', 'Bearer test', {
      strategy: 'PROFILE_CV', limit: 3, selectedCvId: 'foreign-cv',
    }, now)).rejects.toMatchObject({ status: 404 });
    expect(recommendJobs).not.toHaveBeenCalled();
  });
});
