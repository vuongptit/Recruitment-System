import { Award, BriefcaseBusiness, FolderKanban, GraduationCap, ScrollText, Sparkles } from "lucide-react";
import type { CandidateProfile, ProfileBlock } from "@/lib/person1Api";
import styles from "./CandidateProfile.module.css";

export const profileBlockOrder = ["experiences", "skills", "educations", "projects", "certificates"] as const;
type ProfileBlockKey = (typeof profileBlockOrder)[number];

export const blockTitles: Record<ProfileBlockKey, string> = {
  experiences: "Kinh nghiệm làm việc", skills: "Kỹ năng chuyên môn",
  educations: "Học vấn", projects: "Dự án", certificates: "Chứng chỉ",
};

const sectionIcons = {
  experiences: BriefcaseBusiness,
  skills: Sparkles,
  educations: GraduationCap,
  projects: FolderKanban,
  certificates: Award,
};

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});

function profileDate(value: ProfileBlock[string] | undefined) {
  if (typeof value !== "string" || !value) return "";
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : dateFormat.format(time);
}

export function BlockItemDetails({
  blockKey,
  item,
}: {
  blockKey: ProfileBlockKey;
  item: ProfileBlock;
}) {
  if (blockKey === "experiences") {
    const timeDisplay = [
      profileDate(item.startDate),
      item.isCurrent ? "Hiện tại" : profileDate(item.endDate),
    ]
      .filter(Boolean)
      .join(" — ");

    return (
      <div className={styles.entryText}>
        <strong>{String(item.position || item.companyName || "")}</strong>
        {item.position && item.companyName ? <p className={styles.muted}>{String(item.companyName)}</p> : null}
        {timeDisplay ? <p className={styles.previewDate}>{timeDisplay}</p> : null}
        {item.description ? <p className={styles.summary}>{String(item.description)}</p> : null}
      </div>
    );
  }

  if (blockKey === "educations") {
    const timeDisplay = [profileDate(item.startDate), profileDate(item.endDate) || "Hiện tại"]
      .filter(Boolean)
      .join(" — ");

    return (
      <div className="person1-item-details">
        <div className="person1-item-row">
          <span className="person1-item-label">Trường:</span>
          <strong className="person1-item-value">{String(item.school ?? "")}</strong>
        </div>
        {item.major ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Chuyên ngành:</span>
            <span className="person1-item-value">{String(item.major)}</span>
          </div>
        ) : null}
        {item.degree ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Bằng cấp:</span>
            <span className="person1-item-value">{String(item.degree)}</span>
          </div>
        ) : null}
        {timeDisplay ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Thời gian:</span>
            <span className="person1-item-value">{timeDisplay}</span>
          </div>
        ) : null}
        {item.description ? (
          <div className="person1-item-row person1-item-desc">
            <span className="person1-item-label">Mô tả:</span>
            <p className="person1-item-text">{String(item.description)}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if (blockKey === "skills") {
    return (
      <div className="person1-item-details">
        <div className="person1-item-row">
          <span className="person1-item-label">Kỹ năng:</span>
          <strong className="person1-item-value">{String(item.name ?? "")}</strong>
        </div>
        {item.level ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Mức độ:</span>
            <span className="person1-badge-pill">{String(item.level)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (blockKey === "certificates") {
    return (
      <div className="person1-item-details">
        <div className="person1-item-row">
          <span className="person1-item-label">Chứng chỉ:</span>
          <strong className="person1-item-value">{String(item.name ?? "")}</strong>
        </div>
        {item.issuer ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Đơn vị cấp:</span>
            <span className="person1-item-value">{String(item.issuer)}</span>
          </div>
        ) : null}
        {item.issuedAt ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Ngày cấp:</span>
            <span className="person1-item-value">{profileDate(item.issuedAt)}</span>
          </div>
        ) : null}
        {item.credentialUrl ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Liên kết:</span>
            <a
              href={String(item.credentialUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="person1-item-link"
            >
              {String(item.credentialUrl)} ↗
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  if (blockKey === "projects") {
    return (
      <div className="person1-item-details">
        <div className="person1-item-row">
          <span className="person1-item-label">Dự án:</span>
          <strong className="person1-item-value">{String(item.name ?? "")}</strong>
        </div>
        {item.role ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Vai trò:</span>
            <span className="person1-item-value">{String(item.role)}</span>
          </div>
        ) : null}
        {item.url ? (
          <div className="person1-item-row">
            <span className="person1-item-label">Liên kết:</span>
            <a
              href={String(item.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="person1-item-link"
            >
              {String(item.url)} ↗
            </a>
          </div>
        ) : null}
        {item.description ? (
          <div className="person1-item-row person1-item-desc">
            <span className="person1-item-label">Mô tả:</span>
            <p className="person1-item-text">{String(item.description)}</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="person1-item-details">
      {Object.entries(item)
        .filter(([k]) => k !== "id")
        .map(([k, v]) => (
          <div key={k} className="person1-item-row">
            <span className="person1-item-label">{k}:</span>
            <span className="person1-item-value">{String(v)}</span>
          </div>
        ))}
    </div>
  );
}

export function ProfileSections({ profile }: { profile: Pick<CandidateProfile, "summary" | ProfileBlockKey> }) {
  return <div className={styles.previewSections}>
    {profile.summary ? <section className={styles.previewSection}>
      <h3><ScrollText size={17} aria-hidden="true" /> Giới thiệu bản thân</h3>
      <p className={styles.summary}>{profile.summary}</p>
    </section> : null}
    {profileBlockOrder.map(key => {
      if (!profile[key]?.length) return null;
      const Icon = sectionIcons[key];
      return <section key={key} className={styles.previewSection}>
        <h3><Icon size={17} aria-hidden="true" /> {blockTitles[key]}</h3>
        {key === "skills" ? <ul className={styles.previewSkills}>{profile.skills.map(item => <li key={item.id}>
          <strong>{item.name}</strong>{item.level ? <span>{item.level}</span> : null}
        </li>)}</ul> : <ul className={key === "experiences" ? styles.previewTimeline : styles.items}>
          {profile[key].map(item => <li key={item.id}><BlockItemDetails blockKey={key} item={item} /></li>)}
        </ul>}
      </section>;
    })}
  </div>;
}
