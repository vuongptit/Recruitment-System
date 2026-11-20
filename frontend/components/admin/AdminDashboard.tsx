"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  CalendarDays,
  Info,
  RefreshCw,
} from "lucide-react";
import { requestApi } from "@/lib/apiClient";
import { person1Error, saveBlob } from "@/lib/person1Api";
import {
  completeUtcDay,
  dashboardDate,
  dashboardPeriods,
  type DashboardActivity,
  type DashboardPeriod,
  type DashboardSnapshot,
} from "@/lib/adminDashboard";
import { LoadingState, PageHeader } from "../ui";
import { AdminQueue, AdminSnapshot } from "./AdminSnapshot";
import { AdminFunnel, AdminOverview } from "./AdminOverview";
import { AdminRecentActivity, type AuditEntry } from "./AdminRecentActivity";

type Selection = { period: DashboardPeriod; from: string; to: string };
const defaults = (): Selection => ({
  period: "30d",
  from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  to: completeUtcDay(),
});

export function AdminDashboard() {
  const [selection, setSelection] = useState<Selection>(defaults);
  const [ready, setReady] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [dateError, setDateError] = useState("");
  const [snapshotReload, setSnapshotReload] = useState(0);
  const [activityReload, setActivityReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState("");
  const [recentReload, setRecentReload] = useState(0);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const initial = defaults();
      const period =
        params.get("period") ||
        (params.has("from") && params.has("to") ? "custom" : "30d");
      const valid = (value: string | null, fallback: string) =>
        value &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value))
          ? value
          : fallback;
      const restored = {
        period: dashboardPeriods.some((item) => item.value === period)
          ? (period as DashboardPeriod)
          : ("30d" as const),
        from: valid(params.get("from"), initial.from),
        to: valid(params.get("to"), initial.to),
      };
      setSelection(restored);
      setDraftFrom(restored.from);
      setDraftTo(restored.to);
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    params.set("period", selection.period);
    if (selection.period === "custom") {
      params.set("from", selection.from);
      params.set("to", selection.to);
    } else {
      params.delete("from");
      params.delete("to");
    }
    const target = window.location.pathname + "?" + params.toString();
    if (target !== window.location.pathname + window.location.search)
      window.history.replaceState(null, "", target);
  }, [selection, ready]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setSnapshotLoading(true);
    setSnapshotError("");
    requestApi<DashboardSnapshot>("/api/admin/stats/snapshot", {
      privateData: true,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setSnapshot(result.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setSnapshotError(person1Error(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSnapshotLoading(false);
      });
    return () => controller.abort();
  }, [snapshotReload, ready]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setActivityLoading(true);
    setActivityError("");
    setExportError("");
    requestApi<DashboardActivity>("/api/admin/stats/activity", {
      privateData: true,
      signal: controller.signal,
      query: {
        period: selection.period,
        ...(selection.period === "custom"
          ? { from: selection.from, to: selection.to }
          : {}),
      },
    })
      .then((result) => {
        if (!controller.signal.aborted) setActivity(result.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setActivityError(person1Error(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setActivityLoading(false);
      });
    return () => controller.abort();
  }, [selection, activityReload, ready]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setRecentLoading(true);
    setRecentError("");
    requestApi<AuditEntry[] | { items?: AuditEntry[] }>("/api/admin/audit-logs", { privateData: true, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        const rows = Array.isArray(data) ? data : data.items ?? [];
        setRecent(rows.filter(row => row.outcome !== "STARTED").slice(0, 5));
      })
      .catch(error => {
        if (!controller.signal.aborted) setRecentError(person1Error(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecentLoading(false);
      });
    return () => controller.abort();
  }, [ready, recentReload]);

  function applyDates(event: FormEvent) {
    event.preventDefault();
    const days = (Date.parse(draftTo) - Date.parse(draftFrom)) / 86400000;
    if (!Number.isFinite(days) || days < 0 || days > 366) {
      setDateError("Chọn khoảng ngày hợp lệ, tối đa 366 ngày.");
      return;
    }
    if (draftTo > completeUtcDay()) {
      setDateError(
        "Chọn đến hết ngày hôm qua (UTC) để xem số liệu ngày đã hoàn tất.",
      );
      return;
    }
    setDateError("");
    setSelection({ period: "custom", from: draftFrom, to: draftTo });
  }
  const emptyPeriod = activity
    ? activity.range.from > activity.range.to
    : false;
  const canExport = activity && !activityLoading && !activityError;
  async function exportFile(type: "csv" | "xlsx") {
    if (!activity || !canExport || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const { from, to } = activity.range;
      const result = await requestApi<Blob>("/api/admin/stats/report", {
        privateData: true,
        query: {
          type,
          period: activity.range.period,
          ...(activity.range.period === "custom" ? { from, to } : {}),
        },
        timeoutMs: 20_000,
        responseType: "blob",
      });
      saveBlob(
        result.data,
        `bao-cao-careerhub-${activity.range.period}-${from}-${to}.${type}`,
      );
    } catch (error) {
      setExportError(person1Error(error));
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className="admin-workspace admin-dashboard">
      <PageHeader
        title="Tổng quan hệ thống"
        description="Hoạt động tuyển dụng và vận hành CareerHub"
        action={
          <button type="button" className="btn admin-overview-refresh" disabled={snapshotLoading || activityLoading || recentLoading} onClick={() => {
            setSnapshotReload(n => n + 1);
            setActivityReload(n => n + 1);
            setRecentReload(n => n + 1);
          }}><RefreshCw size={16} aria-hidden="true" /> Làm mới</button>
        }
      />
      <AdminSnapshot data={snapshot} loading={snapshotLoading} error={snapshotError} onRetry={() => setSnapshotReload(n => n + 1)} />
      <section className="admin-dashboard-section admin-activity-section" aria-labelledby="admin-activity-heading" aria-busy={activityLoading}>
        <div className="admin-dashboard-section-title admin-activity-heading">
          <h2 id="admin-activity-heading">Hoạt động tuyển dụng</h2>
          <div className="admin-overview-toolbar">
            <label className="admin-period-picker">
              <CalendarDays size={17} aria-hidden="true" />
              <span className="sr-only">Khoảng thống kê</span>
              <select className="select" value={selection.period} onChange={event => {
                setDateError("");
                const period = event.target.value as DashboardPeriod;
                setSelection(current => ({ ...current, period }));
              }}>
                {dashboardPeriods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="admin-export" role="group" aria-label="Xuất báo cáo">
              <button type="button" className="btn" disabled={!canExport || exporting} onClick={() => void exportFile("xlsx")}>
                <ArrowDownToLine size={16} aria-hidden="true" />
                {exporting ? "Đang xuất…" : "Xuất Excel"}
              </button>
              <button type="button" className="btn" disabled={!canExport || exporting} onClick={() => void exportFile("csv")}>CSV</button>
            </div>
          </div>
        </div>
        {selection.period === "custom" && (
          <form
            className="admin-date-form admin-custom-period"
            onSubmit={applyDates}
          >
            <label className="field">
              Từ ngày
              <input
                className="input"
                type="date"
                name="from"
                required
                max={completeUtcDay()}
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </label>
            <label className="field">
              Đến ngày
              <input
                className="input"
                type="date"
                name="to"
                required
                min={draftFrom}
                max={completeUtcDay()}
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </label>
            <button className="btn btn-primary" disabled={activityLoading}>
              Áp dụng
            </button>
          </form>
        )}
        {dateError && (
          <p className="admin-field-error" role="alert">
            {dateError}
          </p>
        )}
        {exportError && (
          <p className="admin-field-error" role="alert">
            {exportError}
          </p>
        )}
        {activityLoading ? (
          <LoadingState label="Đang tải thống kê…" />
        ) : activityError ? (
          <div className="admin-feedback admin-feedback-error" role="alert">
            <p>{activityError}</p>
            <button
              className="btn"
              onClick={() => setActivityReload((n) => n + 1)}
            >
              Thử lại thống kê
            </button>
          </div>
        ) : (
          activity && (
            <>
              <div className="admin-period-summary">
                <strong>
                  {selection.period === "all"
                    ? "Tất cả dữ liệu đã ghi nhận"
                    : activity.range.period === "today"
                      ? `Hôm nay ${dashboardDate(activity.range.from)} (GMT+7)`
                      : emptyPeriod
                        ? "Tháng này chưa có ngày hoàn tất"
                        : `${dashboardDate(activity.range.from)} – ${dashboardDate(activity.range.to)}`}
                </strong>
                {activity.range.previousFrom && activity.range.previousTo && (
                  <span>
                    {activity.partial && activity.observedAt
                      ? `Cập nhật lúc ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(activity.observedAt))}; so với cùng giờ hôm qua`
                      : `So với ${dashboardDate(activity.range.previousFrom)} – ${dashboardDate(activity.range.previousTo)}`}
                  </span>
                )}
              </div>
              {activity.pendingDays > 0 && (
                <p
                  className="admin-feedback admin-feedback-warning"
                  role="status"
                >
                  {activity.liveRecalculated
                    ? `Số liệu kỳ này được tính trực tiếp từ sự kiện đã ghi nhận vì còn ${activity.pendingDays} ngày chờ tổng hợp.`
                    : `Có ${activity.pendingDays} ngày chờ tổng hợp. Số liệu hoạt động hiện có thể chưa đầy đủ.`}
                </p>
              )}
              {activity.range.period === "all" && (
                <p className="admin-data-note">
                  {activity.firstRecordedDate
                    ? `Dữ liệu ghi nhận từ ${dashboardDate(activity.firstRecordedDate)}; biểu đồ gộp theo tháng.`
                    : "Chưa có sự kiện tuyển dụng được ghi nhận."}{" "}
                  Không bao gồm lịch sử chưa được đồng bộ vào hệ thống thống kê.
                </p>
              )}
              <AdminOverview activity={activity} />
            </>
          )
        )}
      </section>
      <div className="admin-overview-panels">
        <AdminRecentActivity items={recent} loading={recentLoading} error={recentError} onRetry={() => setRecentReload(n => n + 1)} />
        {activity && !activityLoading && !activityError ? <AdminFunnel activity={activity} /> : null}
        <AdminQueue data={snapshot} loading={snapshotLoading} />
      </div>
      <details className="admin-overview-notes">
        <summary>Phạm vi và nguồn số liệu</summary>
        <p className="admin-data-note">
          <Info size={14} aria-hidden="true" />
          {selection.period === "today"
            ? "Hôm nay tính từ 00:00 theo GMT+7 đến thời điểm cập nhật, từ sự kiện đã ghi nhận. Số liệu trong ngày chưa chốt; bấm Làm mới để cập nhật."
            : "Theo ngày UTC đã hoàn tất; dữ liệu tổng hợp sau 00:15 UTC. Số liệu dựa trên sự kiện đã ghi nhận, không bao gồm lịch sử chưa đồng bộ."}
        </p>
      </details>
    </main>
  );
}
