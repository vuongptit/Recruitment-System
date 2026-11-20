import { ApiClientError, assertCanonicalUuidV4, requestApi } from "./apiClientCore";
import { isDemoPerson2Api } from "./apiMode";
import { sendSignedFile, type UploadStep } from "./signedFileUpload";

export interface ConfirmedOfferAttachment {
  fileId: string;
  fileUrl: string;
}

export const OFFER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB
export const OFFER_ATTACHMENT_ALLOWED_FORMATS = ["pdf", "doc", "docx"] as const;

export const OFFER_ATTACHMENT_SUPPORT = Object.freeze({
  available: true,
  title: "Tệp thư mời nhận việc",
  description:
    "Hỗ trợ đính kèm tệp văn bản hoặc PDF thư mời nhận việc (tối đa 10 MB). Ứng viên sẽ có thể xem tệp đính kèm khi phản hồi thư mời.",
});

export function validateOfferAttachmentFile(file: Pick<File, "name" | "size">): void {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !OFFER_ATTACHMENT_ALLOWED_FORMATS.includes(ext as (typeof OFFER_ATTACHMENT_ALLOWED_FORMATS)[number])) {
    throw new Error("Chỉ chấp nhận tệp định dạng PDF, DOC hoặc DOCX.");
  }
  if (file.size <= 0) {
    throw new Error("Tệp đang trống. Hãy chọn một tệp khác.");
  }
  if (file.size > OFFER_ATTACHMENT_MAX_BYTES) {
    throw new Error("Tệp đính kèm không được vượt quá 10 MB.");
  }
}

interface UploadCapability {
  fileId: string;
  uploadUrl: string;
  apiKey: string;
  signature: string;
  expiresAt: string;
  maxBytes: number;
  allowedFormats: string[];
  params: Record<string, string | number>;
}

export async function uploadOfferAttachment(
  file: File,
  signal?: AbortSignal,
  onStep?: (step: UploadStep) => void,
): Promise<ConfirmedOfferAttachment> {
  validateOfferAttachmentFile(file);

  if (isDemoPerson2Api) {
    onStep?.("preparing");
    onStep?.("signing");
    onStep?.("uploading");
    onStep?.("confirming");
    const demoFileId = globalThis.crypto?.randomUUID?.() || "018f47a2-6f4d-4b7d-8c91-ff02d770a944";
    return {
      fileId: demoFileId,
      fileUrl: `https://res.cloudinary.com/example/offers/${encodeURIComponent(file.name)}`,
    };
  }

  onStep?.("signing");
  const randomSuffix = globalThis.crypto?.randomUUID?.() || Date.now().toString();
  const idempotencyKey = `offer-${randomSuffix}`;
  const intentResult = await requestApi<UploadCapability>("/api/files/signature", {
    method: "POST",
    privateData: true,
    signal,
    headers: { "Idempotency-Key": idempotencyKey },
    body: { type: "CHAT_ATTACHMENT", originalFilename: file.name },
  });

  const cap = intentResult.data;
  onStep?.("uploading");
  await sendSignedFile(cap, file, signal);

  onStep?.("confirming");
  await requestApi("/api/files/", {
    method: "POST",
    privateData: true,
    body: { fileId: cap.fileId },
    signal,
    maxRetries: 0,
  });

  let fileUrl = "";
  try {
    const downloadRes = await requestApi<{ url: string }>(`/api/files/${cap.fileId}/download-url`, {
      method: "POST",
      privateData: true,
      signal,
      maxRetries: 0,
    });
    fileUrl = downloadRes.data.url;
  } catch {
    fileUrl = `https://res.cloudinary.com/dpgrveiqx/raw/upload/${cap.fileId}/${encodeURIComponent(file.name)}`;
  }

  return {
    fileId: cap.fileId,
    fileUrl,
  };
}

export function normalizeOfferAttachment(input: {
  fileId?: string | null;
  fileUrl?: string | null;
}): ConfirmedOfferAttachment | null {
  const fileId = input.fileId?.trim() || null;
  const fileUrl = input.fileUrl?.trim() || null;
  if (Boolean(fileId) !== Boolean(fileUrl)) {
    throw new ApiClientError({ code: "INVALID_OFFER_FILE_PAIR" });
  }
  if (!fileId || !fileUrl) return null;

  assertCanonicalUuidV4(fileId, "fileId");
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    throw new ApiClientError({ code: "INVALID_OFFER_FILE_URL" });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ApiClientError({ code: "INVALID_OFFER_FILE_URL" });
  }
  return { fileId, fileUrl: parsed.toString() };
}

export function emptyOfferAttachment(): { fileId: undefined; fileUrl: undefined } {
  return { fileId: undefined, fileUrl: undefined };
}
