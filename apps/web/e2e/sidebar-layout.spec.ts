import { expect, test } from '@playwright/test';

const user = {
  id: 'ui-test-user',
  username: 'designer',
  role: 'admin',
  createdAt: '2026-08-23T00:00:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        version: '0.1.0',
        rclone: {
          online: true,
          version: 'v1.75.0',
          error: null,
          checkedAt: '2026-08-23T00:00:00.000Z',
        },
      },
    }),
  );
  await page.route('**/api/remotes', (route) =>
    route.fulfill({
      json: [
        { name: 'drive', type: 'drive', online: true, about: { used: 357_000_000_000 } },
        {
          name: 'ulima_drive',
          type: 'drive',
          online: true,
          about: { used: 2_000_000_000_000 },
        },
      ],
    }),
  );
});

test('centra iconos y texto en las filas de navegación', async ({ page }) => {
  await page.goto('/explorer');

  const links = page.locator('aside nav a');
  await expect(links).toHaveCount(6);

  for (const link of await links.all()) {
    const row = link.locator(':scope > span').first();
    await expect(row).toHaveCSS('display', 'flex');
    await expect(row).toHaveCSS('align-items', 'center');

    const offset = await row.evaluate((element) => {
      const icon = element.querySelector('svg');
      const label = element.querySelector('span');
      if (!icon || !label) return Number.POSITIVE_INFINITY;
      const iconBox = icon.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      return Math.abs(
        iconBox.top + iconBox.height / 2 - (labelBox.top + labelBox.height / 2),
      );
    });
    expect(offset).toBeLessThan(1);
  }
});

test('mantiene centrados los iconos al colapsar el sidebar', async ({ page }) => {
  await page.goto('/explorer');
  await page.getByRole('button', { name: 'Colapsar panel lateral' }).click();

  const links = page.locator('aside nav a');
  await expect(links).toHaveCount(6);
  for (const link of await links.all()) {
    const row = link.locator(':scope > span').first();
    await expect(row).toHaveCSS('display', 'flex');
    await expect(row).toHaveCSS('justify-content', 'center');
  }
});
