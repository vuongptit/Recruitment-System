"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { CompanyMark } from "@/components/discovery/CompanyMark";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import { isJobAcceptingApplications, jobDeadline, jobSalary } from "@/lib/jobPresentation";
import { getApplications, getCandidateBookmarks, removeCandidateBookmark, saveCandidateBookmark, type Job, type PublicCompanyProfile } from "@/lib/person2Api";
import styles from "./JobSearch.module.css";

const activeApplications = new Set(["APPLIED", "REVIEWING", "INTERVIEW", "OFFER", "HIRED"]);

export function useJobSearchActivity(candidateId?: string, guest = false) {
  const [bookmarks, setBookmarks] = useState<{ owner: string; ids: Set<string> }>();
  const [applied, setApplied] = useState<{ owner: string; ids: Set<string> }>();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requests = useRef(new Map<string, AbortController>());

  useEffect(() => {
    if (!candidateId) return;
    const controller = new AbortController();
    getCandidateBookmarks(controller.signal)
      .then(({ data }) => { if (!controller.signal.aborted) setBookmarks({ owner: candidateId, ids: new Set(data.map(item => item.jobId)) }); })
      .catch(reason => { if (!controller.signal.aborted) setError(toUserMessage(reason)); });
    return () => controller.abort();
  }, [candidateId, retry]);

  useEffect(() => {
    if (!candidateId) return;
    const controller = new AbortController();
    const mutations = requests.current;
    getApplications(candidateId, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setApplied({ owner: candidateId, ids: new Set(data.filter(item => activeApplications.has(item.status)).map(item => item.jobId)) });
      }).catch(() => { /* The submit endpoint remains authoritative for application eligibility. */ });
    return () => { controller.abort(); mutations.forEach(request => request.abort()); mutations.clear(); };
  }, [candidateId]);

  const isSaved = (jobId: string) => !!bookmarks && bookmarks.owner === candidateId && bookmarks.ids.has(jobId);
  async function toggle(jobId: string) {
    if (!candidateId || bookmarks?.owner !== candidateId || requests.current.size > 0) return;
    const controller = new AbortController();
    requests.current.set(jobId, controller);
    setPending(current => new Set(current).add(jobId));
    setError("");
    const saved = isSaved(jobId);
    try {
      if (saved) await removeCandidateBookmark(jobId, controller.signal);
      else await saveCandidateBookmark(jobId, controller.signal);
      if (!controller.signal.aborted) setBookmarks(current => {
        if (current?.owner !== candidateId) return current;
        const ids = new Set(current.ids);
        if (saved) ids.delete(jobId); else ids.add(jobId);
        return { owner: candidateId, ids };
      });
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (reason instanceof ApiClientError && reason.status === 409) {
          setBookmarks(undefined);
          setRetry(value => value + 1);
        }
        else setError(toUserMessage(reason));
      }
    } finally {
      if (requests.current.get(jobId) === controller) requests.current.delete(jobId);
      setPending(current => { const next = new Set(current); next.delete(jobId); return next; });
    }
  }

  return {
    candidateId, guest, error, isSaved, toggle,
    ready: !!candidateId && bookmarks?.owner === candidateId,
    pending: pending.size > 0,
    hasApplied: (jobId: string) => !!applied && applied.owner === candidateId && applied.ids.has(jobId),
    reload: () => { setError(""); setRetry(value => value + 1); },
  };
}

type Activity = ReturnType<typeof useJobSearchActivity>;

const compactNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const relativeDate = new Intl.RelativeTimeFormat("vi-VN", { numeric: "auto" });

export function displaySalary(job: Job) {
  if (job.currency !== "VND" || job.isNegotiable || job.salaryMin < 1_000_000) return jobSalary(job);
  const min = compactNumber.format(job.salaryMin / 1_000_000);
  const max = job.salaryMax ? compactNumber.format(job.salaryMax / 1_000_000) : null;
  return max ? `${min} – ${max} triệu` : `Từ ${min} triệu`;
}

function postedLabel(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60_000));
  if (minutes < 1) return "Vừa đăng";
  if (minutes < 60) return relativeDate.format(-minutes, "minute");
  if (minutes < 1440) return relativeDate.format(-Math.floor(minutes / 60), "hour");
  if (minutes < 10_080) return relativeDate.format(-Math.floor(minutes / 1440), "day");
  return jobDeadline(date);
}

function JobBookmark({ job, href, activity }: { job: Job; href: string; activity: Activity }) {
  const saved = activity.isSaved(job.id);
  const label = saved ? "Bỏ lưu việc làm" : "Lưu việc làm";
  if (activity.guest) return <Link className={styles.saveIcon}
    href={`/login?returnTo=${encodeURIComponent(href)}`} prefetch={false}
    aria-label={`Đăng nhập để lưu việc làm: ${job.title}`}>
    <Bookmark size={17} aria-hidden="true" />
  </Link>;
  if (!activity.candidateId) return null;
  return <button type="button" className={styles.saveIcon}
    aria-label={`${label}: ${job.title}`} aria-pressed={saved}
    disabled={!activity.ready || activity.pending} onClick={() => void activity.toggle(job.id)}>
    <Bookmark size={17} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
  </button>;
}

export function SearchJobCard({ job, company, href, activity, compact }: {
  job: Job; company?: PublicCompanyProfile; href: string; activity: Activity; compact: boolean;
}) {
  const status = activity.hasApplied(job.id) ? "Đã ứng tuyển" : !isJobAcceptingApplications(job) ? "Ngừng nhận hồ sơ" : null;
  const companyName = company?.name || job.ownerName;
  const showSkills = !compact && job.skills.length > 0;
  const publishedAt = compact ? null : job.publishedAt;
  return <article className={styles.jobCard} data-company-id={job.companyId}>
    <Link className={styles.jobLink} href={href} prefetch={false}>
      <div className={styles.jobIdentity}><CompanyMark name={companyName} src={company?.logoUrl} /><div><h3>{job.title}</h3><p>{companyName}</p></div></div>
      <div className={styles.jobMeta}><strong className={styles.salary}>{displaySalary(job)}</strong><span>{job.location}</span></div>
      {showSkills || publishedAt || status ? <div className={styles.cardFoot}>
        {showSkills ? <div className={styles.tags}>{job.skills.slice(0, 2).map(skill => <span key={skill}>{skill}</span>)}{job.skills.length > 2 ? <span>+{job.skills.length - 2}</span> : null}</div> : null}
        {publishedAt ? <time dateTime={publishedAt} title={jobDeadline(publishedAt)}>{postedLabel(publishedAt)}</time> : null}
        {status ? <strong>{status}</strong> : null}
      </div> : null}
    </Link>
    <JobBookmark job={job} href={href} activity={activity} />
  </article>;
}

export function SearchSkeleton({ compact }: { compact: boolean }) {
  return <div className={styles.skeletons} role="status"><span className="sr-only">Đang tải danh sách việc làm</span>
    {Array.from({ length: compact ? 6 : 3 }, (_, item) => <div key={item} aria-hidden="true" className={styles.skeleton}><span /><span /><span /></div>)}
  </div>;
}
