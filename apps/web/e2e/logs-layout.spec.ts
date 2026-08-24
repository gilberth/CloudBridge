import { expect, test } from '@playwright/test';

const user = {
  id: 'ui-test-user',
  username: 'designer',
  role: 'admin',
  createdAt: '2026-08-24T00:00:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        status: 'ok',
        version: '0.1.0',
        rclone: { online: true, version: 'v1.75.0', error: null },
      },
    }),
  );
  await page.route('**/api/remotes', (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/logs(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  );
});

test('mantiene el selector de nivel alineado y en una sola línea', async ({ page }) => {
  await page.goto('/logs');

  const level = page.getByRole('combobox').first();
  const search = page.getByRole('textbox', { name: 'Buscar en los logs' });

  await expect(level).toHaveCSS('white-space', 'nowrap');
  expect(
    await level.evaluate((element) => {
      const value = element.querySelector('span');
      return Boolean(value && value.scrollWidth <= value.clientWidth);
    }),
  ).toBe(true);
  const [levelBox, searchBox] = await Promise.all([level.boundingBox(), search.boundingBox()]);
  expect(levelBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(Math.abs(levelBox!.y - searchBox!.y)).toBeLessThanOrEqual(1);
  expect(levelBox!.height).toBe(searchBox!.height);
});

test('abre el selector nativo desde botones de calendario accesibles', async ({ page }) => {
  await page.goto('/logs');

  const from = page.getByLabel('Fecha y hora desde');
  const to = page.getByLabel('Fecha y hora hasta');
  await expect(from).toHaveAttribute('type', 'datetime-local');
  await expect(to).toHaveAttribute('type', 'datetime-local');

  await page.getByRole('button', { name: 'Abrir calendario desde' }).click();
  await expect(from).toBeFocused();

  await page.getByRole('button', { name: 'Abrir calendario hasta' }).click();
  await expect(to).toBeFocused();
});
