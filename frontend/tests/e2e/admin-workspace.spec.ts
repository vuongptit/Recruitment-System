import { expect, test, type Page, type Route } from "@playwright/test";
import {
  activityFixture,
  snapshotFixture,
  todayActivityFixture,
} from "./helpers/adminDashboard";

const origin = "http://127.0.0.1:4173";
const api = origin + "/api";
const user = {
  id: "1795c0de-7908-4ab5-9bed-4c4f1cf9c211",
  email: "admin@example.test",
  role: "ADMIN",
};
const jobId = "3795c0de-7908-4ab5-9bed-4c4f1cf9c211";
const reply = (route: Route, data: unknown, total?: number) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data, meta: total === undefined ? {} : { total } }),
  });

async function session(page: Page) {
  // Presentation tests must never fall through to the real local moderation API.
  await page.route(api + "/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "UNMOCKED_ENDPOINT" }),
    }),
  );
  await page.route(api + "/auth/me", (route) => reply(route, user));
  await page.route(api + "/auth-cookie/refresh", (route) =>
    reply(route, { user }),
  );
  await page.route(api + "/notifications**", (route) =>
    reply(
      route,
      route.request().url().includes("unread-count") ? { unread_count: 0 } : [],
    ),
  );
  await page.addInitScript(() => {
    class MockEventSource extends EventTarget {
      close() {}
    }
    (window as any).EventSource = MockEventSource;
  });
  await page.route(api + "/admin/stats/snapshot", (route) =>
    reply(route, snapshotFixture),
  );
}

test("admin filters and pagination survive reload without crossing portals", async ({
  page,
}) => {
  await session(page);
  const requests: URL[] = [];
  await page.route(api + "/admin/users**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNumber = Number(url.searchParams.get("page"));
    return reply(
      route,
      Array.from({ length: pageNumber === 2 ? 1 : 20 }, (_, index) => ({
        id: `${pageNumber}-${index}`,
        email: `recruiter${pageNumber}-${index}@example.test`,
        role: "RECRUITER",
        is_locked: false,
        is_verified: true,
      })),
      21,
    );
  });
  await page.goto("/admin/users?role=RECRUITER&email=recruiter");
  await expect(
    page.getByRole("combobox", { name: "Vai trò", exact: true }),
  ).toHaveValue("RECRUITER");
  await expect(page.getByLabel("Tìm theo email")).toHaveValue("recruiter");
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("21–21 trên 21 kết quả")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Vai trò", exact: true }),
  ).toHaveValue("RECRUITER");
  await expect(page.getByText("Trang 2", { exact: true })).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
  expect(requests.at(-1)?.searchParams.get("email")).toBe("recruiter");
  await expect(
    page.locator('a[href^="/candidate"],a[href^="/recruiter"]'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("moderation keeps the reason after API failure and requires explicit confirmation", async ({
  page,
}) => {
  await session(page);
  let writes = 0;
  await page.route(api + "/admin/jobs/pending", (route) =>
    reply(
      route,
      writes === 2
        ? []
        : [
            {
              id: jobId,
              title: "Tin cần kiểm tra",
              description: "Mô tả đầy đủ",
              deadline: "2027-01-01",
            },
          ],
    ),
  );
  await page.route(api + `/admin/jobs/${jobId}/reject`, (route) => {
    writes++;
    expect(route.request().postDataJSON()).toEqual({
      reason: "Thông tin chưa chính xác",
    });
    return writes === 1
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "SERVICE_UNAVAILABLE" }),
        })
      : reply(route, {});
  });
  await page.goto("/admin/jobs");
  await page.getByRole("button", { name: "Từ chối", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Từ chối tin", exact: true });
  await expect(
    dialog.getByText("Tin cần kiểm tra", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("ít nhất 3 ký tự");
  await expect(dialog.getByLabel("Lý do / kết quả xử lý")).toBeFocused();
  expect(writes).toBe(0);
  await dialog
    .getByLabel("Lý do / kết quả xử lý")
    .fill("  Thông tin chưa chính xác  ");
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Lý do / kết quả xử lý")).toHaveValue(
    "  Thông tin chưa chính xác  ",
  );
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Đã hoàn tất");
  await expect(page.getByText("Đã xử lý hết yêu cầu chờ duyệt")).toBeVisible();
  expect(writes).toBe(2);
});

test("details close with Escape and return focus to their trigger", async ({
  page,
}) => {
  await session(page);
  await page.route(api + "/admin/companies/pending**", (route) =>
    reply(
      route,
      [
        {
          id: jobId,
          name: "Công ty Kiểm thử",
          description: "Thông tin doanh nghiệp ".repeat(100),
          taxCode: "0101234567",
          industry: "Công nghệ",
          website: "https://example.test",
        },
      ],
      1,
    ),
  );
  await page.goto("/admin/companies");
  const trigger = page.getByRole("button", {
    name: "Xem chi tiết Công ty Kiểm thử",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Hồ sơ doanh nghiệp" });
  await expect(
    dialog.getByRole("heading", { name: "Công ty Kiểm thử" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("reports preserve optimistic version and prevent unsupported lock actions", async ({
  page,
}) => {
  await session(page);
  let writes = 0;
  await page.route(api + "/admin/reports**", (route) => {
    if (route.request().method() === "PATCH") {
      writes++;
      expect(route.request().postDataJSON()).toEqual({
        status: "RESOLVED",
        expectedVersion: 3,
        resolution: "Đã đối chiếu hành vi",
      });
      return reply(route, {});
    }
    return reply(
      route,
      [
        {
          id: jobId,
          reason: "Phản ánh công ty",
          target_type: "COMPANY",
          status: "OPEN",
          version: 2,
        },
        {
          id: user.id,
          reason: "Phản ánh tài khoản",
          target_type: "USER",
          status: "OPEN",
          version: 3,
        },
      ],
      2,
    );
  });
  await page.goto("/admin/reports");
  const companyRow = page
    .getByRole("row")
    .filter({ hasText: "Phản ánh công ty" });
  await expect(
    companyRow.getByRole("button", { name: "Xử lý", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("row")
    .filter({ hasText: "Phản ánh tài khoản" })
    .getByRole("button", { name: "Xử lý", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Lý do / kết quả xử lý").fill("Đã đối chiếu hành vi");
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(1);
});

test("statistics validate date range, expose chart data and download CSV", async ({
  page,
}) => {
  await session(page);
  let requests = 0;
  await page.route(api + "/admin/stats/activity**", (route) => {
    requests++;
    return reply(route, activityFixture("custom"));
  });
  await page.route(api + "/admin/stats/report**", (route) =>
    route.fulfill({
      contentType: "text/csv",
      body: "date,metric,value\n2026-10-01,APPLIED,12",
    }),
  );
  await page.goto("/admin?from=2026-10-01&to=2026-10-31");
  await expect(
    page.getByRole("img", { name: /Biểu đồ đơn ứng tuyển/ }),
  ).toBeVisible();
  const initialRequests = requests;
  await page.getByLabel("Từ ngày", { exact: true }).fill("2024-01-01");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "366 ngày",
  );
  expect(requests).toBe(initialRequests);
  await page.getByText("Xem bảng số liệu", { exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "2026-10-01", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "bao-cao-careerhub-custom-2026-10-01-2026-10-31.csv",
  );
});

test("dashboard keeps current state independent from activity presets", async ({
  page,
}) => {
  await session(page);
  let snapshotRequests = 0;
  const periods: string[] = [];
  await page.route(api + "/admin/stats/snapshot", (route) => {
    snapshotRequests++;
    return reply(route, snapshotFixture);
  });
  await page.route(api + "/admin/stats/activity**", (route) => {
    const period = new URL(route.request().url()).searchParams.get("period")!;
    periods.push(period);
    return reply(route, activityFixture(period));
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("button", { name: "30 ngày", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const current = page.getByRole("region", {
    name: "Hiện trạng toàn hệ thống",
    exact: true,
  });
  await expect(current.getByText("1.234", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tin chờ duyệt/ })).toContainText(
    "50+",
  );
  const initialSnapshotRequests = snapshotRequests;
  await page.getByRole("button", { name: "7 ngày", exact: true }).click();
  await expect(page).toHaveURL(/period=7d/);
  await expect(
    page.getByRole("button", { name: "7 ngày", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("img", { name: /Biểu đồ đơn ứng tuyển/ }),
  ).toBeVisible();
  expect(periods).toEqual(["30d", "7d"]);
  expect(snapshotRequests).toBe(initialSnapshotRequests);
  await expect(current.getByText("1.234", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "7 ngày", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("all-time activity uses recorded monthly history and supports complete reports", async ({
  page,
}) => {
  await session(page);
  await page.route(api + "/admin/stats/activity**", (route) =>
    reply(route, activityFixture("all")),
  );
  await page.goto("/admin?period=all");
  await expect(
    page.getByRole("heading", {
      name: "Đơn ứng tuyển theo tháng",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Tất cả dữ liệu đã ghi nhận", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xuất Excel", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(/Không bao gồm lịch sử chưa được đồng bộ/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("unavailable statistics never become zero and do not hide current state", async ({
  page,
}) => {
  await session(page);
  const snapshot = structuredClone(snapshotFixture);
  snapshot.metrics.CANDIDATES = {
    value: null as any,
    available: false,
    lowerBound: false,
  };
  await page.route(api + "/admin/stats/snapshot", (route) =>
    reply(route, snapshot),
  );
  await page.route(api + "/admin/stats/activity**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "ADMIN_UNAVAILABLE" }),
    }),
  );
  await page.goto("/admin");
  const candidate = page
    .locator(".admin-snapshot-metrics .admin-metric")
    .filter({ hasText: "Tài khoản ứng viên" });
  await expect(candidate.locator("strong")).toHaveText("—");
  await expect(page.getByText("1.234", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Thử lại thống kê", exact: true }),
  ).toBeVisible();
});

test("dirty daily statistics show fresh recorded counts with a clear source note", async ({
  page,
}) => {
  await session(page);
  await page.route(api + "/admin/stats/activity**", (route) =>
    reply(route, {
      ...activityFixture(),
      pendingDays: 1,
      liveRecalculated: true,
    }),
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("status").filter({ hasText: "tính trực tiếp từ sự kiện" }),
  ).toBeVisible();
  const applied = page
    .locator(".admin-activity-section .admin-metric")
    .filter({ hasText: "Đơn ứng tuyển" });
  await expect(applied.locator("strong")).toHaveText("12");
  await expect(
    page.getByRole("img", { name: /Biểu đồ đơn ứng tuyển/ }),
  ).toBeVisible();
});

test("today uses GMT+7 hourly activity, same-time comparison and its own CSV endpoint", async ({
  page,
}) => {
  await session(page);
  await page.route(api + "/admin/stats/activity**", (route) => {
    const period = new URL(route.request().url()).searchParams.get("period");
    return reply(
      route,
      period === "today" ? todayActivityFixture() : activityFixture(),
    );
  });
  let exports = 0;
  await page.route(api + "/admin/stats/report**", (route) => {
    exports++;
    expect(new URL(route.request().url()).searchParams.get("type")).toBe("csv");
    expect(new URL(route.request().url()).searchParams.get("period")).toBe(
      "today",
    );
    return route.fulfill({
      contentType: "text/csv",
      body: "hour_start,metric,value,as_of\n2026-11-04T00:00:00+07:00,APPLIED,3,2026-11-04T01:30:00+07:00",
    });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Hôm nay", exact: true }).click();
  await expect(page).toHaveURL(/period=today/);
  await expect(
    page.getByRole("heading", { name: "Đơn ứng tuyển theo giờ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Cập nhật lúc 01:30:00; so với cùng giờ hôm qua/),
  ).toBeVisible();
  const metric = page
    .locator(".admin-activity-section .admin-metric")
    .filter({ hasText: "Đơn ứng tuyển" });
  await expect(metric.locator("strong")).toHaveText("3");
  await expect(metric).toContainText("+50% so với cùng giờ hôm qua");
  await page.getByText("Xem bảng số liệu", { exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "00:00", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "bao-cao-careerhub-today-2026-11-04-2026-11-04.csv",
  );
  expect(exports).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Hôm nay", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("audit shows the action and readable target identity instead of reason and IDs", async ({
  page,
}) => {
  await session(page);
  const targetId = "2795c0de-7908-4ab5-9bed-4c4f1cf9c211";
  const operationId = "8795c0de-7908-4ab5-9bed-4c4f1cf9c211";
  await page.route(api + "/admin/audit-logs**", (route) =>
    reply(route, [
      {
        id: "audit-lock",
        operation_id: operationId,
        admin_id: user.id,
        action: "LOCK_USER",
        target_type: "AUTH",
        target_id: targetId,
        target_label: "candidate@example.test",
        target_role: "CANDIDATE",
        admin_label: "admin@example.test",
        reason: "Lý do thử nghiệm",
        outcome: "SUCCEEDED",
        created_at: "2026-11-04T02:35:00Z",
      },
      {
        id: "audit-unlock",
        action: "UNLOCK_USER",
        target_type: "AUTH",
        target_id: targetId,
        target_label: "candidate@example.test",
        target_role: "CANDIDATE",
        outcome: "SUCCEEDED",
        created_at: "2026-11-04T02:36:00Z",
      },
      {
        id: "audit-job",
        action: "APPROVE_JOB",
        target_type: "JOB",
        target_id: jobId,
        target_label: "Backend Developer",
        outcome: "SUCCEEDED",
        created_at: "2026-11-04T02:37:00Z",
      },
      {
        id: "audit-start",
        action: "LOCK_USER",
        target_type: "AUTH",
        target_id: targetId,
        outcome: "STARTED",
      },
    ]),
  );
  await page.goto("/admin/audit");
  const lock = page
    .getByRole("row")
    .filter({ has: page.getByText("Khóa tài khoản", { exact: true }) });
  await expect(lock.locator("td").first().locator("strong")).toHaveText(
    "Khóa tài khoản",
  );
  await expect(lock.locator("td").first()).toContainText(
    "Lý do: Lý do thử nghiệm",
  );
  await expect(lock.locator("td").nth(1)).toContainText(
    "candidate@example.test",
  );
  await expect(lock.locator("td").nth(1)).toContainText("Ứng viên");
  await expect(page.locator("main table")).not.toContainText(targetId);
  await expect(page.locator("main table")).not.toContainText("AUTH");
  await expect(page.locator("main tbody tr")).toHaveCount(3);
  await expect(
    page.getByText("Backend Developer", { exact: true }),
  ).toBeVisible();
  await lock
    .getByRole("button", { name: "Xem chi tiết Khóa tài khoản", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Khóa tài khoản", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("admin@example.test", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(targetId, { exact: true })).toBeHidden();
  await dialog.getByText("Thông tin đối soát", { exact: true }).click();
  await expect(dialog.getByText(targetId, { exact: true })).toBeVisible();
  await expect(dialog.getByText(operationId, { exact: true })).toBeVisible();
});

test("audit keeps unavailable identities honest without putting IDs in the list", async ({
  page,
}) => {
  await session(page);
  await page.route(api + "/admin/audit-logs**", (route) =>
    reply(route, [
      {
        id: "missing",
        action: "LOCK_USER",
        target_type: "AUTH",
        target_id: jobId,
        reason: "Đang đối soát",
        outcome: "UNKNOWN",
        created_at: "2026-11-04T02:35:00Z",
      },
    ]),
  );
  await page.goto("/admin/audit");
  await expect(page.locator("main table")).toContainText(
    "Chưa lấy được thông tin đối tượng",
  );
  await expect(page.locator("main table")).toContainText(
    "Chưa xác định kết quả",
  );
  await expect(page.locator("main table")).not.toContainText(jobId);
});
