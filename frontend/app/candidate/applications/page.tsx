"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, ArrowUpRight, Building2, RefreshCw } from "lucide-react";
import { ApplicationNextStep, ApplicationProgress } from "@/components/ApplicationJourney";
import { ApplicationStageFilter } from "@/components/ApplicationStageFilter";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import { APPLICATION_STATUSES, formatApplicationDate } from "@/lib/applicationStateMachine";
import { applicationStatusLabel } from "@/lib/recruitmentLabels";
import { getApplications, type CandidateApplication } from "@/lib/person2Api";
import styles from "./applications.module.css";

export default function CandidateApplicationsPage() {
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [stage, setStage] = useState<"ALL" | CandidateApplication["status"]>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    getApplications(undefined, controller.signal)
      .then((response) => { if (!controller.signal.aborted) setApplications(response.data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) setLoadError(toUserMessage(reason));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reloadKey]);

  const keyword = search.trim().toLocaleLowerCase("vi-VN");
  const searched = applications.filter((application) => `${application.jobTitle} ${application.companyName}`.toLocaleLowerCase("vi-VN").includes(keyword));
  const visible = searched.filter((application) => stage === "ALL" || application.status === stage);
  const counts = Object.fromEntries([ ["ALL", searched.length], ...APPLICATION_STATUSES.map((status) => [status, searched.filter((application) => application.status === status).length]) ]);

  return <main className="stack">
    <PageHeader eyebrow="HÀNH TRÌNH NGHỀ NGHIỆP" title="Hồ sơ ứng tuyển của tôi" description="Cùng nhà tuyển dụng theo dõi một tiến trình, từ lúc gửi hồ sơ đến nhận việc." action={<div className="btn-group"><button className="btn" type="button" disabled={loading} onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={16} /> Làm mới</button><Link className="btn btn-primary" href="/candidate/jobs">Tìm thêm việc</Link></div>} />
    <section className="panel">
      <div className={styles.toolbar}><div><h2>Theo dõi ứng tuyển</h2><p className="help">Hồ sơ đã gửi được giữ lại và không thể rút. Mở chi tiết để xem lịch sử xử lý.</p></div><label className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" aria-label="Tìm hồ sơ theo công việc hoặc công ty" placeholder="Tìm công việc, công ty…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <ApplicationStageFilter value={stage} onChange={setStage} counts={loading || loadError ? undefined : counts} />
      {loadError ? <ErrorState message={loadError} onRetry={() => setReloadKey((value) => value + 1)} /> : null}
      {loading ? <LoadingState label="Đang tải hồ sơ ứng tuyển" /> : null}
      {!loading && !loadError ? <>
        <p className="help" role="status">{visible.length} hồ sơ{stage !== "ALL" ? ` · ${applicationStatusLabel(stage)}` : ""}</p>
        {applications.length === 0 ? <EmptyState title="Chưa có hồ sơ ứng tuyển" description="Các công việc bạn đã ứng tuyển sẽ xuất hiện tại đây." href="/candidate/jobs" action="Khám phá việc làm" /> : visible.length === 0 ? <EmptyState title="Không có hồ sơ phù hợp bộ lọc" description="Chọn bước khác hoặc bỏ từ khóa để xem lại hồ sơ." /> : null}
        <div className="stack">{visible.map((application) => <article className={styles.application} key={application.id}>
          <div className={styles.heading}><div><h3><Link href={`/candidate/applications/${application.id}`}>{application.jobTitle}</Link></h3><p className={styles.company}><Building2 size={15} aria-hidden="true" /> {application.companyName}</p><p className="help">Đã gửi: <time dateTime={application.createdAt}>{formatApplicationDate(application.createdAt)}</time> · GMT+7</p></div><StatusBadge tone={application.status === "HIRED" ? "success" : application.status === "REJECTED" || application.status === "WITHDRAWN" ? "neutral" : "info"}>{applicationStatusLabel(application.status)}</StatusBadge></div>
          <ApplicationProgress status={application.status} compact />
          <ApplicationNextStep status={application.status} viewer="CANDIDATE" applicationId={application.id} offerId={application.offerId} />
          <div className="btn-group"><Link className="btn btn-primary" href={`/candidate/applications/${application.id}`}>Chi tiết và lịch sử <ArrowUpRight size={16} /></Link><Link className="btn" href={`/candidate/jobs/${application.jobId}`}>Xem việc làm</Link></div>
        </article>)}</div>
      </> : null}
    </section>
  </main>;
}
