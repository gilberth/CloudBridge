import { expect, test } from '@playwright/test';

const user = {
  id: 'ui-test-user',
  username: 'designer',
  role: 'admin',
  createdAt: '2026-08-23T00:00:00.000Z',
};

const providers = [
  {
    name: 'onedrive',
    description: 'Microsoft OneDrive',
    oauth: true,
    options: [
      {
        name: 'client_id',
        help: 'OAuth Client Id. Leave blank normally.',
        default: '',
        required: false,
        isPassword: false,
        advanced: false,
        type: 'string',
      },
      {
        name: 'client_secret',
        help: 'OAuth Client Secret. Leave blank normally.',
        default: '',
        required: false,
        isPassword: true,
        advanced: false,
        type: 'string',
      },
      {
        name: 'region',
        help: 'Choose national cloud region for OneDrive.',
        default: 'global',
        required: false,
        isPassword: false,
        advanced: false,
        type: 'string',
        examples: [
          { value: 'global', help: 'Microsoft Cloud Global' },
          { value: 'us', help: 'Microsoft Cloud for US Government' },
        ],
      },
      {
        name: 'tenant',
        help: "ID of the service principal's tenant. Also called directory ID.",
        default: '',
        required: false,
        isPassword: false,
        advanced: false,
        type: 'string',
      },
      {
        name: 'drive_id',
        help: 'The ID of the drive to use.',
        default: '',
        required: false,
        isPassword: false,
        advanced: true,
        type: 'string',
      },
      {
        name: 'future_option',
        help: 'English text from a future rclone version.',
        default: '',
        required: false,
        isPassword: false,
        advanced: false,
        type: 'string',
      },
    ],
  },
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
  await page.route('**/api/remotes', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/remotes/providers', (route) =>
    route.fulfill({ json: providers }),
  );
});

async function openOneDriveDialog(page: import('@playwright/test').Page) {
  await page.goto('/remotes?add=1');
  await page.getByRole('option', { name: /onedrive/i }).click();
  return page.getByRole('dialog', { name: 'Añadir remoto' });
}

test('localiza al español las ayudas que rclone entrega en inglés', async ({ page }) => {
  const dialog = await openOneDriveDialog(page);

  const helpButtons = dialog.getByRole('button', { name: /^Información sobre / });
  await expect(helpButtons).toHaveCount(7);

  await dialog
    .getByRole('button', { name: 'Información sobre Nombre del remoto' })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText('Identificador');

  await dialog.getByRole('button', { name: 'Información sobre client_id' }).focus();
  await expect(page.getByRole('tooltip')).toContainText('Identificador de cliente OAuth');
  await expect(page.getByRole('tooltip')).not.toContainText('OAuth Client Id');

  await dialog.getByRole('button', { name: 'Información sobre Token OAuth' }).focus();
  await expect(page.getByRole('tooltip')).toContainText('JSON');

  await dialog.getByRole('button', { name: 'Información sobre future_option' }).hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'Configura la opción técnica future_option para este proveedor.',
  );
  await expect(page.getByRole('tooltip')).not.toContainText('English text');

  await dialog.getByRole('combobox', { name: 'region' }).click();
  await expect(
    page.getByRole('option', { name: /Nube global de Microsoft/ }),
  ).toBeVisible();
  await expect(page.getByText('Microsoft Cloud Global')).toHaveCount(0);
});

test('organiza las opciones básicas en una cuadrícula alineada', async ({ page }) => {
  const dialog = await openOneDriveDialog(page);
  await expect(dialog).toHaveAttribute('data-remote-dialog', 'true');

  const clientId = dialog.getByRole('textbox', { name: 'client_id' });
  const clientSecret = dialog.getByRole('textbox', { name: 'client_secret' });
  const [idBox, secretBox, dialogBox] = await Promise.all([
    clientId.boundingBox(),
    clientSecret.boundingBox(),
    dialog.boundingBox(),
  ]);
  expect(idBox).not.toBeNull();
  expect(secretBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(Math.abs(idBox!.y - secretBox!.y)).toBeLessThanOrEqual(1);
  expect(secretBox!.x).toBeGreaterThan(idBox!.x + idBox!.width);
  expect(dialogBox!.width).toBeGreaterThanOrEqual(640);
});

test('apila los campos sin desbordarse en una ventana estrecha', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  const dialog = await openOneDriveDialog(page);

  const clientId = await dialog.getByRole('textbox', { name: 'client_id' }).boundingBox();
  const clientSecret = await dialog
    .getByRole('textbox', { name: 'client_secret' })
    .boundingBox();
  expect(clientId).not.toBeNull();
  expect(clientSecret).not.toBeNull();
  expect(Math.abs(clientId!.x - clientSecret!.x)).toBeLessThanOrEqual(1);
  expect(clientSecret!.y).toBeGreaterThan(clientId!.y + clientId!.height);
  expect(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
