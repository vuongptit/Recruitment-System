"use client";

import { useState } from "react";
import styles from "./Discovery.module.css";

export function CompanyMark({ name, src, large = false }: { name: string; src?: string | null; large?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <span className={`${styles.companyMark} ${large ? styles.companyMarkLarge : ""}`} aria-hidden="true">
    {src && src !== failedSource ? <img src={src} width={large ? 112 : 64} height={large ? 112 : 64} alt="" loading={large ? "eager" : "lazy"} decoding="async" onError={() => setFailedSource(src)} /> : <span>{initials || "C"}</span>}
  </span>;
}
