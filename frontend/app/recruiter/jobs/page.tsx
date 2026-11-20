"use client";

import { jobStatusLabel } from "@/lib/recruitmentLabels";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount } from "@/components/SessionGate";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { TransientRecoveryState } from "@/components/TransientRecoveryState";
import { EmptyState, LoadingState, Metric, PageHeader, StatusBadge } from "@/components/ui";
import { ApiClientError, toUserMessage } from "../../../lib/apiClient";
import { isRejectedRecruiterJob, recruiterJobActionLabel, recruiterJobActions, recruiterJobEditLabel, type RecruiterJobAction } from "../../../lib/jobLifecycle";
import { closeRecruiterJob, deleteRecruiterJobDraft, getCurrentCompanyMembership, getRecruiterJobs, reopenRecruiterJob, submitJobForApproval, type CompanyMemberRole, type Job, type JobStatus } from "../../../lib/person2Api";
import { isRecruiterJobAccessDenied, recruiterJobScopeView } from "../../../lib/recruiterJobAccess";
import { buildRecruiterJobTable, type RecruiterJobScopeFilter, type RecruiterJobSort } from "../../../lib/recruiterJobTable";
import { isDateAfterUtcToday } from "../../../lib/jobForm";
import styles from "./RecruiterJobs.module.css";

export default function RecruiterJobsPage() {
  const account = useCurrentAccount();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | JobStatus>("ALL");
  const [scopeFilter, setScopeFilter] = useState<RecruiterJobScopeFilter>("ALL");
  const [sort, setSort] = useState<RecruiterJobSort>("UPDATED_DESC");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [membershipRole, setMembershipRole] = useState<CompanyMemberRole | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [failureCount, setFailureCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [reopenTarget, setReopenTarget] = useState<Job | null>(null);
  const [reopenDeadline, setReopenDeadline] = useState("");
  const [reopenError, setReopenError] = useState("");
  const actionLock = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setMembershipLoading(true);
    setMembershipError("");
    getCurrentCompanyMembership(controller.signal)
      .then((response) => {
        if (active) setMembershipRole(response.data.memberRole);
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) {
          setMembershipRole(null);
          setMembershipError(toUserMessage(reason));
        }
      })
      .finally(() => {
        if (active) setMembershipLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getRecruiterJobs(controller.signal)
      .then((response) => {
        if (active) {
          setJobs(response.data);
          setFailureCount(0);
        }
      })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) {
          setLoadError(reason);
          setFailureCount((value) => value + 1);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const myJobsCount = useMemo(() => {
    if (!account?.id) return 0;
    return jobs.filter((job) => job.createdBy === account.id).length;
  }, [jobs, account?.id]);

  const canManageJob = (job: Job) => {
    if (membershipRole === "OWNER") return true;
    return Boolean(account?.id && job.createdBy === account.id);
  };

  const jobTable = useMemo(() => buildRecruiterJobTable(jobs, {
    query,
    status: statusFilter,
    sort,
    page,
    pageSize,
    scope: scopeFilter,
    currentUserId: account?.id,
  }), [jobs, page, pageSize, query, sort, statusFilter, scopeFilter, account?.id]);

  async function runJobAction(job: Job, action: RecruiterJobAction) {
    if (actionLock.current) return;
    actionLock.current = true;
    setPendingJobId(job.id);
    setActionError("");
    setActionStatus("");
    try {
      if (action === "REOPEN" && !isDateAfterUtcToday(reopenDeadline)) {
        setReopenError("Chọn hạn nộp sau hôm nay để mở lại tin.");
        return;
      }
      setReopenError("");
      const response = action === "REOPEN"
        ? await reopenRecruiterJob(job.id, reopenDeadline)
        : await (action === "CLOSE" ? closeRecruiterJob : submitJobForApproval)(job.id);
      setJobs((current) => current.map((item) => item.id === job.id ? response.data : item));
      const messages = {
        SUBMIT_FOR_APPROVAL: "Đã gửi tin cho quản trị viên duyệt.",
        CLOSE: "Đã đóng tin tuyển dụng.",
        REOPEN: "Đã mở lại tin. Ứng viên có thể nộp hồ sơ theo hạn nộp đã chọn.",
      };
      setActionStatus(messages[action]);
      if (action === "REOPEN") {
        setReopenTarget(null);
        if (statusFilter === "CLOSED") { setStatusFilter("PUBLISHED"); setPage(1); }
      }
    } catch (reason: unknown) {
      if (action === "REOPEN") setReopenError(toUserMessage(reason));
      else setActionError(toUserMessage(reason));
      if (isRecruiterJobAccessDenied(reason)) setReloadKey((value) => value + 1);
    } finally {
      actionLock.current = false;
      setPendingJobId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || actionLock.current) return;
    actionLock.current = true;
    setPendingJobId(deleteTarget.id);
    setDeleteError("");
    setActionError("");
    setActionStatus("");
    try {
      await deleteRecruiterJobDraft(deleteTarget.id);
      setJobs((current) => current.filter((job) => job.id !== deleteTarget.id));
      setDeleteTarget(null);
      setActionStatus("Đã xóa vĩnh viễn bản nháp tuyển dụng.");
    } catch (reason) {
      setDeleteError(toUserMessage(reason));
      if (isRecruiterJobAccessDenied(reason)) setReloadKey((value) => value + 1);
    } finally {
      actionLock.current = false;
      setPendingJobId(null);
    }
  }

  const scopedTotal = scopeFilter === "MINE" ? myJobsCount : jobs.length;

  return (
    <main className={styles.page}>
      <PageHeader title="Quản lý tin tuyển dụng" description="Theo dõi tin đang tuyển, cập nhật nội dung và xem hồ sơ ứng tuyển." action={<Link className="btn btn-primary" href="/recruiter/jobs/new"><Plus size={17} aria-hidden="true" /> Tạo tin mới</Link>} />
      <section className={`metric-grid ${styles.metrics}`} aria-label="Tổng quan tin tuyển dụng">
        <Metric label="Tổng tin" value={String(jobs.length)} detail="Trong công ty" />
        <Metric label="Đang tuyển" value={String(jobs.filter((job) => job.status === "PUBLISHED").length)} detail="Công khai" />
        <Metric label="Chờ duyệt" value={String(jobs.filter((job) => job.status === "PENDING_APPROVAL").length)} detail="Đã gửi quản trị viên" />
        <Metric label="Bản nháp" value={String(jobs.filter((job) => job.status === "DRAFT").length)} detail="Chưa gửi duyệt" />
      </section>

      {membershipLoading ? <p className="notice" role="status">Đang xác định phạm vi tin theo vai trò công ty…</p> : null}
      {!membershipLoading && membershipRole ? (() => {
        const scope = recruiterJobScopeView(membershipRole);
        return <p className={`notice notice-${scope.tone}`} role="status"><StatusBadge tone={scope.tone}>{scope.label}</StatusBadge> {scope.description}</p>;
      })() : null}
      {!membershipLoading && membershipError ? <p className="notice notice-warning" role="alert"><strong>Chưa xác định được phạm vi vai trò.</strong> {membershipError}</p> : null}

      <div className={styles.scope} role="group" aria-label="Phạm vi danh sách tin tuyển dụng">
        <button
          aria-pressed={scopeFilter === "ALL"}
          className={`btn ${scopeFilter === "ALL" ? "btn-primary" : "btn-ghost"}`}
          type="button"
          onClick={() => { setScopeFilter("ALL"); setPage(1); }}
        >
          Toàn bộ tin công ty ({jobs.length})
        </button>
        <button
          aria-pressed={scopeFilter === "MINE"}
          className={`btn ${scopeFilter === "MINE" ? "btn-primary" : "btn-ghost"}`}
          type="button"
          onClick={() => { setScopeFilter("MINE"); setPage(1); }}
        >
          Tin do tôi đăng tuyển ({myJobsCount})
        </button>
      </div>

      <section className={`toolbar ${styles.filters}`} aria-label="Bộ lọc tin tuyển dụng">
        <div className="field search-field">
          <label className="label" htmlFor="recruiter-job-search">Tìm tin tuyển dụng</label>
          <input ref={searchRef} id="recruiter-job-search" className="input" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tên vị trí, phòng ban, địa điểm, phụ trách" />
          {query ? <button className="clear-search" type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => { setQuery(""); setPage(1); searchRef.current?.focus(); }}>×</button> : null}
        </div>
        <div className="field">
          <label className="label" htmlFor="job-status-filter">Trạng thái</label>
          <select id="job-status-filter" className="select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "ALL" | JobStatus); setPage(1); }}>
            <option value="ALL">Tất cả trạng thái</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="PENDING_APPROVAL">Chờ duyệt</option>
            <option value="PUBLISHED">Đang tuyển</option>
            <option value="CLOSED">Đã đóng</option>
            <option value="EXPIRED">Hết hạn</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="job-sort">Sắp xếp</label>
          <select id="job-sort" className="select" value={sort} onChange={(event) => { setSort(event.target.value as RecruiterJobSort); setPage(1); }}>
            <option value="UPDATED_DESC">Mới cập nhật</option>
            <option value="DEADLINE_ASC">Hạn nộp gần nhất</option>
            <option value="TITLE_ASC">Tên vị trí A–Z</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="job-page-size">Số dòng</label>
          <select id="job-page-size" className="select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            <option value="5">5 dòng</option>
            <option value="10">10 dòng</option>
            <option value="20">20 dòng</option>
          </select>
        </div>
      </section>

      {actionStatus ? <p className="notice notice-success" role="status">{actionStatus}</p> : null}
      {actionError ? <p className="notice notice-danger" role="alert"><strong>Chưa đổi được trạng thái tin.</strong> {actionError}</p> : null}

      <section className={`panel ${styles.results}`} aria-label="Danh sách tin tuyển dụng">
        <div className="list-meta">
          <strong>{jobTable.filteredCount} / {scopedTotal} tin phù hợp</strong>
          <span className="help">{scopeFilter === "MINE" ? "Danh sách tin do bạn trực tiếp đăng tuyển trong công ty." : "Lọc theo từ khóa, trạng thái và thời gian để tìm nhanh tin cần quản lý."}</span>
        </div>
        {loadError ? (
          <TransientRecoveryState
            error={loadError}
            failureCount={failureCount}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        ) : null}
        {loading ? <LoadingState /> : null}
        {!loading && !loadError && jobTable.filteredCount === 0 ? <EmptyState title="Không có tin phù hợp" description={scopeFilter === "MINE" ? "Bạn chưa tạo tin tuyển dụng nào hoặc bộ lọc hiện tại không khớp." : "Thử xóa từ khóa hoặc đổi trạng thái lọc."} /> : null}
        {!loading && !loadError && jobTable.filteredCount > 0 ? (
          <>
          <div className={`table-wrap ${styles.tableWrap}`}>
            <table className={`data-table ${styles.table}`} role="table">
              <caption>Hiển thị tin {jobTable.from}–{jobTable.to} trong {jobTable.filteredCount} kết quả</caption>
              <thead><tr><th scope="col">Vị trí</th><th scope="col">Trạng thái</th><th scope="col">Hạn nộp</th><th scope="col">Phụ trách</th><th scope="col">Thao tác</th></tr></thead>
              <tbody role="rowgroup">{jobTable.items.map((job) => {
                const canManage = canManageJob(job);
                const isMine = Boolean(account?.id && job.createdBy === account.id);
                return (
                  <tr key={job.id} role="row">
                    <td role="cell">
                      <Link href={`/recruiter/jobs/${job.id}/preview`} className={styles.jobTitle}>
                        <strong>{job.title}</strong>
                      </Link>
                      <div className="help">{job.location} · {job.department}</div>
                      {isRejectedRecruiterJob(job.status, job.rejectionReason) ? (
                        <div className="job-rejection-summary" role="note">
                          <strong>Quản trị viên yêu cầu chỉnh sửa</strong>
                          <span>{job.rejectionReason}</span>
                        </div>
                      ) : null}
                    </td>
                    <td role="cell"><StatusBadge tone={job.status === "PUBLISHED" ? "success" : job.status === "DRAFT" ? "neutral" : job.status === "EXPIRED" ? "danger" : "warning"}>{jobStatusLabel(job.status)}</StatusBadge></td>
                    <td role="cell"><span className={styles.mobileLabel}>Hạn nộp </span>{new Date(job.deadline).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td>
                    <td role="cell">
                      <span className={styles.mobileLabel}>Phụ trách </span>
                      {isMine ? <strong>{job.ownerName}</strong> : job.ownerName}
                      <div className="help">{isMine ? "Tin do bạn tạo" : (membershipRole === "OWNER" ? "Thành viên công ty" : "Người tạo tin")}</div>
                    </td>
                    <td role="cell"><div className={styles.actions}>
                      <Link className="btn btn-ghost" href={`/recruiter/jobs/${job.id}`}>Hồ sơ ứng tuyển</Link>
                      {canManage && ["DRAFT", "PENDING_APPROVAL", "PUBLISHED"].includes(job.status) ? (
                        <Link className={isRejectedRecruiterJob(job.status, job.rejectionReason) ? "btn btn-warning" : "btn btn-ghost"} href={`/recruiter/jobs/${job.id}/edit`}>
                          {job.status === "DRAFT" ? recruiterJobEditLabel(job.status, job.rejectionReason) : "Sửa tin"}
                        </Link>
                      ) : null}
                      {canManage && recruiterJobActions(job.status).map((action) => (
                        <button
                          key={action}
                          className={action === "CLOSE" ? "btn btn-warning" : "btn btn-secondary"}
                          type="button"
                          disabled={pendingJobId !== null}
                          aria-busy={pendingJobId === job.id}
                          onClick={() => {
                            if (action !== "REOPEN") { void runJobAction(job, action); return; }
                            const deadline = job.deadline.slice(0, 10);
                            setReopenDeadline(isDateAfterUtcToday(deadline) ? deadline : "");
                            setReopenError("");
                            setReopenTarget(job);
                          }}
                        >
                          {pendingJobId === job.id ? "Đang xử lý…" : recruiterJobActionLabel(action)}
                        </button>
                      ))}
                      {canManage && job.status === "DRAFT" && !job.rejectionReason ? (
                        <button className="btn btn-danger" type="button" disabled={pendingJobId !== null} onClick={() => { setDeleteError(""); setDeleteTarget(job); }}>
                          Xóa vĩnh viễn
                        </button>
                      ) : null}
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <nav className="btn-group pagination-actions" aria-label="Phân trang tin tuyển dụng">
            <button className="btn" type="button" disabled={jobTable.page <= 1} onClick={() => setPage(Math.max(1, jobTable.page - 1))}>Trang trước</button>
            <span className="badge badge-muted" role="status">Trang {jobTable.page}/{jobTable.totalPages}</span>
            <button className="btn" type="button" disabled={jobTable.page >= jobTable.totalPages} onClick={() => setPage(Math.min(jobTable.totalPages, jobTable.page + 1))}>Trang sau</button>
          </nav>
          </>
        ) : null}
      </section>
      <ConfirmationDialog open={reopenTarget !== null}
        title="Mở lại tin tuyển dụng?"
        description={`Tin “${reopenTarget?.title ?? ""}” sẽ nhận hồ sơ trở lại sau khi bạn xác nhận.`}
        confirmLabel="Mở lại tin"
        pending={pendingJobId !== null}
        error={reopenError}
        onConfirm={() => { if (reopenTarget) void runJobAction(reopenTarget, "REOPEN"); }}
        onCancel={() => setReopenTarget(null)}>
        <label className="field">Hạn nộp hồ sơ
          <input className="input" type="date" required value={reopenDeadline} disabled={pendingJobId !== null}
            onChange={(event) => { setReopenDeadline(event.target.value); setReopenError(""); }} />
        </label>
      </ConfirmationDialog>
      <ConfirmationDialog open={deleteTarget !== null}
        title="Xóa vĩnh viễn tin tuyển dụng?"
        description={`Bản nháp “${deleteTarget?.title ?? ""}” sẽ bị xóa và không thể khôi phục. Chỉ bản nháp chưa từng gửi duyệt mới có thể xóa.`}
        confirmLabel="Xóa vĩnh viễn"
        pending={pendingJobId !== null}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)} />
    </main>
  );
}
