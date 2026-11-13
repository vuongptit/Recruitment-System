import { expect, test, type Page, type Route } from "@playwright/test";

const api = "http://127.0.0.1:4173/api";
const applicationId = "2795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const jobId = "3795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const userId = "1795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const offerId = "4795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const reply = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status < 400 ? { data, meta: null } : data) });

async function login(page: Page, role: "CANDIDATE" | "RECRUITER", destination: string) {
  let signedIn = false;
  const account = { id: userId, email: "pipeline@example.test", role };
  await page.route(api + "/auth/me", (route) => signedIn ? reply(route, account) : reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(api + "/auth-cookie/refresh", (route) => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(api + "/notifications**", (route) => reply(route, route.request().url().includes("unread-count") ? { unread_count: 0 } : []));
  await page.route(api + "/profile/" + userId, (route) => reply(route, { userId, fullName: "Ứng viên kiểm thử" }));
  await page.route(api + "/auth-cookie/login", (route) => { signedIn = true; return reply(route, { user: account }); });
  await page.goto(`${role === "RECRUITER" ? "/recruiter/login" : "/login"}?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel(role === "RECRUITER" ? "Email công việc" : "Email", { exact: true }).fill(account.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FixturePassword123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173" + destination);
}

test("candidate and recruiter follow the same application through review, interview, offer and acceptance", async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  let status = "APPLIED";
  let version = 7;
  let sent = false;
  let offerStatus = "SENT";
  const history: { fromStatus: string | null; toStatus: string; changedAt: string; note: string | null }[] = [{ fromStatus: null, toStatus: "APPLIED", changedAt: "2026-11-12T18:00:00Z", note: null }];
  const application = () => ({ id: applicationId, jobId, companyId: jobId, candidateId: userId, jobTitle: "Kỹ sư phần mềm", status, version, appliedAt: history[0].changedAt, updatedAt: history.at(-1)?.changedAt, timeline: history, offerId: sent ? offerId : null });
  const offer = () => ({ id: offerId, applicationId, salary: 25000000, startDate: "2030-12-01", position: "Kỹ sư phần mềm", status: offerStatus, version: offerStatus === "ACCEPTED" ? 1 : 0, applicationStatus: status, applicationVersion: version, expiresAt: "2030-11-30T00:00:00Z", note: null, fileId: null, fileUrl: null, responseNote: null });
  const transition = (target: string, note: string | null = null) => {
    const fromStatus = status;
    status = target; version += 1;
    history.push({ fromStatus, toStatus: target, changedAt: new Date().toISOString(), note });
    return { applicationId, fromStatus, toStatus: target, updatedAt: history.at(-1)?.changedAt, version };
  };
  async function routes(target: Page) {
    await target.route(api + "/applications/my", route => reply(route, [application()]));
    await target.route(api + "/applications/?**", route => {
      const filter = new URL(route.request().url()).searchParams.get("status");
      const items = !filter || filter === status ? [application()] : [];
      return reply(route, { items, page: 0, size: 20, totalElements: items.length, totalPages: items.length ? 1 : 0 });
    });
    await target.route(api + "/applications/" + applicationId, route => reply(route, application()));
    await target.route(api + "/applications/" + applicationId + "/status", route => {
      const body = route.request().postDataJSON();
      expect(body.expectedVersion).toBe(version);
      return reply(route, transition(body.status, body.note ?? null));
    });
    await target.route(api + "/applications/" + applicationId + "/offer", route => {
      const body = route.request().postDataJSON();
      expect(body.expectedApplicationVersion).toBe(version);
      expect(status).toBe("INTERVIEW");
      sent = true; transition("OFFER");
      return reply(route, offer(), 201);
    });
    await target.route(api + "/offers/" + offerId, route => reply(route, offer()));
    await target.route(api + "/offers/" + offerId + "/respond", route => {
      const body = route.request().postDataJSON();
      expect(body.expectedApplicationVersion).toBe(version);
      expect(body.expectedOfferVersion).toBe(0);
      expect(body.decision).toBe("ACCEPTED");
      offerStatus = "ACCEPTED"; transition("HIRED");
      return reply(route, offer());
    });
    await target.route(api + "/interviews?**", route => reply(route, { items: [], nextCursor: null }));
  }
  const candidatePage = await context.browser()!.newPage({ viewport: testInfo.project.use.viewport, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  try {
    await routes(page); await routes(candidatePage);
    await login(page, "RECRUITER", "/recruiter/applications");
    await login(candidatePage, "CANDIDATE", "/candidate/applications");
    await expect(candidatePage.getByRole("button", { name: "Rút hồ sơ", exact: true })).toHaveCount(0);
    await expect(candidatePage.locator('[aria-current="step"]')).toContainText("Đã ứng tuyển");
    await page.getByRole("button", { name: "Bắt đầu xem xét", exact: true }).click();
    await expect(page.locator('[aria-current="step"]')).toContainText("Đang xem xét");
    await candidatePage.getByRole("button", { name: "Làm mới", exact: true }).click();
    await expect(candidatePage.locator('[aria-current="step"]')).toContainText("Đang xem xét");
    await expect(page.getByRole("link", { name: "Xem lịch phỏng vấn" })).toHaveCount(0);
    await page.getByRole("button", { name: "Chuyển phỏng vấn", exact: true }).click();
    await expect(page.getByRole("link", { name: "Xem lịch phỏng vấn" })).toBeVisible();
    await page.getByRole("link", { name: "Soạn thư mời nhận việc", exact: true }).click();
    await page.getByLabel("Mức lương", { exact: true }).fill("25000000");
    await page.getByLabel("Ngày bắt đầu", { exact: true }).fill("2030-12-01");
    await page.getByLabel("Hạn phản hồi", { exact: true }).fill("2030-11-30T09:00");
    await page.getByRole("button", { name: "Gửi thư mời nhận việc", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Gửi thư mời nhận việc", exact: true }).click();
    await expect(page.getByRole("region", { name: "Thư mời của hồ sơ" })).toContainText("Chờ phản hồi");
    await candidatePage.getByRole("button", { name: "Làm mới", exact: true }).click();
    await expect(candidatePage.locator('[aria-current="step"]')).toContainText("Thư mời nhận việc");
    await candidatePage.getByRole("link", { name: "Phản hồi thư mời", exact: true }).click();
    await candidatePage.getByRole("button", { name: "Chấp nhận", exact: true }).click();
    await candidatePage.getByRole("alertdialog").getByRole("button", { name: "Chấp nhận thư mời nhận việc", exact: true }).click();
    await expect(candidatePage.getByText("Đã chấp nhận thư mời nhận việc.", { exact: true })).toBeVisible();
    for (const [target, portal] of [[page, "recruiter"], [candidatePage, "candidate"]] as const) {
      await target.goto(`/${portal}/applications/${applicationId}`);
      await expect(target.locator('[aria-current="step"]')).toContainText("Đã nhận việc");
      await expect(target.getByRole("heading", { name: "Lịch sử tiến trình", exact: true })).toBeVisible();
      await expect(target.getByRole("region", { name: "Thư mời của hồ sơ" })).toContainText("Đã chấp nhận");
      await expect(target.getByRole("link", { name: "Đặt lịch phỏng vấn", exact: true })).toHaveCount(0);
      expect(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await target.screenshot({ path: testInfo.outputPath(`${portal}-journey.png`), fullPage: true });
    }
    expect(history.map(entry => entry.toStatus)).toEqual(["APPLIED", "REVIEWING", "INTERVIEW", "OFFER", "HIRED"]);
  } finally { await candidatePage.context().close(); }
});

test("recruiter filters the entire server list and keeps rejection reason on conflict", async ({ page }) => {
  let conflict = false;
  const queries: string[] = [];
  const record = { id: applicationId, jobId, companyId: jobId, candidateId: userId, jobTitle: "Kỹ sư phần mềm", status: "APPLIED", version: 4, appliedAt: "2026-11-12T18:00:00Z", updatedAt: "2026-11-12T18:00:00Z" };
  await page.route(api + "/applications/?**", route => {
    const status = new URL(route.request().url()).searchParams.get("status");
    queries.push(status ?? "ALL");
    return reply(route, { items: [record], page: 0, size: 20, totalElements: 22, totalPages: 2 });
  });
  await page.route(api + "/applications/" + applicationId, route => reply(route, { ...record, status: "REVIEWING", version: 5 }));
  await page.route(api + "/applications/" + applicationId + "/status", route => {
    conflict = true;
    return reply(route, { code: "APPLICATION_CHANGED_CONCURRENTLY" }, 409);
  });
  await login(page, "RECRUITER", "/recruiter/applications");
  await page.getByRole("navigation", { name: "Lọc theo bước tuyển dụng" }).getByRole("button", { name: "Đã ứng tuyển", exact: true }).click();
  await expect(page.getByText(/22 hồ sơ theo bộ lọc/)).toBeVisible();
  expect(queries).toContain("APPLIED");
  await page.getByText("Từ chối hồ sơ", { exact: true }).click();
  const reason = page.getByLabel("Lý do từ chối (hiển thị trong lịch sử hồ sơ)");
  await reason.fill("Chưa đáp ứng kinh nghiệm yêu cầu");
  await page.getByRole("button", { name: "Xác nhận từ chối", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Hồ sơ ứng tuyển vừa được người khác sửa/ })).toBeVisible();
  expect(conflict).toBe(true);
  await expect(page.getByText("Chưa đáp ứng kinh nghiệm yêu cầu", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
