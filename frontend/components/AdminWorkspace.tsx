"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { requestApi } from "../lib/apiClient";
import { person1Error } from "../lib/person1Api";
import { AdminDialog } from "./admin/AdminDialog";
import { AdminDataTable, AdminDetail } from "./admin/AdminDataTable";
import { AdminDashboard } from "./admin/AdminDashboard";
import { useAdminFilters } from "./admin/useAdminFilters";
import { EmptyState, LoadingState, PageHeader, StatusBadge } from "./ui";
type Row = Record<string, unknown>;
type Tab = "stats" | "companies" | "jobs" | "users" | "reports" | "audit";
type Command = {
  path: string;
  body: Record<string, unknown>;
  label: string;
  subject: string;
  needsReason: boolean;
};
const labels: Record<Tab, string> = {
  stats: "Thống kê",
  companies: "Xác minh công ty",
  jobs: "Duyệt tin tuyển dụng",
  users: "Quản lý người dùng",
  reports: "Báo cáo vi phạm",
  audit: "Nhật ký hoạt động",
};
const roleLabels: Record<string, string> = {
  CANDIDATE: "Ứng viên",
  RECRUITER: "Nhà tuyển dụng",
  ADMIN: "Quản trị viên",
};
const reportStatusLabels: Record<string, string> = {
  OPEN: "Mới gửi",
  PROCESSING: "Đang xử lý",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bỏ qua",
};
const targetLabels: Record<string, string> = {
  JOB: "Tin tuyển dụng",
  COMPANY: "Công ty",
  USER: "Tài khoản",
};
const count = (value: unknown) =>
  new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
export function AdminWorkspace({ initialTab = "stats" }: { initialTab?: Tab }) {
  if (initialTab === "stats") return <AdminDashboard />;
  return <AdminContent key={initialTab} tab={initialTab} />;
}
function AdminContent({ tab }: { tab: Exclude<Tab, "stats"> }) {
  const {
    page,
    query,
    role,
    locked,
    status,
    targetType,
    ready,
    setPage,
    setQuery,
    setRole,
    setLocked,
    setStatus,
    setTargetType,
  } = useAdminFilters(tab);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [command, setCommand] = useState<Command | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [commandError, setCommandError] = useState("");
  useEffect(() => {
    setEmail(query);
  }, [query]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    setDetail(null);
    async function load() {
      const paths = {
        companies: "companies/pending",
        jobs: "jobs/pending",
        users: "users",
        reports: "reports",
        audit: "audit-logs",
      };
      const result = await requestApi<Row[]>("/api/admin/" + paths[tab], {
        privateData: true,
        signal: controller.signal,
        query: {
          ...(tab !== "jobs" ? { page, limit: 20 } : {}),
          ...(tab === "users"
            ? {
                email: query,
                role: role || undefined,
                locked: locked || undefined,
              }
            : {}),
          ...(tab === "reports"
            ? { status: status || undefined, type: targetType || undefined }
            : {}),
        },
      });
      if (controller.signal.aborted) return;
      const resultTotal = Number(result.meta?.total ?? result.data.length);
      if (tab !== "audit" && page > 1 && (page - 1) * 20 >= resultTotal) {
        setPage(Math.max(1, Math.ceil(resultTotal / 20)));
        return;
      }
      setRows(result.data);
      setTotal(resultTotal);
    }
    load()
      .catch((e) => {
        if (!controller.signal.aborted) setError(person1Error(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, page, query, role, locked, status, targetType, reload, ready]);
  function choose(
    path: string,
    body: Record<string, unknown>,
    label: string,
    needsReason = false,
    subject = "",
  ) {
    setReason("");
    setCommandError("");
    setCommand({ path, body, label, needsReason, subject });
  }
  async function execute() {
    if (!command || pending) return;
    if (command.needsReason && reason.trim().length < 3) {
      setCommandError("Nhập lý do ít nhất 3 ký tự.");
      document.getElementById("admin-reason")?.focus();
      return;
    }
    setPending(true);
    setCommandError("");
    setError("");
    setNotice("");
    try {
      await requestApi("/api/admin/" + command.path, {
        method: "PATCH",
        privateData: true,
        body: {
          ...command.body,
          ...(command.needsReason
            ? {
                [command.path.startsWith("reports/") ? "resolution" : "reason"]:
                  reason.trim(),
              }
            : {}),
        },
      });
      setNotice(
        "Đã hoàn tất: " +
          command.label +
          (command.subject ? " — " + command.subject : ""),
      );
      setCommand(null);
      setReason("");
      setReload((n) => n + 1);
    } catch (e) {
      setCommandError(person1Error(e));
    } finally {
      setPending(false);
    }
  }
  const displayedRows =
    tab === "jobs"
      ? rows.slice((page - 1) * 20, page * 20)
      : tab === "audit"
        ? rows.filter((row) => row.outcome !== "STARTED")
        : rows;
  const descriptions: Record<Tab, string> = {
    stats: "Nắm bắt hoạt động tuyển dụng và theo dõi hiệu quả chuyển đổi.",
    users: "Tra cứu tài khoản, kiểm tra xác minh và quản lý quyền truy cập.",
    companies: "Kiểm tra hồ sơ doanh nghiệp trước khi xác minh trên CareerHub.",
    jobs: "Đối chiếu nội dung và phê duyệt các tin đang chờ đăng tuyển.",
    reports: "Xem phản ánh và xử lý các nội dung vi phạm trong hệ thống.",
    audit: "Theo dõi các thao tác quản trị và kết quả xử lý để đối soát.",
  };
  return (
    <main className="admin-workspace">
      <div className="admin-breadcrumb">
        <ShieldCheck size={15} aria-hidden="true" />
        <Link href="/admin">Quản trị</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span>{labels[tab]}</span>
      </div>
      <PageHeader
        title={labels[tab]}
        description={descriptions[tab]}
        action={
          <button
            className="btn"
            disabled={loading || pending}
            onClick={() => setReload((n) => n + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? "Đang tải…" : "Làm mới"}
          </button>
        }
      />
      {error && (
        <div className="admin-feedback admin-feedback-error" role="alert">
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>Chưa thể hoàn tất yêu cầu</strong>
            <p>{error}</p>
          </div>
          <button
            className="btn"
            disabled={loading}
            onClick={() => setReload((n) => n + 1)}
          >
            Thử lại
          </button>
        </div>
      )}
      {notice && (
        <p className="admin-feedback admin-feedback-success" role="status">
          {notice}
        </p>
      )}
      <>
        {tab === "users" && (
          <form
            className="admin-filters"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setPage(1);
              setQuery(email.trim());
            }}
          >
            <label className="field admin-search-field">
              Tìm theo email
              <div className="admin-search-input">
                <Search size={17} aria-hidden="true" />
                <input
                  className="input"
                  name="user-search"
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={200}
                  placeholder="Nhập email người dùng…"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>
            <label className="field">
              Vai trò
              <select
                className="select"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả vai trò</option>
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Trạng thái
              <select
                className="select"
                value={locked}
                onChange={(e) => {
                  setLocked(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="false">Đang mở</option>
                <option value="true">Đã khóa</option>
              </select>
            </label>
            <button className="btn btn-primary" disabled={loading}>
              Tìm người dùng
            </button>
            {(query || role || locked) && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEmail("");
                  setQuery("");
                  setRole("");
                  setLocked("");
                  setPage(1);
                }}
              >
                Xóa bộ lọc
              </button>
            )}
          </form>
        )}
        {tab === "reports" && (
          <div className="admin-filters">
            <label className="field">
              Trạng thái
              <select
                className="select"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(reportStatusLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Đối tượng
              <select
                className="select"
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả đối tượng</option>
                {Object.entries(targetLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <section
          className="admin-surface admin-directory"
          aria-label={labels[tab]}
          aria-busy={loading}
        >
          <div className="admin-section-heading">
            <div>
              <h2>
                {tab === "companies"
                  ? "Hồ sơ chờ xác minh"
                  : tab === "jobs"
                    ? "Tin đang chờ duyệt"
                    : tab === "users"
                      ? "Danh sách tài khoản"
                      : tab === "reports"
                        ? "Danh sách báo cáo"
                        : "Lịch sử quản trị"}
              </h2>
              <p>
                {loading
                  ? "Đang cập nhật dữ liệu…"
                  : tab === "audit"
                    ? `${count(displayedRows.length)} kết quả xử lý trong trang này`
                    : `${count(total)} kết quả${tab === "companies" || tab === "jobs" ? " đang chờ duyệt" : " phù hợp"}`}
              </p>
            </div>
            {!loading && !error && (
              <StatusBadge tone="neutral">
                {tab === "audit" ? "Mới nhất trước" : `${count(total)} bản ghi`}
              </StatusBadge>
            )}
          </div>
          {loading ? (
            <LoadingState label="Đang tải dữ liệu…" />
          ) : error ? (
            <EmptyState
              title="Danh sách chưa tải được"
              description="Sử dụng nút Thử lại ở trên để kết nối lại."
            />
          ) : displayedRows.length ? (
            <>
              <p className="admin-table-hint">
                Vuốt ngang bảng để xem trạng thái và thao tác.
              </p>
              <AdminDataTable
                tab={tab}
                rows={displayedRows}
                pending={pending}
                onDetail={setDetail}
                onChoose={choose}
              />
            </>
          ) : (
            <EmptyState
              title={
                tab === "audit"
                  ? "Chưa có kết quả xử lý trong trang này"
                  : tab === "companies" || tab === "jobs"
                    ? "Đã xử lý hết yêu cầu chờ duyệt"
                    : "Không có dữ liệu phù hợp"
              }
              description={
                tab === "audit" && rows.length === 20
                  ? "Chọn Trang sau để xem các nhật ký tiếp theo."
                  : tab === "companies" || tab === "jobs"
                    ? "Yêu cầu mới sẽ xuất hiện tại đây khi được gửi lên hệ thống."
                    : "Thử thay đổi bộ lọc hoặc làm mới để xem cập nhật."
              }
            />
          )}
          {!loading && !error && (
            <div className="admin-pagination">
              <span>
                {displayedRows.length
                  ? tab === "audit"
                    ? `${count(displayedRows.length)} kết quả xử lý`
                    : `${count((page - 1) * 20 + 1)}–${count((page - 1) * 20 + displayedRows.length)} trên ${count(total)} kết quả`
                  : "0 kết quả"}
              </span>
              <div>
                <button
                  className="admin-icon-button"
                  aria-label="Trang trước"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <span aria-live="polite">Trang {page}</span>
                <button
                  className="admin-icon-button"
                  aria-label="Trang sau"
                  disabled={
                    tab === "audit" ? rows.length < 20 : page * 20 >= total
                  }
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>
      </>
      {detail && (
        <AdminDialog
          title={
            tab === "companies"
              ? "Hồ sơ doanh nghiệp"
              : tab === "jobs"
                ? "Nội dung tin tuyển dụng"
                : tab === "users"
                  ? "Thông tin tài khoản"
                  : tab === "reports"
                    ? "Chi tiết báo cáo"
                    : "Chi tiết hoạt động"
          }
          onClose={() => setDetail(null)}
        >
          <AdminDetail row={detail} tab={tab} />
          <div className="admin-dialog-footer">
            <button className="btn" onClick={() => setDetail(null)}>
              Đóng chi tiết
            </button>
          </div>
        </AdminDialog>
      )}
      {command && (
        <AdminDialog
          title={command.label}
          pending={pending}
          onClose={() => setCommand(null)}
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void execute();
            }}
          >
            <div className="admin-detail-body">
              <p className="admin-command-subject">{command.subject}</p>
              <p className="admin-data-note">
                Thao tác sẽ được ghi vào nhật ký quản trị. Kiểm tra thông tin
                trước khi xác nhận.
              </p>
              {command.needsReason && (
                <label className="field">
                  Lý do / kết quả xử lý
                  <textarea
                    id="admin-reason"
                    className="textarea"
                    name="moderation-reason"
                    maxLength={500}
                    rows={4}
                    disabled={pending}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-required="true"
                    aria-invalid={!!commandError}
                    aria-describedby={
                      commandError ? "admin-command-error" : undefined
                    }
                    placeholder="Nhập lý do cụ thể để đối soát…"
                  />
                  <span className="admin-character-count">
                    {reason.length}/500 ký tự
                  </span>
                </label>
              )}
              {commandError && (
                <p
                  className="admin-field-error"
                  id="admin-command-error"
                  role="alert"
                >
                  {commandError}
                </p>
              )}
            </div>
            <div className="admin-dialog-footer">
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={() => setCommand(null)}
              >
                Quay lại
              </button>
              <button
                className={`btn ${command.needsReason ? "admin-confirm-danger" : "btn-primary"}`}
                type="submit"
                disabled={pending}
                aria-busy={pending}
              >
                {pending ? "Đang xử lý…" : "Xác nhận"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </main>
  );
}
