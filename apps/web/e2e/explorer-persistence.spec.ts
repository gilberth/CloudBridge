import { expect, test } from '@playwright/test';

const user = {
  id: 'ui-test-user',
  username: 'designer',
  role: 'admin',
  createdAt: '2026-08-23T00:00:00.000Z',
};

const remotes = [
  { name: 'drive', type: 'drive', online: true, about: null },
  { name: 'ulima_drive', type: 'drive', online: true, about: null },
];

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
  await page.route('**/api/remotes', (route) => route.fulfill({ json: remotes }));
  await page.route('**/api/fs/list**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: {
        remote: url.searchParams.get('remote'),
        path: url.searchParams.get('path') ?? '',
        entries: [],
      },
    });
  });
  await page.route('**/api/settings/timezones', (route) =>
    route.fulfill({ json: ['America/Lima', 'UTC'] }),
  );
  await page.route(/\/api\/settings(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        rclone: { url: 'http://127.0.0.1:5572', user: 'rclone', passwordSet: true },
        defaults: { transfers: 4, checkers: 8, bwlimit: null, logLevel: 'info' },
        historyRetentionDays: 30,
        webhookUrl: null,
        webhookTemplate: null,
        timezone: 'America/Lima',
        accentColor: '#f97316',
      },
    }),
  );
  await page.route('**/api/users', (route) => route.fulfill({ json: [user] }));
});

async function expectPanels(
  page: import('@playwright/test').Page,
  left: string,
  right: string,
) {
  const selectors = page.getByRole('combobox');
  await expect(selectors.nth(0)).toContainText(left);
  await expect(selectors.nth(1)).toContainText(right);
}

test('conserva los últimos remotos al navegar y recargar la web', async ({ page }) => {
  await page.goto('/explorer?left=drive&right=ulima_drive');
  await expectPanels(page, 'drive', 'ulima_drive');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole('link', { name: 'Explorer' }).click();

  await expectPanels(page, 'drive', 'ulima_drive');
  await expect(page).toHaveURL(/left=drive/);
  await expect(page).toHaveURL(/right=ulima_drive/);

  await page.reload();
  await expectPanels(page, 'drive', 'ulima_drive');
});

test('una URL explícita reemplaza las selecciones anteriores', async ({ page }) => {
  await page.goto('/explorer?left=drive&right=ulima_drive');
  await expectPanels(page, 'drive', 'ulima_drive');

  await page.goto('/explorer?left=ulima_drive&right=drive');
  await expectPanels(page, 'ulima_drive', 'drive');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Explorer' }).click();

  await expectPanels(page, 'ulima_drive', 'drive');
});

test('descarta un remoto guardado que ya no existe', async ({ page }) => {
  await page.goto('/explorer?left=eliminado&right=drive');

  await expectPanels(page, 'Elegir remoto', 'drive');
  await expect(page).not.toHaveURL(/left=eliminado/);
});
