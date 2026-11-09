/** Optimize presentation images locally; documents and videos are never transcoded. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
export type UploadImageKind = "AVATAR" | "COMPANY_LOGO" | "COMPANY_IMAGE";
const IMAGE_OPTIONS = {
  AVATAR: { edge: 768, target: 128 * 1024, max: AVATAR_MAX_BYTES },
  COMPANY_LOGO: { edge: 768, target: 192 * 1024, max: 2 * 1024 * 1024 },
  COMPANY_IMAGE: { edge: 1920, target: 512 * 1024, max: 5 * 1024 * 1024 },
};

export async function prepareUploadImage(file: File, kind: UploadImageKind, signal?: AbortSignal): Promise<File> {
  const options = IMAGE_OPTIONS[kind];
  signal?.throwIfAborted();
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error("Chọn ảnh JPG, PNG hoặc WEBP.");
  if (!file.size) throw new Error("Ảnh đang trống. Hãy chọn một ảnh khác.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Ảnh gốc vượt quá 20 MiB. Hãy thu nhỏ ảnh trước khi chọn.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = image.onerror = null;
        signal?.removeEventListener("abort", cancel);
      };
      const cancel = () => { cleanup(); image.src = ""; reject(new DOMException("Aborted", "AbortError")); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error("Không đọc được nội dung ảnh. Hãy chọn ảnh JPG, PNG hoặc WEBP hợp lệ.")); };
      signal?.addEventListener("abort", cancel, { once: true });
      image.src = url;
      if (signal?.aborted) cancel();
    });
    signal?.throwIfAborted();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > MAX_PIXELS) {
      throw new Error("Ảnh có độ phân giải quá lớn. Hãy chọn ảnh không quá 25 triệu điểm ảnh.");
    }
    if (file.size <= options.target && Math.max(width, height) <= options.edge) return file;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không xử lý được ảnh. Hãy chọn ảnh dưới 2 MiB.");
    try {
      let best: Blob | null = null;
      for (const edge of [options.edge, Math.round(options.edge * .75), Math.round(options.edge * .5)]) {
        signal?.throwIfAborted();
        const scale = Math.min(1, edge / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // WebP preserves transparency for logos/PNG and avoids lossless PNG's large payloads.
        // Browsers without this encoder fall back to PNG; use the actual returned MIME type.
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .86));
        signal?.throwIfAborted();
        if (blob && blob.size > 0 && (!best || blob.size < best.size)) best = blob;
        if (best && best.size <= options.target) break;
      }
      if (best && best.size <= options.max) {
        const suffix = best.type === "image/png" ? "png" : best.type === "image/webp" ? "webp" : "jpg";
        return new File([best], `${file.name.replace(/\.[^.]+$/, "")}.${suffix}`, { type: best.type, lastModified: file.lastModified });
      }
    } finally {
      canvas.width = canvas.height = 0;
    }
    throw new Error("Không thể tối ưu ảnh xuống dung lượng cho phép. Hãy chọn ảnh nhỏ hơn.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function prepareAvatarImage(file: File, signal?: AbortSignal): Promise<File> {
  return prepareUploadImage(file, "AVATAR", signal);
}
