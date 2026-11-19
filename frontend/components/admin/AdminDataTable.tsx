import {
  Award,
  Ban,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  Globe,
  Image as ImageIcon,
  Info,
  LockKeyhole,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Tag,
  UsersRound,
  Video as VideoIcon,
  X,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "../ui";
import { jobStatusLabel } from "../../lib/recruitmentLabels";

export type AdminRow = Record<string, unknown>;
export type AdminTab = "companies" | "jobs" | "users" | "reports" | "audit";
export const roleLabels: Record<string, string> = {
  CANDIDATE: "Ứng viên",
  RECRUITER: "Nhà tuyển dụng",
  ADMIN: "Quản trị viên",
};
export const reportLabels: Record<string, string> = {
  OPEN: "Mới gửi",
  PROCESSING: "Đang xử lý",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bỏ qua",
};
export const targetLabels: Record<string, string> = {
  JOB: "Tin tuyển dụng",
  COMPANY: "Công ty",
  USER: "Tài khoản",
  AUTH: "Tài khoản",
  REPORT: "Báo cáo vi phạm",
};
const outcomes: Record<string, string> = {
  SUCCESS: "Thành công",
  SUCCEEDED: "Thành công",
  FAILED: "Thất bại",
  FAILURE: "Thất bại",
  PENDING: "Đang xử lý",
  STARTED: "Đã bắt đầu",
  UNKNOWN: "Chưa xác định kết quả",
};
const actionLabels: Record<string, string> = {
  LOCK_USER: "Khóa tài khoản",
  UNLOCK_USER: "Mở khóa tài khoản",
  APPROVE_JOB: "Duyệt tin",
  REJECT_JOB: "Từ chối tin",
  VERIFY_COMPANY: "Xác minh công ty",
  RESOLVE_REPORT: "Xử lý báo cáo",
  DISMISS_REPORT: "Bỏ qua báo cáo",
  HANDLE_REPORT: "Xử lý báo cáo",
  SUSPEND_JOB: "Gỡ tin tuyển dụng",
  RESTORE_JOB: "Khôi phục tin tuyển dụng",
  SUSPEND_COMPANY: "Đình chỉ công ty",
  RESTORE_COMPANY: "Khôi phục công ty",
};
const auditTitle = (row: AdminRow) =>
  actionLabels[String(row.action)] || "Hoạt động quản trị";
const text = (value: unknown, fallback = "Chưa cập nhật") =>
  typeof value === "string" && value.trim()
    ? value
    : typeof value === "number"
      ? String(value)
      : fallback;
const date = (value: unknown, withTime = false) => {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? "Chưa cập nhật"
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        ...(withTime ? { timeStyle: "short" as const } : {}),
      }).format(parsed);
};
export const rowTitle = (row: AdminRow) =>
  text(
    row.name ??
      row.title ??
      row.email ??
      row.reason ??
      actionLabels[String(row.action)] ??
      row.action,
    String(row.id),
  );

export function AdminDataTable({
  tab,
  rows,
  pending,
  onDetail,
  onChoose,
}: {
  tab: AdminTab;
  rows: AdminRow[];
  pending: boolean;
  onDetail: (row: AdminRow) => void;
  onChoose: (
    path: string,
    body: AdminRow,
    label: string,
    needsReason?: boolean,
    subject?: string,
  ) => void;
}) {
  const columns =
    tab === "users"
      ? [
          "Tài khoản",
          "Tên người dùng",
          "Vai trò",
          "Trạng thái",
          "Xác minh",
          "Thao tác",
        ]
      : tab === "audit"
        ? ["Hoạt động", "Đối tượng", "Kết quả", "Thời gian", "Chi tiết"]
        : tab === "reports"
          ? [
              "Nội dung phản ánh",
              "Đối tượng",
              "Trạng thái",
              "Ngày gửi",
              "Thao tác",
            ]
          : tab === "companies"
            ? ["Doanh nghiệp", "Lĩnh vực", "Trạng thái", "Ngày gửi", "Thao tác"]
            : [
                "Tin tuyển dụng",
                "Địa điểm",
                "Hạn ứng tuyển",
                "Trạng thái",
                "Thao tác",
              ];
  return (
    <div
      className="admin-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Danh sách quản trị — cuộn ngang để xem đầy đủ"
    >
      <table className="admin-table">
        <caption className="sr-only">
          Danh sách {columns[0].toLowerCase()}
        </caption>
        <thead>
          <tr>
            {columns.map((label) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = String(row.id);
            const subject = tab === "audit" ? auditTitle(row) : rowTitle(row);
            const choose = (
              path: string,
              body: AdminRow,
              label: string,
              needsReason = false,
            ) => onChoose(path, body, label, needsReason, subject);
            return (
              <tr key={id + index}>
                <td>
                  <div className="admin-record">
                    {tab !== "audit" && (
                      <span
                        className={`admin-record-avatar ${tab === "companies" ? "admin-company-avatar" : ""}`}
                        aria-hidden="true"
                      >
                        {tab === "companies" &&
                        typeof (row.logoUrl ?? (row.logo as Record<string, unknown> | undefined)?.url) === "string" &&
                        /^https?:\/\//.test(String(row.logoUrl ?? (row.logo as Record<string, unknown> | undefined)?.url)) ? (
                          <img
                            src={String(row.logoUrl ?? (row.logo as Record<string, unknown> | undefined)?.url)}
                            alt=""
                            width={36}
                            height={36}
                            loading="lazy"
                          />
                        ) : tab === "users" ? (
                          text(row.email).slice(0, 1).toUpperCase()
                        ) : tab === "jobs" ? (
                          <BriefcaseBusiness size={18} />
                        ) : tab === "reports" ? (
                          <Flag size={18} />
                        ) : (
                          <Building2 size={18} />
                        )}
                      </span>
                    )}
                    <div>
                      <strong>{subject}</strong>
                      <small>
                        {tab === "companies"
                          ? text(row.taxCode, "Chưa có mã số thuế")
                          : tab === "jobs"
                            ? text(
                                row.companyName ?? row.company_name,
                                typeof row.companyId === "string"
                                  ? `Mã công ty: ${row.companyId}`
                                  : "Chưa rõ công ty",
                              )
                            : tab === "users"
                              ? text(row.locked_reason, "")
                              : tab === "reports"
                                ? text(row.description, "")
                                : typeof row.reason === "string" &&
                                    row.reason.trim()
                                  ? `Lý do: ${row.reason}`
                                  : "Không có ghi chú"}
                      </small>
                    </div>
                  </div>
                </td>
                {tab === "users" ? (
                  <>
                    <td>
                      {text(
                        row.fullName ?? row.full_name ?? row.name,
                        "Chưa cập nhật",
                      )}
                    </td>
                    <td>
                      <StatusBadge tone="neutral">
                        {roleLabels[String(row.role)] || "Chưa rõ vai trò"}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={row.is_locked ? "danger" : "success"}>
                        {row.is_locked ? "Đã khóa" : "Đang mở"}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge
                        tone={row.is_verified ? "success" : "warning"}
                      >
                        {row.is_verified ? "Đã xác minh" : "Chưa xác minh"}
                      </StatusBadge>
                    </td>
                  </>
                ) : tab === "audit" ? (
                  <>
                    <td>
                      <strong className="admin-target-label">
                        {text(
                          row.target_label,
                          "Chưa lấy được thông tin đối tượng",
                        )}
                      </strong>
                      <small className="admin-cell-subtitle">
                        {targetLabels[String(row.target_type)] ||
                          "Đối tượng quản trị"}
                        {row.target_role && roleLabels[String(row.target_role)]
                          ? ` · ${roleLabels[String(row.target_role)]}`
                          : ""}
                      </small>
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          String(row.outcome).includes("FAIL")
                            ? "danger"
                            : ["SUCCESS", "SUCCEEDED"].includes(
                                  String(row.outcome),
                                )
                              ? "success"
                              : row.outcome === "UNKNOWN"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {outcomes[String(row.outcome)] || "Chưa xác định kết quả"}
                      </StatusBadge>
                    </td>
                    <td className="admin-nowrap">
                      {date(row.created_at, true)}
                    </td>
                  </>
                ) : tab === "reports" ? (
                  <>
                    <td>
                      {targetLabels[String(row.target_type)] ||
                        "Chưa rõ loại đối tượng"}
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          row.status === "OPEN" || row.status === "PROCESSING"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {reportLabels[String(row.status)] || "Chưa rõ trạng thái"}
                      </StatusBadge>
                    </td>
                    <td className="admin-nowrap">{date(row.created_at)}</td>
                  </>
                ) : tab === "companies" ? (
                  <>
                    <td>{text(row.industry)}</td>
                    <td>
                      <StatusBadge tone={row.isSuspended ? "danger" : row.verifiedStatus === "VERIFIED" ? "success" : row.verifiedStatus === "REJECTED" ? "danger" : "warning"}>
                        {row.isSuspended ? "Đình chỉ" : row.verifiedStatus === "VERIFIED" ? "Đã xác minh" : row.verifiedStatus === "REJECTED" ? "Từ chối" : "Chờ xác minh"}
                      </StatusBadge>
                    </td>
                    <td className="admin-nowrap">
                      {date(row.createdAt ?? row.created_at)}
                    </td>
                  </>
                ) : (
                  <>
                    <td>{text(row.location)}</td>
                    <td className="admin-nowrap">{date(row.deadline)}</td>
                    <td>
                      <StatusBadge tone={row.isSuspended ? "danger" : row.status === "PUBLISHED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>
                        {row.isSuspended ? "Đã gỡ" : jobStatusLabel(String(row.status))}
                      </StatusBadge>
                    </td>
                  </>
                )}
                <td>
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className="admin-icon-button"
                      aria-label={`Xem chi tiết ${subject}`}
                      title="Xem chi tiết"
                      onClick={() => onDetail(row)}
                    >
                      <Eye size={17} aria-hidden="true" />
                    </button>
                    {tab === "companies" && row.verifiedStatus === "PENDING" && (
                      <>
                        <button
                          className="btn admin-approve"
                          disabled={pending}
                          onClick={() =>
                            choose(
                              `companies/${id}/verify`,
                              { decision: "APPROVE" },
                              "Duyệt công ty",
                            )
                          }
                        >
                          Duyệt
                        </button>
                        <button
                          className="btn admin-danger"
                          disabled={pending}
                          onClick={() =>
                            choose(
                              `companies/${id}/verify`,
                              { decision: "REJECT" },
                              "Từ chối công ty",
                              true,
                            )
                          }
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    {tab === "jobs" && row.status === "PENDING_APPROVAL" && (
                      <>
                        <button
                          className="btn admin-approve"
                          disabled={pending}
                          onClick={() =>
                            choose(`jobs/${id}/approve`, {}, "Duyệt tin")
                          }
                        >
                          Duyệt
                        </button>
                        <button
                          className="btn admin-danger"
                          disabled={pending}
                          onClick={() =>
                            choose(`jobs/${id}/reject`, {}, "Từ chối tin", true)
                          }
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    {(tab === "companies" || tab === "jobs") && (
                      <button
                        type="button"
                        className={`btn ${row.isSuspended ? "admin-approve" : "admin-danger"}`}
                        disabled={pending || typeof row.aggregateVersion !== "number"}
                        title={typeof row.aggregateVersion !== "number" ? "Thiếu phiên bản dữ liệu để cập nhật an toàn" : undefined}
                        onClick={() => {
                          const suspended = !row.isSuspended;
                          choose(
                            `${tab}/${id}/moderation`,
                            { suspended, expectedVersion: row.aggregateVersion, operationId: crypto.randomUUID() },
                            suspended ? (tab === "companies" ? "Đình chỉ công ty" : "Gỡ tin tuyển dụng") : (tab === "companies" ? "Khôi phục công ty" : "Khôi phục tin tuyển dụng"),
                            true,
                          );
                        }}
                      >
                        {row.isSuspended ? <RotateCcw size={14} aria-hidden="true" /> : <Ban size={14} aria-hidden="true" />}
                        {row.isSuspended ? "Khôi phục" : "Gỡ"}
                      </button>
                    )}
                    {tab === "users" && (
                      <button
                        className={`btn ${row.is_locked ? "" : "admin-danger"}`}
                        title={
                          row.role === "ADMIN"
                            ? "Không thể khóa tài khoản quản trị viên"
                            : undefined
                        }
                        disabled={pending || row.role === "ADMIN"}
                        onClick={() =>
                          choose(
                            `users/${id}/lock`,
                            { locked: !row.is_locked },
                            row.is_locked
                              ? "Mở khóa tài khoản"
                              : "Khóa tài khoản",
                            !row.is_locked,
                          )
                        }
                      >
                        <LockKeyhole size={14} aria-hidden="true" />
                        {row.is_locked ? "Mở khóa" : "Khóa"}
                      </button>
                    )}
                    {tab === "reports" && row.status === "OPEN" && (
                      <>
                        <button
                          className="btn"
                          disabled={pending}
                          onClick={() =>
                            choose(
                              `reports/${id}`,
                              {
                                status: "DISMISSED",
                                expectedVersion: row.version,
                              },
                              "Bỏ qua báo cáo",
                              true,
                            )
                          }
                        >
                          Bỏ qua
                        </button>
                        <button
                          className="btn admin-danger"
                          disabled={pending}
                          onClick={() =>
                            choose(
                              `reports/${id}`,
                              {
                                status: "RESOLVED",
                                expectedVersion: row.version,
                              },
                              row.target_type === "USER"
                                ? "Chấp nhận báo cáo và khóa tài khoản"
                                : row.target_type === "COMPANY"
                                  ? "Chấp nhận báo cáo và đình chỉ công ty"
                                  : "Chấp nhận báo cáo và gỡ tin tuyển dụng",
                              true,
                            )
                          }
                        >
                          Xử lý
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminCompanyDetail({
  row,
  pending = false,
  onChoose,
  onClose,
}: {
  row: AdminRow;
  pending?: boolean;
  onChoose?: (
    path: string,
    body: AdminRow,
    label: string,
    needsReason?: boolean,
    subject?: string,
  ) => void;
  onClose?: () => void;
}) {
  const id = String(row.id || "");
  const name = String(row.name || "Doanh nghiệp");
  const taxCode = text(row.taxCode);
  const industry = text(row.industry);
  const size = text(row.size);
  const address = text(row.address);
  const website =
    typeof row.website === "string" && row.website.trim()
      ? row.website.trim()
      : null;
  const description = text(row.description);
  const verifiedStatus = String(row.verifiedStatus || "PENDING");
  const rejectReason =
    typeof row.rejectReason === "string" && row.rejectReason.trim()
      ? row.rejectReason.trim()
      : null;
  const suspensionReason =
    typeof row.suspensionReason === "string" && row.suspensionReason.trim()
      ? row.suspensionReason.trim()
      : null;
  const isSuspended = Boolean(row.isSuspended);
  const ownerName = text(
    row.ownerName || row.ownerEmail || row.email,
    "Đang đồng bộ thành viên",
  );
  const createdAt = row.createdAt;
  const updatedAt = row.updatedAt;

  const logoUrl =
    (row.logo as { url?: string } | undefined)?.url ||
    (typeof row.logoUrl === "string" ? row.logoUrl : null);

  const rawMedia = Array.isArray(row.media)
    ? (row.media as Array<{
        url: string;
        type?: string;
        sortOrder?: number;
      }>)
    : [];

  const verifiedStatusLabels: Record<string, string> = {
    VERIFIED: "Đã xác minh",
    PENDING: "Chờ xác minh",
    REJECTED: "Đã từ chối",
    UNVERIFIED: "Chưa xác minh",
  };

  const statusTone: "warning" | "success" | "danger" | "neutral" =
    isSuspended
      ? "danger"
      : row.verifiedStatus === "VERIFIED"
        ? "success"
        : row.verifiedStatus === "REJECTED"
          ? "danger"
          : "warning";

  const statusLabel = isSuspended
    ? "Đã đình chỉ"
    : verifiedStatusLabels[verifiedStatus] || "Chờ xác minh";

  return (
    <div className="admin-company-detail">
      {/* 4 Overview metric cards */}
      <section className="admin-company-metrics" aria-label="Tóm tắt công ty">
        <div className="admin-company-metric-card">
          <span className="metric-label">Trạng thái</span>
          <strong className={`metric-value tone-${statusTone}`}>
            {statusLabel}
          </strong>
          <span className="metric-sub">Xác minh doanh nghiệp</span>
        </div>
        <div className="admin-company-metric-card">
          <span className="metric-label">Lĩnh vực</span>
          <strong className="metric-value">{industry}</strong>
          <span className="metric-sub">Thông tin doanh nghiệp</span>
        </div>
        <div className="admin-company-metric-card">
          <span className="metric-label">Người đại diện / Sở hữu</span>
          <strong className="metric-value">{ownerName}</strong>
          <span className="metric-sub">Quyền quản lý công ty</span>
        </div>
        <div className="admin-company-metric-card">
          <span className="metric-label">Quy mô</span>
          <strong className="metric-value">
            {size !== "Chưa cập nhật" ? `${size} nhân sự` : "Chưa cập nhật"}
          </strong>
          <span className="metric-sub">Quy mô nhân sự</span>
        </div>
      </section>

      {/* Main 2-column layout */}
      <div className="admin-company-layout">
        {/* Left Column */}
        <div className="admin-company-main">
          {/* Header */}
          <div className="admin-company-header">
            <div className="admin-company-brand">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`Logo ${name}`}
                  className="admin-company-logo-avatar"
                />
              ) : (
                <div className="admin-company-logo-fallback" aria-hidden="true">
                  <Building2 size={32} />
                </div>
              )}
              <div className="admin-company-title-wrap">
                <h2>{name}</h2>
                <p className="admin-company-meta">
                  MST {taxCode} · Chủ sở hữu {ownerName}
                </p>
              </div>
            </div>
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
          </div>

          {/* Legal Notice */}
          <div className="admin-company-notice admin-notice-legal">
            <strong>Hồ sơ pháp lý</strong>
            <p>
              Đổi tên hoặc mã số thuế khi đã xác minh sẽ đưa công ty về trạng
              thái chờ duyệt.
            </p>
          </div>

          {/* Status Notice */}
          {verifiedStatus === "PENDING" && !isSuspended && (
            <div
              className="admin-company-notice admin-notice-pending"
              aria-live="polite"
            >
              <strong>Đang chờ xác minh</strong>
              <p>Hồ sơ đã được gửi và đang chờ Admin xem xét.</p>
            </div>
          )}
          {verifiedStatus === "VERIFIED" && !isSuspended && (
            <div
              className="admin-company-notice admin-notice-verified"
              aria-live="polite"
            >
              <strong>Đã xác minh</strong>
              <p>
                Hồ sơ công ty đã được kiểm duyệt và xác thực hợp lệ trên hệ thống.
              </p>
            </div>
          )}
          {verifiedStatus === "REJECTED" && !isSuspended && (
            <div
              className="admin-company-notice admin-notice-rejected"
              aria-live="polite"
            >
              <strong>Đã từ chối xác minh</strong>
              <p>Hồ sơ doanh nghiệp đã bị từ chối yêu cầu xác thực.</p>
              {rejectReason && (
                <p className="admin-notice-reason">
                  <strong>Lý do từ chối:</strong> {rejectReason}
                </p>
              )}
            </div>
          )}
          {isSuspended && (
            <div
              className="admin-company-notice admin-notice-suspended"
              aria-live="polite"
            >
              <strong>Doanh nghiệp đang bị đình chỉ</strong>
              <p>Công ty đang tạm thời bị ẩn khỏi hệ thống.</p>
              {suspensionReason && (
                <p className="admin-notice-reason">
                  <strong>Lý do đình chỉ:</strong> {suspensionReason}
                </p>
              )}
            </div>
          )}

          {/* Fact items list */}
          <dl className="admin-company-facts">
            <div className="admin-fact-row">
              <dt>
                <Building2 size={16} aria-hidden="true" /> Lĩnh vực
              </dt>
              <dd>{industry}</dd>
            </div>
            <div className="admin-fact-row">
              <dt>
                <UsersRound size={16} aria-hidden="true" /> Quy mô
              </dt>
              <dd>
                {size !== "Chưa cập nhật"
                  ? `${size} nhân sự`
                  : "Chưa cập nhật"}
              </dd>
            </div>
            <div className="admin-fact-row">
              <dt>
                <MapPin size={16} aria-hidden="true" /> Địa chỉ
              </dt>
              <dd>{address}</dd>
            </div>
            <div className="admin-fact-row">
              <dt>
                <Globe size={16} aria-hidden="true" /> Trang web
              </dt>
              <dd>
                {website ? (
                  <a
                    href={
                      website.startsWith("http")
                        ? website
                        : `https://${website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="admin-text-link"
                  >
                    {website} <ExternalLink size={13} aria-hidden="true" />
                  </a>
                ) : (
                  "Chưa cập nhật"
                )}
              </dd>
            </div>
            <div className="admin-fact-row">
              <dt>
                <FileText size={16} aria-hidden="true" /> Mã số thuế
              </dt>
              <dd>{taxCode}</dd>
            </div>
            <div className="admin-fact-row full-width">
              <dt>
                <Info size={16} aria-hidden="true" /> Giới thiệu
              </dt>
              <dd className="admin-company-description">{description}</dd>
            </div>
            {Boolean(createdAt) && (
              <div className="admin-fact-row">
                <dt>
                  <CalendarDays size={16} aria-hidden="true" /> Ngày gửi hồ sơ
                </dt>
                <dd>{date(createdAt, true)}</dd>
              </div>
            )}
            {Boolean(updatedAt) && (
              <div className="admin-fact-row">
                <dt>
                  <CalendarDays size={16} aria-hidden="true" /> Cập nhật gần nhất
                </dt>
                <dd>{date(updatedAt, true)}</dd>
              </div>
            )}
            {typeof row.aggregateVersion === "number" && (
              <div className="admin-fact-row">
                <dt>
                  <FileText size={16} aria-hidden="true" /> Phiên bản dữ liệu
                </dt>
                <dd>{String(row.aggregateVersion)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Right Column: Media */}
        <div className="admin-company-side">
          <div className="admin-side-card">
            <div className="admin-side-head">
              <h3>Thư viện hình ảnh và video</h3>
              <p>Ảnh đại diện, không gian làm việc và tư liệu công ty.</p>
            </div>

            {/* Logo Preview */}
            <div className="admin-media-group">
              <span className="admin-media-group-label">Logo công ty</span>
              {logoUrl ? (
                <div className="admin-logo-card">
                  <img
                    src={logoUrl}
                    alt={`Logo ${name}`}
                    className="admin-logo-large-preview"
                  />
                  <a
                    href={logoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="admin-icon-link"
                  >
                    Xem ảnh gốc <ExternalLink size={13} />
                  </a>
                </div>
              ) : (
                <div className="admin-media-empty-item">
                  <Building2 size={24} aria-hidden="true" />
                  <span>Chưa cập nhật logo</span>
                </div>
              )}
            </div>

            {/* Gallery */}
            <div className="admin-media-group">
              <div className="admin-media-group-head">
                <span className="admin-media-group-label">
                  Hình ảnh & Video ({rawMedia.length})
                </span>
              </div>
              {rawMedia.length > 0 ? (
                <div className="admin-media-grid">
                  {rawMedia.map((item, idx) => (
                    <div key={item.url || idx} className="admin-media-item">
                      {item.type === "VIDEO" ? (
                        <video
                          controls
                          preload="metadata"
                          className="admin-media-video"
                        >
                          <source src={item.url} />
                        </video>
                      ) : (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-media-thumb-link"
                          title="Xem ảnh gốc"
                        >
                          <img
                            src={item.url}
                            alt={`Ảnh ${idx + 1}`}
                            loading="lazy"
                            className="admin-media-thumb"
                          />
                          <span className="admin-media-zoom">
                            <ExternalLink size={14} />
                          </span>
                        </a>
                      )}
                      <span className="admin-media-tag">
                        {item.type === "VIDEO" ? (
                          <>
                            <VideoIcon size={11} /> Video
                          </>
                        ) : (
                          <>
                            <ImageIcon size={11} /> Ảnh
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-media-empty-state">
                  <ImageIcon size={28} aria-hidden="true" />
                  <p>Doanh nghiệp chưa bổ sung ảnh hoặc video giới thiệu.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="admin-detail-actions-bar">
        <div className="admin-detail-action-buttons">
          {onChoose && verifiedStatus === "PENDING" && (
            <>
              <button
                type="button"
                className="btn admin-approve"
                disabled={pending}
                onClick={() =>
                  onChoose(
                    `companies/${id}/verify`,
                    { decision: "APPROVE" },
                    "Duyệt công ty",
                    false,
                    name,
                  )
                }
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Duyệt công ty
              </button>
              <button
                type="button"
                className="btn admin-danger"
                disabled={pending}
                onClick={() =>
                  onChoose(
                    `companies/${id}/verify`,
                    { decision: "REJECT" },
                    "Từ chối công ty",
                    true,
                    name,
                  )
                }
              >
                <XCircle size={16} aria-hidden="true" />
                Từ chối
              </button>
            </>
          )}
          {onChoose && (
            <button
              type="button"
              className={`btn ${isSuspended ? "admin-approve" : "admin-danger"}`}
              disabled={pending || typeof row.aggregateVersion !== "number"}
              title={
                typeof row.aggregateVersion !== "number"
                  ? "Thiếu phiên bản dữ liệu để cập nhật an toàn"
                  : undefined
              }
              onClick={() => {
                const suspended = !isSuspended;
                onChoose(
                  `companies/${id}/moderation`,
                  {
                    suspended,
                    expectedVersion: row.aggregateVersion,
                    operationId: crypto.randomUUID(),
                  },
                  suspended ? "Đình chỉ công ty" : "Khôi phục công ty",
                  true,
                  name,
                );
              }}
            >
              {isSuspended ? (
                <RotateCcw size={15} aria-hidden="true" />
              ) : (
                <Ban size={15} aria-hidden="true" />
              )}
              {isSuspended ? "Khôi phục" : "Đình chỉ"}
            </button>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Đóng chi tiết
          </button>
        )}
      </div>
    </div>
  );
}

function formatJobContent(value: unknown) {
  if (!value) {
    return <p className="admin-job-empty">Chưa có thông tin</p>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="admin-job-prose">
        {value.map((item, idx) => (
          <div key={idx} className="admin-job-line admin-job-bullet">
            <span className="admin-job-dot" aria-hidden="true">•</span>
            <span>{String(item)}</span>
          </div>
        ))}
      </div>
    );
  }
  const text = String(value).trim();
  if (!text) {
    return <p className="admin-job-empty">Chưa có thông tin</p>;
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return <p className="admin-job-empty">Chưa có thông tin</p>;
  }

  return (
    <div className="admin-job-prose">
      {lines.map((line, idx) => {
        const isBullet = /^[•\-*+]\s*/.test(line);
        const cleanLine = isBullet ? line.replace(/^[•\-*+]\s*/, "") : line;
        return (
          <div
            key={idx}
            className={
              isBullet
                ? "admin-job-line admin-job-bullet"
                : "admin-job-line admin-job-paragraph"
            }
          >
            {isBullet && (
              <span className="admin-job-dot" aria-hidden="true">
                •
              </span>
            )}
            <span>{cleanLine}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatSalary(row: AdminRow): string {
  if (row.isNegotiable) return "Lương thỏa thuận";
  const numMin =
    row.salaryMin !== null && row.salaryMin !== undefined
      ? Number(row.salaryMin)
      : null;
  const numMax =
    row.salaryMax !== null && row.salaryMax !== undefined
      ? Number(row.salaryMax)
      : null;
  const currency = String(row.currency || "VND");

  if (numMin && numMax) {
    if (currency === "VND" && numMin >= 1000000 && numMax >= 1000000) {
      return `${(numMin / 1000000).toLocaleString("vi-VN")} - ${(numMax / 1000000).toLocaleString("vi-VN")} triệu ${currency}`;
    }
    return `${numMin.toLocaleString("vi-VN")} – ${numMax.toLocaleString("vi-VN")} ${currency}`;
  }
  if (numMin) {
    if (currency === "VND" && numMin >= 1000000) {
      return `Từ ${(numMin / 1000000).toLocaleString("vi-VN")} triệu ${currency}`;
    }
    return `Từ ${numMin.toLocaleString("vi-VN")} ${currency}`;
  }
  if (numMax) {
    if (currency === "VND" && numMax >= 1000000) {
      return `Lên đến ${(numMax / 1000000).toLocaleString("vi-VN")} triệu ${currency}`;
    }
    return `Lên đến ${numMax.toLocaleString("vi-VN")} ${currency}`;
  }
  return "Lương thỏa thuận";
}

function formatExperience(years: unknown): string {
  if (years === undefined || years === null || years === "")
    return "Chưa cập nhật";
  const num = Number(years);
  if (isNaN(num)) return String(years);
  if (num === 0) return "Không yêu cầu KN";
  return `Từ ${num} năm kinh nghiệm`;
}

function formatDeadline(val: unknown): string {
  if (!val) return "Chưa cập nhật";
  const s = String(val).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s.split("-").reverse().join("/");
  }
  return String(val);
}

export function AdminJobDetail({
  row,
  pending = false,
  onChoose,
  onClose,
}: {
  row: AdminRow;
  pending?: boolean;
  onChoose?: (
    path: string,
    body: AdminRow,
    label: string,
    needsReason?: boolean,
    subject?: string,
  ) => void;
  onClose?: () => void;
}) {
  const id = String(row.id || "");
  const title = String(row.title || row.name || "Tin tuyển dụng");
  const companyName = row.companyName ? String(row.companyName) : null;
  const companyId = row.companyId ? String(row.companyId) : null;
  const isSuspended = Boolean(row.isSuspended);
  const status = String(row.status || "PENDING_APPROVAL");

  const statusLabels: Record<string, string> = {
    PUBLISHED: "Đang xuất bản",
    PENDING_APPROVAL: "Chờ phê duyệt",
    REJECTED: "Đã từ chối",
    DRAFT: "Bản nháp",
    CLOSED: "Đã đóng",
  };

  const statusTone: "warning" | "success" | "danger" | "neutral" =
    isSuspended
      ? "danger"
      : status === "PUBLISHED"
        ? "success"
        : status === "REJECTED"
          ? "danger"
          : status === "PENDING_APPROVAL"
            ? "warning"
            : "neutral";

  const statusLabel = isSuspended
    ? "Đã gỡ bỏ"
    : statusLabels[status] || "Chờ phê duyệt";

  const rawSkills: string[] = Array.isArray(row.skills)
    ? (row.skills as string[])
    : typeof row.skills === "string"
      ? (row.skills as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const jobTypeMap: Record<string, string> = {
    FULL_TIME: "Toàn thời gian",
    PART_TIME: "Bán thời gian",
    CONTRACT: "Hợp đồng",
    INTERNSHIP: "Thực tập sinh",
    FREELANCE: "Tự do",
    REMOTE: "Làm việc từ xa",
  };

  const jobTypeDisplay =
    jobTypeMap[String(row.jobType || row.type || "")] ||
    String(row.jobType || row.type || "Toàn thời gian");

  return (
    <div className="admin-job-detail">
      {/* 1. Hero Header */}
      <div className="admin-job-hero">
        <div className="admin-job-hero-main">
          <div className="admin-job-icon-wrap" aria-hidden="true">
            <BriefcaseBusiness size={28} />
          </div>
          <div className="admin-job-hero-content">
            <div className="admin-job-title-row">
              <h2>{title}</h2>
              <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
            </div>
            <div className="admin-job-hero-meta">
              {companyName ? (
                <span className="admin-job-company">
                  <Building2 size={15} aria-hidden="true" />
                  <strong>{companyName}</strong>
                </span>
              ) : null}
              {companyId ? (
                <span className="admin-job-code">
                  Mã công ty: <code>{companyId}</code>
                </span>
              ) : null}
              <span className="admin-job-code">
                Mã tin: <code>{id}</code>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TopCV 4 Highlight Metric Cards */}
      <section className="admin-job-metrics" aria-label="Điểm nhấn tin tuyển dụng">
        <div className="admin-job-metric-card">
          <div className="admin-job-metric-icon icon-salary">
            <Banknote size={22} aria-hidden="true" />
          </div>
          <div className="admin-job-metric-body">
            <span className="admin-job-metric-label">Mức lương</span>
            <strong className="admin-job-metric-value salary-highlight">
              {formatSalary(row)}
            </strong>
            <span className="admin-job-metric-sub">
              {row.isNegotiable ? "Có thể thương lượng" : "Thu nhập cạnh tranh"}
            </span>
          </div>
        </div>

        <div className="admin-job-metric-card">
          <div className="admin-job-metric-icon icon-location">
            <MapPin size={22} aria-hidden="true" />
          </div>
          <div className="admin-job-metric-body">
            <span className="admin-job-metric-label">Địa điểm</span>
            <strong className="admin-job-metric-value">
              {row.location ? String(row.location) : "Chưa cập nhật"}
            </strong>
            <span className="admin-job-metric-sub">{jobTypeDisplay}</span>
          </div>
        </div>

        <div className="admin-job-metric-card">
          <div className="admin-job-metric-icon icon-exp">
            <BriefcaseBusiness size={22} aria-hidden="true" />
          </div>
          <div className="admin-job-metric-body">
            <span className="admin-job-metric-label">Kinh nghiệm</span>
            <strong className="admin-job-metric-value">
              {formatExperience(row.experienceYears)}
            </strong>
            <span className="admin-job-metric-sub">Yêu cầu kinh nghiệm</span>
          </div>
        </div>

        <div className="admin-job-metric-card">
          <div className="admin-job-metric-icon icon-deadline">
            <CalendarDays size={22} aria-hidden="true" />
          </div>
          <div className="admin-job-metric-body">
            <span className="admin-job-metric-label">Hạn ứng tuyển</span>
            <strong className="admin-job-metric-value">
              {formatDeadline(row.deadline)}
            </strong>
            <span className="admin-job-metric-sub">Hạn nộp hồ sơ</span>
          </div>
        </div>
      </section>

      {/* 3. Moderation Notice Alerts */}
      {status === "PENDING_APPROVAL" && !isSuspended && (
        <div className="admin-company-notice admin-notice-pending" aria-live="polite">
          <strong>⏳ Tin tuyển dụng đang chờ phê duyệt</strong>
          <p>
            Tin tuyển dụng do nhà tuyển dụng đăng tải đang chờ Quản trị viên xem
            xét nội dung và phê duyệt để xuất bản công khai.
          </p>
        </div>
      )}
      {status === "PUBLISHED" && !isSuspended && (
        <div className="admin-company-notice admin-notice-verified" aria-live="polite">
          <strong>✅ Tin tuyển dụng đang hoạt động</strong>
          <p>
            Tin đã được duyệt và đang xuất bản trên hệ thống. Ứng viên có thể xem
            và nộp hồ sơ ứng tuyển.
          </p>
        </div>
      )}
      {status === "REJECTED" && !isSuspended && (
        <div className="admin-company-notice admin-notice-rejected" aria-live="polite">
          <strong>❌ Tin tuyển dụng đã bị từ chối</strong>
          <p>Tin không đạt tiêu chuẩn phê duyệt hoặc vi phạm chính sách đăng tuyển.</p>
          {Boolean(row.rejectionReason) && (
            <p className="admin-notice-reason">
              <strong>Lý do từ chối:</strong> {String(row.rejectionReason)}
            </p>
          )}
        </div>
      )}
      {isSuspended && (
        <div className="admin-company-notice admin-notice-suspended" aria-live="polite">
          <strong>🚫 Tin tuyển dụng đang bị gỡ bỏ</strong>
          <p>Tin đã bị tạm dừng hiển thị đối với ứng viên và cộng đồng.</p>
          {Boolean(row.suspensionReason) && (
            <p className="admin-notice-reason">
              <strong>Lý do gỡ:</strong> {String(row.suspensionReason)}
            </p>
          )}
        </div>
      )}

      {/* 4. TopCV 2-Column Body Layout */}
      <div className="admin-job-layout">
        {/* Left Column: Job Description, Requirements, Benefits */}
        <div className="admin-job-main-column">
          {/* Section: Mô tả công việc */}
          <div className="admin-job-card">
            <h3 className="admin-job-section-title">
              <FileText size={18} aria-hidden="true" />
              Mô tả công việc
            </h3>
            {formatJobContent(row.description)}
          </div>

          {/* Section: Yêu cầu ứng viên */}
          <div className="admin-job-card">
            <h3 className="admin-job-section-title">
              <CheckCircle2 size={18} aria-hidden="true" />
              Yêu cầu ứng viên
            </h3>
            {formatJobContent(row.requirements)}
          </div>

          {/* Section: Quyền lợi được hưởng */}
          <div className="admin-job-card">
            <h3 className="admin-job-section-title">
              <Award size={18} aria-hidden="true" />
              Quyền lợi được hưởng
            </h3>
            {formatJobContent(row.benefits)}
          </div>

          {/* Section: Địa điểm làm việc */}
          {Boolean(row.location) && (
            <div className="admin-job-card">
              <h3 className="admin-job-section-title">
                <MapPin size={18} aria-hidden="true" />
                Địa điểm làm việc
              </h3>
              <p style={{ margin: 0, fontSize: "14.5px", color: "#334155" }}>
                {String(row.location)}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Key facts, Skills, Admin Audit */}
        <div className="admin-job-side-column">
          {/* Thông tin chung */}
          <div className="admin-job-card">
            <h3 className="admin-job-section-title">
              <Info size={18} aria-hidden="true" />
              Thông tin chung
            </h3>
            <dl className="admin-job-facts-list">
              <div className="admin-job-fact-item">
                <div className="admin-job-fact-icon">
                  <UsersRound size={17} aria-hidden="true" />
                </div>
                <div className="admin-job-fact-content">
                  <dt>Số lượng tuyển dụng</dt>
                  <dd>
                    {row.quantity ? `${row.quantity} người` : "Không giới hạn"}
                  </dd>
                </div>
              </div>

              <div className="admin-job-fact-item">
                <div className="admin-job-fact-icon">
                  <Clock3 size={17} aria-hidden="true" />
                </div>
                <div className="admin-job-fact-content">
                  <dt>Hình thức làm việc</dt>
                  <dd>{jobTypeDisplay}</dd>
                </div>
              </div>

              <div className="admin-job-fact-item">
                <div className="admin-job-fact-icon">
                  <BriefcaseBusiness size={17} aria-hidden="true" />
                </div>
                <div className="admin-job-fact-content">
                  <dt>Cấp bậc</dt>
                  <dd>{row.level ? String(row.level) : "Nhân viên"}</dd>
                </div>
              </div>

              <div className="admin-job-fact-item">
                <div className="admin-job-fact-icon">
                  <CalendarDays size={17} aria-hidden="true" />
                </div>
                <div className="admin-job-fact-content">
                  <dt>Hạn nộp hồ sơ</dt>
                  <dd>{formatDeadline(row.deadline)}</dd>
                </div>
              </div>

              {Boolean(row.publishedAt) && (
                <div className="admin-job-fact-item">
                  <div className="admin-job-fact-icon">
                    <CalendarDays size={17} aria-hidden="true" />
                  </div>
                  <div className="admin-job-fact-content">
                    <dt>Ngày xuất bản</dt>
                    <dd>{date(row.publishedAt)}</dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {/* Kỹ năng liên quan */}
          {rawSkills.length > 0 && (
            <div className="admin-job-card">
              <h3 className="admin-job-section-title">
                <Tag size={18} aria-hidden="true" />
                Kỹ năng chuyên môn
              </h3>
              <div className="admin-job-skills-wrap">
                {rawSkills.map((skill, idx) => (
                  <span key={idx} className="admin-job-skill-pill">
                    #{skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Thông tin đối soát & Quản trị */}
          <div className="admin-job-card">
            <h3 className="admin-job-section-title">
              <ShieldCheck size={18} aria-hidden="true" />
              Thông tin kiểm duyệt & Đối soát
            </h3>
            <dl className="admin-job-audit-table">
              <dt>Mã tin tuyển dụng</dt>
              <dd><code>{id}</code></dd>

              {Boolean(companyId) && (
                <>
                  <dt>Mã công ty</dt>
                  <dd><code>{companyId}</code></dd>
                </>
              )}

              {Boolean(row.createdBy) && (
                <>
                  <dt>Người đăng</dt>
                  <dd><code>{String(row.createdBy)}</code></dd>
                </>
              )}

              <dt>Phiên bản dữ liệu</dt>
              <dd>v{typeof row.aggregateVersion === "number" ? row.aggregateVersion : 1}</dd>

              {Boolean(row.createdAt) && (
                <>
                  <dt>Ngày tạo</dt>
                  <dd>{date(row.createdAt, true)}</dd>
                </>
              )}

              {Boolean(row.updatedAt) && (
                <>
                  <dt>Cập nhật lần cuối</dt>
                  <dd>{date(row.updatedAt, true)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* 5. Moderation Action Bar */}
      <div className="admin-detail-actions-bar">
        <div className="admin-detail-action-buttons">
          {onChoose && status === "PENDING_APPROVAL" && (
            <>
              <button
                type="button"
                className="btn admin-approve"
                disabled={pending}
                onClick={() =>
                  onChoose(
                    `jobs/${id}/approve`,
                    {},
                    "Duyệt tin tuyển dụng",
                    false,
                    title,
                  )
                }
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Duyệt tin tuyển dụng
              </button>
              <button
                type="button"
                className="btn admin-danger"
                disabled={pending}
                onClick={() =>
                  onChoose(
                    `jobs/${id}/reject`,
                    {},
                    "Từ chối tin tuyển dụng",
                    true,
                    title,
                  )
                }
              >
                <XCircle size={16} aria-hidden="true" />
                Từ chối tin
              </button>
            </>
          )}

          {onChoose && (
            <button
              type="button"
              className={`btn ${isSuspended ? "admin-approve" : "admin-danger"}`}
              disabled={pending || typeof row.aggregateVersion !== "number"}
              title={
                typeof row.aggregateVersion !== "number"
                  ? "Thiếu phiên bản dữ liệu để cập nhật an toàn"
                  : undefined
              }
              onClick={() => {
                const suspended = !isSuspended;
                onChoose(
                  `jobs/${id}/moderation`,
                  {
                    suspended,
                    expectedVersion: row.aggregateVersion,
                    operationId: crypto.randomUUID(),
                  },
                  suspended ? "Gỡ tin tuyển dụng" : "Khôi phục tin tuyển dụng",
                  true,
                  title,
                );
              }}
            >
              {isSuspended ? (
                <>
                  <RotateCcw size={14} aria-hidden="true" />
                  Khôi phục tin
                </>
              ) : (
                <>
                  <Ban size={14} aria-hidden="true" />
                  Gỡ tin tuyển dụng
                </>
              )}
            </button>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Đóng chi tiết
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminDetail({
  row,
  tab,
  pending = false,
  onChoose,
  onClose,
}: {
  row: AdminRow;
  tab: AdminTab;
  pending?: boolean;
  onChoose?: (
    path: string,
    body: AdminRow,
    label: string,
    needsReason?: boolean,
    subject?: string,
  ) => void;
  onClose?: () => void;
}) {
  if (tab === "companies") {
    return (
      <AdminCompanyDetail
        row={row}
        pending={pending}
        onChoose={onChoose}
        onClose={onClose}
      />
    );
  }

  if (tab === "jobs") {
    return (
      <AdminJobDetail
        row={row}
        pending={pending}
        onChoose={onChoose}
        onClose={onClose}
      />
    );
  }

  const fields =
    tab === "users"
      ? [
          ["email", "Email"],
          ["fullName", "Tên người dùng"],
          ["role", "Vai trò"],
          ["locked_reason", "Lý do khóa"],
        ]
      : tab === "reports"
        ? [
            ["target_type", "Đối tượng"],
            ["target_id", "Mã đối tượng"],
            ["description", "Nội dung"],
            ["resolution", "Kết quả xử lý"],
            ["status", "Trạng thái"],
          ]
        : [
            ["target_label", "Tên đối tượng / email"],
            ["target_type", "Loại đối tượng"],
            ...(row.target_role
              ? [["target_role", "Vai trò tài khoản"]]
              : []),
            ["admin_label", "Người thực hiện"],
            ["reason", "Lý do / ghi chú"],
            ["outcome", "Kết quả"],
            ["created_at", "Thời gian"],
          ];
  return (
    <div className="admin-detail-body">
      <h3>{tab === "audit" ? auditTitle(row) : rowTitle(row)}</h3>
      {tab === "audit" && (
        <p className="admin-data-note">
          Tên và email được tra cứu theo thông tin hiện tại. Mã định danh gốc
          nằm trong mục Thông tin đối soát.
        </p>
      )}
      <dl className="admin-detail-fields">
        {fields.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {key === "fullName"
                ? text(
                    row.fullName ?? row.full_name ?? row.name,
                    "Chưa cập nhật",
                  )
                : key === "deadline"
                ? date(row[key])
                : key === "created_at"
                  ? date(row[key], true)
                  : typeof row[key] === "boolean"
                    ? row[key]
                      ? "Có"
                      : "Không"
                    : key === "role" || key === "target_role"
                      ? roleLabels[String(row[key])] || "Chưa rõ vai trò"
                      : key === "target_type"
                        ? targetLabels[String(row[key])] ||
                          "Chưa rõ loại đối tượng"
                        : key === "status"
                          ? tab === "reports"
                            ? reportLabels[String(row[key])] ||
                              "Chưa rõ trạng thái"
                            : jobStatusLabel(String(row[key]))
                          : key === "outcome"
                            ? outcomes[String(row[key])] ||
                              "Chưa xác định kết quả"
                            : text(row[key])}
            </dd>
          </div>
        ))}
      </dl>
      {tab === "audit" && (
        <details className="admin-data-details">
          <summary>Thông tin đối soát</summary>
          <dl className="admin-detail-fields">
            {[
              ["id", "Mã nhật ký"],
              ["operation_id", "Mã thao tác"],
              ["target_id", "Mã đối tượng"],
              ["admin_id", "Mã người thực hiện"],
            ].map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{text(row[key])}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {tab === "reports" && row.status === "PROCESSING" && (
        <p className="admin-data-note">
          Báo cáo đang chờ đối soát. Kiểm tra nhật ký và trạng thái tài khoản
          trước khi tiếp tục.
        </p>
      )}
      {tab === "reports" && row.target_type !== "USER" && (
        <p className="admin-data-note">
          Khi chấp nhận báo cáo này, tin tuyển dụng sẽ được gỡ khỏi phần công khai
          hoặc công ty sẽ bị đình chỉ. Dữ liệu và lịch sử ứng tuyển được giữ lại.
        </p>
      )}
      {onClose && (
        <div className="admin-dialog-footer">
          <button type="button" className="btn" onClick={onClose}>
            Đóng chi tiết
          </button>
        </div>
      )}
    </div>
  );
}
