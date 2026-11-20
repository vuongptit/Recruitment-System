export type PublicJobSearchSort = "RELEVANCE" | "NEWEST" | "SALARY_DESC";
export type PublicJobTypeFilter = "" | "FULL_TIME" | "PART_TIME" | "REMOTE" | "INTERNSHIP";
export const jobSearchExperienceBands = {
  "0": "Không yêu cầu kinh nghiệm",
  "1": "1 năm",
  "2": "2 năm",
  "3": "3 năm",
  "4": "4 năm",
  "5_PLUS": "Từ 5 năm trở lên",
} as const;
type ExperienceBand = keyof typeof jobSearchExperienceBands;

export interface PublicJobSearchForm {
  q: string;
  location: string;
  salaryMin: string;
  salaryMax: string;
  skills: string;
  experienceYears: string;
  experienceBand: "" | ExperienceBand;
  jobType: PublicJobTypeFilter;
  sort: PublicJobSearchSort;
}

export interface PublicJobSearchFilters {
  q?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: "VND";
  skills?: string[];
  experienceYears?: number;
  experienceBand?: ExperienceBand;
  jobType?: Exclude<PublicJobTypeFilter, "">;
  sort: PublicJobSearchSort;
}

export const emptyPublicJobSearchForm: PublicJobSearchForm = {
  q: "",
  location: "",
  salaryMin: "",
  salaryMax: "",
  skills: "",
  experienceYears: "",
  experienceBand: "",
  jobType: "",
  sort: "RELEVANCE",
};

export function validatePublicJobSearch(values: PublicJobSearchForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!["", "FULL_TIME", "PART_TIME", "REMOTE", "INTERNSHIP"].includes(values.jobType)) errors.jobType = "Chọn hình thức tuyển dụng hợp lệ.";
  const salaryMin = values.salaryMin.trim() ? Number(values.salaryMin) : undefined;
  const salaryMax = values.salaryMax.trim() ? Number(values.salaryMax) : undefined;
  if (
    (salaryMin !== undefined && (!Number.isFinite(salaryMin) || salaryMin < 0)) ||
    (salaryMax !== undefined && (!Number.isFinite(salaryMax) || salaryMax < 0)) ||
    (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax)
  ) {
    errors.salary = "Khoảng lương phải là số không âm và mức tối thiểu không lớn hơn tối đa.";
  }
  const skills = values.skills.split(",").map((value) => value.normalize("NFKC").trim()).filter(Boolean);
  if (skills.length > 50) errors.skills = "Chỉ được lọc tối đa 50 kỹ năng.";
  if (values.experienceYears.trim()) {
    const years = Number(values.experienceYears);
    if (!Number.isInteger(years) || years < 0 || years > 60) errors.experienceYears = "Kinh nghiệm phải là số nguyên từ 0 đến 60.";
  }
  if (values.experienceBand && !Object.hasOwn(jobSearchExperienceBands, values.experienceBand)) errors.experienceBand = "Chọn mốc kinh nghiệm hợp lệ.";
  if (values.q.trim().length > 200) errors.q = "Từ khóa tối đa 200 ký tự.";
  if (values.location.trim().length > 255) errors.location = "Địa điểm tối đa 255 ký tự.";
  return errors;
}

export function normalizePublicJobSearch(values: PublicJobSearchForm): PublicJobSearchFilters {
  const filters: PublicJobSearchFilters = { sort: values.sort };
  const q = values.q.normalize("NFKC").trim();
  const location = values.location.normalize("NFKC").trim();
  const skills = [...new Set(values.skills.split(",").map((value) => value.normalize("NFKC").trim()).filter(Boolean))];
  if (q) filters.q = q;
  if (location) filters.location = location;
  if (values.salaryMin.trim()) filters.salaryMin = Number(values.salaryMin);
  if (values.salaryMax.trim()) filters.salaryMax = Number(values.salaryMax);
  if (filters.salaryMin !== undefined || filters.salaryMax !== undefined) filters.salaryCurrency = "VND";
  if (skills.length) filters.skills = skills;
  if (values.experienceBand) filters.experienceBand = values.experienceBand;
  else if (values.experienceYears.trim()) filters.experienceYears = Number(values.experienceYears);
  if (values.jobType) filters.jobType = values.jobType;
  return filters;
}

export function publicJobSearchScope(filters: PublicJobSearchFilters, limit: number): string {
  return JSON.stringify({ ...filters, limit });
}

export function isOffsetWindowTooDeep(page: number, limit: number): boolean {
  return page * limit > 10_000;
}

export function mergePublicJobPage<T extends { id: string }>(
  current: T[],
  incoming: T[],
  continuation: boolean,
): T[] {
  if (!continuation) return incoming;
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export function readJobSearchQuery(query: URLSearchParams) {
  const form = { ...emptyPublicJobSearchForm };
  form.q = (query.get("q") ?? "").slice(0, 200);
  form.location = (query.get("location") ?? "").slice(0, 255);
  form.skills = (query.get("skills") ?? "").slice(0, 2000);
  form.salaryMin = (query.get("salaryMin") ?? "").slice(0, 30);
  form.salaryMax = (query.get("salaryMax") ?? "").slice(0, 30);
  form.experienceYears = (query.get("experienceYears") ?? "").slice(0, 3);
  form.experienceBand = (query.get("experienceBand") ?? "") as PublicJobSearchForm["experienceBand"];
  form.jobType = (query.get("jobType") ?? "") as PublicJobTypeFilter;
  const sort = query.get("sort");
  if (sort === "NEWEST" || sort === "SALARY_DESC") form.sort = sort;
  for (const key of Object.keys(validatePublicJobSearch(form))) {
    if (key === "salary") { form.salaryMin = ""; form.salaryMax = ""; }
    else if (key === "jobType" || key === "experienceYears" || key === "experienceBand" || key === "skills") form[key] = "";
  }
  const requestedLimit = Number(query.get("limit"));
  const limit = [5, 10, 20, 50].includes(requestedLimit) ? requestedLimit : 10;
  const mode = query.get("mode") === "CURSOR" ? "CURSOR" as const : "OFFSET" as const;
  const requestedPage = Number(query.get("page"));
  const page = mode === "OFFSET" && Number.isInteger(requestedPage) && requestedPage >= 1 && !isOffsetWindowTooDeep(requestedPage, limit) ? requestedPage : 1;
  const hasSearchCriteria = Boolean(form.q || form.jobType || form.skills || form.salaryMin || form.salaryMax || form.experienceYears || form.experienceBand);
  const searched = query.get("search") === "1" || hasSearchCriteria || Boolean(form.location && query.get("browse") !== "1");
  return { form, limit, mode, page, searched };
}

export function jobSearchHref(filters: PublicJobSearchFilters, mode: "CURSOR" | "OFFSET", page: number, limit: number, searched: boolean) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || (key === "sort" && value === "RELEVANCE")) continue;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  if (mode === "CURSOR") query.set("mode", mode);
  if (page > 1 && mode === "OFFSET") query.set("page", String(page));
  if (limit !== 10) query.set("limit", String(limit));
  if (searched) query.set("search", "1");
  else if (filters.location) query.set("browse", "1");
  return `/candidate/jobs${query.size ? `?${query}` : ""}`;
}
