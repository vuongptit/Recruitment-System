import { ApiClientError } from "./apiClientCore";
import { sendSignedFile } from "./signedFileUpload";

export type CompanyMediaAssetType = "COMPANY_LOGO" | "COMPANY_IMAGE" | "COMPANY_VIDEO";

export interface CompanyMediaUploadCapability {
  fileId: string;
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  resourceType: "image" | "video";
  expiresAt: string;
  maxBytes: number;
  allowedFormats: readonly string[];
  params: Record<string, string | number>;
  signature: string;
}

export interface CompanyMediaUploadResult {
  fileId: string;
  type: CompanyMediaAssetType;
  url: string;
}

const LOCAL_POLICIES: Record<CompanyMediaAssetType, { allowedFormats: readonly string[]; maxBytes: number }> = {
  COMPANY_LOGO: { allowedFormats: ["jpg", "jpeg", "png", "webp"], maxBytes: 2 * 1024 * 1024 },
  COMPANY_IMAGE: { allowedFormats: ["jpg", "jpeg", "png", "webp"], maxBytes: 5 * 1024 * 1024 },
  COMPANY_VIDEO: { allowedFormats: ["mp4"], maxBytes: 50 * 1024 * 1024 },
};

function extension(filename: string): string {
  const value = filename.toLowerCase().split(".").pop();
  return value && value !== filename.toLowerCase() ? value : "";
}

export function validateCompanyMediaFile(
  file: { name: string; size: number },
  type: CompanyMediaAssetType,
  capability?: Pick<CompanyMediaUploadCapability, "allowedFormats" | "maxBytes" | "expiresAt">,
  now = Date.now(),
): string | null {
  const policy = capability ?? LOCAL_POLICIES[type];
  const format = extension(file.name);
  const allowed = policy.allowedFormats.map((value) => value.toLowerCase());
  if (!format || !allowed.includes(format) && !(format === "jpeg" && allowed.includes("jpg"))) {
    return `Định dạng không hợp lệ. Chỉ chấp nhận: ${allowed.join(", ")}.`;
  }
  if (file.size <= 0 || file.size > policy.maxBytes) {
    return `Dung lượng phải lớn hơn 0 và không quá ${(policy.maxBytes / 1024 / 1024).toFixed(0)} MB.`;
  }
  if (capability && secondsUntilExpiry(capability.expiresAt, now) <= 0) {
    return "Chữ ký tải lên đã hết hạn. Hãy xin chữ ký mới.";
  }
  return null;
}

export function secondsUntilExpiry(expiresAt: string, now = Date.now()): number {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - now) / 1_000));
}

export function createMediaIdempotencyKey(randomUuid?: () => string): string {
  const uuid = randomUuid?.() ?? globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new ApiClientError({ code: "UUID_GENERATION_UNAVAILABLE" });
  return `company-media-${uuid.toLowerCase()}`;
}

export async function uploadToSignedProvider(
  capability: CompanyMediaUploadCapability,
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  await sendSignedFile(capability, file, signal);
}
