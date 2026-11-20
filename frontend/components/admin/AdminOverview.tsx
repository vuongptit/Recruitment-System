import { useId, useState } from "react";
import { BriefcaseBusiness, ChartNoAxesCombined, Check, UsersRound } from "lucide-react";
import type { DashboardActivity } from "@/lib/adminDashboard";
import { EmptyState } from "../ui";

const metrics = {
  JOBS_PUBLISHED: "Tin đã đăng",
  APPLIED: "Đơn ứng tuyển",
  INTERVIEW: "Phỏng vấn",
  OFFER: "Đề nghị",
  HIRED: "Đã tuyển",
};
type Metric = keyof typeof metrics;
const primaryMetrics = [
  { key: "JOBS_PUBLISHED", icon: BriefcaseBusiness, tone: "blue" },
  { key: "APPLIED", icon: UsersRound, tone: "green" },
  { key: "HIRED", icon: Check, tone: "amber" },
] as const;
const count = new Intl.NumberFormat("vi-VN");
const decimal = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

function periodKeys(activity: DashboardActivity) {
  const { from, to, bucket, fromInstant, toExclusive } = activity.range;
  const keys: string[] = [];
  if (activity.pendingDays && !activity.liveRecalculated) return null;
  if (bucket === "HOUR" && fromInstant && toExclusive) {
    for (let at = Date.parse(fromInstant); at < Date.parse(toExclusive) && keys.length < 24; at += 3600000) {
      keys.push(new Date(at).toISOString());
    }
  } else if (from <= to) {
    const day = new Date(`${from}T00:00:00Z`);
    if (bucket === "MONTH") day.setUTCDate(1);
    while (day.toISOString().slice(0, 10) <= to && keys.length < 10000) {
      keys.push(day.toISOString().slice(0, 10));
      if (bucket === "MONTH") day.setUTCMonth(day.getUTCMonth() + 1);
      else day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  return keys;
}

function metricTrend(rows: Record<string, unknown>[], metric: Metric, keys: string[] | null, hourly: boolean) {
  const recorded = new Map(rows.filter(row => row.metric === metric).map(row => {
    const date = String(row.stat_date);
    return [hourly ? new Date(date).toISOString() : date, Number(row.value) || 0] as const;
  }));
  return (keys ?? [...recorded.keys()].sort()).map(date => ({ date, value: recorded.get(date) ?? 0 }));
}

function comparison(activity: DashboardActivity, key: Metric) {
  const { totals, previousTotals, range } = activity;
  if (!previousTotals) return { text: "Trong kỳ đã chọn", tone: "steady" };
  const current = totals[key] ?? 0;
  const previous = previousTotals[key] ?? 0;
  const relativePeriod = range.bucket === "HOUR" ? "cùng giờ hôm qua" : "kỳ trước";
  if (!previous) return { text: current ? "Có phát sinh; kỳ so sánh bằng 0" : `Không đổi so với ${relativePeriod}`, tone: "steady" };
  const percent = ((current - previous) * 100) / previous;
  return { text: `${percent > 0 ? "+" : ""}${decimal.format(percent)}% so với ${relativePeriod}`, tone: percent > 0 ? "rising" : percent < 0 ? "falling" : "steady" };
}

export function AdminOverview({ activity }: { activity: DashboardActivity }) {
  const [metric, setMetric] = useState<Metric>("APPLIED");
  const fillId = useId();
  const { range, totals, pendingDays, liveRecalculated } = activity;
  const hourly = range.bucket === "HOUR";
  const rows = hourly ? (activity.hourly ?? []) : activity.daily;
  const keys = periodKeys(activity);
  const trend = metricTrend(rows, metric, keys, hourly);
  const bucket = hourly ? "giờ" : range.bucket === "MONTH" ? "tháng" : "ngày";
  const chartDate = new Intl.DateTimeFormat("vi-VN", hourly ? {
    timeZone: range.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  } : range.bucket === "MONTH" ? { timeZone: "UTC", month: "2-digit", year: "numeric" }
    : { timeZone: "UTC", day: "2-digit", month: "2-digit" });
  const interval = Math.max(1, Math.ceil(Math.max(0, ...trend.map(point => point.value)) / 4));
  const start = trend[0] ? Date.parse(trend[0].date) : 0;
  const duration = trend.length > 1 ? Date.parse(trend[trend.length - 1].date) - start : 0;
  const x = (index: number) => duration ? 66 + 788 * (Date.parse(trend[index].date) - start) / duration : 460;
  const y = (value: number) => 206 - (value / (interval * 4)) * 168;
  const points = trend.map(({ value }, index) => `${x(index)},${y(value)}`).join(" ");
  const ticks = Math.min(trend.length, 7);
  const tickIndexes = Array.from({ length: ticks }, (_, index) => ticks === 1 ? 0 : Math.round(index * (trend.length - 1) / (ticks - 1)));

  return <>
    <section className="admin-overview-kpis" aria-label="Thống kê tuyển dụng">
      {primaryMetrics.map(({ key, icon: Icon, tone }) => {
        const delta = comparison(activity, key);
        const series = metricTrend(rows, key, keys, hourly);
        const maximum = Math.max(1, ...series.map(point => point.value));
        const sparkline = series.map(({ value }, index) => `${2 + index * 236 / Math.max(1, series.length - 1)},${32 - 26 * value / maximum}`).join(" ");
        return <article className={`admin-metric admin-kpi is-${tone}`} key={key}>
          <div className="admin-metric-label"><span>{metrics[key]}</span><span className="admin-kpi-icon"><Icon size={19} aria-hidden="true" /></span></div>
          <strong>{count.format(totals[key] ?? 0)}</strong>
          <small data-trend={delta.tone}>{delta.text}</small>
          {series.length > 1 && <svg className="admin-sparkline" viewBox="0 0 240 36" preserveAspectRatio="none" aria-hidden="true"><polyline points={sparkline} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>}
        </article>;
      })}
    </section>
    <section className="admin-surface admin-trend" aria-labelledby="admin-trend-title">
      <div className="admin-section-heading admin-trend-heading">
        <div><h2 id="admin-trend-title">{metrics[metric]} theo {bucket}</h2><p><ChartNoAxesCombined size={15} aria-hidden="true" />{count.format(totals[metric] ?? 0)} trong kỳ</p></div>
        <select className="select admin-chart-select" aria-label="Chỉ số biểu đồ" value={metric} onChange={event => setMetric(event.target.value as Metric)}>
          {Object.entries(metrics).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </div>
      {trend.length ? <div className="admin-chart" role="region" aria-label="Vùng biểu đồ xu hướng" tabIndex={0}>
        <svg viewBox="0 0 920 252" role="img" aria-label={`Biểu đồ ${metrics[metric].toLocaleLowerCase("vi-VN")}. Bảng số liệu ở bên dưới.`}>
          <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="var(--primary)" stopOpacity=".17"/><stop offset="1" stopColor="var(--primary)" stopOpacity=".015"/></linearGradient></defs>
          {[0, 1, 2, 3, 4].map(tick => <g key={tick}>
            <line x1="66" x2="854" y1={y(tick * interval)} y2={y(tick * interval)} stroke="var(--line)" strokeDasharray={tick > 0 ? "3 4" : undefined} />
            <text x="50" y={y(tick * interval) + 4} textAnchor="end">{count.format(tick * interval)}</text>
          </g>)}
          {trend.length > 1 && <polygon fill={`url(#${fillId})`} points={`${x(0)},206 ${points} ${x(trend.length - 1)},206`} />}
          <polyline fill="none" stroke="var(--primary)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" points={points} />
          {trend.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(point.value)} r={trend.length > 60 ? 1.7 : 3.6} fill="var(--primary)"><title>{chartDate.format(new Date(point.date))} · {count.format(point.value)}</title></circle>)}
          {tickIndexes.map(index => <text key={index} x={x(index)} y="233" textAnchor="middle">{chartDate.format(new Date(trend[index].date))}</text>)}
        </svg>
      </div> : <EmptyState title="Chưa có dữ liệu cho chỉ số này" description="Chọn một chỉ số hoặc khoảng thời gian khác." />}
      {!!pendingDays && !liveRecalculated && <p className="admin-overview-message">Biểu đồ hiển thị các mốc đã ghi nhận.</p>}
      <details className="admin-data-details">
        <summary>Xem bảng số liệu</summary>
        <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={`Thống kê theo ${bucket}`}>
          <table className="admin-table">
            <caption className="sr-only">Thống kê tuyển dụng theo {bucket} {hourly ? "GMT+7" : "UTC"}</caption>
            <thead><tr><th scope="col">{hourly ? "Giờ (GMT+7)" : range.bucket === "MONTH" ? "Tháng" : "Ngày"}</th><th scope="col">Chỉ số</th><th scope="col">Số lượng</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index}>
              <td>{range.bucket === "DAY" ? String(row.stat_date) : chartDate.format(new Date(String(row.stat_date)))}</td>
              <td>{metrics[row.metric as Metric] || String(row.metric)}</td><td>{count.format(Number(row.value) || 0)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  </>;
}

export function AdminFunnel({ activity }: { activity: DashboardActivity }) {
  const stages = (["APPLIED", "INTERVIEW", "OFFER", "HIRED"] as const).flatMap(key => activity.funnel.filter(item => item.stage === key));
  const hasApplied = (stages.find(stage => stage.stage === "APPLIED")?.count ?? 0) > 0;
  return <section className="admin-surface admin-funnel" aria-labelledby="admin-funnel-title">
    <div className="admin-section-heading"><div><h2 id="admin-funnel-title">Phễu tuyển dụng</h2><p>Tỷ lệ so với số hồ sơ nộp lần đầu trong kỳ</p></div></div>
    {stages.length ? <ol className="admin-funnel-list">{stages.map(item => <li key={item.stage}>
      <div><span>{metrics[item.stage as Metric]}</span><strong>{count.format(item.count)} <small>{hasApplied ? `${decimal.format(item.rate)}%` : "—"}</small></strong></div>
      <progress aria-label={metrics[item.stage as Metric]} max={100} value={Math.max(0, Math.min(100, item.rate))} />
    </li>)}</ol> : <p className="admin-overview-message">Chưa có dữ liệu chuyển đổi.</p>}
    <p className="admin-data-note">Mỗi hồ sơ được tính một lần ở từng mốc, {activity.range.bucket === "HOUR" ? "đến thời điểm cập nhật" : "đến hết ngày cuối kỳ"}.</p>
  </section>;
}
