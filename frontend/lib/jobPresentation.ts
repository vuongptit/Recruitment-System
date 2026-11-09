import type { Job } from "./person2Api";

export function jobSalary(job: Pick<Job, "salaryMin" | "salaryMax" | "currency" | "isNegotiable">): string {
  if (job.isNegotiable) return "Lương thỏa thuận";
  const min = job.salaryMin.toLocaleString("vi-VN");
  const max = job.salaryMax?.toLocaleString("vi-VN");
  return max ? `${min} – ${max} ${job.currency}` : `Từ ${min} ${job.currency}`;
}

export function jobDeadline(value: string): string {
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : "Chưa cập nhật";
}

export function jobExperience(years?: number): string {
  return years === undefined ? "Chưa cập nhật" : years === 0 ? "Không yêu cầu kinh nghiệm" : `Từ ${years} năm kinh nghiệm`;
}
