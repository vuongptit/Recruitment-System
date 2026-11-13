import { expect, test, type Page, type Route } from "@playwright/test";

const api = "http://127.0.0.1:4173/api";
const userId = "1795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const applicationId = "2795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const jobId = "3795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const interviewId = "4795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const application = { id: applicationId, jobId, companyId: jobId, candidateId: userId,
  jobTitle: "Backend Engineer live fixture", status: "INTERVIEW", version: 4,
  appliedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", matchScore: null };
const interview = { id: interviewId, applicationId, roundNumber: 2,
  scheduledStart: "2030-01-15T02:30:00Z", scheduledEnd: "2030-01-15T03:15:00Z",
  timeZone: "Asia/Ho_Chi_Minh", durationMinutes: 45, mode: "OFFLINE", location: "Fixture office", status: "SCHEDULED" };
const reply = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json",
  body: JSON.stringify(status < 400 ? { data, meta: null } : data) });

async function login(page: Page, role: "CANDIDATE" | "RECRUITER" | "ADMIN", destination: string) {
  await page.route(api + "/auth/me", r => reply(r, { code: "AUTH_INVALID" }, 401));
  await page.route(api + "/auth-cookie/refresh", r => reply(r, { code: "AUTH_INVALID" }, 401));
  await page.route(api + "/notifications**", r => reply(r, r.request().url().includes("unread-count") ? { unread_count: 0 } : []));
  await page.route(api + "/profile/" + userId, r => reply(r, { fullName: "Fixture Candidate" }));
  await page.route(api + "/auth-cookie/login", r => reply(r, { user: { id: userId, email: "fixture@example.test", role } }));
  await page.goto((role === "ADMIN" ? "/admin/login" : role === "RECRUITER" ? "/recruiter/login" : "/login") + "?returnTo=" + encodeURIComponent(destination));
  await page.getByLabel(role === "ADMIN" ? "Email quản trị" : role === "RECRUITER" ? "Email công việc" : "Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FixturePassword123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173" + destination);
}

for (const role of ["CANDIDATE", "RECRUITER", "ADMIN"] as const) {
  test(`${role} inbox displays legacy system notifications in Vietnamese and preserves user text and read actions`, async ({ page }) => {
    await login(page, role, `/${role.toLowerCase()}/notifications`);
    let marked = false;
    const rows = () => [
      { id: userId, type: "APPLICATION_STATUS_CHANGED", title: "Application status updated", body: "The application for Backend Engineer is now REVIEWING.",
        metadata: { application_id: applicationId }, is_read: marked, created_at: "2026-11-13T03:00:00Z" },
      { id: interviewId, type: "INTERVIEW_SCHEDULED", title: "Interview scheduled", body: "A new interview has been scheduled. Open the app for details.",
        metadata: { interview_id: interviewId, application_id: applicationId }, is_read: true, created_at: "2026-11-13T02:00:00Z" },
      { id: jobId, type: "new_message", title: "Tin nhắn mới", body: "Please bring your CV. Java & TypeScript.",
        metadata: { conversation_id: jobId }, is_read: true, created_at: "2026-11-13T01:00:00Z" },
    ];
    await page.route(api + "/notifications**", route => {
      const url = new URL(route.request().url());
      if (route.request().method() === "PATCH") { marked = true; return reply(route, {}); }
      return reply(route, url.pathname.endsWith("unread-count") ? { unread_count: marked ? 0 : 1 } : rows());
    });
    const refresh = page.getByRole("button", { name: "Tải lại thông báo", exact: true });
    await expect(refresh).toBeEnabled();
    await refresh.click();
    const inbox = page.getByRole("region", { name: "Danh sách thông báo" });
    await expect(inbox.getByRole("heading", { name: "Trạng thái hồ sơ ứng tuyển đã cập nhật" })).toBeVisible();
    await expect(inbox.getByText("Hồ sơ ứng tuyển vị trí Backend Engineer đã chuyển sang trạng thái: Đang xem xét.", { exact: true })).toBeVisible();
    await expect(inbox.getByRole("heading", { name: "Lịch phỏng vấn mới" })).toBeVisible();
    await expect(inbox.getByText("Please bring your CV. Java & TypeScript.", { exact: true })).toBeVisible();
    await expect(inbox).not.toContainText(/Application status updated|Interview scheduled|REVIEWING/);
    const applicationNotice = inbox.getByRole("article").filter({ has: page.getByRole("heading", { name: "Trạng thái hồ sơ ứng tuyển đã cập nhật" }) });
    if (role === "ADMIN") await expect(applicationNotice.getByRole("link")).toHaveCount(0);
    else await expect(applicationNotice.getByRole("link", { name: "Xem chi tiết" })).toHaveAttribute("href", `/${role.toLowerCase()}/applications/${applicationId}`);
    await applicationNotice.getByRole("button", { name: "Đánh dấu đã đọc", exact: true }).click();
    await expect(applicationNotice.getByText("Đã đọc", { exact: true })).toBeVisible();
    expect(marked).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("Candidate calendar reads actual scoped API rows and presents GMT+7 without a fake online room", async ({ page }) => {
  await page.route(api + "/interviews/my**", route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("view")).toBe("ALL");
    expect(url.searchParams.has("candidateId")).toBe(false);
    return reply(route, { items: [interview], nextCursor: null });
  });
  await login(page, "CANDIDATE", "/candidate/interviews");
  await expect(page.getByRole("heading", { name: "Phỏng vấn vòng 2" })).toBeVisible();
  await expect(page.getByText(/09:30/)).toBeVisible();
  await expect(page.getByText(/Fixture office/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem đơn ứng tuyển" })).toHaveAttribute("href", "/candidate/applications/" + applicationId);
  await expect(page.getByRole("link", { name: "Vào phòng phỏng vấn" })).toHaveCount(0);
  await expect(page.getByText("Công ty Cổ phần Mộc Công Nghệ")).toHaveCount(0);
});

test("Recruiter application list reads the company pipeline without a fake fixture or job filter", async ({ page }) => {
  await page.route(api + "/applications/**", route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.has("job_id")).toBe(false);
    return reply(route, { items: [application], totalElements: 1, page: 0, size: 20, totalPages: 1 });
  });
  await login(page, "RECRUITER", "/recruiter/applications");
  await expect(page.getByRole("link", { name: "Chi tiết hồ sơ" })).toHaveAttribute("href", "/recruiter/applications/" + applicationId);
  await expect(page.getByRole("link", { name: "Đặt lịch phỏng vấn" })).toBeVisible();
  await expect(page.getByText("Nguyễn Văn A", { exact: true })).toHaveCount(0);
});

test("candidate online calendar uses Vietnamese mode labels without exposing transport names", async ({ page }) => {
  await page.route(api + "/interviews/my**", route => reply(route, { items: [{ ...interview, mode: "ONLINE", location: null }], nextCursor: null }));
  await login(page, "CANDIDATE", "/candidate/interviews");
  await expect(page.getByText("Phỏng vấn trực tuyến", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Video Room|LiveKit|WebRTC|ONLINE|OFFLINE/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("recruiter interview options use Vietnamese labels and preserve mode values", async ({ page }) => {
  await page.route(api + "/applications/" + applicationId, route => reply(route, application));
  await page.route(api + "/interviews?**", route => reply(route, { items: [], nextCursor: null }));
  await login(page, "RECRUITER", `/recruiter/applications/${applicationId}/interview`);
  const mode = page.getByRole("combobox", { name: "Hình thức phỏng vấn", exact: true });
  await expect(mode).toHaveValue("ONLINE");
  await expect(mode.getByRole("option", { name: "Phỏng vấn trực tuyến", exact: true })).toHaveAttribute("value", "ONLINE");
  await expect(mode.getByRole("option", { name: "Phỏng vấn trực tiếp", exact: true })).toHaveAttribute("value", "OFFLINE");
  await mode.selectOption("OFFLINE");
  await expect(page.getByLabel("Địa điểm phỏng vấn", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Video Room|LiveKit|WebRTC/);
});

test("Recruiter schedules via API, preserves GMT+7 and retries a failed request with the same id", async ({ page }) => {
  await page.route(api + "/applications/" + applicationId, r => reply(r, application));
  const bodies: Record<string, unknown>[] = [];
  await page.route(api + "/interviews", route => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1 ? reply(route, { code: "INTERVIEW_UNAVAILABLE" }, 503) : reply(route, interview, 201);
  });
  await login(page, "RECRUITER", "/recruiter/applications/" + applicationId + "/interview");
  await page.getByLabel("Vòng phỏng vấn").fill("2");
  await page.getByLabel("Thời gian dự kiến").fill("2030-01-15T09:30");
  await page.getByLabel("Địa điểm").fill("Fixture office");
  await page.getByRole("button", { name: "Gửi lịch phỏng vấn" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  expect(bodies).toHaveLength(1);
  await expect(page.getByLabel("Địa điểm")).toHaveValue("Fixture office");
  await page.getByRole("button", { name: "Gửi lịch phỏng vấn" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã gửi lịch phỏng vấn thành công.");
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[0]).toMatchObject({ applicationId, scheduledStart: "2030-01-15T09:30:00+07:00", timeZone: "Asia/Ho_Chi_Minh", durationMinutes: 45, mode: "OFFLINE", roundNumber: 2 });
});

test("Recruiter detail loads the stored application and hides scheduling for a terminal stage", async ({ page }) => {
  await page.route(api + "/applications/" + applicationId, r => reply(r, { ...application, status: "HIRED" }));
  await login(page, "RECRUITER", "/recruiter/applications/" + applicationId);
  await expect(page.getByRole("heading", { name: application.jobTitle })).toBeVisible();
  await expect(page.getByText("Đã nhận việc", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Đặt lịch phỏng vấn" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tạo thư mời nhận việc" })).toHaveCount(0);
  await expect(page.getByText("nguyenvana@example.com")).toHaveCount(0);
});
