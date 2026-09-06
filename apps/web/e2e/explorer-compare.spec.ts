import { expect, test } from "@playwright/test";

const user = {
  id: "ui-test-user",
  username: "designer",
  role: "admin",
  createdAt: "2026-08-23T00:00:00.000Z",
};

const comparisonRun = {
  id: "compare-1",
  jobId: null,
  jobName: null,
  label: "Comparación profunda src: → dst:",
  mode: "compare",
  status: "running",
  dryRun: false,
  group: "run:compare-1",
  rcloneJobIds: [],
  source: { remote: "src", path: "" },
  destinations: [{ remote: "dst", path: "" }],
  startedAt: "2026-09-06T20:00:00.000Z",
  finishedAt: null,
  durationMs: null,
  files: 0,
  bytes: 0,
  errors: 0,
  errorMessage: null,
  failedFiles: [],
  retryOfRunId: null,
  dryRunReport: null,
  comparison: null,
};

test("lanza una comparación profunda como ejecución persistente", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        version: "0.1.0",
        rclone: {
          online: true,
          version: "v1.75.0",
          error: null,
          checkedAt: new Date().toISOString(),
        },
      },
    }),
  );
  await page.route("**/api/remotes", (route) =>
    route.fulfill({
      json: [
        { name: "src", type: "drive", online: true, about: null, error: null },
        { name: "dst", type: "drive", online: true, about: null, error: null },
      ],
    }),
  );
  await page.route("**/api/fs/list*", (route) =>
    route.fulfill({ json: { remote: "src", path: "", entries: [] } }),
  );
  await page.route("**/api/fs/compare", (route) =>
    route.fulfill({ json: comparisonRun }),
  );
  await page.route("**/api/transfers", (route) =>
    route.fulfill({ json: [comparisonRun] }),
  );
  await page.goto("/explorer?left=src&right=dst");

  await page.getByRole("button", { name: "Comparación profunda" }).click();

  await expect(page).toHaveURL(/\/transfers/);
  await expect(page.getByText("Comparación profunda src: → dst:")).toBeVisible();
});
