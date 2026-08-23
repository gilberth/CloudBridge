import { expect, test } from '@playwright/test';

/**
 * End-to-end: crear job → ejecutar → ver historial.
 *
 * Requires the stack from docker-compose.yml running with:
 * - the seeded admin (ADMIN_USER / ADMIN_PASSWORD from .env)
 * - two `local` remotes named `e2e-src` and `e2e-dst`, with at least one
 *   file under e2e-src's path (see README "Tests" for the setup commands).
 * Everything else — job wizard, scheduler wiring, run tracking — is
 * exercised for real against the actual rclone daemon; nothing is mocked.
 */

const ADMIN_USER = process.env.CLOUDBRIDGE_E2E_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.CLOUDBRIDGE_E2E_PASSWORD ?? 'change-me-at-least-8-chars';
const SRC_REMOTE = process.env.CLOUDBRIDGE_E2E_SRC ?? 'e2e-src';
const DST_REMOTE = process.env.CLOUDBRIDGE_E2E_DST ?? 'e2e-dst';

test('crear job → ejecutar → ver historial', async ({ page }) => {
  const jobName = `e2e-job-${Date.now()}`;

  await test.step('login', async () => {
    await page.goto('/');
    await page.getByLabel('Usuario').fill(ADMIN_USER);
    await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('link', { name: 'Explorer' })).toBeVisible();
  });

  await test.step('crear job', async () => {
    await page.getByRole('link', { name: 'Jobs' }).click();
    await page.getByRole('button', { name: 'Nuevo job' }).click();

    // Paso 1: Origen
    await page.getByLabel('Nombre del job').fill(jobName);
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(`\\b${SRC_REMOTE}$`) }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 2: Destinos
    await page.getByRole('button', { name: 'Añadir destino' }).click();
    await page.getByRole('combobox').last().click();
    await page.getByRole('option', { name: new RegExp(`\\b${DST_REMOTE}$`) }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 3: Opciones — copy por defecto, sin cambios.
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Paso 4: Programación — manual, sin activar.
    await page.getByRole('button', { name: 'Crear job' }).click();

    await expect(page.getByText(`Job "${jobName}" creado`)).toBeVisible();
  });

  const row = page.locator('tr', { hasText: jobName });
  await expect(row).toBeVisible();

  await test.step('ejecutar', async () => {
    await row.getByRole('button', { name: 'Ejecutar ahora' }).click();
    await expect(page.getByText('Job lanzado')).toBeVisible();
  });

  await test.step('ver historial', async () => {
    // Give the run a moment to finish against the real rclone daemon.
    await expect
      .poll(
        async () => {
          await row.getByRole('button', { name: 'Ejecutar ahora' }).isVisible();
          return page.locator('tr', { hasText: jobName }).getByText(/success|error/i).first().textContent();
        },
        { timeout: 15_000 },
      )
      .toBeTruthy();

    await row.getByRole('button', { name: 'Ver historial' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Historial de "${jobName}"`)).toBeVisible();
    await expect(dialog.getByText('success').first()).toBeVisible({ timeout: 15_000 });
  });
});
