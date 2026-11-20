"use client";

import { useState } from "react";
import { ApiClientError, toUserMessage } from "../lib/apiClient";
import { getRecruiterApplicationCv, type RecruiterApplicationCv } from "../lib/person2Api";
import { StatusBadge } from "./ui";
import { FileText, ExternalLink } from "lucide-react";

export function RecruiterCvAccess({ applicationId }: { applicationId: string }) {
  const [metadata, setMetadata] = useState<RecruiterApplicationCv | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function openCv() {
    if (pending) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("Trình duyệt đã chặn cửa sổ xem CV. Hãy cho phép popup rồi thử lại.");
      return;
    }
    popup.opener = null;
    setPending(true);
    setError("");
    setStatus("");
    try {
      const cv = await getRecruiterApplicationCv(applicationId);
      setMetadata(cv.data);
      popup.location.replace(`/api/cv-preview/recruiter/${encodeURIComponent(applicationId)}`);
      setStatus("Đã mở trang xem PDF trong tab mới.");
    } catch (reason: unknown) {
      popup.close();
      setError(toUserMessage(reason));
      if (reason instanceof ApiClientError && reason.code === "CV_DOWNLOAD_EXPIRED") {
        setError("Link CV hết hạn quá nhanh. Hãy bấm mở lại để xin link mới.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="cv-access" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="btn-group" style={{ alignItems: "center" }}>
        <button 
          className="btn" 
          type="button" 
          onClick={() => { void openCv(); }} 
          disabled={pending} 
          aria-busy={pending}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <FileText size={14} />
          {pending ? "Đang xin link CV…" : "Xem CV"}
          <ExternalLink size={12} style={{ opacity: 0.7 }} />
        </button>
        {metadata ? (
          <StatusBadge tone={metadata.isDeleted ? "warning" : "neutral"}>
            {metadata.type === "UPLOAD" ? "CV tải lên" : metadata.type === "ONLINE" ? "CV trực tuyến" : "CV ứng tuyển"} · {metadata.isDeleted ? "Bản CV đã nộp" : "Đang hoạt động"}
          </StatusBadge>
        ) : null}
      </div>
      {metadata ? (
        <p className="help" style={{ margin: 0 }}>
          <strong>{metadata.title}</strong> · Tạo ngày {new Date(metadata.createdAt).toLocaleDateString("vi-VN")}
        </p>
      ) : null}
      {status ? <p className="status-line" role="status" style={{ margin: 0 }}>{status}</p> : null}
      {error ? <p className="form-error" role="alert" style={{ margin: 0 }}>{error}</p> : null}
    </div>
  );
}
