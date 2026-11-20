import Link from "next/link";
import { ArrowRight, Briefcase, Check, FileText, MapPin, Settings2, Sparkles } from "lucide-react";
import { CompanyMark } from "@/components/discovery/CompanyMark";
import { StatusBadge } from "@/components/ui";
import type { JobRecommendation, JobRecommendationContext, PublicCompanyProfile } from "@/lib/person2Api";
import { recommendationSourceView } from "@/lib/recommendationPresentation";
import { displaySalary } from "./JobSearchPanels";
import styles from "./JobSuggestions.module.css";

export function SuggestionHeading({ signedIn }: { signedIn: boolean }) {
  return <header className={styles.heading}>
    <div>
      <span className={styles.eyebrow}><Sparkles size={16} aria-hidden="true" />Gợi ý việc làm</span>
      <h2 id="job-suggestions-title">Khám phá công việc phù hợp với bạn</h2>
      <p>Đối chiếu CV với tin tuyển dụng và ưu tiên kỹ năng, vị trí từng đảm nhiệm trong hồ sơ.</p>
    </div>
    {signedIn ? <Link className="btn btn-secondary" href="/candidate/profile"><Settings2 size={17} aria-hidden="true" /> Cập nhật hồ sơ</Link> : null}
  </header>;
}

export function SuggestionCard({ item, company }: { item: JobRecommendation; company?: PublicCompanyProfile }) {
  const { job, match } = item;
  const cvMatch = match?.cv ?? item.source === "AI";
  const source = recommendationSourceView(item.source);
  const supplemental = item.source === "LATEST";
  const href = `/candidate/jobs/${item.id}?source=${cvMatch ? "AI_RECOMMENDATION" : "SEARCH"}`;
  const matchedSkills = match?.skills ?? [];
  const otherSkills = (job?.skills ?? []).filter(skill => !matchedSkills.includes(skill));
  const evidence = [
    matchedSkills.length ? `${matchedSkills.length} kỹ năng trùng với hồ sơ` : null,
    match?.role ? "chức danh khớp với hồ sơ" : null,
    cvMatch ? "nội dung tương đồng với CV" : null,
  ].filter(Boolean);

  return <article className={styles.card}>
    <div className={styles.cardHeading}>
      <CompanyMark name={company?.name ?? job?.ownerName ?? ""} src={company?.logoUrl} />
      <div className={styles.identity}>
        <h3><Link href={href}>{item.title}</Link></h3>
        {job ? <p>{company?.name ?? job.ownerName}</p> : null}
      </div>
    </div>
    {job ? <ul className={styles.details} aria-label="Thông tin việc làm">
      <li className={styles.salary}>{displaySalary(job)}</li>
      {job.location ? <li><MapPin size={15} aria-hidden="true" /> {job.location}</li> : null}
      {Number.isFinite(job.experienceYears) ? <li><Briefcase size={15} aria-hidden="true" /> {job.experienceYears ? `Từ ${job.experienceYears} năm` : "Không yêu cầu kinh nghiệm"}</li> : null}
    </ul> : null}
    {matchedSkills.length || otherSkills.length ? <ul className={styles.skills} aria-label="Kỹ năng của công việc">
      {matchedSkills.slice(0, 5).map(skill => <li key={skill} className={styles.matched}><Check size={14} aria-label="Khớp hồ sơ" />{skill}</li>)}
      {otherSkills.slice(0, Math.max(0, 5 - matchedSkills.length)).map(skill => <li key={skill}>{skill}</li>)}
    </ul> : null}
    <div className={styles.cardFoot}>
      {supplemental ? <div className={styles.supplemental}>
        <StatusBadge tone={source.tone}>Tin mới bổ sung</StatusBadge>
        <p>Chưa ghi nhận điểm khớp từ CV hoặc hồ sơ.</p>
      </div> : evidence.length > 0 ? <p><Sparkles size={15} aria-hidden="true" />{evidence.join(" · ")}</p> : <p>{source.description}</p>}
      <Link href={href} className={styles.action}>Xem chi tiết <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  </article>;
}

export function SuggestionSources({ context, items, selectedCvId, pending, onSelectCv }: {
  context: JobRecommendationContext;
  items: JobRecommendation[];
  selectedCvId?: string;
  pending: boolean;
  onSelectCv: (id: string) => void;
}) {
  const cvOptions = context.cvOptions ?? [];
  const normalizeSkill = (skill: string) => skill.normalize("NFKC").trim().toLowerCase();
  const profileSkills = new Set(context.profileSkills.map(normalizeSkill));
  const otherSkills = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const skills = new Map((item.job?.skills ?? []).map(skill => [normalizeSkill(skill), skill]));
    for (const [key, label] of skills) {
      if (key && !profileSkills.has(key) && !item.match?.skills.includes(label)) {
        otherSkills.set(key, { label, count: (otherSkills.get(key)?.count ?? 0) + 1 });
      }
    }
  }
  const frequentSkills = [...otherSkills.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi")).slice(0, 3);
  return <aside className={styles.sources} aria-labelledby="job-suggestion-sources">
    <h3 id="job-suggestion-sources">Nguồn dữ liệu gợi ý</h3>
    <div className={styles.sourceCv}>
      <FileText size={20} aria-hidden="true" />
      {cvOptions.length ? <div>
        <label htmlFor="suggestion-cv"><strong>CV dùng để gợi ý</strong></label>
        <select id="suggestion-cv" className="select" value={selectedCvId ?? context.selectedCvId ?? ""} onChange={event => onSelectCv(event.target.value)} disabled={pending}>
          {cvOptions.map((cv, index) => <option key={cv.id} value={cv.id}>{cv.title || `CV ${index + 1}`}</option>)}
        </select>
        {pending ? <span role="status">Đang cập nhật gợi ý…</span> : context.cvCompared === false ? <span>CV chưa có kết quả đối chiếu. Điểm hiện dựa trên hồ sơ.</span> : null}
      </div> : <>
        <div><strong>{context.cvTitle ?? "Chưa có thông tin CV"}</strong><span>CV dùng để gợi ý</span></div>
        <Link href="/candidate/profile/cvs">Thêm CV</Link>
      </>}
    </div>
    <div className={styles.profile}>
      <strong>Hồ sơ cá nhân</strong>
      {context.profileCompletion !== null ? <><span>Hoàn thiện {context.profileCompletion}%</span><progress aria-label="Mức hoàn thiện hồ sơ" value={context.profileCompletion} max={100} /></> : <span>Chưa có thông tin hoàn thiện</span>}
      <Link href="/candidate/profile">Cập nhật hồ sơ</Link>
    </div>
    {context.profileSkills.length ? <div className={styles.profile}>
      <strong>Kỹ năng trong hồ sơ</strong>
      <ul className={styles.skills}>{context.profileSkills.slice(0, 10).map(skill => <li key={skill}>{skill}</li>)}</ul>
    </div> : null}
    {frequentSkills.length ? <div className={styles.profile}>
      <strong>Kỹ năng có thể bổ sung vào hồ sơ</strong>
      <span>Tổng hợp từ các tin gợi ý đang hiển thị.</span>
      <ul className={styles.skillOpportunities}>{frequentSkills.map(({ label, count }) => <li key={label}><span>{label}</span><span>{count} tin</span></li>)}</ul>
    </div> : null}
  </aside>;
}
