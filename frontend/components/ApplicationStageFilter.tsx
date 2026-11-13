"use client";

import type { ApplicationStatus } from "@/lib/demoData";
import { APPLICATION_STATUSES } from "@/lib/applicationStateMachine";
import { applicationStatusLabel } from "@/lib/recruitmentLabels";
import styles from "./ApplicationStageFilter.module.css";
import { History } from "lucide-react";

export function ApplicationStageFilter({ value, onChange, counts, disabled }: {
  value: "ALL" | ApplicationStatus;
  onChange: (value: "ALL" | ApplicationStatus) => void;
  counts?: Partial<Record<"ALL" | ApplicationStatus, number>>;
  disabled?: boolean;
}) {
  return <nav className={styles.filters} aria-label="Lọc theo bước tuyển dụng">
    {(["ALL", ...APPLICATION_STATUSES.filter((status) => status !== "WITHDRAWN")] as const).map((status) => <button key={status} type="button" disabled={disabled} className={value === status ? styles.selected : ""} aria-pressed={value === status} onClick={() => onChange(status)}>
      {status === "ALL" ? "Tất cả" : applicationStatusLabel(status)}{counts?.[status] !== undefined ? <span>{counts[status]}</span> : null}
    </button>)}
    {counts === undefined || (counts.WITHDRAWN ?? 0) > 0 || value === "WITHDRAWN" ? <button type="button" disabled={disabled} className={`${styles.legacy} ${value === "WITHDRAWN" ? styles.selected : ""}`} aria-pressed={value === "WITHDRAWN"} title="Xem hồ sơ đã rút theo quy trình cũ. Hiện không còn chức năng rút hồ sơ." onClick={() => onChange("WITHDRAWN")}><History size={15} aria-hidden="true" />Lịch sử cũ{counts?.WITHDRAWN !== undefined ? <span>{counts.WITHDRAWN}</span> : null}</button> : null}
  </nav>;
}
