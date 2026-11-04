"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type Filters = {
  page: number;
  from: string;
  to: string;
  query: string;
  role: string;
  locked: string;
  status: string;
  targetType: string;
  suspended: string;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const defaults = (tab = ""): Filters => ({
  page: 1,
  from: today().slice(0, 8) + "01",
  to: today(),
  query: "",
  role: "",
  locked: "",
  status: tab === "companies" ? "PENDING" : tab === "jobs" ? "PENDING_APPROVAL" : tab === "reports" ? "OPEN" : "",
  targetType: "",
  suspended: "",
});
const validDate = (value: string | null, fallback: string) =>
  value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value))
    ? value
    : fallback;

/** Restore filters before the first fetch. Native history preserves Back/Forward without another route request. */
export function useAdminFilters(tab: string) {
  const [filters, setFilters] = useState(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const restore = () => {
      const p = new URLSearchParams(window.location.search);
      const initial = defaults(tab);
      setFilters({
        page: Math.min(
          10000,
          Math.max(1, Math.floor(Number(p.get("page")) || 1)),
        ),
        from: validDate(p.get("from"), initial.from),
        to: validDate(p.get("to"), initial.to),
        query: (p.get(tab === "companies" || tab === "jobs" ? "q" : "email") || "").slice(0, 200),
        role: ["CANDIDATE", "RECRUITER", "ADMIN"].includes(p.get("role") || "")
          ? p.get("role")!
          : "",
        locked: ["true", "false"].includes(p.get("locked") || "")
          ? p.get("locked")!
          : "",
        status: (() => {
          const allowed = tab === "companies"
            ? ["PENDING", "VERIFIED", "REJECTED", "ALL"]
            : tab === "jobs"
              ? ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "CLOSED", "EXPIRED", "ALL"]
              : ["", "OPEN", "PROCESSING", "RESOLVED", "DISMISSED"];
          return p.has("status") && allowed.includes(p.get("status")!)
            ? p.get("status")!
            : defaults(tab).status;
        })(),
        targetType: ["JOB", "COMPANY", "USER"].includes(p.get("type") || "")
          ? p.get("type")!
          : "",
        suspended: ["true", "false"].includes(p.get("suspended") || "")
          ? p.get("suspended")!
          : "",
      });
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams(window.location.search);
    const values: Record<string, string> = {
      page: filters.page > 1 ? String(filters.page) : "",
    };
    if (tab === "stats")
      Object.assign(values, { from: filters.from, to: filters.to });
    if (tab === "users")
      Object.assign(values, {
        email: filters.query,
        role: filters.role,
        locked: filters.locked,
      });
    if (tab === "reports")
      Object.assign(values, {
        status: filters.status,
        type: filters.targetType,
      });
    if (tab === "companies" || tab === "jobs")
      Object.assign(values, {
        status: filters.status,
        q: filters.query,
        suspended: filters.suspended,
      });
    for (const [key, value] of Object.entries(values)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    const target =
      window.location.pathname +
      (p.size ? "?" + p.toString() : "") +
      window.location.hash;
    if (
      target !==
      window.location.pathname + window.location.search + window.location.hash
    )
      window.history.replaceState(null, "", target);
  }, [filters, ready, tab]);
  function setter<K extends keyof Filters>(
    key: K,
  ): Dispatch<SetStateAction<Filters[K]>> {
    return (value) =>
      setFilters((previous) => ({
        ...previous,
        [key]:
          typeof value === "function"
            ? (value as (current: Filters[K]) => Filters[K])(previous[key])
            : value,
      }));
  }
  return {
    ...filters,
    ready,
    setPage: setter("page"),
    setFrom: setter("from"),
    setTo: setter("to"),
    setQuery: setter("query"),
    setRole: setter("role"),
    setLocked: setter("locked"),
    setStatus: setter("status"),
    setTargetType: setter("targetType"),
    setSuspended: setter("suspended"),
  };
}
