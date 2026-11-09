import { ApiClientError } from "./apiClientCore";

export type UploadStep = "preparing" | "signing" | "uploading" | "confirming" | "saving";
export const uploadStepLabels: Record<UploadStep, string> = {
  preparing: "Đang chuẩn bị và tối ưu tệp…",
  signing: "Đang chuẩn bị tải lên…",
  uploading: "Đang gửi tệp lên kho lưu trữ…",
  confirming: "Đang kiểm tra tệp đã tải…",
  saving: "Đang lưu thay đổi…",
};

export interface SignedFileCapability {
  uploadUrl: string;
  apiKey: string;
  signature: string;
  expiresAt: string;
  maxBytes: number;
  allowedFormats: readonly string[];
  params: Record<string, string | number>;
}

export function storageUploadError(status: number, payload: unknown): Error {
  const detail = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
  const message = detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string"
    ? detail.message.slice(0, 1000).toLowerCase() : "";
  // Never display the provider's raw payload: it can contain signed parameters.
  if (status === 401 || status === 403 || /invalid signature|invalid api.?key|unknown api.?key/.test(message)
    || /upload preset/.test(message) && /not found|does not exist|invalid|unknown/.test(message))
    return new Error("Dịch vụ lưu trữ chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị viên để hoàn tất cấu hình tải tệp.");
  if (status === 413 || /file size too large|maximum file size/.test(message))
    return new Error("Kho lưu trữ từ chối vì tệp vượt quá dung lượng cho phép. Hãy chọn tệp nhỏ hơn.");
  if (status === 429 || status >= 500)
    return new Error("Dịch vụ lưu trữ đang bận hoặc gián đoạn. Vui lòng thử tải tệp lại sau.");
  return new Error("Kho lưu trữ từ chối tệp. Kiểm tra định dạng và dung lượng trước khi thử lại.");
}

export async function sendSignedFile(cap: SignedFileCapability, file: File, signal?: AbortSignal): Promise<void> {
  const url = new URL(cap.uploadUrl);
  const format = file.name.split(".").pop()?.toLowerCase().replace(/^jpeg$/, "jpg");
  if (url.protocol !== "https:" || url.hostname !== "api.cloudinary.com" || url.username || url.password
    || !Number.isFinite(Date.parse(cap.expiresAt)) || Date.parse(cap.expiresAt) <= Date.now()
    || !file.size || file.size > cap.maxBytes || !format || !cap.allowedFormats.includes(format)) {
    throw new Error("Thông tin tải tệp không hợp lệ hoặc đã hết hạn. Hãy chuẩn bị tải lại.");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  Object.entries(cap.params).forEach(([key, value]) => form.append(key, String(value)));
  form.append("api_key", cap.apiKey);
  form.append("signature", cap.signature);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  // Video uploads need a bounded transfer budget distinct from API metadata calls.
  const timeout = setTimeout(cancel, file.size > 10 * 1024 * 1024 ? 180_000 : 60_000);
  try {
    if (signal?.aborted) cancel();
    const response = await fetch(cap.uploadUrl, {
      method: "POST", body: form, credentials: "omit", redirect: "error", signal: abort.signal,
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      throw storageUploadError(response.status, payload);
    }
  } catch (reason) {
    if (abort.signal.aborted) throw new ApiClientError({ code: signal?.aborted ? "REQUEST_CANCELLED" : "TIMEOUT" });
    if (reason instanceof TypeError) throw new ApiClientError({ code: "NETWORK_ERROR" });
    throw reason;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
