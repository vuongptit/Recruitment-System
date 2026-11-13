import { apiUrl } from "./apiRoutes";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** Resolve access through the owning service; never accept a URL from the browser. */
export async function serveCvPreview(scope: string, id: string, accessToken?: string): Promise<Response> {
  const fail = (message: string, status: number) => new Response(message, {
    status, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
  if (!accessToken) return fail("Phiên đăng nhập đã hết hạn. Quay lại trang chính và đăng nhập để xem CV.", 401);
  if (!["candidate", "recruiter"].includes(scope) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    return fail("Không tìm thấy CV.", 404);
  }
  try {
    const path = scope === "candidate" ? `/api/profile/cvs/${id}/download-url` : `/api/applications/${id}/cv/download-url`;
    const grant = await fetch(apiUrl(path, process.env.API_INTERNAL_BASE_URL || "http://localhost:8080"), {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!grant.ok) return fail(grant.status === 401 ? "Phiên đăng nhập đã hết hạn. Quay lại trang chính và đăng nhập để xem CV." : "Không thể xem CV. Bạn có thể không có quyền truy cập hoặc CV không còn khả dụng.", [401, 403, 404].includes(grant.status) ? grant.status : 502);
    const data = (await grant.json()).data;
    const url = new URL(data.url);
    if (url.protocol !== "https:" || !["api.cloudinary.com", "res.cloudinary.com"].includes(url.hostname) || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Invalid storage URL");
    const file = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!file.ok || !file.body) throw new Error("Storage unavailable");
    const reader = file.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PDF_BYTES) { await reader.cancel(); throw new Error("PDF too large"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const pdf = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { pdf.set(chunk, offset); offset += chunk.byteLength; }
    if (new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-") throw new Error("Invalid PDF");
    return new Response(pdf.buffer, { headers: {
      ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="cv.pdf"',
      "Content-Length": String(size), "Accept-Ranges": "none",
    } });
  } catch { return fail("Chưa mở được CV. Quay lại trang trước và bấm Xem CV để thử lại.", 502); }
}
