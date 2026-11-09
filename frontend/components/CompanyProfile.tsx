import Link from "next/link";
import { BadgeCheck, Building2, ExternalLink, Globe, MapPin, ShieldCheck, UsersRound, FileText, CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ApiClientError, toUserMessage } from "@/lib/apiClient";
import { orderPublicCompanyMedia } from "@/lib/companyPublicProfile";
import { getPublicCompany } from "@/lib/person2Api";
import { CompanyJobs } from "./CompanyJobs";
import { PortalReportLink } from "@/components/PortalReportLink";
import { CompanyMark } from "./discovery/CompanyMark";
import styles from "./discovery/Discovery.module.css";

function CompanyNotFound({ basePath }: { basePath: string }) {
  return (
    <main>
      <EmptyState title="Không tìm thấy doanh nghiệp" description="Hồ sơ có thể chưa được xác minh hoặc không còn công khai." />
      <Link className="btn" href={basePath}>Quay về danh sách</Link>
    </main>
  );
}

function safeWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function CompanyProfile({ companyId, basePath = "/companies" }: { companyId: string; basePath?: string }) {
  let response;
  try {
    response = await getPublicCompany(companyId);
  } catch (reason: unknown) {
    if (reason instanceof ApiClientError && reason.code === "COMPANY_NOT_FOUND") return <CompanyNotFound basePath={basePath} />;
    return (
      <main>
        <div className="notice notice-danger" role="alert">
          <strong>Chưa tải được hồ sơ doanh nghiệp</strong>
          <p>{toUserMessage(reason)}</p>
        </div>
        <Link className="btn" href={basePath}>Quay về danh sách</Link>
      </main>
    );
  }

  const company = response.data;
  if (!company) {
    return <CompanyNotFound basePath={basePath} />;
  }

  const website = safeWebsite(company.website);
  const media = orderPublicCompanyMedia(company.media);
  const cover = media.find(item => item.type === "IMAGE");
  const updatedDate = new Date(company.updatedAt);
  const updatedLabel = Number.isNaN(updatedDate.getTime()) ? "Chưa cập nhật" : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(updatedDate);

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span aria-hidden="true">/</span><Link href={basePath}>Công ty</Link><span aria-hidden="true">/</span><span>{company.name}</span></nav>
      <section className={styles.companyHero}>
        <div className={`${styles.companyCover} ${cover ? "" : styles.companyCoverFallback}`} aria-hidden="true">{cover ? <img src={cover.url} alt="" width={1240} height={300} decoding="async" /> : <Building2 />}</div>
        <div className={styles.companyHeroBody}>
          <CompanyMark name={company.name} src={company.logoUrl} large />
          <div className={styles.companyHeroText}><span className={styles.verified}><BadgeCheck size={16} aria-hidden="true" />Doanh nghiệp đã xác minh</span><h1>{company.name}</h1><div className={styles.meta}>{company.industry ? <span><Building2 size={15} />{company.industry}</span> : null}{company.size ? <span><UsersRound size={15} />{company.size} nhân sự</span> : null}</div></div>
          <div className={styles.companyHeroActions}><a className="btn btn-primary" href="#company-jobs">Xem việc đang tuyển</a>{website ? <a className="btn" href={website} target="_blank" rel="noreferrer">Mở website <ExternalLink size={15} aria-hidden="true" /></a> : null}</div>
        </div>
        <nav className={styles.sectionNav} aria-label="Nội dung hồ sơ công ty"><a href="#company-introduction">Giới thiệu</a><a href="#company-jobs">Tuyển dụng</a><a href="#company-gallery">Hình ảnh</a></nav>
      </section>
      <div className={styles.contentColumns}>
        <div className={styles.mainColumn}>
          <section className={styles.section} id="company-introduction"><h2 className={styles.sectionTitle}>Giới thiệu công ty</h2><div className={styles.prose}><p>{company.description || "Doanh nghiệp chưa cập nhật phần giới thiệu."}</p></div></section>
          <CompanyJobs key={company.id} companyId={company.id} companyName={company.name} />
      <section className={styles.section} id="company-gallery">
        <div className={styles.sectionTitle}><h2>Hình ảnh doanh nghiệp</h2><span>{media.length} ảnh và video</span></div>
        {media.length === 0 ? (
          <EmptyState title="Chưa có hình ảnh công khai" description="Doanh nghiệp chưa bổ sung hình ảnh. Hãy quay lại sau để khám phá môi trường làm việc." />
        ) : (
          <div className={styles.mediaGrid}>
            {media.map((item, index) => item.type === "VIDEO" ? (
              <video key={`${item.url}-${index}`} controls preload="metadata" aria-label={`Video giới thiệu ${company.name}`}><source src={item.url} /></video>
            ) : (
              <img key={`${item.url}-${index}`} src={item.url} width={960} height={640} decoding="async" alt={`Không gian làm việc tại ${company.name} ${index + 1}`} loading="lazy" />
            ))}
          </div>
        )}
      </section>
        </div>
        <aside className={styles.sideColumn} aria-label="Thông tin doanh nghiệp">
          <section className={styles.section}><h2>Thông tin chung</h2><dl className={styles.factsList}>
            <div className={styles.fact}><Building2 size={19} aria-hidden="true" /><div><dt>Lĩnh vực hoạt động</dt><dd>{company.industry || "Chưa cập nhật"}</dd></div></div>
            <div className={styles.fact}><UsersRound size={19} aria-hidden="true" /><div><dt>Quy mô công ty</dt><dd>{company.size || "Chưa cập nhật"}</dd></div></div>
            <div className={styles.fact}><FileText size={19} aria-hidden="true" /><div><dt>Mã số thuế</dt><dd>{company.taxCode || "Chưa cập nhật"}</dd></div></div>
            {website ? <div className={styles.fact}><Globe size={19} aria-hidden="true" /><div><dt>Website</dt><dd><a href={website} target="_blank" rel="noreferrer">{new URL(website).hostname}</a></dd></div></div> : null}
            <div className={styles.fact}><CalendarDays size={19} aria-hidden="true" /><div><dt>Cập nhật hồ sơ</dt><dd>{updatedLabel}</dd></div></div>
          </dl></section>
          <section className={styles.section}><h2>Địa chỉ công ty</h2><div className={styles.fact}><MapPin size={20} aria-hidden="true" /><span>{company.address || "Doanh nghiệp chưa cập nhật địa chỉ."}</span></div></section>
          <div className={styles.sideHint}><ShieldCheck size={23} aria-hidden="true" /><strong>Thông tin minh bạch, tìm việc an tâm</strong><p>Hồ sơ doanh nghiệp đã được xác minh trên CareerHub. Hãy kiểm tra kỹ nội dung tin trước khi ứng tuyển.</p><PortalReportLink targetId={company.id} /></div>
          <Link className="btn" href={basePath}>Quay về danh sách</Link>
        </aside>
      </div>
    </main>
  );
}
