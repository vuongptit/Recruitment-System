"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { requestApi } from "../lib/apiClient";
import { person1Error } from "../lib/person1Api";
import { AdminDialog } from "./admin/AdminDialog";
import { AdminDataTable, AdminDetail } from "./admin/AdminDataTable";
import { AdminDashboard } from "./admin/AdminDashboard";
import { useAdminFilters } from "./admin/useAdminFilters";
import { EmptyState, LoadingState, PageHeader, StatusBadge } from "./ui";
type Row = Record<string, unknown>;
type Tab =
  | "stats"
  | "companies"
  | "company-verifications"
  | "jobs"
  | "users"
  | "reports"
  | "audit";
type Command = {
  path: string;
  body: Record<string, unknown>;
  label: string;
  subject: string;
  needsReason: boolean;
};
const labels: Record<Tab, string> = {
  stats: "Thống kê",
  companies: "Quản lý công ty",
  "company-verifications": "Duyệt công ty",
  jobs: "Quản lý tin tuyển dụng",
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
    suspended,
    ready,
    setPage,
    setQuery,
    setRole,
    setLocked,
    setStatus,
    setTargetType,
    setSuspended,
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
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const [editingCompany, setEditingCompany] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    taxCode: "",
    website: "",
    industry: "",
    size: "",
    address: "",
    description: "",
  });
  const [editError, setEditError] = useState("");
  const [editPending, setEditPending] = useState(false);

  function handleStartEdit(row: Row) {
    setEditingCompany(row);
    setEditError("");
    setEditForm({
      name: String(row.name || ""),
      taxCode: String(row.taxCode || ""),
      website: String(row.website || ""),
      industry: String(row.industry || ""),
      size: String(row.size || ""),
      address: String(row.address || ""),
      description: String(row.description || ""),
    });
  }

  async function handleSaveCompany(e: FormEvent) {
    e.preventDefault();
    if (!editingCompany) return;
    if (!editForm.name.trim()) {
      setEditError("Tên công ty không được để trống.");
      return;
    }
    setEditPending(true);
    setEditError("");
    try {
      await requestApi(`/api/admin/companies/${editingCompany.id}`, {
        method: "PUT",
        privateData: true,
        body: {
          ...editForm,
          expectedVersion: editingCompany.version,
        },
      });
      setNotice(`Đã cập nhật thông tin công ty: ${editForm.name}`);
      setEditingCompany(null);
      setReload((n) => n + 1);
      if (detail && detail.id === editingCompany.id) {
        setDetail((current) => (current ? { ...current, ...editForm } : current));
      }
    } catch (err) {
      setEditError(person1Error(err));
    } finally {
      setEditPending(false);
    }
  }

  function handleOpenDetail(row: Row) {
    lastTriggerRef.current = document.activeElement as HTMLElement | null;
    setDetail(row);
    if ((tab === "companies" || tab === "company-verifications") && row.id) {
      requestApi<Row>(`/api/admin/companies/${row.id}`, { privateData: true })
        .then((res) => {
          if (res.data) {
            setDetail((current) =>
              current && current.id === row.id
                ? { ...current, ...res.data }
                : current,
            );
          }
        })
        .catch(() => {});
    }
    setTimeout(() => {
      document
        .getElementById("admin-detail-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleCloseDetail() {
    setDetail(null);
    lastTriggerRef.current?.focus();
  }

  useEffect(() => {
    if (!detail) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseDetail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail]);
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
      const paths: Record<Exclude<Tab, "stats">, string> = {
        companies: "companies",
        "company-verifications": "companies",
        jobs: "jobs",
        users: "users",
        reports: "reports",
        audit: "audit-logs",
      };
      const result = await requestApi<
        Row[] | { items?: Row[]; total?: number }
      >("/api/admin/" + paths[tab], {
        privateData: true,
        signal: controller.signal,
        query: {
          ...(tab !== "audit" ? { page, limit: 20 } : {}),
          ...(tab === "companies"
            ? {
                status: status || "ALL",
                q: query,
                suspended: suspended || undefined,
              }
            : {}),
          ...(tab === "company-verifications"
            ? {
                status: status || "PENDING",
                q: query,
              }
            : {}),
          ...(tab === "jobs"
            ? {
                status: status || "PENDING_APPROVAL",
                q: query,
                suspended: suspended || undefined,
              }
            : {}),
          ...(tab === "users"
            ? {
                email: query,
                role: role || undefined,
                locked: locked || undefined,
              }
            : {}),
          ...(tab === "reports"
            ? {
                status: status || undefined,
                type: targetType || undefined,
              }
            : {}),
        },
      });
      if (controller.signal.aborted) return;
      const payload = result.data;
      const pageRows = Array.isArray(payload) ? payload : payload.items ?? [];
      const resultTotal = Number(
        result.meta?.total ??
          (!Array.isArray(payload) ? payload.total : undefined) ??
          pageRows.length,
      );
      if (tab !== "audit" && page > 1 && (page - 1) * 20 >= resultTotal) {
        setPage(Math.max(1, Math.ceil(resultTotal / 20)));
        return;
      }
      setRows(pageRows);
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
  }, [tab, page, query, role, locked, status, targetType, suspended, reload, ready]);
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
    tab === "audit"
        ? rows.filter((row) => row.outcome !== "STARTED")
        : rows;
  const descriptions: Record<Tab, string> = {
    stats: "Nắm bắt hoạt động tuyển dụng và theo dõi hiệu quả chuyển đổi.",
    users: "Tra cứu tài khoản, kiểm tra xác minh và quản lý quyền truy cập.",
    companies:
      "Tra cứu danh sách công ty, quản lý trạng thái hoạt động và cập nhật thông tin.",
    "company-verifications":
      "Kiểm tra và xử lý các hồ sơ đăng ký doanh nghiệp đang chờ xét duyệt.",
    jobs:
      "Tra cứu tin tuyển dụng, duyệt nội dung và gỡ/khôi phục tin vi phạm.",
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
        {(tab === "companies" || tab === "company-verifications" || tab === "jobs") && (
          <>
            {tab === "companies" && (
              <div className="admin-status-tabs" role="tablist" aria-label="Lọc nhanh trạng thái công ty">
                {[
                  { value: "ALL", label: "Tất cả công ty" },
                  { value: "PENDING", label: "Chờ xác minh" },
                  { value: "VERIFIED", label: "Đã xác minh" },
                  { value: "SUSPENDED", label: "Đang đình chỉ" },
                  { value: "REJECTED", label: "Bị từ chối" },
                ].map((item) => {
                  const isActive =
                    item.value === "SUSPENDED"
                      ? suspended === "true"
                      : (status || "ALL") === item.value && suspended !== "true";
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`admin-status-tab ${isActive ? "is-active admin-status-tab-active" : ""}`}
                      onClick={() => {
                        if (item.value === "SUSPENDED") {
                          setSuspended("true");
                          setStatus("ALL");
                        } else {
                          setSuspended("");
                          setStatus(item.value);
                        }
                        setPage(1);
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
            <form
              className="admin-filters"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                setPage(1);
                setQuery(email.trim());
              }}
            >
              <label className="field admin-search-field">
                {tab === "jobs" ? "Tìm tin tuyển dụng" : "Tìm công ty"}
                <div className="admin-search-input">
                  <Search size={17} aria-hidden="true" />
                  <input
                    className="input"
                    name="directory-search"
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={200}
                    placeholder={
                      tab === "jobs"
                        ? "Tên tin tuyển dụng"
                        : "Tên công ty hoặc mã số thuế"
                    }
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </label>
              {tab !== "company-verifications" && (
                <>
                  <label className="field">Trạng thái
                    <select
                      className="select"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                      }}
                    >
                      {tab === "companies" ? <>
                        <option value="ALL">Tất cả</option>
                        <option value="PENDING">Chờ xác minh</option>
                        <option value="VERIFIED">Đã xác minh</option>
                        <option value="REJECTED">Từ chối</option>
                      </> : <>
                        <option value="PENDING_APPROVAL">Chờ duyệt</option>
                        <option value="PUBLISHED">Đang tuyển</option>
                        <option value="DRAFT">Bản nháp</option>
                        <option value="CLOSED">Đã đóng</option>
                        <option value="EXPIRED">Hết hạn</option>
                        <option value="ALL">Tất cả</option>
                      </>}
                    </select>
                  </label>
                  <label className="field">Gỡ / đình chỉ
                    <select
                      className="select"
                      value={suspended}
                      onChange={(e) => {
                        setSuspended(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Tất cả</option>
                      <option value="false">Chưa gỡ / đình chỉ</option>
                      <option value="true">Đã gỡ / đình chỉ</option>
                    </select>
                  </label>
                </>
              )}
              <button className="btn btn-primary" disabled={loading}>Tìm kiếm</button>
              {(query ||
                (tab === "companies" && (status !== "ALL" || suspended)) ||
                (tab === "company-verifications" && (status !== "PENDING" || suspended)) ||
                (tab === "jobs" && (status !== "PENDING_APPROVAL" || suspended))) && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setEmail("");
                    setQuery("");
                    setStatus(
                      tab === "companies"
                        ? "ALL"
                        : tab === "company-verifications"
                          ? "PENDING"
                          : "PENDING_APPROVAL",
                    );
                    setSuspended("");
                    setPage(1);
                  }}
                >
                  Đặt lại
                </button>
              )}
            </form>
          </>
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
                  ? suspended === "true"
                    ? "Danh sách công ty đang đình chỉ"
                    : status === "PENDING"
                      ? "Hồ sơ công ty chờ xác minh"
                      : status === "VERIFIED"
                        ? "Danh sách công ty đã xác minh"
                        : status === "REJECTED"
                          ? "Danh sách công ty bị từ chối"
                          : "Danh sách tất cả công ty"
                  : tab === "company-verifications"
                    ? "Hồ sơ công ty chờ xét duyệt"
                    : tab === "jobs"
                      ? status === "PENDING_APPROVAL"
                        ? "Tin tuyển dụng chờ duyệt"
                        : "Danh sách tin tuyển dụng"
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
                    : `${count(total)} kết quả phù hợp`}
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
                onDetail={handleOpenDetail}
                onChoose={choose}
                onEdit={handleStartEdit}
              />
            </>
          ) : (
            <EmptyState
              title={
                tab === "audit"
                  ? "Chưa có kết quả xử lý trong trang này"
                  : tab === "company-verifications"
                    ? "Không có hồ sơ công ty chờ duyệt"
                    : tab === "companies" || tab === "jobs"
                      ? "Không có bản ghi phù hợp với bộ lọc"
                      : "Không có dữ liệu phù hợp"
              }
              description={
                tab === "audit" && rows.length === 20
                  ? "Chọn Trang sau để xem các nhật ký tiếp theo."
                  : tab === "company-verifications"
                    ? "Tất cả các yêu cầu đăng ký doanh nghiệp đã được xử lý."
                    : tab === "companies" || tab === "jobs"
                      ? "Thử thay đổi trạng thái hoặc từ khóa tìm kiếm."
                      : "Thử thay đổi bộ lọc hoặc làm mới để xem cập nhật."
              }
            />
          )}
          {detail && (
            <div
              id="admin-detail-panel"
              role="dialog"
              aria-label={
                tab === "companies" || tab === "company-verifications"
                  ? "Hồ sơ doanh nghiệp"
                  : tab === "jobs"
                    ? "Nội dung tin tuyển dụng"
                    : tab === "users"
                      ? "Thông tin tài khoản"
                      : tab === "reports"
                        ? "Chi tiết báo cáo"
                        : "Chi tiết hoạt động"
              }
              tabIndex={-1}
              className="admin-detail-panel-wrapper"
            >
              <div className="admin-detail-panel-heading">
                <h2>
                  {tab === "companies" || tab === "company-verifications"
                    ? "Hồ sơ doanh nghiệp"
                    : tab === "jobs"
                      ? "Nội dung tin tuyển dụng"
                      : tab === "users"
                        ? "Thông tin tài khoản"
                        : tab === "reports"
                          ? "Chi tiết báo cáo"
                          : "Chi tiết hoạt động"}
                </h2>
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label="Đóng chi tiết"
                  title="Đóng chi tiết"
                  onClick={handleCloseDetail}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <AdminDetail
                row={detail}
                tab={tab}
                pending={pending}
                onChoose={choose}
                onClose={handleCloseDetail}
                onEdit={handleStartEdit}
              />
            </div>
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
              <div className="admin-pagination-controls">
                <button
                  className="btn btn-secondary admin-pagination-btn"
                  aria-label="Trang trước"
                  disabled={page === 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    setDetail(null);
                  }}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  <span>Trang trước</span>
                </button>
                <span className="admin-pagination-current" aria-live="polite">
                  Trang {page}
                </span>
                <button
                  className="btn btn-secondary admin-pagination-btn"
                  aria-label="Trang sau"
                  disabled={
                    tab === "audit" ? rows.length < 20 : page * 20 >= total
                  }
                  onClick={() => {
                    setPage((p) => p + 1);
                    setDetail(null);
                  }}
                >
                  <span>Trang sau</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </section>
      </>
      {editingCompany && (
        <AdminDialog
          title={`Chỉnh sửa thông tin: ${String(editingCompany.name || "Doanh nghiệp")}`}
          pending={editPending}
          onClose={() => setEditingCompany(null)}
        >
          <form
            noValidate
            onSubmit={handleSaveCompany}
            className="admin-edit-form"
          >
            <div className="admin-detail-body">
              {editError && (
                <p className="admin-field-error" role="alert">
                  {editError}
                </p>
              )}
              <div className="admin-form-grid">
                <label className="field">
                  Tên công ty *
                  <input
                    className="input"
                    required
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Mã số thuế
                  <input
                    className="input"
                    value={editForm.taxCode}
                    onChange={(e) =>
                      setEditForm({ ...editForm, taxCode: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Website
                  <input
                    className="input"
                    type="url"
                    placeholder="https://example.com"
                    value={editForm.website}
                    onChange={(e) =>
                      setEditForm({ ...editForm, website: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Lĩnh vực hoạt động
                  <input
                    className="input"
                    placeholder="VD: Công nghệ thông tin, Bán lẻ..."
                    value={editForm.industry}
                    onChange={(e) =>
                      setEditForm({ ...editForm, industry: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Quy mô nhân sự
                  <select
                    className="select"
                    value={editForm.size}
                    onChange={(e) =>
                      setEditForm({ ...editForm, size: e.target.value })
                    }
                  >
                    <option value="">Chưa chọn</option>
                    <option value="1-10">1-10 nhân viên</option>
                    <option value="11-50">11-50 nhân viên</option>
                    <option value="51-200">51-200 nhân viên</option>
                    <option value="201-500">201-500 nhân viên</option>
                    <option value="500+">500+ nhân viên</option>
                  </select>
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  Địa chỉ trụ sở
                  <input
                    className="input"
                    value={editForm.address}
                    onChange={(e) =>
                      setEditForm({ ...editForm, address: e.target.value })
                    }
                  />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  Mô tả công ty
                  <textarea
                    className="textarea"
                    rows={4}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="admin-dialog-footer">
              <button
                className="btn"
                type="button"
                disabled={editPending}
                onClick={() => setEditingCompany(null)}
              >
                Hủy
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={editPending}
                aria-busy={editPending}
              >
                {editPending ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </form>
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
              {command.path.endsWith("/moderation") && (
                <p className="admin-data-note">
                  Nội dung sẽ bị ẩn khỏi các trang công khai. Hồ sơ, đơn ứng tuyển
                  và lịch sử liên quan vẫn được giữ lại; có thể khôi phục tại danh
                  sách này.
                </p>
              )}
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
