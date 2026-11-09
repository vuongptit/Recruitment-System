"use client";

import { useEffect, useState } from "react";
import { toUserMessage } from "@/lib/apiClient";
import { getPublicJobs, type Job } from "@/lib/person2Api";
import { EmptyState, ErrorState, LoadingState } from "./ui";
import { JobResultCard } from "./discovery/JobResultCard";
import styles from "./discovery/Discovery.module.css";

const PAGE_SIZE = 6;

export function CompanyJobs({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getPublicJobs({ companyId, mode: "OFFSET", page, limit: PAGE_SIZE, sort: "NEWEST" }, controller.signal)
      .then(response => {
        if (controller.signal.aborted) return;
        setJobs(current => page === 1 ? response.data : [...new Map([...current, ...response.data].map(job => [job.id, job])).values()]);
        setTotal(typeof response.meta?.total === "number" ? response.meta.total : null);
        setHasMore(Boolean(response.meta?.hasMore));
      })
      .catch(reason => { if (!controller.signal.aborted) setError(toUserMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, page, reload]);

  return <section id="company-jobs" className={`${styles.section} company-jobs`} aria-labelledby="company-jobs-heading" aria-busy={loading}>
    <div className={styles.sectionTitle}><h2 id="company-jobs-heading">Việc làm đang tuyển</h2>{total !== null ? <span>{total} vị trí</span> : null}</div>
    <p className="help">Cơ hội nghề nghiệp tại {companyName}. Chọn vị trí phù hợp để xem chi tiết và ứng tuyển.</p>
    {error ? <ErrorState message={error} onRetry={() => setReload(value => value + 1)} /> : null}
    {loading ? <LoadingState label={page === 1 ? "Đang tải việc làm của công ty" : "Đang tải thêm việc làm"} /> : null}
    {!loading && !error && jobs.length === 0 ? <EmptyState title="Công ty chưa có tin đang tuyển" description="Bạn có thể quay lại sau hoặc khám phá thêm những cơ hội phù hợp khác." href="/candidate/jobs" action="Khám phá việc làm" /> : null}
    <div className={styles.companyJobList}>
      {jobs.map(job => <JobResultCard key={job.id} job={{ ...job, ownerName: companyName }} source="COMPANY_PAGE" className="company-job-card" />)}
    </div>
    {!error && hasMore ? <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => setPage(value => value + 1)}>Xem thêm việc làm của công ty</button> : null}
  </section>;
}
