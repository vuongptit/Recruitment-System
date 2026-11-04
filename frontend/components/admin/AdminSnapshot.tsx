import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Flag,
  Info,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { DashboardSnapshot } from "@/lib/adminDashboard";

const overview = [
  {
    key: "TOTAL_ACCOUNTS",
    label: "Tổng tài khoản",
    help: "Bao gồm mọi vai trò và trạng thái",
    icon: UsersRound,
  },
  {
    key: "CANDIDATES",
    label: "Tài khoản ứng viên",
    help: "Tổng số tài khoản có vai trò ứng viên",
    icon: UsersRound,
  },
  {
    key: "RECRUITERS",
    label: "Tài khoản tuyển dụng",
    help: "Tài khoản nhà tuyển dụng đã đăng ký",
    icon: BriefcaseBusiness,
  },
  {
    key: "VERIFIED_COMPANIES",
    label: "Công ty đã xác minh",
    help: "Hồ sơ doanh nghiệp đã được duyệt",
    icon: Building2,
  },
  {
    key: "SEARCHABLE_JOBS",
    label: "Tin đang hiển thị",
    help: "Tin công khai đáp ứng điều kiện tìm kiếm",
    icon: ClipboardList,
  },
];
const queues = [
  {
    key: "PENDING_COMPANIES",
    label: "Công ty chờ xác minh",
    href: "/admin/companies",
    icon: Building2,
  },
  {
    key: "PENDING_JOBS",
    label: "Tin chờ duyệt",
    href: "/admin/jobs",
    icon: BriefcaseBusiness,
  },
  {
    key: "OPEN_REPORTS",
    label: "Báo cáo mới",
    href: "/admin/reports?status=OPEN",
    icon: Flag,
  },
  {
    key: "PROCESSING_REPORTS",
    label: "Báo cáo đang xử lý",
    href: "/admin/reports?status=PROCESSING",
    icon: ShieldCheck,
  },
];
const number = (value: number) => new Intl.NumberFormat("vi-VN").format(value);

export function AdminSnapshot({
  data,
  loading,
  error,
  onRetry,
}: {
  data: DashboardSnapshot | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  function value(key: string) {
    const metric = data?.metrics[key];
    if (loading) return "…";
    return metric?.available && metric.value != null
      ? number(metric.value) + (metric.lowerBound ? "+" : "")
      : "—";
  }
  const unavailable =
    data && Object.values(data.metrics).some((metric) => !metric.available);
  return (
    <>
      <section
        className="admin-dashboard-section"
        aria-labelledby="admin-current-heading"
        aria-busy={loading}
      >
        <div className="admin-dashboard-section-title">
          <div>
            <h2 id="admin-current-heading">Hiện trạng toàn hệ thống</h2>
            <p>Số liệu hiện tại, không phụ thuộc bộ lọc thời gian bên dưới.</p>
          </div>
          {data && !loading && (
            <span className="admin-snapshot-time">
              Lấy lúc{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
                timeStyle: "short",
              }).format(new Date(data.capturedAt))}{" "}
              (GMT+7)
            </span>
          )}
        </div>
        {error && (
          <div className="admin-feedback admin-feedback-error" role="alert">
            <p>{error}</p>
            <button className="btn" disabled={loading} onClick={onRetry}>
              Thử lại hiện trạng
            </button>
          </div>
        )}
        <div className="admin-metrics admin-snapshot-metrics">
          {overview.map(({ key, label, help, icon: Icon }) => (
            <article className="admin-metric" key={key}>
              <div className="admin-metric-label">
                <span>{label}</span>
                <Icon size={18} aria-hidden="true" />
              </div>
              <strong>{value(key)}</strong>
              <small>
                {!loading &&
                (!data?.metrics[key]?.available ||
                  data.metrics[key].value == null)
                  ? "Chưa lấy được số liệu"
                  : help}
              </small>
            </article>
          ))}
        </div>
        {unavailable && !error && (
          <p className="admin-data-note">
            <Info size={14} aria-hidden="true" />
            Một số nguồn dữ liệu chưa phản hồi. Dấu “—” thể hiện số liệu chưa
            có; bạn có thể làm mới để thử lại.
          </p>
        )}
      </section>
      <section
        className="admin-dashboard-section"
        aria-labelledby="admin-queue-heading"
      >
        <div className="admin-dashboard-section-title">
          <div>
            <h2 id="admin-queue-heading">Cần xử lý</h2>
            <p>Mở từng nhóm để kiểm tra và xử lý yêu cầu.</p>
          </div>
        </div>
        <div className="admin-action-queues">
          {queues.map(({ key, label, href, icon: Icon }) => (
            <Link key={key} href={href} className="admin-action-queue">
              <span className="admin-queue-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <span>{label}</span>
                <strong>{value(key)}</strong>
                {data?.metrics[key]?.lowerBound && (
                  <small>Tối thiểu 50 yêu cầu</small>
                )}
                {!loading && !data?.metrics[key]?.available && (
                  <small>Chưa lấy được số liệu</small>
                )}
              </div>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
