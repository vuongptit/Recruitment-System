import { expect, test, type Page, type Route } from "@playwright/test";

const api = "http://127.0.0.1:4173/api";
const accountId = "1795c0de-7908-4ab5-9bed-4c4f1cf9c211";

test("homepage search suggestions are Vietnamese while preserving the original search keywords", async ({ page }) => {
  await page.route(`${api}/auth/me`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth-cookie/refresh`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Lập trình viên", exact: true })).toHaveAttribute("href", "/candidate/jobs?q=Developer");
  await expect(page.getByRole("link", { name: "Tiếp thị", exact: true })).toHaveAttribute("href", "/candidate/jobs?q=Marketing");
  await expect(page.getByRole("link", { name: "Kinh doanh & Tiếp thị", exact: true })).toHaveAttribute("href", "/candidate/jobs?q=Marketing");
});
const job = {
  id: "2795c0de-7908-4ab5-9bed-4c4f1cf9c211",
  companyId: "3795c0de-7908-4ab5-9bed-4c4f1cf9c212",
  title: "Remote Engineer",
  companyName: "CareerHub Demo",
  description: "Build products for candidates and recruiters.",
  salaryMin: 1200,
  salaryMax: 2400,
  isNegotiable: false,
  currency: "USD",
  location: "Phường Ba Đình, Hà Nội",
  jobType: "REMOTE",
  experienceYears: 2,
  skills: ["TypeScript"],
  deadline: "2099-12-31",
  status: "PUBLISHED",
  source: "POSTGRESQL",
};

function reply(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? data : { data, meta: null }),
  });
}

async function authenticate(page: Page) {
  const user = { id: accountId, role: "CANDIDATE", email: "candidate@example.test" };
  let signedIn = false;
  await page.route(`${api}/auth-cookie/refresh`, (route) => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth/me`, route => signedIn ? reply(route, user) : reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth-cookie/login`, route => { signedIn = true; return reply(route, { user }); });
  await page.goto("/login?returnTo=%2Fcandidate%2Fjobs");
  await page.getByLabel("Email", { exact: true }).fill("candidate@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/candidate\/jobs$/);
}

test("candidate job search keeps primary search clear and advanced filters functional", async ({ page }, info) => {
  const searches: URL[] = [];
  await page.route(`${api}/notifications**`, (route) => reply(route, { unread_count: 0 }));
  await page.route(`${api}/profile/${accountId}`, (route) => reply(route, { userId: accountId, fullName: "Ứng viên thử nghiệm" }));
  await page.route(`${api}/jobs/search**`, (route) => {
    searches.push(new URL(route.request().url()));
    return reply(route, {
      items: [job], total: 1, page: 1, limit: 10, hasMore: false,
      nextCursor: null, source: "POSTGRESQL",
    });
  });
  await page.route(`${api}/jobs/recommended**`, (route) => reply(route, {
    items: [], source: "LATEST", fallbackReason: null, nextCursor: null,
  }));
  await page.route(`${api}/jobs/${job.id}`, route => reply(route, job));
  await page.route(`${api}/applications/bookmarks`, route => reply(route, []));
  await page.route(`${api}/applications/my`, route => reply(route, []));

  await authenticate(page);
  const advanced = page.locator(".candidate-job-search-advanced");
  const displayOptions = page.locator(".job-results-options");
  await expect(page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" })).toBeVisible();
  const sidebar = page.viewportSize()!.width >= 980;
  const toggle = page.getByRole("button", { name: /^Bộ lọc/ });
  await expect(advanced).toHaveCount(0);
  await expect(toggle).toHaveCount(0);
  const mainNav = page.getByRole("navigation", { name: "Điều hướng chính" });
  const tabs = ["Trang chủ", "Tìm việc làm", "Công ty"];
  await expect(mainNav).toBeVisible();
  await expect(mainNav.getByRole("link")).toHaveText(tabs);
  await expect(page.getByRole("complementary", { name: "Chi tiết công việc" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("search-basic.png"), fullPage: true, animations: "disabled" });
  await page.locator("#q").fill("Frontend");
  await expect(advanced).toHaveCount(0);
  await expect(toggle).toHaveCount(0);
  await page.getByRole("button", { name: "Địa điểm làm việc", exact: true }).click();
  const location = page.getByRole("dialog", { name: "Chọn địa điểm làm việc" });
  await location.getByRole("textbox", { name: "Tìm tỉnh/thành phố" }).fill("ha noi");
  await location.getByRole("radio", { name: "Hà Nội", exact: true }).check();
  await expect(location.getByRole("radio", { name: "Phường Ba Đình", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("location-picker.png"), animations: "disabled" });
  await location.getByRole("textbox", { name: "Tìm xã/phường" }).fill("ba dinh");
  await location.getByRole("radio", { name: "Phường Ba Đình", exact: true }).check();
  await location.getByRole("button", { name: "Áp dụng địa điểm", exact: true }).click();
  await page.getByRole("button", { name: "Tìm việc", exact: true }).click();
  await expect.poll(() => searches.at(-1)?.searchParams.get("location")).toBe("Phường Ba Đình, Hà Nội");
  await expect(mainNav.getByRole("link")).toHaveText(tabs);
  if (!sidebar) await toggle.click();
  await expect(advanced).toBeVisible();
  await expect(displayOptions).not.toHaveAttribute("open", "");
  await advanced.getByRole("radio", { name: "Làm việc từ xa", exact: true }).check();
  await advanced.getByRole("radio", { name: "2 năm", exact: true }).check();
  const lowerSalary = advanced.getByRole("slider", { name: "Lương tối thiểu" });
  const upperSalary = advanced.getByRole("slider", { name: "Lương tối đa" });
  await lowerSalary.press("ArrowRight");
  await upperSalary.press("ArrowLeft");
  await expect(lowerSalary).toHaveAttribute("aria-valuetext", "1 triệu VNĐ");
  await expect(upperSalary).toHaveAttribute("aria-valuetext", "99 triệu VNĐ");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("search-advanced.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Áp dụng bộ lọc", exact: true }).click();
  await expect.poll(() => searches.at(-1)?.searchParams.get("q")).toBe("Frontend");
  await expect.poll(() => searches.at(-1)?.searchParams.get("jobType")).toBe("REMOTE");
  const appliedQuery = searches.at(-1)!.searchParams;
  expect(appliedQuery.get("experienceBand")).toBe("2");
  expect(appliedQuery.has("experienceYears")).toBe(false);
  expect(appliedQuery.get("salaryMin")).toBe("1000000");
  expect(appliedQuery.get("salaryMax")).toBe("99000000");
  expect(appliedQuery.get("salaryCurrency")).toBe("VND");
  await expect(page.getByRole("region", { name: "Kết quả tìm việc", exact: true }).getByRole("link", { name: /Remote Engineer/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kết quả tìm việc", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("job-search.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Bỏ bộ lọc Làm việc từ xa", exact: true }).click();
  await expect.poll(() => searches.at(-1)?.searchParams.has("jobType")).toBe(false);
  await page.getByLabel("Sắp xếp theo", { exact: true }).selectOption("NEWEST");
  await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("NEWEST");
  await page.goBack();
  await expect(page.getByLabel("Sắp xếp theo", { exact: true })).toHaveValue("RELEVANCE");
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" })).toHaveValue("Frontend");
  await page.getByRole("region", { name: "Kết quả tìm việc" }).getByRole("link", { name: /^Remote Engineer/ }).click();
  await expect(page).toHaveURL(new RegExp(`/candidate/jobs/${job.id}\\?from=`));
  await expect(page.getByRole("heading", { name: "Remote Engineer", exact: true })).toBeVisible();
  await expect(page.locator('#job-application')).toHaveCount(1);
  await page.getByRole("navigation", { name: "Đường dẫn" }).getByRole("link", { name: "Tìm việc làm" }).click();
  await expect(page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" })).toHaveValue("Frontend");
  await mainNav.getByRole("link", { name: "Tìm việc làm" }).click();
  await expect(page).toHaveURL(/\/candidate\/jobs$/);
  await expect(page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" })).toHaveValue("");
  await expect(advanced).toHaveCount(0);
  await expect(toggle).toHaveCount(0);
});

test("homepage passes keyword and selected province/ward into the first search stage", async ({ page }) => {
  await page.route(`${api}/auth/me`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth-cookie/refresh`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/jobs/search**`, route => reply(route, { items: [job], total: 1, page: 1, limit: 10, hasMore: false, nextCursor: null, source: "POSTGRESQL" }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Vị trí hoặc kỹ năng", exact: true }).fill("Frontend");
  await page.getByRole("button", { name: "Địa điểm làm việc", exact: true }).click();
  const location = page.getByRole("dialog", { name: "Chọn địa điểm làm việc" });
  await location.getByRole("radio", { name: "Hà Nội", exact: true }).check();
  await location.getByRole("radio", { name: "Phường Ba Đình", exact: true }).check();
  await location.getByRole("button", { name: "Áp dụng địa điểm", exact: true }).click();
  await page.getByRole("button", { name: "Tìm việc", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("location")).toBe("Phường Ba Đình, Hà Nội");
  expect(new URL(page.url()).searchParams.get("q")).toBe("Frontend");
  expect(new URL(page.url()).searchParams.get("search")).toBe("1");
  if (page.viewportSize()!.width >= 980) await expect(page.getByRole("heading", { name: "Bộ lọc", exact: true })).toBeVisible();
  else await expect(page.getByRole("button", { name: /^Bộ lọc/ })).toHaveAttribute("aria-expanded", "false");
});

test("location picker retries local ward data and changing province clears the previous ward", async ({ page }) => {
  await page.route(`${api}/auth/me`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth-cookie/refresh`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/jobs/search**`, route => reply(route, { items: [], total: 0, page: 1, limit: 10, hasMore: false, nextCursor: null, source: "POSTGRESQL" }));
  let fail = true;
  await page.route("**/data/vietnam-wards/01.json", route => fail ? route.fulfill({ status: 503, body: "unavailable" }) : route.continue());
  await page.goto("/candidate/jobs");
  const trigger = page.getByRole("button", { name: "Địa điểm làm việc", exact: true });
  await trigger.click();
  const location = page.getByRole("dialog", { name: "Chọn địa điểm làm việc" });
  await location.getByRole("radio", { name: "Hà Nội", exact: true }).check();
  await expect(location.getByRole("alert")).toContainText("Chưa tải được danh sách xã/phường");
  fail = false;
  await location.getByRole("button", { name: "Thử lại", exact: true }).click();
  await location.getByRole("radio", { name: "Phường Ba Đình", exact: true }).check();
  await location.getByRole("radio", { name: "Hồ Chí Minh", exact: true }).check();
  await expect(location.getByRole("radio", { name: "Tất cả xã/phường", exact: true })).toBeChecked();
  await location.getByRole("button", { name: "Áp dụng địa điểm", exact: true }).click();
  const selected = page.getByRole("button", { name: "Địa điểm: Hồ Chí Minh", exact: true });
  await expect(selected).toBeFocused();
  await selected.click();
  await location.getByRole("radio", { name: "Hà Nội", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(selected).toBeVisible();
  await expect(selected).toBeFocused();
});

test("job details navigate to a separate page and retain search, saved and applied status on return", async ({ page }) => {
  const second = { ...job, id: "3795c0de-7908-4ab5-9bed-4c4f1cf9c211", title: "Backend Developer", requirements: ["Java"], benefits: ["Đào tạo"], publishedAt: "2026-11-10T07:30:00Z" };
  const saved: string[] = [];
  const submitted: unknown[] = [];
  await page.route(`${api}/notifications**`, route => reply(route, { unread_count: 0 }));
  await page.route(`${api}/profile/${accountId}`, route => reply(route, { userId: accountId, fullName: "Ứng viên thử nghiệm" }));
  await page.route(`${api}/jobs/search**`, route => reply(route, { items: [job, second], total: 2, page: 1, limit: 10, hasMore: false, source: "POSTGRESQL" }));
  await page.route(`${api}/jobs/recommended**`, route => reply(route, { items: [], source: "LATEST" }));
  await page.route(`${api}/jobs/${job.id}`, route => reply(route, job));
  await page.route(`${api}/jobs/${second.id}`, route => reply(route, second));
  await page.route(`${api}/companies/${job.companyId}`, route => reply(route, { id: job.companyId, name: job.companyName, industry: "Công nghệ", media: [], logoUrl: null }));
  await page.route(`${api}/applications/bookmarks`, route => {
    if (route.request().method() === "POST") saved.push(route.request().postDataJSON().jobId);
    return reply(route, route.request().method() === "POST" ? { jobId: second.id } : saved.map(jobId => ({ jobId })));
  });
  await page.route(`${api}/applications/my`, route => reply(route, submitted.length ? [{ id: accountId, jobId: second.id, status: "APPLIED", appliedAt: "2026-11-20T00:00:00Z" }] : []));
  await page.route(`${api}/profile/cvs`, route => reply(route, [{ id: accountId, title: "CV Java", isDefault: true, type: "UPLOAD" }]));
  await page.route(url => url.pathname === "/api/applications" || url.pathname === "/api/applications/", route => {
    submitted.push(route.request().postDataJSON());
    return reply(route, { id: accountId, jobId: second.id, status: "APPLIED", appliedAt: "2026-11-20T00:00:00Z" }, 201);
  });
  await authenticate(page);
  const results = page.getByRole("region", { name: "Kết quả tìm việc" });
  await page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" }).fill("Developer");
  await page.getByRole("button", { name: "Tìm việc", exact: true }).click();
  await expect(page).toHaveURL(/\/candidate\/jobs\?q=Developer&search=1$/);
  await expect(page.getByRole("complementary", { name: "Chi tiết công việc" })).toHaveCount(0);
  const save = results.getByRole("button", { name: /Lưu việc làm: Backend Developer/i });
  await save.click();
  await expect(results.getByRole("button", { name: "Bỏ lưu việc làm: Backend Developer" })).toHaveAttribute("aria-pressed", "true");
  expect(saved).toEqual([second.id]);
  await results.getByRole("link", { name: /^Backend Developer/ }).click();
  await expect(page.getByRole("heading", { name: second.title, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bỏ lưu việc làm", exact: true })).toHaveAttribute("aria-pressed", "true");
  const apply = page.locator("#job-application");
  await expect(apply.getByLabel("CV dùng để ứng tuyển")).toHaveValue(accountId);
  await apply.getByRole("button", { name: "Gửi ứng tuyển" }).click();
  await expect(apply.getByRole("status")).toContainText("Đã gửi hồ sơ ứng tuyển");
  await page.getByRole("navigation", { name: "Đường dẫn" }).getByRole("link", { name: "Tìm việc làm" }).click();
  await expect(page).toHaveURL(/\/candidate\/jobs\?q=Developer&search=1$/);
  await expect(results.getByRole("link", { name: /Backend Developer.*Đã ứng tuyển/ })).toBeVisible();
  expect(submitted).toEqual([{ jobId: second.id, cvId: accountId, source: "SEARCH" }]);
});

test("search shows loading, empty and recoverable error states", async ({ page }) => {
  await page.route(`${api}/auth/me`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth-cookie/refresh`, route => reply(route, { code: "AUTH_INVALID" }, 401));
  let resolveInitial!: () => void;
  const initial = new Promise<void>(resolve => { resolveInitial = resolve; });
  let fail = true;
  await page.route(`${api}/jobs/search**`, async route => {
    await initial;
    return fail ? reply(route, { code: "SERVICE_UNAVAILABLE" }, 503) : reply(route, { items: [], total: 0, hasMore: false });
  });
  await page.goto("/candidate/jobs?q=KhongTonTai");
  const results = page.getByRole("region", { name: "Kết quả tìm việc" });
  await expect(results.getByText("Đang tải danh sách việc làm", { exact: true })).toBeAttached();
  resolveInitial();
  await expect(results.getByRole("alert")).toBeVisible();
  fail = false;
  await results.getByRole("button", { name: "Thử lại" }).click();
  await expect(results.getByRole("heading", { name: "Chưa có việc làm phù hợp" })).toBeVisible();
  await results.getByRole("button", { name: "Xóa tìm kiếm" }).click();
  await expect(page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" })).toHaveValue("");
  await expect(page).toHaveURL(/\/candidate\/jobs$/);
});
