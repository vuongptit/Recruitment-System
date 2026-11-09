import { expect, test, type Page, type Route } from "@playwright/test";

const api = "http://127.0.0.1:4173/api";
const accountId = "1795c0de-7908-4ab5-9bed-4c4f1cf9c211";
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
  location: "Hà Nội",
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

test("candidate job search keeps primary search clear and advanced filters functional", async ({ page }) => {
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
  await expect(advanced).not.toHaveAttribute("open", "");
  await expect(displayOptions).not.toHaveAttribute("open", "");

  await advanced.locator("summary").click();
  await page.locator("#jobType").selectOption("REMOTE");
  await page.locator("#q").fill("Frontend");
  await page.getByRole("button", { name: "Áp dụng bộ lọc", exact: true }).click();
  await expect.poll(() => searches.at(-1)?.searchParams.get("q")).toBe("Frontend");
  await expect.poll(() => searches.at(-1)?.searchParams.get("jobType")).toBe("REMOTE");
  await expect(page.getByRole("link", { name: "Xem chi tiết", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
