"use client";

import { jobStatusLabel, jobTypeLabel } from "@/lib/recruitmentLabels";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ApplyForm } from "@/components/ApplyForm";
import { useCurrentAccount } from "@/components/SessionGate";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui";
import { ArrowRight, ArrowUpRight, Banknote, BriefcaseBusiness, Building2, CalendarDays, Clock3, MapPin, MessageSquare, Send, ShieldCheck, UsersRound } from "lucide-react";
import { CompanyMark } from "@/components/discovery/CompanyMark";
import styles from "@/components/discovery/Discovery.module.css";
import { jobDeadline, jobExperience, jobSalary } from "@/lib/jobPresentation";
import { ApiClientError, toUserMessage } from "../../../../lib/apiClient";
import { getPublicCompany, getPublicJob, getRecommendationsForCandidate, isDemoPerson2Api, type Job, type JobRecommendation, type PublicCompanyProfile } from "../../../../lib/person2Api";
import { createConversation } from "../../../../lib/chatApi";
import { useRouter } from "next/navigation";

const SOURCES = ["SEARCH", "AI_RECOMMENDATION", "COMPANY_PAGE", "SHARED_LINK", "OTHER"] as const;
type ApplicationSource = typeof SOURCES[number];

export default function CandidateJobDetailPage({ params, searchParams }: {
  params: { jobId: string };
  searchParams: { source?: string };
}) {
  const router = useRouter();
  const account = useCurrentAccount();
  const [job, setJob] = useState<Job | null>(null);
  const [company, setCompany] = useState<PublicCompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [recommendations, setRecommendations] = useState<JobRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState("");
  const canRecommend = isDemoPerson2Api || account?.role === "CANDIDATE";
  const source = SOURCES.includes(searchParams.source as ApplicationSource)
    ? searchParams.source as ApplicationSource
    : "SEARCH";

  async function handleStartChat() {
    if (!job?.createdBy || chatting || account?.role !== "CANDIDATE") return;
    setChatError("");
    setChatting(true);
    try {
      const response = await createConversation(`Chat với ${job.ownerName}`, [job.createdBy], false);
      router.push(`/candidate/messages?chat=${encodeURIComponent(response.data.id)}`);
    } catch (e) {
      setChatError("Không thể mở cuộc trò chuyện. " + toUserMessage(e));
    } finally {
      setChatting(false);
    }
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getPublicJob(params.jobId, controller.signal)
      .then((response) => { if (active) setJob(response.data); })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) setError(toUserMessage(reason));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [params.jobId, reloadKey]);

  useEffect(() => {
    setCompany(null);
    if (!job?.companyId) return;
    const controller = new AbortController();
    getPublicCompany(job.companyId, controller.signal)
      .then(response => { if (!controller.signal.aborted) setCompany(response.data); })
      .catch(() => { /* The job remains readable when its optional company profile is unavailable. */ });
    return () => controller.abort();
  }, [job?.companyId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!canRecommend) { setRecommendations([]); setRecommendationLoading(false); return; }
    setRecommendationLoading(true);
    setRecommendationError("");
    getRecommendationsForCandidate({ limit: 3 }, controller.signal)
      .then((response) => { if (active) setRecommendations(response.data.filter((item) => item.id !== params.jobId)); })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof ApiClientError && reason.code === "REQUEST_CANCELLED")) setRecommendationError(toUserMessage(reason));
      })
      .finally(() => { if (active) setRecommendationLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [canRecommend, params.jobId]);

  if (loading) return <main><LoadingState label="Đang tải việc làm" /></main>;
  if (error) return <main><ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} /><Link className="btn" href="/candidate/jobs">Quay về danh sách</Link></main>;
  if (!job) return <main><h1 className="page-title">Không tìm thấy việc làm</h1><Link className="btn" href="/candidate/jobs">Quay về danh sách</Link></main>;

  const canApply = job.status === "PUBLISHED" && job.deadline.slice(0, 10) >= new Date().toISOString().slice(0, 10);
  return (
    <main className={`${styles.page} ${styles.jobDetailPage}`}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span aria-hidden="true">/</span><Link href="/candidate/jobs">Tìm việc làm</Link><span aria-hidden="true">/</span><span>{job.title}</span></nav>
      <section className={styles.jobHero}>
        <StatusBadge tone={canApply ? "success" : "warning"}>{!canApply && job.status === "PUBLISHED" ? "Đã hết hạn ứng tuyển" : jobStatusLabel(job.status)}</StatusBadge>
        <h1>{job.title}</h1>
        <Link className={styles.jobHeroCompany} href={`/candidate/companies/${job.companyId}`}><Building2 size={16} aria-hidden="true" />{company?.name || job.ownerName}<ArrowUpRight size={15} aria-hidden="true" /></Link>
        <div className={styles.jobMetrics}>
          <div className={styles.jobMetric}><span><Banknote size={21} aria-hidden="true" /></span><div><small>Mức lương</small><strong>{jobSalary(job)}</strong></div></div>
          <div className={styles.jobMetric}><span><MapPin size={21} aria-hidden="true" /></span><div><small>Địa điểm làm việc</small><strong>{job.location}</strong></div></div>
          <div className={styles.jobMetric}><span><BriefcaseBusiness size={21} aria-hidden="true" /></span><div><small>Kinh nghiệm</small><strong>{jobExperience(job.experienceYears)}</strong></div></div>
        </div>
        <div className={styles.jobHeroFooter}><span><CalendarDays size={16} aria-hidden="true" />Hạn nộp hồ sơ: <time dateTime={job.deadline.slice(0, 10)}>{jobDeadline(job.deadline)}</time></span><div className={styles.jobHeroActions}>{canApply ? <a className="btn btn-primary" href="#job-application"><Send size={17} aria-hidden="true" />Ứng tuyển ngay</a> : null}<BookmarkButton jobId={job.id} /></div></div>
      </section>
      <div className={styles.contentColumns}>
        <div className={styles.mainColumn}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Chi tiết công việc</h2>
          <div className={styles.prose}>
          <h3>Mô tả công việc</h3><p>{job.description}</p>
          <h3>Yêu cầu ứng viên</h3>
          {job.requirements.length ? <ul>{job.requirements.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>Nhà tuyển dụng chưa cập nhật yêu cầu chi tiết.</p>}
          <h3>Quyền lợi</h3>
          {job.benefits.length ? <ul>{job.benefits.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>Trao đổi thêm với nhà tuyển dụng về quyền lợi của vị trí này.</p>}
          {job.skills.length ? <><h3>Kỹ năng liên quan</h3><div className={styles.tags}>{job.skills.map(skill => <span key={skill}>{skill}</span>)}</div></> : null}
          <h3>Địa điểm làm việc</h3><p><MapPin size={16} aria-hidden="true" /> {job.location}</p>
          </div>
        </section>
        <section className={`${styles.section} ${styles.application}`} id="job-application">
          {!canApply || isDemoPerson2Api || account?.role === "CANDIDATE" ? <h2>Ứng tuyển</h2> : null}
          {canApply && (isDemoPerson2Api || account?.role === "CANDIDATE") ? <p className="help">Chọn CV phù hợp và giới thiệu ngắn gọn để nhà tuyển dụng hiểu hơn về bạn.</p> : null}
          {canApply ? <ApplyForm jobId={job.id} source={source} /> : <p className="notice">Tin này hiện không nhận thêm hồ sơ. Bạn vẫn có thể xem nội dung và tìm việc khác.</p>}
        </section>
        </div>
        <aside className={styles.sideColumn} aria-label="Thông tin tuyển dụng">
          <section className={styles.section}><div className={styles.companyMini}><CompanyMark name={company?.name || job.ownerName} src={company?.logoUrl} /><h2>{company?.name || job.ownerName}</h2></div><dl className={styles.factsList}>
            {company?.size ? <div className={styles.fact}><UsersRound size={18} aria-hidden="true" /><div><dt>Quy mô</dt><dd>{company.size} nhân sự</dd></div></div> : null}
            {company?.industry ? <div className={styles.fact}><Building2 size={18} aria-hidden="true" /><div><dt>Lĩnh vực</dt><dd>{company.industry}</dd></div></div> : null}
            <div className={styles.fact}><MapPin size={18} aria-hidden="true" /><div><dt>Địa điểm</dt><dd>{company?.address || job.location}</dd></div></div>
          </dl><Link className={styles.sideCompanyLink} href={`/candidate/companies/${job.companyId}`}>Xem công ty <ArrowRight size={16} aria-hidden="true" /></Link></section>
          <section className={styles.section}><h2>Thông tin chung</h2><dl className={styles.factsList}>
            <div className={styles.fact}><BriefcaseBusiness size={19} aria-hidden="true" /><div><dt>Kinh nghiệm</dt><dd>{jobExperience(job.experienceYears)}</dd></div></div>
            <div className={styles.fact}><Clock3 size={19} aria-hidden="true" /><div><dt>Hình thức làm việc</dt><dd>{jobTypeLabel(job.type)}</dd></div></div>
            <div className={styles.fact}><UsersRound size={19} aria-hidden="true" /><div><dt>Số lượng tuyển</dt><dd>{job.quantity ? `${job.quantity} người` : "Chưa cập nhật"}</dd></div></div>
            <div className={styles.fact}><CalendarDays size={19} aria-hidden="true" /><div><dt>Hạn nộp hồ sơ</dt><dd>{jobDeadline(job.deadline)}</dd></div></div>
          </dl></section>
          {job.createdBy && account?.role === "CANDIDATE" ? <section className={styles.section}><h2>Trao đổi với nhà tuyển dụng</h2><p className="help">Bạn cần tìm hiểu thêm về vị trí này? Gửi câu hỏi trực tiếp cho nhà tuyển dụng.</p><button className="btn btn-secondary" type="button" onClick={handleStartChat} disabled={chatting} aria-busy={chatting}><MessageSquare size={17} aria-hidden="true" />{chatting ? "Đang tạo..." : "Chat ngay"}</button>{chatError ? <p className="notice notice-danger" role="alert">{chatError}</p> : null}</section> : null}
          <div className={styles.sideHint}><ShieldCheck size={23} aria-hidden="true" /><strong>Chuẩn bị trước khi ứng tuyển</strong><p>Chọn CV phù hợp với vị trí và giới thiệu ngắn gọn kinh nghiệm liên quan trong thư ứng tuyển.</p><Link className={styles.reportLink} href={`/candidate/reports?type=JOB&id=${encodeURIComponent(job.id)}`}>Báo cáo tin tuyển dụng</Link></div>
        </aside>
      </div>
      {canRecommend ? (
        <section className={styles.recommendations}>
          <h2>Việc làm gợi ý khác</h2>
          {recommendationLoading ? <LoadingState label="Đang tải gợi ý" /> : null}
          {recommendationError ? <p className="notice notice-warning">Gợi ý tạm thời chưa sẵn sàng. Bạn vẫn có thể đọc và ứng tuyển tin này.</p> : null}
          {!recommendationLoading && !recommendationError && recommendations.length === 0 ? <div className={styles.recommendationEmpty}><EmptyState title="Chưa có gợi ý khác" description="Bạn có thể tiếp tục tìm kiếm để khám phá thêm các vị trí đang tuyển." /></div> : null}
          <div className={styles.recommendationGrid}>{recommendations.map((item) => (
            <Link key={item.id} className={`card ${styles.relatedJob}`} href={`/candidate/jobs/${item.id}?source=${item.source === "AI" ? "AI_RECOMMENDATION" : "SEARCH"}`}><BriefcaseBusiness size={22} aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.source === "AI" ? `Mức phù hợp ${item.matchPercent}%` : "Khám phá cơ hội nghề nghiệp"}</p></div></Link>
          ))}</div>
          <Link className="btn" href="/candidate/jobs#suitable-jobs">Xem thêm gợi ý</Link>
        </section>
      ) : null}
      {canApply ? <div className={styles.mobileApply}><strong>{jobSalary(job)}</strong><a className="btn btn-primary" href="#job-application">Ứng tuyển ngay</a></div> : null}
    </main>
  );
}
