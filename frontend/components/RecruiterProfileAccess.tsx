"use client";

import { ArrowUpRight, Eye, FileText, IdCard, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProfileSections, profileBlockOrder } from "@/app/candidate/profile/ProfileSections";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import { openCandidateProfile, type RecruiterCandidateProfile } from "@/lib/person1Api";
import { LoadingState } from "./ui";
import styles from "./RecruiterProfileAccess.module.css";

export function RecruiterProfileAccess({ applicationId }: { applicationId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [viewId, setViewId] = useState("");
  const [profile, setProfile] = useState<RecruiterCandidateProfile | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  useEffect(() => () => request.current?.abort(), []);

  async function load(id: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setProfile(null);
    setError("");
    setMissing(false);
    try {
      const { data } = await openCandidateProfile(applicationId, id, controller.signal);
      if (!controller.signal.aborted) setProfile(data);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiClientError && reason.code === "PROFILE_NOT_FOUND") setMissing(true);
      else setError(toUserMessage(reason));
    }
  }

  function open() {
    if (!dialog.current || dialog.current.open) return;
    const id = crypto.randomUUID();
    setViewId(id);
    dialog.current.showModal();
    void load(id);
  }

  const links = profile ? [
    { label: "GitHub", url: profile.githubUrl },
    { label: "LinkedIn", url: profile.linkedinUrl },
    { label: "Trang cá nhân", url: profile.portfolioUrl },
  ] : [];
  const name = profile?.fullName?.trim() || "Ứng viên";
  const initials = name.split(/\s+/).slice(-2).map(word => word[0]).join("").toLocaleUpperCase("vi-VN");
  const hasDetails = profile && (profile.summary || profileBlockOrder.some(key => profile[key].length));

  return <>
    <button className="btn" type="button" onClick={open}><Eye size={17} aria-hidden="true" /> Xem hồ sơ ứng viên</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="recruiter-profile-title" onClose={() => {
      if (dialog.current?.open) return;
      request.current?.abort();
      setProfile(null);
    }}>
      <header className={styles.header}>
        <h2 id="recruiter-profile-title"><IdCard size={19} aria-hidden="true" /> Hồ sơ ứng viên</h2>
        <button type="button" className={styles.close} aria-label="Đóng" onClick={() => dialog.current?.close()}><X size={21} aria-hidden="true" /></button>
      </header>
      <div className={styles.body}>
        {profile ? <>
          <div className={styles.identity}>
            <div className={styles.avatar} aria-hidden="true">
              {initials}
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" onError={event => { event.currentTarget.hidden = true; }} /> : null}
            </div>
            <div className={styles.identityText}>
              <h3>{name}</h3>
              {profile.headline ? <p>{profile.headline}</p> : null}
              {links.some(link => link.url) ? <nav className={styles.links} aria-label="Liên kết cá nhân">
                {links.map(({ label, url }) => url ? <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={14} aria-hidden="true" /></a> : null)}
              </nav> : null}
            </div>
          </div>
          <ProfileSections profile={profile} />
        </> : null}
        {missing || (profile && !hasDetails) ? <div className={styles.empty}>
          <FileText size={22} aria-hidden="true" />
          <div><strong>{missing ? "Chưa có hồ sơ cá nhân" : "Chưa có thông tin nghề nghiệp"}</strong><p>Bạn có thể xem CV đã gửi trong đơn ứng tuyển.</p></div>
        </div> : null}
        {error ? <div className={styles.error}><p role="alert" className="notice notice-danger">{error}</p><button type="button" className="btn" onClick={() => void load(viewId)}>Thử lại</button></div> : null}
        {!profile && !missing && !error ? <LoadingState label="Đang tải hồ sơ ứng viên…" /> : null}
      </div>
    </dialog>
  </>;
}
