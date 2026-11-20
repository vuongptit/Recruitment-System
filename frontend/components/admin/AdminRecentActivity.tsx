import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { auditOutcomes, auditTitle } from "@/lib/adminAudit";

export type AuditEntry = Record<string, unknown>;

const timestamp = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function AdminRecentActivity({ items, loading, error, onRetry }: {
  items: AuditEntry[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return <section className="admin-surface admin-recent" aria-labelledby="admin-recent-title" aria-busy={loading}>
    <div className="admin-section-heading">
      <div><h2 id="admin-recent-title">Hoạt động quản trị gần đây</h2><p>Nhật ký hệ thống · GMT+7</p></div>
    </div>
    {loading ? <p className="admin-overview-message" role="status">Đang tải nhật ký…</p>
      : error ? <div className="admin-overview-message"><p>{error}</p><button type="button" className="btn" onClick={onRetry}>Thử lại nhật ký</button></div>
      : items.length ? <ul className="admin-recent-list">
        {items.map(item => {
          const outcome = String(item.outcome ?? item.status ?? "UNKNOWN");
          const tone = ["SUCCESS", "SUCCEEDED"].includes(outcome) ? "success" : ["FAILURE", "FAILED"].includes(outcome) ? "danger" : "neutral";
          const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? XCircle : Clock3;
          const time = String(item.created_at ?? "");
          const validTime = Number.isFinite(Date.parse(time));
          const target = typeof item.target_label === "string" ? item.target_label.trim() : "";
          return <li key={String(item.id)}>
            <span className={`admin-recent-icon is-${tone}`}><Icon size={16} aria-hidden="true" /></span>
            <div><strong>{auditTitle(item)}</strong><span>{target ? `${target} · ` : ""}{auditOutcomes[outcome] || auditOutcomes.UNKNOWN}</span></div>
            {validTime ? <time dateTime={time}>{timestamp.format(new Date(time))}</time> : null}
          </li>;
        })}
      </ul> : <p className="admin-overview-message">Chưa có hoạt động quản trị được ghi nhận.</p>}
    <div className="admin-panel-footer"><Link href="/admin/audit" prefetch={false}>Xem nhật ký <ArrowRight size={15} aria-hidden="true" /></Link></div>
  </section>;
}
