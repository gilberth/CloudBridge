import { expect, test } from '@playwright/test';

const user = {
  id: 'ui-test-user',
  username: 'designer',
  role: 'admin',
  createdAt: '2026-08-23T00:00:00.000Z',
};

const setupId = '123e4567-e89b-42d3-a456-426614174000';

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

test('completa las preguntas posteriores al OAuth antes de cerrar el modal', async ({ page }) => {
  let continuation = 0;
  await page.route('**/api/remotes', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        status: 'question',
        setupId,
        remoteName: 'onedrive',
        state: '*oauth-confirm,refresh,',
        option: {
          name: 'config_refresh_token',
          help: 'Refresh token?',
          default: true,
          examples: [
            { value: 'true', help: 'Yes' },
            { value: 'false', help: 'No' },
          ],
          required: true,
          isPassword: false,
          type: 'string',
          exclusive: true,
        },
      },
    });
  });
  await page.route('**/api/remotes/onedrive/config/continue', async (route) => {
    continuation += 1;
    if (continuation === 1) {
      await route.fulfill({
        json: {
          status: 'question',
          setupId,
          remoteName: 'onedrive',
          state: '*oauth-confirm,choose_type,,',
          option: {
            name: 'config_type',
            help: 'Type of connection',
            default: 'onedrive',
            examples: [
              { value: 'onedrive', help: 'OneDrive Personal or Business' },
              { value: 'sharepoint', help: 'Root SharePoint site' },
            ],
            required: true,
            isPassword: false,
            type: 'string',
            exclusive: true,
          },
        },
      });
      return;
    }
    if (continuation === 2) {
      await route.fulfill({
        json: {
          status: 'question',
          setupId,
          remoteName: 'onedrive',
          state: 'driveid_final',
          option: {
            name: 'config_driveid',
            help: 'Select drive you want to use',
            default: 'drive-business',
            examples: [{ value: 'drive-business', help: 'OneDrive (business)' }],
            required: true,
            isPassword: false,
            type: 'string',
            exclusive: true,
          },
        },
      });
      return;
    }
    if (continuation === 3) {
      await route.fulfill({
        json: {
          status: 'question',
          setupId,
          remoteName: 'onedrive',
          state: 'driveid_final_end',
          option: {
            name: 'config_drive_ok',
            help: 'Drive OK?',
            default: true,
            examples: [
              { value: 'true', help: 'Yes' },
              { value: 'false', help: 'No' },
            ],
            required: true,
            isPassword: false,
            type: 'bool',
            exclusive: true,
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        status: 'complete',
        remote: {
          name: 'onedrive',
          type: 'onedrive',
          online: true,
          about: { total: 100, used: 10 },
        },
      },
    });
  });

  const dialog = await openOneDriveDialog(page);
  await dialog.getByRole('textbox', { name: 'Nombre del remoto' }).fill('onedrive');
  await dialog
    .getByRole('textbox', { name: 'Token OAuth' })
    .fill('{"access_token":"token"}');
  await dialog.getByRole('button', { name: 'Crear remoto' }).click();

  await expect(dialog.getByText('Renovar autorización OAuth')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Renovar autorización OAuth' }).click();
  await page.getByRole('option', { name: /^No/ }).click();
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await dialog.getByRole('combobox', { name: 'Tipo de conexión' }).click();
  await page.getByRole('option', { name: /OneDrive personal o empresarial/ }).click();
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await expect(dialog.getByText('OneDrive empresarial')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Unidad de OneDrive' }).click();
  await page.getByRole('option', { name: /OneDrive empresarial/ }).click();
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await expect(dialog.getByText('Confirmar unidad')).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await expect(dialog).toBeHidden();
  expect(continuation).toBe(4);
});

test('limpia un remoto nuevo si se cancela el asistente', async ({ page }) => {
  let cancellations = 0;
  await page.route('**/api/remotes', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        status: 'question',
        setupId,
        remoteName: 'onedrive-cancelado',
        state: '*oauth-confirm,refresh,',
        option: {
          name: 'config_refresh_token',
          help: 'Refresh token?',
          default: true,
          examples: [
            { value: 'true', help: 'Yes' },
            { value: 'false', help: 'No' },
          ],
          required: true,
          isPassword: false,
          type: 'bool',
          exclusive: true,
        },
      },
    });
  });
  await page.route('**/api/remotes/onedrive-cancelado/config/cancel', async (route) => {
    cancellations += 1;
    await route.fulfill({ json: { removed: true } });
  });

  const dialog = await openOneDriveDialog(page);
  await dialog.getByRole('textbox', { name: 'Nombre del remoto' }).fill('onedrive-cancelado');
  await dialog
    .getByRole('textbox', { name: 'Token OAuth' })
    .fill('{"access_token":"token"}');
  await dialog.getByRole('button', { name: 'Crear remoto' }).click();
  await expect(dialog.getByText('Renovar autorización OAuth')).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancelar' }).click();

  await expect(dialog).toBeHidden();
  expect(cancellations).toBe(1);
});

test('permite escribir una respuesta cuando rclone ofrece ejemplos no exclusivos', async ({
  page,
}) => {
  await page.route('**/api/remotes', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: {
        status: 'question',
        setupId,
        remoteName: 'onedrive-personalizado',
        state: 'custom-site',
        option: {
          name: 'custom_site',
          help: 'Enter a site or select an example',
          default: '',
          examples: [{ value: 'example', help: 'Example site' }],
          required: true,
          isPassword: false,
          type: 'string',
          exclusive: false,
        },
      },
    });
  });

  const dialog = await openOneDriveDialog(page);
  await dialog
    .getByRole('textbox', { name: 'Nombre del remoto' })
    .fill('onedrive-personalizado');
  await dialog.getByRole('button', { name: 'Crear remoto' }).click();

  await expect(dialog.getByRole('textbox', { name: 'Opción custom_site' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Opción custom_site' })).toHaveCount(0);
});

test('no reutiliza el token de un alta anterior al editar otro remoto', async ({ page }) => {
  let updateBody: Record<string, unknown> | null = null;
  const remote = {
    name: 'onedrive-existente',
    type: 'onedrive',
    online: true,
    about: { total: 100, used: 10 },
  };
  await page.route('**/api/remotes', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [remote] });
  });
  await page.route('**/api/remotes/onedrive-existente', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { ...remote, parameters: { type: 'onedrive', token: '••••••••' } },
      });
      return;
    }
    if (route.request().method() === 'PUT') {
      updateBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { status: 'complete', remote } });
      return;
    }
    await route.fallback();
  });

  const createDialog = await openOneDriveDialog(page);
  await createDialog
    .getByRole('textbox', { name: 'Token OAuth' })
    .fill('{"access_token":"no-reutilizar"}');
  await createDialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Editar' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar "onedrive-existente"' });
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editDialog).toBeHidden();

  expect(updateBody).not.toBeNull();
  expect(updateBody).not.toHaveProperty('token');
});
