import {
  BriefcaseBusiness,
  Building2,
  Eye,
  Flag,
  LockKeyhole,
} from "lucide-react";
import { StatusBadge } from "../ui";

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
};
const auditTitle = (row: AdminRow) =>
  actionLabels[String(row.action)] || text(row.action, "Hoạt động quản trị");
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
      ? ["Tài khoản", "Vai trò", "Trạng thái", "Xác minh", "Thao tác"]
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
                        typeof row.logoUrl === "string" &&
                        /^https?:\/\//.test(row.logoUrl) ? (
                          <img
                            src={row.logoUrl}
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
                                "Tin chờ kiểm duyệt",
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
                      <StatusBadge tone="neutral">
                        {roleLabels[String(row.role)] || text(row.role)}
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
                        {outcomes[String(row.outcome)] || text(row.outcome)}
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
                        text(row.target_type)}
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          row.status === "OPEN" || row.status === "PROCESSING"
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {reportLabels[String(row.status)] || text(row.status)}
                      </StatusBadge>
                    </td>
                    <td className="admin-nowrap">{date(row.created_at)}</td>
                  </>
                ) : tab === "companies" ? (
                  <>
                    <td>{text(row.industry)}</td>
                    <td>
                      <StatusBadge tone="warning">Chờ xác minh</StatusBadge>
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
                      <StatusBadge tone="warning">Chờ duyệt</StatusBadge>
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
                    {tab === "companies" && (
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
                    {tab === "jobs" && (
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
                          disabled={pending || row.target_type !== "USER"}
                          title={
                            row.target_type !== "USER"
                              ? "Chỉ áp dụng cho báo cáo tài khoản"
                              : undefined
                          }
                          onClick={() =>
                            choose(
                              `reports/${id}`,
                              {
                                status: "RESOLVED",
                                expectedVersion: row.version,
                              },
                              "Chấp nhận báo cáo và khóa tài khoản",
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

export function AdminDetail({ row, tab }: { row: AdminRow; tab: AdminTab }) {
  const fields =
    tab === "companies"
      ? [
          ["description", "Giới thiệu"],
          ["industry", "Lĩnh vực"],
          ["size", "Quy mô"],
          ["address", "Địa chỉ"],
          ["website", "Website"],
          ["taxCode", "Mã số thuế"],
          ["verifiedStatus", "Trạng thái"],
        ]
      : tab === "jobs"
        ? [
            ["description", "Mô tả công việc"],
            ["requirements", "Yêu cầu"],
            ["benefits", "Quyền lợi"],
            ["location", "Địa điểm"],
            ["deadline", "Hạn ứng tuyển"],
          ]
        : tab === "users"
          ? [
              ["email", "Email"],
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
              {key === "deadline"
                ? date(row[key])
                : key === "created_at"
                  ? date(row[key], true)
                  : roleLabels[String(row[key])] ||
                    targetLabels[String(row[key])] ||
                    reportLabels[String(row[key])] ||
                    outcomes[String(row[key])] ||
                    text(row[key])}
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
          Thao tác khóa chỉ áp dụng cho báo cáo tài khoản. Báo cáo tin tuyển
          dụng và công ty có thể được xem xét hoặc bỏ qua.
        </p>
      )}
    </div>
  );
}
