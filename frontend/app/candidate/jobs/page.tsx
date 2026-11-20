"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount } from "@/components/SessionGate";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui";
import { ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { LocationPicker } from "@/components/discovery/LocationPicker";
import discovery from "@/components/discovery/Discovery.module.css";
import styles from "./JobSearch.module.css";
import { SearchJobCard, SearchSkeleton, useJobSearchActivity } from "./JobSearchPanels";
import { formatSalaryMillions, JobSalaryRange } from "./JobSalaryRange";
import { jobTypeLabel } from "@/lib/recruitmentLabels";
import { ApiClientError, toUserMessage } from "../../../lib/apiClient";
import { cursorRestartView } from "../../../lib/cursorRecovery";
import {
  emptyPublicJobSearchForm,
  isOffsetWindowTooDeep,
  jobSearchExperienceBands,
  jobSearchHref,
  mergePublicJobPage,
  normalizePublicJobSearch,
  publicJobSearchScope,
  readJobSearchQuery,
  validatePublicJobSearch,
  type PublicJobSearchFilters,
  type PublicJobSearchForm,
} from "../../../lib/publicJobSearch";
import { canLoadMoreRecommendations, mergeRecommendationPage, recommendationFallbackView, recommendationSourceView } from "../../../lib/recommendationPresentation";
import {
  type Job,
  type JobRecommendation,
  type PublicCompanyProfile,
  type RecommendationSource,
  type SearchMode,
  getPublicCompany,
  getPublicJobs,
  isDemoPerson2Api,
  type FallbackReason,
  getRecommendationsForCandidate,
} from "../../../lib/person2Api";

function RecommendationCard({
  item,
  loading,
  onRetry,
}: {
  item: JobRecommendation;
  loading: boolean;
  onRetry: () => void;
}) {
  const source = recommendationSourceView(item.source);
  const fallback = recommendationFallbackView(item.fallbackReason);
  return (
    <article className="card recommendation-card">
      <div className="section-head row-between"><Link href={`/candidate/jobs/${item.id}?source=${item.source === "AI" ? "AI_RECOMMENDATION" : "SEARCH"}`}><strong>{item.title}</strong></Link><StatusBadge tone={source.tone}>{source.label}</StatusBadge></div>
      <p className="help">{source.description}</p>
      {item.source === "AI" ? <p className="help">Mức phù hợp {item.matchPercent}%</p> : null}
      <Link className="btn btn-secondary" href={`/candidate/jobs/${item.id}?source=${item.source === "AI" ? "AI_RECOMMENDATION" : "SEARCH"}`}>Xem việc làm</Link>
      {fallback ? (
        <section className="recommendation-fallback" aria-label="Thông tin nguồn gợi ý dự phòng">
          <strong>{fallback.title}</strong>
          <p>{fallback.description}</p>
          {fallback.action === "UPLOAD_CV" ? (
            <Link className="btn btn-secondary" href="/candidate/profile/cvs">{fallback.actionLabel}</Link>
          ) : (
            <button className="btn btn-secondary" type="button" disabled={loading} onClick={onRetry}>{loading ? "Đang làm mới…" : fallback.actionLabel}</button>
          )}
        </section>
      ) : null}
    </article>
  );
}

function WatchSearchUrl({ onChange }: { onChange: (query: string) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => { onChange(query); }, [query, onChange]);
  return null;
}

export default function CandidateJobsPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const account = useCurrentAccount();
  const canRecommend = isDemoPerson2Api || account?.role === "CANDIDATE";
  const activity = useJobSearchActivity(account?.role === "CANDIDATE" ? account.id : isDemoPerson2Api ? "demo-candidate" : undefined, account === null && !isDemoPerson2Api);
  const routeQuery = new URLSearchParams(Object.fromEntries(
    Object.entries(searchParams).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []),
  )).toString();
  const [initial] = useState(() => readJobSearchQuery(new URLSearchParams(routeQuery)));
  const [recommendationFallback, setRecommendationFallback] = useState<FallbackReason | undefined>();
  const [form, setForm] = useState<PublicJobSearchForm>(initial.form);
  const [filters, setFilters] = useState<PublicJobSearchFilters>(() => normalizePublicJobSearch(form));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(() => initial.searched || !!(initial.form.q || initial.form.location));
  const [mode, setMode] = useState<SearchMode>(initial.mode);
  const [page, setPage] = useState(initial.page);
  const [limit, setLimit] = useState(initial.limit);
  const [wide, setWide] = useState(false);
  const [companies, setCompanies] = useState<Record<string, PublicCompanyProfile>>({});
  const companyRequests = useRef(new Map<string, AbortController>());
  const [searchRevision, setSearchRevision] = useState(0);
  const filtersDialogRef = useRef<HTMLDialogElement>(null);
  const lastQuery = useRef(routeQuery);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tooDeep, setTooDeep] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [recs, setRecs] = useState<JobRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [searchRestartNotice, setSearchRestartNotice] = useState("");
  const [recommendationRestartNotice, setRecommendationRestartNotice] = useState("");
  const [recommendationReloadKey, setRecommendationReloadKey] = useState(0);
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const [recommendationCursor, setRecommendationCursor] = useState<string | null>(null);
  const [nextRecommendationCursor, setNextRecommendationCursor] = useState<string | null>(null);
  const [recommendationSource, setRecommendationSource] = useState<RecommendationSource | null>(null);
  const searchRestartedRef = useRef(false);
  const recommendationRestartedRef = useRef(false);
  const restoreListFocusRef = useRef(false);
  const jobListRef = useRef<HTMLElement>(null);
  const cardListRef = useRef<HTMLDivElement>(null);
  const recommendationSentinelRef = useRef<HTMLDivElement>(null);
  const scope = useMemo(() => publicJobSearchScope(filters, limit), [filters, limit]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 980px)");
    function resize() {
      setWide(desktop.matches);
      if (desktop.matches) setFiltersOpen(false);
    }
    resize();
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);

  const syncSearchUrl = useCallback((query: string) => {
    if (lastQuery.current === query) return;
    lastQuery.current = query;
    setSearchRevision(value => value + 1);
  }, []);

  useEffect(() => { if (filtersOpen) filtersDialogRef.current?.showModal(); }, [filtersOpen]);

  useEffect(() => {
    if (!searchRevision) return;
    const next = readJobSearchQuery(new URLSearchParams(window.location.search));
    resetTraversal();
    setForm(next.form);
    setFormErrors({});
    setFiltersOpen(false);
    setHasSearched(next.searched || !!(next.form.q || next.form.location));
    setMode(next.mode);
    setPage(next.page);
    setLimit(next.limit);
    setFilters(normalizePublicJobSearch(next.form));
  }, [searchRevision]);

  const loadCompany = useCallback((companyId: string) => {
    if (companyRequests.current.has(companyId)) return;
    const controller = new AbortController();
    companyRequests.current.set(companyId, controller);
    getPublicCompany(companyId, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted && data) setCompanies(current => ({ ...current, [companyId]: data }));
    }).catch(() => { /* Company data is optional in the job search. */ });
  }, []);

  useEffect(() => {
    const requests = companyRequests.current;
    return () => { requests.forEach(request => request.abort()); requests.clear(); };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.getAttribute("data-company-id");
        if (id) loadCompany(id);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "120px" });
    cardListRef.current?.querySelectorAll("[data-company-id]").forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [jobs, loadCompany]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const continuation = mode === "CURSOR" && Boolean(cursor);
    setLoading(true);
    setError("");
    setTooDeep(false);
    getPublicJobs({ ...filters, mode, page, limit, cursor }, controller.signal)
      .then((response) => {
        if (!active) return;
        setJobs((current) => mergePublicJobPage(current, response.data, continuation));
        setHasMore(Boolean(response.meta?.hasMore));
        setNextCursor(response.meta?.nextCursor ?? null);
        setTotal(Number(response.meta?.total ?? 0));
        searchRestartedRef.current = false;
        if (restoreListFocusRef.current) {
          restoreListFocusRef.current = false;
          requestAnimationFrame(() => {
            const list = jobListRef.current;
            if (!list) return;
            list.scrollTo({ top: 0 });
            list.focus({ preventScroll: true });
            const bounds = list.getBoundingClientRect();
            if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) list.scrollIntoView({ block: "start" });
          });
        }
      })
      .catch((reason: unknown) => {
        if (!active || (reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) return;
        if (reason instanceof ApiClientError && reason.code === "JOB_SEARCH_PAGE_TOO_DEEP") {
          setTooDeep(true);
        } else if (reason instanceof ApiClientError && cursorRestartView(reason.code)?.code === "JOB_SEARCH_CURSOR_STALE" && !searchRestartedRef.current) {
          searchRestartedRef.current = true;
          restoreListFocusRef.current = true;
          setSearchRestartNotice(cursorRestartView(reason.code)?.message ?? "");
          setCursor(null);
          setPage(1);
          setNextCursor(null);
          setHasMore(false);
          if (!cursor) setReloadKey((value) => value + 1);
        } else {
          setError(toUserMessage(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [scope, filters, mode, page, limit, cursor, reloadKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!canRecommend) {
      setRecs([]);
      setRecommendationLoading(false);
      setRecommendationError("");
      setNextRecommendationCursor(null);
      return;
    }
    const continuation = Boolean(recommendationCursor);
    setRecommendationLoading(true);
    setRecommendationError("");
    getRecommendationsForCandidate({ cursor: recommendationCursor, limit: 10 }, controller.signal)
      .then((response) => {
        if (!active) return;
        const source = (response.meta?.source as RecommendationSource | undefined) ?? response.data[0]?.source ?? "LATEST";
        const candidateCursor = response.meta?.nextCursor ?? null;
        setRecs((current) => mergeRecommendationPage(current, response.data, continuation));
        setRecommendationSource(source);
        setRecommendationFallback(response.meta?.fallbackReason as FallbackReason | undefined);
        setNextRecommendationCursor(canLoadMoreRecommendations(source, candidateCursor) ? candidateCursor : null);
        recommendationRestartedRef.current = false;
      })
      .catch((reason: unknown) => {
        if (!active || (reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) return;
        const restart = reason instanceof ApiClientError ? cursorRestartView(reason.code) : null;
        if (restart?.code === "RECOMMENDATION_CURSOR_STALE" && !recommendationRestartedRef.current) {
          recommendationRestartedRef.current = true;
          setRecommendationRestartNotice(restart.message);
          setRecommendationCursor(null);
          setNextRecommendationCursor(null);
          if (!recommendationCursor) setRecommendationReloadKey((value) => value + 1);
          return;
        }
        setRecommendationError(toUserMessage(reason));
      })
      .finally(() => {
        if (active) setRecommendationLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [canRecommend, recommendationCursor, recommendationReloadKey]);

  const canLoadMoreRecommendation = canLoadMoreRecommendations(recommendationSource, nextRecommendationCursor);

  useEffect(() => {
    const sentinel = recommendationSentinelRef.current;
    if (!sentinel || !canLoadMoreRecommendation || recommendationLoading || !nextRecommendationCursor) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setRecommendationCursor(nextRecommendationCursor);
    }, { rootMargin: "160px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMoreRecommendation, nextRecommendationCursor, recommendationLoading]);

  function change<K extends keyof PublicJobSearchForm>(field: K, value: PublicJobSearchForm[K]) {
    setForm((current) => ({ ...current, [field]: value, ...(field === "experienceBand" ? { experienceYears: "" } : {}) }));
    setFormErrors((current) => {
      if (!(field in current) && !(field === "salaryMin" || field === "salaryMax")) return current;
      const next = { ...current };
      delete next[field];
      if (field === "salaryMin" || field === "salaryMax") delete next.salary;
      return next;
    });
  }

  function resetTraversal() {
    searchRestartedRef.current = false;
    restoreListFocusRef.current = false;
    setSearchRestartNotice("");
    setPage(1);
    setCursor(null);
    setNextCursor(null);
    setJobs([]);
    setHasMore(false);
    setTooDeep(false);
  }

  function updateUrl(nextFilters: PublicJobSearchFilters, nextMode = mode, nextPage = 1, nextLimit = limit, searched = hasSearched) {
    const href = jobSearchHref(nextFilters, nextMode, nextPage, nextLimit, searched);
    if (href === window.location.pathname + window.location.search) return;
    window.history.pushState(null, "", href);
    lastQuery.current = new URLSearchParams(window.location.search).toString();
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>, advanced = false) {
    event.preventDefault();
    const hasCriterion = Boolean(form.q.trim() || form.location.trim());
    const nextForm: PublicJobSearchForm = advanced ? form : {
      ...emptyPublicJobSearchForm, q: form.q, location: form.location, sort: filters.sort,
      ...(hasCriterion ? {
        salaryMin: String(filters.salaryMin ?? ""), salaryMax: String(filters.salaryMax ?? ""),
        jobType: filters.jobType ?? "", skills: filters.skills?.join(", ") ?? "", experienceYears: String(filters.experienceYears ?? ""),
        experienceBand: filters.experienceBand ?? "",
      } : {}),
    };
    const errors = validatePublicJobSearch(nextForm);
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      const invalidField = Object.keys(errors)[0];
      requestAnimationFrame(() => document.getElementById(invalidField === "salary" ? "salaryMin" : invalidField)?.focus());
      return;
    }
    resetTraversal();
    setForm(nextForm);
    const nextFilters = normalizePublicJobSearch(nextForm);
    setFilters(nextFilters);
    updateUrl(nextFilters, mode, 1, limit, true);
    setHasSearched(true);
    restoreListFocusRef.current = true;
    setReloadKey((value) => value + 1);
    if (advanced) filtersDialogRef.current?.close();
  }

  function changeMode(nextMode: SearchMode) {
    if (nextMode === mode) return;
    resetTraversal();
    setMode(nextMode);
    updateUrl(filters, nextMode);
  }

  function changeLimit(nextLimit: number) {
    if (nextLimit === limit) return;
    resetTraversal();
    setLimit(nextLimit);
    updateUrl(filters, mode, 1, nextLimit);
  }

  function resetFilters(clearSearch = false) {
    filtersDialogRef.current?.close();
    const nextForm = clearSearch ? emptyPublicJobSearchForm : { ...emptyPublicJobSearchForm, q: filters.q ?? "", location: filters.location ?? "" };
    if (clearSearch) setHasSearched(false);
    setForm(nextForm);
    setFormErrors({});
    resetTraversal();
    const nextFilters = normalizePublicJobSearch(nextForm);
    setFilters(nextFilters);
    updateUrl(nextFilters, mode, 1, limit, !clearSearch);
    setReloadKey((value) => value + 1);
  }

  function switchToCursor() {
    changeMode("CURSOR");
  }

  function restartRecommendations() {
    recommendationRestartedRef.current = false;
    setRecommendationCursor(null);
    setNextRecommendationCursor(null);
    setRecommendationRestartNotice("");
    setRecommendationReloadKey((value) => value + 1);
  }

  const nextOffsetTooDeep = mode === "OFFSET" && isOffsetWindowTooDeep(page + 1, limit);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const activeFilters: { field: Exclude<keyof PublicJobSearchForm, "sort">; label: string }[] = [];
  if (filters.q) activeFilters.push({ field: "q", label: filters.q });
  if (filters.location) activeFilters.push({ field: "location", label: filters.location });
  if (filters.jobType) activeFilters.push({ field: "jobType", label: jobTypeLabel(filters.jobType) });
  if (filters.salaryMin !== undefined) activeFilters.push({ field: "salaryMin", label: `Lương từ ${formatSalaryMillions(filters.salaryMin)} triệu VNĐ` });
  if (filters.salaryMax !== undefined) activeFilters.push({ field: "salaryMax", label: `Lương đến ${formatSalaryMillions(filters.salaryMax)} triệu VNĐ` });
  if (filters.skills?.length) activeFilters.push({ field: "skills", label: filters.skills.join(", ") });
  if (filters.experienceBand) activeFilters.push({ field: "experienceBand", label: jobSearchExperienceBands[filters.experienceBand] });
  else if (filters.experienceYears !== undefined) activeFilters.push({ field: "experienceYears", label: filters.experienceYears === 0 ? jobSearchExperienceBands["0"] : `Kinh nghiệm 0–${filters.experienceYears} năm` });
  const advancedFilters = activeFilters.filter(item => item.field !== "q" && item.field !== "location");
  const showFilters = activeFilters.length > 0;

  function removeFilter(field: Exclude<keyof PublicJobSearchForm, "sort">) {
    setForm(current => ({ ...current, [field]: emptyPublicJobSearchForm[field] }));
    setFormErrors({});
    const next = { ...filters };
    delete next[field];
    if (next.salaryMin === undefined && next.salaryMax === undefined) delete next.salaryCurrency;
    setFilters(next);
    updateUrl(next);
    resetTraversal();
    setReloadKey(value => value + 1);
    restoreListFocusRef.current = true;
  }

  function sortBy(sort: PublicJobSearchForm["sort"]) {
    if (filters.sort === sort) return;
    const next = { ...filters, sort };
    setForm(current => ({ ...current, sort }));
    setFilters(next);
    resetTraversal();
    updateUrl(next);
  }

  function changePage(next: number) {
    setPage(next);
    restoreListFocusRef.current = true;
    updateUrl(filters, mode, next);
    const list = jobListRef.current;
    if (list && list.getBoundingClientRect().top < 72) list.scrollIntoView({ block: "start" });
  }

  const searchHref = jobSearchHref(filters, mode, page, limit, hasSearched);
  const detailHref = (jobId: string) => `/candidate/jobs/${jobId}?${new URLSearchParams({ from: searchHref })}`;

  const filterForm = <form className={styles.filterForm} noValidate onSubmit={event => applyFilters(event, true)}>
    <fieldset className={styles.types}>
      <legend>Hình thức làm việc</legend>
      {([["", "Tất cả"], ["FULL_TIME", "Toàn thời gian"], ["PART_TIME", "Bán thời gian"], ["INTERNSHIP", "Thực tập"], ["REMOTE", "Làm việc từ xa"]] as const).map(([value, label]) =>
        <label key={value}><input type="radio" name="jobType" value={value} checked={form.jobType === value} onChange={() => change("jobType", value)} />{label}</label>)}
    </fieldset>
    <fieldset className={styles.types}>
      <legend>Kinh nghiệm</legend>
      {(["", "0", "1", "2", "3", "4", "5_PLUS"] as const).map(value =>
        <label key={value}><input type="radio" name="experiencePreset" value={value} checked={form.experienceBand === value && (value !== "" || !form.experienceYears)} onChange={() => change("experienceBand", value)} />{value === "" ? "Tất cả" : jobSearchExperienceBands[value]}</label>)}
    </fieldset>
    <JobSalaryRange minimum={form.salaryMin} maximum={form.salaryMax} onChange={change} error={formErrors.salary} />
    <details className={styles.displayOptions} open={formErrors.skills ? true : undefined}>
      <summary>Kỹ năng<ChevronDown size={15} aria-hidden="true" /></summary>
      <div className={styles.filterGroup}>
      <label className="label" htmlFor="skills">Kỹ năng</label>
      <input id="skills" className="input" value={form.skills} onChange={event => change("skills", event.target.value)} aria-invalid={!!formErrors.skills} aria-describedby={formErrors.skills ? "skills-error" : "skills-help"} placeholder="Ví dụ: React, Java" />
      <span id="skills-help" className="help">Phân tách bằng dấu phẩy.</span>
      {formErrors.skills ? <span id="skills-error" className="form-error">{formErrors.skills}</span> : null}
      </div>
    </details>
    <button className="btn btn-primary" type="submit">Áp dụng bộ lọc</button>
    <details className={`${styles.displayOptions} job-results-options`}>
      <summary>Tùy chọn hiển thị<ChevronDown size={15} aria-hidden="true" /></summary>
      <div className={styles.filterGroup}>
        <label className="label" htmlFor="candidate-job-mode">Cách xem việc làm</label>
        <select id="candidate-job-mode" className="select" value={mode} onChange={event => changeMode(event.target.value as SearchMode)}><option value="OFFSET">Phân trang</option><option value="CURSOR">Tải thêm</option></select>
        <label className="label" htmlFor="candidate-job-limit">Số việc mỗi lượt</label>
        <select id="candidate-job-limit" className="select" value={limit} onChange={event => changeLimit(Number(event.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
      </div>
    </details>
  </form>;
  const filterTitle = <h2 id="job-search-filter-title">Bộ lọc</h2>;

  return (
    <main className={styles.page}>
      <Suspense fallback={null}><WatchSearchUrl onChange={syncSearchUrl} /></Suspense>
      <form className={styles.searchHeader} noValidate onSubmit={applyFilters} role="search" aria-label="Tìm việc làm">
        <div className={styles.heading}><h1>Tìm công việc phù hợp với bạn</h1><p>Khám phá cơ hội nghề nghiệp và tiến gần hơn đến mục tiêu của bạn.</p></div>
        <div className={styles.searchBar}>
          <div className={styles.keyword}><Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="q">Vị trí hoặc từ khóa</label>
            <input id="q" type="search" maxLength={200} placeholder="Vị trí, kỹ năng hoặc tên công ty" value={form.q} onChange={event => change("q", event.target.value)} aria-invalid={!!formErrors.q} aria-describedby={formErrors.q ? "q-error" : undefined} />
            {form.q ? <button className={styles.iconButton} type="button" aria-label="Xóa từ khóa" onClick={() => { change("q", ""); document.getElementById("q")?.focus(); }}><X size={17} aria-hidden="true" /></button> : null}
          </div>
          <div className={styles.location}><LocationPicker value={form.location} onChange={value => change("location", value)} invalid={!!formErrors.location} describedBy={formErrors.location ? "location-error" : undefined} /></div>
          <button className="btn btn-primary" type="submit">Tìm việc</button>
        </div>
        {formErrors.q ? <p id="q-error" className="form-error">{formErrors.q}</p> : null}
        {formErrors.location ? <p id="location-error" className="form-error">{formErrors.location}</p> : null}
      </form>

      <div className={styles.workspace}>
        {showFilters && wide ? <aside className={`${styles.filters} candidate-job-search-advanced`} aria-labelledby="job-search-filter-title">
          <div className={styles.filterHeader}>{filterTitle}<button className={styles.textButton} type="button" onClick={() => resetFilters()}>Đặt lại</button></div>
          {filterForm}
        </aside> : showFilters && filtersOpen ? (
          <dialog ref={filtersDialogRef} className={`${styles.dialog} ${styles.filterDrawer} candidate-job-search-advanced`} aria-labelledby="job-search-filter-title" onClose={() => setFiltersOpen(false)}>
            <header className={styles.dialogHeader}>{filterTitle}<div><button className={styles.textButton} type="button" onClick={() => resetFilters()}>Đặt lại</button><button className={styles.iconButton} type="button" onClick={() => filtersDialogRef.current?.close()} aria-label="Đóng bộ lọc"><X size={20} aria-hidden="true" /></button></div></header>
            {filterForm}
          </dialog>
        ) : null}

        <section ref={jobListRef} className={styles.results} tabIndex={-1} aria-label="Kết quả tìm việc">
          <div className={styles.toolbar}>
            <div className={styles.toolbarTop}><h2>{loading && jobs.length === 0 ? "Đang tìm việc làm…" : error ? "Việc làm" : <>{(mode === "OFFSET" ? total : jobs.length).toLocaleString("vi-VN")} việc làm</>}</h2>
              <div className={styles.sortRow}><label htmlFor="sort" className="sr-only">Sắp xếp theo</label><select id="sort" className="select" value={filters.sort} onChange={event => sortBy(event.target.value as PublicJobSearchForm["sort"])}><option value="RELEVANCE">Phù hợp nhất</option><option value="NEWEST">Mới nhất</option><option value="SALARY_DESC">Lương cao nhất</option></select>
                {showFilters && !wide ? <button type="button" className={styles.filterButton} aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17} aria-hidden="true" /> Bộ lọc {advancedFilters.length > 0 ? <span>{advancedFilters.length}</span> : null}</button> : null}
              </div>
            </div>
            {advancedFilters.length ? <div className={styles.activeFilters} aria-label="Bộ lọc đang áp dụng">{advancedFilters.map(item => <button type="button" key={item.field} onClick={() => removeFilter(item.field)} aria-label={`Bỏ bộ lọc ${item.label}`}>{item.label}<X size={13} aria-hidden="true" /></button>)}</div> : null}
          </div>
          {activity.error ? <p className="notice notice-danger" role="alert">{activity.error} <button className={styles.textButton} type="button" onClick={activity.reload}>Tải lại danh sách đã lưu</button></p> : null}
          {tooDeep || (hasMore && nextOffsetTooDeep) ? <section className="notice notice-warning" role="status"><p>Đã tới giới hạn phân trang. Bạn có thể tải thêm hoặc thu hẹp bộ lọc.</p><button className="btn" type="button" onClick={switchToCursor}>Tải thêm kết quả</button></section> : null}
          {searchRestartNotice ? <p className="notice" role="status">{searchRestartNotice}</p> : null}
          {error ? <ErrorState message={error} onRetry={() => setReloadKey(value => value + 1)} /> : null}
          {loading && jobs.length === 0 ? <SearchSkeleton /> : null}
          {!loading && !error && !tooDeep && jobs.length === 0 ? <div className={styles.blank}><EmptyState title="Chưa có việc làm phù hợp" description="Thử dùng từ khóa ngắn hơn, mở rộng địa điểm hoặc điều chỉnh khoảng lương." />{activeFilters.length ? <button className="btn" onClick={() => resetFilters(true)} type="button">Xóa tìm kiếm</button> : null}</div> : null}
          <div className={styles.resultList} ref={cardListRef}>
            {jobs.map(job => <SearchJobCard key={job.id} job={job} company={companies[job.companyId]} href={detailHref(job.id)} activity={activity} />)}
          </div>
          {loading && jobs.length > 0 ? <p className="help" role="status">Đang tải thêm kết quả…</p> : null}
          {(jobs.length > 0 || page > 1) && (mode === "OFFSET" ? <nav className={styles.pagination} aria-label="Phân trang việc làm">
            <button className={styles.iconButton} type="button" aria-label="Trang trước" disabled={loading || page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
            <span>Trang {page} / {totalPages}</span>
            <button className={styles.iconButton} type="button" aria-label="Trang sau" disabled={loading || !hasMore || nextOffsetTooDeep} onClick={() => changePage(page + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
          </nav> : <button className={`btn ${styles.loadMore}`} type="button" disabled={loading || !hasMore || !nextCursor} onClick={() => setCursor(nextCursor)}>{hasMore ? "Tải thêm việc làm" : "Đã tải hết kết quả"}</button>)}
        </section>

      </div>
        <section className={discovery.recommendations} id="suitable-jobs" tabIndex={-1}>
          <header><span className={discovery.verified}><Sparkles size={16} aria-hidden="true" />Dành riêng cho bạn</span><h2>Gợi ý phù hợp</h2><p>Khám phá các cơ hội theo CV, sở thích nghề nghiệp hoặc tin mới nhất.</p></header>
          {!canRecommend ? <p className="notice">Đăng nhập bằng tài khoản ứng viên để nhận gợi ý phù hợp với hồ sơ của bạn.</p> : null}
          {canRecommend && !recommendationLoading && !recommendationError && recs.length === 0 ? (() => {
            const fallback = recommendationFallbackView(recommendationFallback);
            return <div className={discovery.recommendationEmpty}><EmptyState title={fallback?.title ?? "Chưa có việc làm phù hợp"} description={fallback?.description ?? "Hãy thử lại khi có tin tuyển dụng mới."} />{fallback?.action === "UPLOAD_CV" ? <Link className="btn btn-secondary" href="/candidate/profile/cvs">{fallback.actionLabel}</Link> : <button className="btn" type="button" onClick={restartRecommendations}>Làm mới gợi ý</button>}</div>;
          })() : null}
          {recommendationRestartNotice ? <p className="notice" role="status">{recommendationRestartNotice}</p> : null}
          {recommendationError ? <ErrorState message={recommendationError} onRetry={() => setRecommendationReloadKey((value) => value + 1)} /> : null}
          {recommendationLoading && recs.length === 0 ? <LoadingState label="Đang tải gợi ý việc làm" /> : null}
          <div className={discovery.recommendationGrid}>
            {recs.map((item) => <RecommendationCard key={item.id} item={item} loading={recommendationLoading} onRetry={restartRecommendations} />)}
          </div>
          {recommendationLoading && recs.length > 0 ? <p className="help" role="status">Đang tải thêm gợi ý…</p> : null}
          {canLoadMoreRecommendation ? (
            <div className="btn-group pagination-actions">
              <button className="btn btn-secondary" type="button" disabled={recommendationLoading} onClick={() => setRecommendationCursor(nextRecommendationCursor)}>Xem thêm gợi ý AI</button>
              <div ref={recommendationSentinelRef} className="recommendation-sentinel" aria-hidden="true" />
            </div>
          ) : null}
          {recommendationSource === "AI" && recs.length > 0 && !recommendationLoading && !nextRecommendationCursor ? <p className="help">Đã tải hết gợi ý AI.</p> : null}
        </section>
    </main>
  );
}
