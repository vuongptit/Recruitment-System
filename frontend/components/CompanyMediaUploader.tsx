"use client";

import { useEffect, useRef, useState } from "react";
import { createMediaIdempotencyKey, type CompanyMediaAssetType, type CompanyMediaUploadCapability,
  type CompanyMediaUploadResult, secondsUntilExpiry, uploadToSignedProvider, validateCompanyMediaFile } from "../lib/companyMediaUpload";
import { prepareUploadImage } from "../lib/avatarImage";
import { ApiClientError, toUserMessage } from "../lib/apiClient";
import type { UploadStep } from "../lib/signedFileUpload";
import { UploadProgress } from "./UploadProgress";
import { FilePicker } from "./FilePicker";
import { type Company, confirmCompanyMediaUpload, createCompanyMediaUploadIntent,
  isDemoPerson2Api, updateCompany } from "../lib/person2Api";

interface UploadAttempt {
  companyId: string;
  source: File;
  file: File;
  type: CompanyMediaAssetType;
  key: string;
  capability?: CompanyMediaUploadCapability;
  uploaded?: boolean;
  confirmed?: CompanyMediaUploadResult;
}

const TYPE_LABELS: Record<CompanyMediaAssetType, string> = {
  COMPANY_LOGO: "Logo công ty", COMPANY_IMAGE: "Ảnh không gian", COMPANY_VIDEO: "Video giới thiệu",
};

export function CompanyMediaUploader({ company, onCompanyChange }: {
  company: Company; onCompanyChange: (company: Company) => void;
}) {
  const [type, setType] = useState<CompanyMediaAssetType>("COMPANY_LOGO");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<UploadStep | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [optimizedBytes, setOptimizedBytes] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const attempt = useRef<UploadAttempt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);

  function select(nextFile: File | null, nextType = type) {
    attempt.current = null;
    setFile(nextFile);
    setType(nextType);
    setOptimizedBytes(null);
    setError("");
    setStatus("");
    if (!nextFile && fileInput.current) fileInput.current.value = "";
  }

  async function upload() {
    if (!file || controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    setError("");
    setStatus("");
    try {
      let current = attempt.current;
      if (!current || current.source !== file || current.type !== type || current.companyId !== company.id) {
        setStep("preparing");
        const prepared = type === "COMPANY_VIDEO" ? file : await prepareUploadImage(file, type, active.signal);
        const issue = validateCompanyMediaFile(prepared, type);
        if (issue) throw new Error(issue);
        current = { source: file, file: prepared, type, companyId: company.id, key: createMediaIdempotencyKey() };
        attempt.current = current;
        setOptimizedBytes(prepared.size);
      }
      const signal = active.signal;
      if (current.capability && !current.uploaded && secondsUntilExpiry(current.capability.expiresAt) === 0) {
        current.capability = undefined;
        current.key = createMediaIdempotencyKey();
      }
      if (!current.capability) {
        setStep("signing");
        const response = await createCompanyMediaUploadIntent(company.id, type, current.file.name, current.key, signal);
        const issue = validateCompanyMediaFile(current.file, type, response.data);
        if (issue) throw new Error(issue);
        current.capability = response.data;
      }
      if (!current.uploaded) {
        setStep("uploading");
        if (!isDemoPerson2Api) await uploadToSignedProvider(current.capability, current.file, signal);
        current.uploaded = true;
      }
      if (!current.confirmed) {
        setStep("confirming");
        const response = await confirmCompanyMediaUpload(company.id, current.capability.fileId, type, signal);
        current.confirmed = response.data;
      }
      setStep("saving");
      const confirmed = current.confirmed;
      const input = type === "COMPANY_LOGO" ? { logo: { fileId: confirmed.fileId } } : { media: [
        ...company.media.gallery.map(({ fileId, type, sortOrder }) => ({ fileId, type, sortOrder })),
        { fileId: confirmed.fileId, type: type === "COMPANY_VIDEO" ? "VIDEO" as const : "IMAGE" as const, sortOrder: company.media.gallery.length },
      ] };
      const response = await updateCompany(company.id, { ...input, expectedVersion: company.aggregateVersion }, signal);
      onCompanyChange(response.data);
      select(null);
      setStatus("Đã lưu tệp vào hồ sơ công ty.");
    } catch (reason) {
      if (!active.signal.aborted) {
        setError(reason instanceof ApiClientError ? toUserMessage(reason) : reason instanceof Error ? reason.message : "Không thể tải tệp. Hãy thử lại.");
        if (reason instanceof ApiClientError && ["FILE_INTENT_EXPIRED", "FILE_REJECTED", "FILE_CONFIRMATION_NOT_ALLOWED"].includes(reason.code)) attempt.current = null;
      }
    } finally {
      if (controller.current === active) controller.current = null;
      setPending(false);
      setStep(null);
    }
  }

  return <div className="stack company-media-uploader">
    <div className="field">
      <label className="label" htmlFor="company-media-type">Loại tệp</label>
      <select id="company-media-type" className="select" value={type} disabled={pending}
        onChange={event => select(null, event.target.value as CompanyMediaAssetType)}>
        {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="field">
      <label className="label" htmlFor="company-media-file">Tệp cần tải</label>
      <FilePicker ref={fileInput} id="company-media-file" fileName={file?.name} disabled={pending}
        accept={type === "COMPANY_VIDEO" ? ".mp4,video/mp4" : ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"}
        aria-describedby="company-media-help" onChange={event => select(event.target.files?.[0] ?? null)} />
      <p className="help" id="company-media-help">{type === "COMPANY_VIDEO" ? "Video MP4 tối đa 50 MiB. Video được giữ nguyên nội dung."
        : "Ảnh gốc tối đa 20 MiB, 25 triệu điểm ảnh. Hệ thống tự tối ưu ảnh trước khi tải lên."}</p>
      {file ? <p className="help">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB{optimizedBytes !== null && optimizedBytes < file.size ? ` → ${(optimizedBytes / 1024).toFixed(0)} KiB sau tối ưu` : ""}</p> : null}
    </div>
    <UploadProgress step={step} />
    {status ? <p className="notice notice-success" role="status">{status}</p> : null}
    {error ? <p className="notice notice-danger" role="alert">{error}{attempt.current?.uploaded ? " Tệp đã được gửi; thử lại sẽ tiếp tục bước kiểm tra hoặc lưu." : ""}</p> : null}
    <div className="btn-group">
      <button className="btn btn-primary" type="button" disabled={pending || !file} aria-busy={pending} onClick={() => void upload()}>
        {pending ? "Đang xử lý…" : error && attempt.current ? "Tiếp tục tải và lưu" : "Tải lên và lưu"}
      </button>
      {file ? <button className="btn" type="button" disabled={pending} onClick={() => select(null)}>Bỏ tệp đã chọn</button> : null}
    </div>
  </div>;
}
