import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ClipboardList,
  Flag,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { EmptyState, StatusBadge } from "../ui";

type Row = Record<string, unknown>;
const names: Record<string, string> = {
  JOBS_PUBLISHED: "Tin đã đăng",
  APPLIED: "Đơn ứng tuyển",
  INTERVIEW: "Phỏng vấn",
  OFFER: "Đề nghị",
  HIRED: "Đã tuyển",
};
const icons = [
  BriefcaseBusiness,
  UsersRound,
  ClipboardList,
  ShieldCheck,
  Check,
];
const count = (value: unknown) =>
  new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
const date = (value: unknown) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(String(value)));

export function AdminOverview({
  overview,
  funnel,
  from,
  to,
  bucket = "DAY",
  previousTotals,
  showQueues = true,
  fromInstant,
  toExclusive,
  timezone = "UTC",
}: {
  overview: {
    daily: Row[];
    totals: Record<string, number>;
    pendingDays?: number;
    liveRecalculated?: boolean;
  };
  funnel: { stage: string; count: number; rate: number }[];
  from: string;
  to: string;
  bucket?: "HOUR" | "DAY" | "MONTH";
  previousTotals?: Record<string, number> | null;
  showQueues?: boolean;
  fromInstant?: string | null;
  toExclusive?: string | null;
  timezone?: string;
}) {
  const recordedTrend = overview.daily
    .filter((row) => row.metric === "APPLIED")
    .slice()
    .sort((a, b) => String(a.stat_date).localeCompare(String(b.stat_date)));
  const trend: Row[] = [];
  if (bucket === "HOUR" && fromInstant && toExclusive) {
    const values = new Map(
      recordedTrend.map((row) => [
        Date.parse(String(row.stat_date)),
        Number(row.value),
      ]),
    );
    for (
      let at = Date.parse(fromInstant);
      at < Date.parse(toExclusive) && trend.length < 24;
      at += 3600000
    ) {
      trend.push({
        stat_date: new Date(at).toISOString(),
        metric: "APPLIED",
        value: values.get(at) ?? 0,
      });
    }
  } else if (overview.pendingDays && !overview.liveRecalculated)
    trend.push(...recordedTrend);
  else if (from <= to) {
    const values = new Map(
      recordedTrend.map((row) => [String(row.stat_date), Number(row.value)]),
    );
    const cursor = new Date(from + "T00:00:00Z");
    if (bucket === "MONTH") cursor.setUTCDate(1);
    while (cursor.toISOString().slice(0, 10) <= to && trend.length < 10000) {
      const key = cursor.toISOString().slice(0, 10);
      trend.push({
        stat_date: key,
        metric: "APPLIED",
        value: values.get(key) ?? 0,
      });
      if (bucket === "MONTH") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  function comparison(key: string) {
    if (!previousTotals)
      return showQueues ? "Trong khoảng đã chọn" : "Dữ liệu ghi nhận trong kỳ";
    const current = overview.totals[key] ?? 0;
    const previous = previousTotals[key] ?? 0;
    if (previous === 0)
      return current === 0
        ? bucket === "HOUR"
          ? "Không đổi so với cùng giờ hôm qua"
          : "Không thay đổi so với kỳ trước"
        : "Có phát sinh; kỳ so sánh bằng 0";
    const percent = ((current - previous) * 100) / previous;
    return `${percent > 0 ? "+" : ""}${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(percent)}% ${bucket === "HOUR" ? "so với cùng giờ hôm qua" : "so với kỳ trước"}`;
  }
  const chartDate = (value: unknown) =>
    bucket === "HOUR"
      ? new Intl.DateTimeFormat("vi-VN", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(String(value)))
      : bucket === "MONTH"
        ? new Intl.DateTimeFormat("vi-VN", {
            timeZone: "UTC",
            month: "2-digit",
            year: "numeric",
          }).format(new Date(String(value)))
        : date(value);
  const start = trend.length ? Date.parse(String(trend[0].stat_date)) : 0;
  const duration = trend.length
    ? Date.parse(String(trend[trend.length - 1].stat_date)) - start
    : 0;
  const x = (row: Row) =>
    duration === 0
      ? 352
      : 52 + (600 * (Date.parse(String(row.stat_date)) - start)) / duration;
  // Rounded intervals keep axis labels unique even for small counts.
  const interval = Math.max(
    1,
    Math.ceil(Math.max(0, ...trend.map((row) => Number(row.value) || 0)) / 4),
  );
  const maximum = interval * 4;
  return (
    <>
      <section className="admin-metrics" aria-label="Thống kê tuyển dụng">
        {Object.entries(names).map(([key, label], index) => {
          const Icon = icons[index];
          return (
            <article key={key} className="admin-metric">
              <div className="admin-metric-label">
                <span>{label}</span>
                <Icon size={18} aria-hidden="true" />
              </div>
              <strong>{count(overview.totals[key])}</strong>
              <small>{comparison(key)}</small>
            </article>
          );
        })}
      </section>
      <div className="admin-analytics-grid">
        <section className="admin-surface admin-trend">
          <div className="admin-section-heading">
            <div>
              <h2>
                Đơn ứng tuyển theo{" "}
                {bucket === "HOUR"
                  ? "giờ"
                  : bucket === "MONTH"
                    ? "tháng"
                    : "ngày"}
              </h2>
              <p>
                {from > to
                  ? "Chưa có ngày hoàn tất trong tháng này"
                  : `${date(from)} – ${date(to)}`}
              </p>
            </div>
            <StatusBadge tone="neutral">
              {count(overview.totals.APPLIED)} đơn
            </StatusBadge>
          </div>
          {trend.length ? (
            <div className="admin-chart">
              <svg
                viewBox="0 0 680 240"
                role="img"
                aria-label="Biểu đồ đơn ứng tuyển. Bảng số liệu đầy đủ ở bên dưới."
              >
                {[0, 1, 2, 3, 4].map((tick) => (
                  <g key={tick}>
                    <line
                      x1="48"
                      x2="656"
                      y1={196 - tick * 42}
                      y2={196 - tick * 42}
                      stroke="#e6ebf2"
                      strokeDasharray="4 4"
                    />
                    <text x="36" y={200 - tick * 42} textAnchor="end">
                      {count(tick * interval)}
                    </text>
                  </g>
                ))}
                <polyline
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={trend
                    .map(
                      (r) =>
                        `${x(r)},${196 - (Number(r.value) * 168) / maximum}`,
                    )
                    .join(" ")}
                />
                {trend.map((r, i) => (
                  <circle
                    key={String(r.stat_date)}
                    cx={x(r)}
                    cy={196 - (Number(r.value) * 168) / maximum}
                    r={trend.length > 60 ? 2 : 4}
                    fill="var(--primary)"
                  >
                    <title>
                      {chartDate(r.stat_date)}: {count(r.value)} đơn
                    </title>
                  </circle>
                ))}
                <text x="48" y="226">
                  {chartDate(trend[0].stat_date)}
                </text>
                <text x="656" y="226" textAnchor="end">
                  {chartDate(trend[trend.length - 1].stat_date)}
                </text>
              </svg>
            </div>
          ) : (
            <EmptyState
              title="Chưa có đơn ứng tuyển"
              description="Chọn khoảng thời gian khác để xem hoạt động ứng tuyển."
            />
          )}
          <details className="admin-data-details">
            <summary>Xem bảng số liệu</summary>
            <div
              className="admin-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Thống kê theo ngày"
            >
              <table className="admin-table">
                <caption className="sr-only">
                  Thống kê tuyển dụng theo{" "}
                  {bucket === "HOUR"
                    ? "giờ GMT+7"
                    : bucket === "MONTH"
                      ? "tháng UTC"
                      : "ngày UTC"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {bucket === "HOUR"
                        ? "Giờ (GMT+7)"
                        : bucket === "MONTH"
                          ? "Tháng"
                          : "Ngày"}
                    </th>
                    <th scope="col">Chỉ số</th>
                    <th scope="col">Số lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.daily.map((r, i) => (
                    <tr key={i}>
                      <td>
                        {bucket === "MONTH" || bucket === "HOUR"
                          ? chartDate(r.stat_date)
                          : String(r.stat_date)}
                      </td>
                      <td>{names[String(r.metric)] || String(r.metric)}</td>
                      <td>{count(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="admin-surface admin-funnel">
          <div className="admin-section-heading">
            <div>
              <h2>Phễu tuyển dụng</h2>
              <p>Tỷ lệ trên số ứng tuyển ban đầu</p>
            </div>
          </div>
          {funnel.length ? (
            <ol className="admin-funnel-list">
              {["APPLIED", "INTERVIEW", "OFFER", "HIRED"]
                .flatMap((key) => funnel.filter((item) => item.stage === key))
                .map((item) => (
                  <li key={item.stage}>
                    <div>
                      <span>{names[item.stage]}</span>
                      <strong>
                        {count(item.count)}{" "}
                        <small>
                          {(funnel.find((stage) => stage.stage === "APPLIED")
                            ?.count ?? 0) === 0
                            ? "—"
                            : new Intl.NumberFormat("vi-VN", {
                                maximumFractionDigits: 1,
                              }).format(item.rate)}
                          {(funnel.find((stage) => stage.stage === "APPLIED")
                            ?.count ?? 0) > 0
                            ? "%"
                            : ""}
                        </small>
                      </strong>
                    </div>
                    <progress
                      aria-label={names[item.stage]}
                      max={100}
                      value={Math.max(0, Math.min(100, item.rate))}
                    />
                  </li>
                ))}
            </ol>
          ) : (
            <EmptyState
              title="Chưa có dữ liệu chuyển đổi"
              description="Số liệu xuất hiện khi có hoạt động ứng tuyển."
            />
          )}
          <p className="admin-data-note">
            Tính theo hồ sơ nộp lần đầu trong kỳ,{" "}
            {bucket === "HOUR" ? "đến thời điểm cập nhật" : "đến hết ngày cuối"}
            . Một hồ sơ được tính một lần ở mỗi mốc; không phải số ứng viên duy
            nhất.
          </p>
        </section>
      </div>
      {showQueues && (
        <section className="admin-queues" aria-label="Truy cập nhanh quản trị">
          {[
            {
              href: "/admin/companies",
              label: "Xác minh doanh nghiệp",
              description: "Kiểm tra hồ sơ đang chờ duyệt",
              icon: Building2,
            },
            {
              href: "/admin/jobs",
              label: "Kiểm duyệt tin tuyển dụng",
              description: "Đánh giá nội dung trước khi đăng",
              icon: BriefcaseBusiness,
            },
            {
              href: "/admin/reports",
              label: "Xử lý báo cáo",
              description: "Tiếp nhận và xem xét phản ánh",
              icon: Flag,
            },
          ].map(({ href, label, description, icon: Icon }) => (
            <Link className="admin-queue" key={href} href={href}>
              <span className="admin-queue-icon">
                <Icon size={21} aria-hidden="true" />
              </span>
              <div>
                <strong>{label}</strong>
                <p>{description}</p>
              </div>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
