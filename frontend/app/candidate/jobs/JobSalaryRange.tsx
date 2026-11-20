import type { CSSProperties } from "react";
import styles from "./JobSearch.module.css";

const MILLION_VND = 1_000_000;
const DEFAULT_LIMIT = 100;
const salaryFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

export function formatSalaryMillions(amount: number) {
  return salaryFormatter.format(amount / MILLION_VND);
}

export function JobSalaryRange({ minimum, maximum, onChange, error }: {
  minimum: string;
  maximum: string;
  onChange: (field: "salaryMin" | "salaryMax", value: string) => void;
  error?: string;
}) {
  const min = Number(minimum) / MILLION_VND;
  const limit = Math.max(DEFAULT_LIMIT, Math.ceil(min), Math.ceil(Number(maximum) / MILLION_VND) + 1);
  const max = maximum === "" ? limit : Number(maximum) / MILLION_VND;
  const step = Number.isInteger(min) && Number.isInteger(max) ? 1 : "any";

  const selectedTrack = { "--salary-start": `${min / limit * 100}%`, "--salary-end": `${max / limit * 100}%` } as CSSProperties;
  const minText = minimum === "" ? "Không giới hạn dưới" : `${formatSalaryMillions(Number(minimum))} triệu VNĐ`;
  const maxText = maximum === "" ? "Không giới hạn trên" : `${formatSalaryMillions(Number(maximum))} triệu VNĐ`;

  return <fieldset id="salary" className={styles.salaryRange}>
    <legend>Mức lương <span>(triệu VNĐ)</span></legend>
    <div className={styles.salaryValues} aria-hidden="true">
      <span>Từ <strong>{formatSalaryMillions(Number(minimum))}</strong></span>
      <span>{maximum === "" ? "Không giới hạn" : <>Đến <strong>{formatSalaryMillions(Number(maximum))}</strong></>}</span>
    </div>
    <div className={styles.salaryTrack} style={selectedTrack}>
      <input type="range" id="salaryMin" min={0} max={limit} step={step} value={min}
        aria-label="Lương tối thiểu" aria-valuetext={minText} aria-describedby={error ? "salary-error" : undefined}
        onChange={event => {
          const value = Math.min(event.currentTarget.valueAsNumber, max);
          onChange("salaryMin", value === 0 ? "" : String(Math.round(value * MILLION_VND)));
        }} />
      <input type="range" id="salaryMax" min={0} max={limit} step={step} value={max}
        aria-label="Lương tối đa" aria-valuetext={maxText} aria-describedby={error ? "salary-error" : undefined}
        onChange={event => {
          const value = Math.max(event.currentTarget.valueAsNumber, min);
          onChange("salaryMax", value === limit ? "" : String(Math.round(value * MILLION_VND)));
        }} />
    </div>
    <div className={styles.salaryScale} aria-hidden="true"><span>0</span><span>{salaryFormatter.format(limit)}+</span></div>
    {error ? <span id="salary-error" className="form-error">{error}</span> : null}
  </fieldset>;
}
