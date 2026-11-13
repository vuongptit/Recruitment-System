import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { serveCvPreview } from "./cvPreview";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const id = "2795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const url = "https://api.cloudinary.com/v1_1/fixture/raw/download?signature=fixture";
const grant = (value = url) => Response.json({ data: { url: value } });

test("CV preview requires a session and canonical resource identifiers before any fetch", async () => {
  globalThis.fetch = async () => { throw new Error("Must not fetch"); };
  assert.equal((await serveCvPreview("candidate", id)).status, 401);
  assert.equal((await serveCvPreview("admin", id, "fixture-token")).status, 404);
  assert.equal((await serveCvPreview("candidate", "../x", "fixture-token")).status, 404);
});

for (const scope of ["candidate", "recruiter"]) {
  test(`${scope} preview preserves authorization and renders an attachment as inline PDF`, async () => {
    const calls: { url: string; options?: RequestInit }[] = [];
    globalThis.fetch = async (input, options) => {
      calls.push({ url: String(input), options });
      return calls.length === 1 ? grant() : new Response("%PDF-1.7\nfixture", { headers: { "Content-Disposition": "attachment", "Content-Type": "application/octet-stream" } });
    };
    const response = await serveCvPreview(scope, id, "fixture-token");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("content-disposition"), 'inline; filename="cv.pdf"');
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.match(await response.text(), /^%PDF-/);
    assert.ok(calls[0].url.endsWith(scope === "candidate" ? `/api/profile/cvs/${id}/download-url` : `/api/applications/${id}/cv/download-url`));
    assert.equal(calls[0].options?.method, "POST");
    assert.equal(new Headers(calls[0].options?.headers).get("Authorization"), "Bearer fixture-token");
    assert.equal(new Headers(calls[1].options?.headers).has("Authorization"), false);
    assert.equal(calls[1].options?.redirect, "error");
  });
}

test("denied CV access never fetches a storage file or exposes backend details", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ secret: "internal-detail" }, { status: 403 }); };
  const response = await serveCvPreview("recruiter", id, "fixture-token");
  assert.equal(response.status, 403);
  assert.equal(calls, 1);
  assert.doesNotMatch(await response.text(), /internal-detail/);
});

test("preview rejects storage SSRF, credentials, insecure URLs and redirects", async () => {
  for (const value of ["http://api.cloudinary.com/x", "https://127.0.0.1/x", "https://api.cloudinary.com.attacker.test/x", "https://user:pass@api.cloudinary.com/x", "https://api.cloudinary.com:444/x"]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return grant(value); };
    assert.equal((await serveCvPreview("candidate", id, "fixture-token")).status, 502);
    assert.equal(calls, 1);
  }
});

test("preview never renders HTML or an oversized object under the PDF origin", async () => {
  for (const body of ["<html>unexpected</html>", new Uint8Array(5 * 1024 * 1024 + 1)]) {
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? grant() : new Response(body);
    const response = await serveCvPreview("candidate", id, "fixture-token");
    assert.equal(response.status, 502);
    assert.match(response.headers.get("content-type")!, /^text\/plain/);
    assert.doesNotMatch(await response.text(), /signature|unexpected/);
  }
});
