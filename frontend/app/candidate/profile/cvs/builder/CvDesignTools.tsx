"use client";

import { Check, Columns2, Minus, Plus, Rows3 } from "lucide-react";
import { cvDesignRanges, cvTemplates, type CvTemplateId } from "@/lib/cvPdf";
import type { CvDesign } from "@/lib/person1Api";
import styles from "./CvBuilder.module.css";

type RangeKey = keyof typeof cvDesignRanges;
const adjustments: { key: RangeKey; label: string; unit: string }[] = [
  { key: "fontSize", label: "Cỡ chữ nội dung", unit: " pt" },
  { key: "lineHeight", label: "Giãn dòng", unit: "" },
  { key: "horizontalMargin", label: "Lề ngang", unit: " mm" },
  { key: "verticalMargin", label: "Lề dọc", unit: " mm" },
  { key: "leftWidth", label: "Độ rộng cột trái", unit: "%" },
];
const accents = [["#263c59", "Xanh đậm"], ["#30383e", "Xám than"], ["#006e2e", "Xanh CareerHub"], ["#6b3b87", "Tím"], ["#9c3c33", "Đỏ gạch"]] as const;

export function CvDesignTools({ template, design, onDesign, onTemplate }: {
  template: CvTemplateId;
  design: CvDesign;
  onDesign: (design: CvDesign) => void;
  onTemplate: (template: CvTemplateId) => void;
}) {
  function adjust(key: RangeKey, raw: number) {
    const { min, max } = cvDesignRanges[key];
    onDesign({ ...design, [key]: Number(Math.max(min, Math.min(max, raw)).toFixed(2)) });
  }

  return <div className={styles.tools}>
    <section aria-labelledby="builder-template-heading">
      <div className={styles.toolHeading}><h2 id="builder-template-heading">Thư viện mẫu CV</h2><button className="btn btn-ghost" type="button" onClick={() => onTemplate(template)}>Đặt lại mẫu</button></div>
      <div className={styles.templates}>
        {(Object.keys(cvTemplates) as CvTemplateId[]).map(id => <button key={id} className={styles.template} data-template={id} type="button" aria-pressed={id === template} onClick={() => onTemplate(id)}>
          <span className={styles.swatchStage} aria-hidden="true"><span className={styles.swatchPaper} style={{ color: cvTemplates[id].accent }}><i /><i /><i /><i /></span>{id === template ? <Check size={16} /> : null}</span>
          <strong>{cvTemplates[id].label}</strong><small>{cvTemplates[id].description}</small>
        </button>)}
      </div>
      <p className="help">Chọn mẫu sẽ áp dụng thông số thiết kế mặc định của mẫu đó.</p>
    </section>
    <section aria-labelledby="builder-spacing-heading">
      <h2 id="builder-spacing-heading">Chữ và khoảng cách</h2>
      {adjustments.filter(item => item.key !== "leftWidth" || design.columns === 2).map(({ key, label, unit }) => <div className={styles.adjustment} key={key}>
        <div><label htmlFor={`cv-design-${key}`}>{label}</label><output htmlFor={`cv-design-${key}`}>{design[key]}{unit}</output></div>
        <div className={styles.slider}>
          <input type="range" id={`cv-design-${key}`} {...cvDesignRanges[key]} value={design[key]} onChange={event => adjust(key, Number(event.target.value))} />
          <button className="btn" type="button" aria-label={`Giảm ${label.toLowerCase()}`} disabled={design[key] <= cvDesignRanges[key].min} onClick={() => adjust(key, design[key] - cvDesignRanges[key].step)}><Minus size={15} /></button>
          <button className="btn" type="button" aria-label={`Tăng ${label.toLowerCase()}`} disabled={design[key] >= cvDesignRanges[key].max} onClick={() => adjust(key, design[key] + cvDesignRanges[key].step)}><Plus size={15} /></button>
        </div>
      </div>)}
    </section>
    <section aria-labelledby="builder-layout-heading">
      <h2 id="builder-layout-heading">Bố cục trang</h2>
      <div className="btn-group" role="group" aria-label="Số cột">
        <button className="btn" type="button" aria-pressed={design.columns === 1} onClick={() => onDesign({ ...design, columns: 1, personalPosition: "top" })}><Rows3 size={16} /> Một cột</button>
        <button className="btn" type="button" aria-pressed={design.columns === 2} onClick={() => onDesign({ ...design, columns: 2 })}><Columns2 size={16} /> Hai cột</button>
      </div>
      {design.columns === 2 ? <label className="field">Vị trí thông tin cá nhân
        <select className="select" value={design.personalPosition} onChange={event => onDesign({ ...design, personalPosition: event.target.value as CvDesign["personalPosition"] })}>
          <option value="top">Trên cùng</option><option value="left">Cột trái</option><option value="right">Cột phải</option>
        </select>
      </label> : null}
      <label className="row"><input type="checkbox" checked={design.pageNumbers} onChange={event => onDesign({ ...design, pageNumbers: event.target.checked })} /> Đánh số trang PDF</label>
      <div className={styles.colors} role="group" aria-label="Màu nhấn">
        <span>Màu nhấn</span>
        {accents.map(([color, name]) => <button type="button" key={color} style={{ background: color }} aria-label={name} aria-pressed={design.accent === color} onClick={() => onDesign({ ...design, accent: color })}>
          {design.accent === color ? <Check size={16} aria-hidden="true" /> : null}
        </button>)}
      </div>
    </section>
  </div>;
}
