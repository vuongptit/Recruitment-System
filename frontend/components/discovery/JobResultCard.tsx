import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin, BriefcaseBusiness } from "lucide-react";
import type { Job } from "@/lib/person2Api";
import { jobTypeLabel } from "@/lib/recruitmentLabels";
import { jobDeadline, jobExperience, jobSalary } from "@/lib/jobPresentation";
import { CompanyMark } from "./CompanyMark";
import styles from "./Discovery.module.css";

export function JobResultCard({ job, source = "SEARCH", className = "" }: { job: Job; source?: "SEARCH" | "COMPANY_PAGE"; className?: string }) {
  const href = `/candidate/jobs/${job.id}${source === "COMPANY_PAGE" ? "?source=COMPANY_PAGE" : ""}`;
  return <article className={`${styles.jobCard} ${className}`}>
    <Link prefetch={false} className={styles.jobCardLink} href={href}>
      <CompanyMark name={job.ownerName} />
      <div className={styles.jobCardContent}>
        <div className={styles.jobCardHeading}><h3>{job.title}</h3><strong className={styles.salary}>{jobSalary(job)}</strong></div>
        <p className={styles.companyName}>{job.ownerName}</p>
        <div className={styles.meta}><span><MapPin size={14} />{job.location}</span><span><BriefcaseBusiness size={14} />{jobTypeLabel(job.type)}</span>{job.experienceYears !== undefined ? <span>{jobExperience(job.experienceYears)}</span> : null}</div>
        {job.skills.length ? <div className={styles.tags}>{job.skills.slice(0, 4).map(skill => <span key={skill}>{skill}</span>)}</div> : null}
      </div>
    </Link>
    <div className={styles.jobCardFooter}><span><CalendarDays size={14} aria-hidden="true" />Hạn nộp {jobDeadline(job.deadline)}</span><div><Link href={href}>Xem chi tiết <ArrowUpRight size={15} aria-hidden="true" /></Link><Link className={styles.applyLink} href={`${href}#job-application`}>Ứng tuyển</Link></div></div>
  </article>;
}
