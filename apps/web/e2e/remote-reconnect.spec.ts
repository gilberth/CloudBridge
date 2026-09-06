import { expect, test } from "@playwright/test";

const user = {
  id: "ui-test-user",
  username: "designer",
  role: "admin",
  createdAt: "2026-08-23T00:00:00.000Z",
};

const oauthRemote = {
  name: "drive",
  type: "drive",
  online: false,
  about: null,
  error: "Token vencido",
};

test.beforeEach(async ({ page }) => {
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
        oauthRemote,
        { name: "sftp", type: "sftp", online: false, about: null, error: "Caído" },
      ],
    }),
  );
  await page.route("**/api/remotes/drive", (route) =>
    route.fulfill({ json: { ...oauthRemote, parameters: { type: "drive" } } }),
  );
  await page.route("**/api/remotes/providers", (route) =>
    route.fulfill({
      json: [{ name: "drive", description: "Google Drive", oauth: true, options: [] }],
    }),
  );
});

test("ofrece reconectar solo para un remoto OAuth en error", async ({ page }) => {
  await page.goto("/remotes");

  await expect(page.getByRole("button", { name: "Reconectar drive" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconectar sftp" })).toHaveCount(0);

  await page.getByRole("button", { name: "Reconectar drive" }).click();
  const dialog = page.getByRole("dialog", { name: 'Reconectar "drive"' });
  await expect(dialog).toContainText("Pega un token OAuth nuevo");
  const token = dialog.getByLabel("Token OAuth");
  const save = dialog.getByRole("button", { name: "Guardar reconexión" });
  await expect(token).toBeVisible();
  await expect(save).toBeDisabled();
  await token.fill('{"access_token":"nuevo","refresh_token":"renovación"}');
  await expect(save).toBeEnabled();
});

test("mantiene abierto el modal cuando el token nuevo no recupera la conexión", async ({
  page,
}) => {
  await page.route("**/api/remotes/drive", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        json: {
          status: "complete",
          remote: { ...oauthRemote, error: "El token nuevo fue rechazado" },
        },
      });
      return;
    }
    await route.fulfill({ json: { ...oauthRemote, parameters: { type: "drive" } } });
  });

  await page.goto("/remotes");
  await page.getByRole("button", { name: "Reconectar drive" }).click();
  const dialog = page.getByRole("dialog", { name: 'Reconectar "drive"' });
  await dialog.getByLabel("Token OAuth").fill('{"access_token":"nuevo"}');
  await dialog.getByRole("button", { name: "Guardar reconexión" }).click();

  await expect(dialog).toBeVisible();
  await expect(page.getByText("No se pudo reconectar el remoto")).toBeVisible();
  await expect(page.getByText("El token nuevo fue rechazado")).toBeVisible();
});
