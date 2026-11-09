"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount } from "@/components/SessionGate";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui";
import { Building2, ChevronDown, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { JobResultCard } from "@/components/discovery/JobResultCard";
import { LocationPicker } from "@/components/discovery/LocationPicker";
import styles from "@/components/discovery/Discovery.module.css";
import { jobTypeLabel } from "@/lib/recruitmentLabels";
import { ApiClientError, toUserMessage } from "../../../lib/apiClient";
import { cursorRestartView } from "../../../lib/cursorRecovery";
import {
  emptyPublicJobSearchForm,
  isOffsetWindowTooDeep,
  mergePublicJobPage,
  normalizePublicJobSearch,
  publicJobSearchScope,
  validatePublicJobSearch,
  type PublicJobSearchFilters,
  type PublicJobSearchForm,
} from "../../../lib/publicJobSearch";
import { canLoadMoreRecommendations, mergeRecommendationPage, recommendationFallbackView, recommendationSourceView } from "../../../lib/recommendationPresentation";
import {
  type Job,
  type JobRecommendation,
  type RecommendationSource,
  type SearchMode,
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

export default function CandidateJobsPage({ searchParams = {} }: { searchParams?: { q?: string; location?: string; search?: string } }) {
  const account = useCurrentAccount();
  const canRecommend = isDemoPerson2Api || account?.role === "CANDIDATE";
  const [recommendationFallback, setRecommendationFallback] = useState<FallbackReason | undefined>();
  const [form, setForm] = useState<PublicJobSearchForm>(() => ({ ...emptyPublicJobSearchForm,
    q: typeof searchParams.q === "string" ? searchParams.q.slice(0, 200) : "",
    location: typeof searchParams.location === "string" ? searchParams.location.slice(0, 255) : "" }));
  const [filters, setFilters] = useState<PublicJobSearchFilters>(() => normalizePublicJobSearch(form));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(() => Boolean(searchParams.search === "1" || form.q.trim() || form.location.trim()));
  const [mode, setMode] = useState<SearchMode>("OFFSET");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
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
  const recommendationSentinelRef = useRef<HTMLDivElement>(null);
  const scope = useMemo(() => publicJobSearchScope(filters, limit), [filters, limit]);

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
            jobListRef.current?.focus({ preventScroll: true });
            jobListRef.current?.scrollIntoView({ block: "start" });
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
    if (field === "q" || field === "location") setFiltersOpen(false);
    setForm((current) => ({ ...current, [field]: value }));
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

  function applyFilters(event: React.FormEvent<HTMLFormElement>, advanced = false) {
    event.preventDefault();
    const nextForm = advanced ? form : { ...emptyPublicJobSearchForm, q: form.q, location: form.location };
    const errors = validatePublicJobSearch(nextForm);
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      if (advanced) setFiltersOpen(true);
      requestAnimationFrame(() => document.getElementById(Object.keys(errors)[0])?.focus());
      return;
    }
    resetTraversal();
    setForm(nextForm);
    setFilters(normalizePublicJobSearch(nextForm));
    setHasSearched(true);
    restoreListFocusRef.current = true;
    setReloadKey((value) => value + 1);
    setFiltersOpen(false);
  }

  function changeMode(nextMode: SearchMode) {
    if (nextMode === mode) return;
    resetTraversal();
    setMode(nextMode);
  }

  function changeLimit(nextLimit: number) {
    if (nextLimit === limit) return;
    resetTraversal();
    setLimit(nextLimit);
  }

  function resetFilters() {
    setHasSearched(false);
    setFiltersOpen(false);
    setForm(emptyPublicJobSearchForm);
    setFormErrors({});
    resetTraversal();
    setFilters(normalizePublicJobSearch(emptyPublicJobSearchForm));
    setReloadKey((value) => value + 1);
  }

  function switchToCursor() {
    resetTraversal();
    setMode("CURSOR");
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
  const basicReady = hasSearched && form.q.normalize("NFKC").trim() === (filters.q ?? "") && form.location.normalize("NFKC").trim() === (filters.location ?? "");
  const activeFilters: { field: Exclude<keyof PublicJobSearchForm, "sort">; label: string }[] = [];
  if (filters.q) activeFilters.push({ field: "q", label: filters.q });
  if (filters.location) activeFilters.push({ field: "location", label: filters.location });
  if (filters.jobType) activeFilters.push({ field: "jobType", label: jobTypeLabel(filters.jobType) });
  if (filters.salaryMin !== undefined) activeFilters.push({ field: "salaryMin", label: `Lương từ ${filters.salaryMin.toLocaleString("vi-VN")}` });
  if (filters.salaryMax !== undefined) activeFilters.push({ field: "salaryMax", label: `Lương đến ${filters.salaryMax.toLocaleString("vi-VN")}` });
  if (filters.skills?.length) activeFilters.push({ field: "skills", label: filters.skills.join(", ") });
  if (filters.experienceYears !== undefined) activeFilters.push({ field: "experienceYears", label: `Kinh nghiệm tối đa ${filters.experienceYears} năm` });

  function removeFilter(field: Exclude<keyof PublicJobSearchForm, "sort">) {
    setForm(current => ({ ...current, [field]: emptyPublicJobSearchForm[field] }));
    setFormErrors({});
    setFilters(current => { const next = { ...current }; delete next[field]; return next; });
    resetTraversal();
    setReloadKey(value => value + 1);
    restoreListFocusRef.current = true;
  }

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Tìm việc làm</span></nav>
      <form noValidate onSubmit={applyFilters}>
        <section className={styles.searchHero}><h1>Tìm việc làm phù hợp với bạn</h1><p>Cơ hội mới bắt đầu từ một công việc phù hợp. Khám phá các vị trí đang tuyển trên CareerHub.</p>
        <div className={styles.searchBar}>
          <div className={styles.searchField}><Search size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="q">Vị trí hoặc từ khóa</label>
            <input id="q" type="search" placeholder="Vị trí tuyển dụng, tên công ty" value={form.q} onChange={(event) => change("q", event.target.value)} aria-invalid={!!formErrors.q} aria-describedby={formErrors.q ? "q-error" : undefined} />
            {formErrors.q ? <span id="q-error" className="form-error">{formErrors.q}</span> : null}
          </div>
          <LocationPicker value={form.location} onChange={value => change("location", value)} invalid={!!formErrors.location} describedBy={formErrors.location ? "location-error" : undefined} />
          <button className="btn btn-primary" type="submit"><Search size={18} aria-hidden="true" />Tìm việc</button>
        </div>
        {formErrors.location ? <span id="location-error" className="form-error">{formErrors.location}</span> : null}
        <div className={styles.searchHeroFoot}><Building2 size={15} aria-hidden="true" />Chọn địa điểm đến xã/phường hoặc tìm trên toàn quốc.</div></section>
      </form>
      {basicReady ? <div className={styles.advancedToolbar}><p>Thu hẹp kết quả theo mức lương, kinh nghiệm và kỹ năng.</p><button type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="job-search-filters" onClick={() => { setFiltersOpen(value => !value); }}><span><SlidersHorizontal size={18} aria-hidden="true" />Bộ lọc nâng cao</span><ChevronDown size={18} aria-hidden="true" /></button></div> : null}
        <div className={`${styles.resultsLayout} ${!basicReady || !filtersOpen ? styles.resultsLayoutFull : ""}`}>
        {basicReady && filtersOpen ? <aside id="job-search-filters" className={`${styles.filterPanel} candidate-job-search-advanced`} aria-label="Bộ lọc việc làm">
          <form noValidate onSubmit={event => applyFilters(event, true)}>
          <div className={styles.filterHeading}><SlidersHorizontal size={19} aria-hidden="true" /><h2>Bộ lọc nâng cao</h2></div>
          <div className={styles.filterFields}>
            <div className="field">
              <label className="label" htmlFor="jobType">Hình thức làm việc</label>
              <select id="jobType" className="select" value={form.jobType} onChange={(event) => change("jobType", event.target.value as PublicJobSearchForm["jobType"])}>
                <option value="">Tất cả</option><option value="FULL_TIME">Toàn thời gian</option><option value="PART_TIME">Bán thời gian</option><option value="REMOTE">Làm việc từ xa</option><option value="INTERNSHIP">Thực tập</option>
              </select>
            </div>
            <div><label className="label" htmlFor="salary">Khoảng lương</label><div className={styles.salaryFields}>
              <input id="salary" className="input" inputMode="decimal" placeholder="Từ" aria-label="Lương tối thiểu" value={form.salaryMin} onChange={(event) => change("salaryMin", event.target.value)} aria-invalid={!!formErrors.salary} aria-describedby={formErrors.salary ? "salary-error" : undefined} />
              <input id="salaryMax" className="input" inputMode="decimal" placeholder="Đến" aria-label="Lương tối đa" value={form.salaryMax} onChange={(event) => change("salaryMax", event.target.value)} aria-invalid={!!formErrors.salary} aria-describedby={formErrors.salary ? "salary-error" : undefined} />
              </div>
              {formErrors.salary ? <span id="salary-error" className="form-error">{formErrors.salary}</span> : null}
            </div>
            <div className="field">
              <label className="label" htmlFor="skills">Kỹ năng</label>
              <input id="skills" className="input" value={form.skills} onChange={(event) => change("skills", event.target.value)} aria-invalid={!!formErrors.skills} aria-describedby={formErrors.skills ? "skills-error" : "skills-help"} placeholder="React, TypeScript" />
              <span id="skills-help" className="help">Phân tách bằng dấu phẩy.</span>
              {formErrors.skills ? <span id="skills-error" className="form-error">{formErrors.skills}</span> : null}
            </div>
            <div className="field">
              <label className="label" htmlFor="experienceYears">Kinh nghiệm tối đa phù hợp</label>
              <input id="experienceYears" className="input" type="number" min="0" max="60" step="1" value={form.experienceYears} onChange={(event) => change("experienceYears", event.target.value)} aria-invalid={!!formErrors.experienceYears} aria-describedby={formErrors.experienceYears ? "experienceYears-error" : undefined} />
              {formErrors.experienceYears ? <span id="experienceYears-error" className="form-error">{formErrors.experienceYears}</span> : null}
            </div>
            <div className="field"><label className="label" htmlFor="sort">Sắp xếp theo</label><select id="sort" className="select" value={form.sort} onChange={event => change("sort", event.target.value as PublicJobSearchForm["sort"])}><option value="RELEVANCE">Liên quan nhất</option><option value="NEWEST">Mới nhất</option><option value="SALARY_DESC">Lương cao nhất</option></select></div>
          </div>
          <details className={`${styles.displayOptions} job-results-options`}>
            <summary>Tùy chọn hiển thị<ChevronDown size={13} aria-hidden="true" /></summary>
            <div><div className="field"><label className="label" htmlFor="candidate-job-mode">Cách xem việc làm</label><select id="candidate-job-mode" className="select" value={mode} onChange={event => changeMode(event.target.value as SearchMode)}><option value="OFFSET">Phân trang</option><option value="CURSOR">Tải thêm</option></select></div><div className="field"><label className="label" htmlFor="candidate-job-limit">Số việc mỗi lượt</label><select id="candidate-job-limit" className="select" value={limit} onChange={event => changeLimit(Number(event.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></div></div>
          </details>
          <div className={styles.filterActions}>
            <button className="btn btn-primary" type="submit">Áp dụng bộ lọc</button>
            <button className="btn" type="button" onClick={resetFilters}>Xóa tất cả bộ lọc</button>
          </div>
          </form>
        </aside> : null}
        <section ref={jobListRef} className={styles.results} tabIndex={-1} aria-label="Kết quả tìm việc" aria-busy={loading}>
          <div className={styles.resultHeader}><div><h2>Danh sách việc làm</h2><p>{loading && jobs.length === 0 ? "Đang tìm kiếm cơ hội phù hợp…" : <><strong>{(mode === "OFFSET" ? total : jobs.length).toLocaleString("vi-VN")}</strong> {mode === "OFFSET" ? "việc làm phù hợp" : "việc làm đã tải"}{filters.q ? ` cho “${filters.q}”` : ""}</>}</p></div></div>
          {activeFilters.length ? <div className={styles.activeFilters} aria-label="Bộ lọc đang áp dụng">{activeFilters.map(item => <button type="button" key={item.field} onClick={() => removeFilter(item.field)} aria-label={`Bỏ bộ lọc ${item.label}`}>{item.label}<X size={13} aria-hidden="true" /></button>)}</div> : null}

      {tooDeep || (hasMore && nextOffsetTooDeep) ? (
        <section className="notice notice-warning" role="status">
          <strong>Đã xem nhiều kết quả theo trang.</strong>
          <p>Bạn có thể tải thêm kết quả hoặc thu hẹp tìm kiếm để tìm việc phù hợp nhanh hơn.</p>
          <div className="btn-group"><button className="btn btn-primary" type="button" onClick={switchToCursor}>Tải thêm kết quả</button><button className="btn" type="button" onClick={() => document.getElementById("q")?.focus()}>Sửa tìm kiếm</button></div>
        </section>
      ) : null}
      {searchRestartNotice ? <p className="notice" role="status">{searchRestartNotice}</p> : null}

          {error ? <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} /> : null}
          {loading && jobs.length === 0 ? <LoadingState label="Đang tìm việc làm phù hợp" /> : null}
          {!loading && !error && !tooDeep && jobs.length === 0 ? <EmptyState title="Chưa có việc làm phù hợp" description="Thử bỏ bớt kỹ năng, mở rộng địa điểm hoặc điều chỉnh khoảng lương." /> : null}
          <div className={styles.resultList}>{jobs.map(job => <JobResultCard job={job} key={job.id} />)}</div>
          {loading && jobs.length > 0 ? <p className="help" role="status">Đang tải lượt tiếp theo…</p> : null}
          {mode === "OFFSET" ? (
            <nav className="btn-group pagination-actions" aria-label="Phân trang việc làm">
              <button className="btn" type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trang trước</button>
              <span className="badge muted">Trang {page}/{totalPages}</span>
              <button className="btn" type="button" disabled={loading || !hasMore || nextOffsetTooDeep} onClick={() => setPage((value) => value + 1)}>Trang sau</button>
            </nav>
          ) : (
            <div className="btn-group pagination-actions">
              <button className="btn btn-secondary" type="button" disabled={loading || !hasMore || !nextCursor} onClick={() => setCursor(nextCursor)}>{hasMore ? "Tải thêm việc làm" : "Đã tải hết kết quả"}</button>
            </div>
          )}
        </section>
        </div>
        <section className={styles.recommendations} id="suitable-jobs" tabIndex={-1}>
          <header><span className={styles.verified}><Sparkles size={16} aria-hidden="true" />Dành riêng cho bạn</span><h2>Gợi ý phù hợp</h2><p>Khám phá các cơ hội theo CV, sở thích nghề nghiệp hoặc tin mới nhất.</p></header>
          {!canRecommend ? <p className="notice">Đăng nhập bằng tài khoản ứng viên để nhận gợi ý phù hợp với hồ sơ của bạn.</p> : null}
          {canRecommend && !recommendationLoading && !recommendationError && recs.length === 0 ? (() => {
            const fallback = recommendationFallbackView(recommendationFallback);
            return <div className={styles.recommendationEmpty}><EmptyState title={fallback?.title ?? "Chưa có việc làm phù hợp"} description={fallback?.description ?? "Hãy thử lại khi có tin tuyển dụng mới."} />{fallback?.action === "UPLOAD_CV" ? <Link className="btn btn-secondary" href="/candidate/profile/cvs">{fallback.actionLabel}</Link> : <button className="btn" type="button" onClick={restartRecommendations}>Làm mới gợi ý</button>}</div>;
          })() : null}
          {recommendationRestartNotice ? <p className="notice" role="status">{recommendationRestartNotice}</p> : null}
          {recommendationError ? <ErrorState message={recommendationError} onRetry={() => setRecommendationReloadKey((value) => value + 1)} /> : null}
          {recommendationLoading && recs.length === 0 ? <LoadingState label="Đang tải gợi ý việc làm" /> : null}
          <div className={styles.recommendationGrid}>
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
