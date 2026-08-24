import { expect, test } from '@playwright/test';

const user = {
  id: 'ui-test-user',
  username: 'designer',
  role: 'admin',
  createdAt: '2026-08-23T00:00:00.000Z',
};

const settings = {
  rclone: {
    url: 'http://127.0.0.1:5572',
    user: 'cloudbridge-dev',
    passwordSet: true,
  },
  defaults: {
    transfers: 4,
    checkers: 8,
    bwlimit: null,
    logLevel: 'info',
  },
  historyRetentionDays: 30,
  webhookUrl: null,
  webhookTemplate: null,
  timezone: 'America/Lima',
  accentColor: '#f97316',
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await page.route('**/api/remotes', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/settings/timezones', (route) =>
    route.fulfill({ json: ['America/Lima', 'UTC'] }),
  );
  await page.route(/\/api\/settings(?:\?.*)?$/, (route) =>
    route.fulfill({ json: settings }),
  );
  await page.route('**/api/users', (route) => route.fulfill({ json: [user] }));
});

test('explica cada opción mediante ayudas accesibles', async ({ page }) => {
  await page.goto('/settings');

  const helpButtons = page.getByRole('button', { name: /^Información sobre / });
  await expect(helpButtons).toHaveCount(14);

  await page.getByRole('button', { name: 'Información sobre URL de la RC API' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('http://127.0.0.1:5572');

  await page.getByRole('button', { name: 'Información sobre --bwlimit global' }).focus();
  await expect(page.getByRole('tooltip')).toContainText('10M');
});

test('alinea los campos de conexión dentro de una tarjeta', async ({ page }) => {
  await page.goto('/settings');

  const section = page.locator('section').filter({ hasText: 'Conexión con rclone' });
  await expect(section).toHaveAttribute('data-settings-card', 'true');

  const inputs = section.locator('input');
  await expect(inputs).toHaveCount(3);
  const boxes = await Promise.all(
    [0, 1, 2].map((index) => inputs.nth(index).boundingBox()),
  );
  expect(boxes.every(Boolean)).toBe(true);
  expect(
    Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y)),
  ).toBeLessThanOrEqual(1);
  expect(new Set(boxes.map((box) => box!.height)).size).toBe(1);

  const testButton = page.getByRole('button', { name: 'Probar conexión' });
  const testButtonBox = await testButton.boundingBox();
  expect(testButtonBox).not.toBeNull();
  expect(testButtonBox!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
});

test('apila los campos sin desbordarse en una ventana estrecha', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/settings');

  const section = page.locator('section').filter({ hasText: 'Conexión con rclone' });
  const inputs = section.locator('input');
  const boxes = await Promise.all(
    [0, 1, 2].map((index) => inputs.nth(index).boundingBox()),
  );
  expect(boxes.every(Boolean)).toBe(true);
  expect(
    Math.max(...boxes.map((box) => box!.x)) - Math.min(...boxes.map((box) => box!.x)),
  ).toBeLessThanOrEqual(1);
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
  expect(
    await section.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
