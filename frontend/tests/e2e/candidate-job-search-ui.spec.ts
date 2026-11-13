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
  await page.route(`${api}/auth-cookie/refresh`, (route) => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth/me`, (route) => reply(route, { code: "AUTH_INVALID" }, 401));
  await page.route(`${api}/auth-cookie/login`, (route) => reply(route, {
    user: { id: accountId, role: "CANDIDATE", email: "candidate@example.test" },
  }));
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

  await authenticate(page);
  const advanced = page.locator(".candidate-job-search-advanced");
  const displayOptions = page.locator(".job-results-options");
  await expect(page.getByRole("searchbox", { name: "Vị trí hoặc từ khóa" })).toBeVisible();
  const toggle = page.getByRole("button", { name: "Bộ lọc nâng cao", exact: true });
  await expect(toggle).toHaveCount(0);
  await expect(advanced).toHaveCount(0);
  await expect(displayOptions).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("search-basic.png"), fullPage: true, animations: "disabled" });
  await page.locator("#q").fill("Frontend");
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
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(advanced).toHaveCount(0);
  await toggle.click();
  await expect(advanced).toBeVisible();
  await expect(displayOptions).not.toHaveAttribute("open", "");
  await page.locator("#jobType").selectOption("REMOTE");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("search-advanced.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Áp dụng bộ lọc", exact: true }).click();
  await expect.poll(() => searches.at(-1)?.searchParams.get("q")).toBe("Frontend");
  await expect.poll(() => searches.at(-1)?.searchParams.get("jobType")).toBe("REMOTE");
  await expect(page.getByRole("link", { name: "Xem chi tiết", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kết quả tìm việc", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: info.outputPath("job-search.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Bỏ bộ lọc Làm việc từ xa", exact: true }).click();
  await expect.poll(() => searches.at(-1)?.searchParams.has("jobType")).toBe(false);
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
  await expect(page.getByRole("button", { name: "Bộ lọc nâng cao", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".candidate-job-search-advanced")).toHaveCount(0);
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
