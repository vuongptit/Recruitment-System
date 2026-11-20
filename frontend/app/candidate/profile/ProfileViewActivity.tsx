"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { getProfileViewActivity } from "@/lib/person1Api";
import styles from "./CandidateProfile.module.css";

const formatNumber = new Intl.NumberFormat("vi-VN");

export function ProfileViewActivity() {
  const [state, setState] = useState<Awaited<ReturnType<typeof getProfileViewActivity>>["data"] | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    getProfileViewActivity(controller.signal)
      .then(({ data }) => { if (!controller.signal.aborted) setState(data); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt]);

  return <section className={styles.card} aria-labelledby="profile-activity-heading">
    <h2 id="profile-activity-heading">Hoạt động hồ sơ</h2>
    {state === null ? <p className={styles.muted} role="status">Đang tải lượt xem…</p> : state === "error" ? <>
      <p className={styles.muted} role="status">Chưa tải được lượt xem hồ sơ.</p>
      <button className={styles.textAction} type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button>
    </> : <>
      <dl className={styles.activity}>
        <div><dt>Lượt xem hồ sơ</dt><dd><Eye size={18} aria-hidden="true" /> {formatNumber.format(state.totalViews)}</dd></div>
        <div><dt>Nhà tuyển dụng đã xem</dt><dd>{formatNumber.format(state.uniqueRecruiters)}</dd></div>
      </dl>
      {state.totalViews === 0 ? <p className={styles.muted}>Hồ sơ của bạn chưa có lượt xem từ nhà tuyển dụng.</p> : null}
    </>}
  </section>;
}
