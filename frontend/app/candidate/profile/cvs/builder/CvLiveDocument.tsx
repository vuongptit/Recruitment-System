import type { CSSProperties } from "react";
import { cvLayout, cvTemplates, type CvTemplateId } from "@/lib/cvPdf";
import type { BuilderContent } from "@/lib/person1Api";
import styles from "./CvBuilder.module.css";

export function CvLiveDocument({ content, template }: { content: BuilderContent; template: CvTemplateId }) {
  const { design, first, second } = cvLayout(content, template);
  const header = <header className={styles.identity}>
    <h3>{content.fullName || "Họ và tên"}</h3>
    <p className={styles.headline}>{content.headline || "Vị trí mong muốn"}</p>
    {content.contact ? <p className={styles.contact}>{content.contact}</p> : null}
  </header>;
  const summary = content.summary ? <p className={styles.summary}>{content.summary}</p> : null;
  const sections = (items: typeof first) => items.map((section, index) => <section className={styles.documentSection} key={index}>
    <h4>{section.title}</h4><p>{section.text}</p>
  </section>);
  const personal = <div>{header}{summary}</div>;
  const cvStyle = {
    "--document-accent": design.accent,
    "--document-left": `${design.leftWidth}fr`,
    "--document-right": `${100 - design.leftWidth}fr`,
    "--document-padding-inline": `${design.horizontalMargin / 210 * 100}%`,
    "--document-padding-block": `${design.verticalMargin / 210 * 100}%`,
    "--document-font": design.fontSize,
    "--document-name": cvTemplates[template].nameSize,
    lineHeight: design.lineHeight,
  } as CSSProperties;
  return <article className={styles.document} data-template={template} data-columns={design.columns} data-personal={design.personalPosition} style={cvStyle} aria-label="Bản bố cục CV trực tiếp">
    {design.columns === 1 ? <>{personal}{sections(first)}</> : design.personalPosition === "top" ? <>
      {personal}<div className={styles.documentColumns}><div>{sections(first)}</div><div>{sections(second)}</div></div>
    </> : <div className={styles.documentColumns}>
      {design.personalPosition === "left" ? personal : <div>{sections(first)}</div>}
      {design.personalPosition === "right" ? personal : <div>{sections(first)}</div>}
    </div>}
  </article>;
}
