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

const entries = [
  {
    path: 'documento-largo.pdf',
    name: 'documento-largo.pdf',
    size: 12_345,
    mimeType: 'application/pdf',
    modTime: '2026-08-23T12:00:00.000Z',
    isDir: false,
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
  await page.route('**/api/remotes', (route) => route.fulfill({ json: remotes }));
  await page.route('**/api/fs/list**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: {
        remote: url.searchParams.get('remote'),
        path: url.searchParams.get('path') ?? '',
        entries,
      },
    });
  });
});

async function resizeNameColumn(
  page: import('@playwright/test').Page,
  panelName: 'Panel izquierdo' | 'Panel derecho',
  delta: number,
) {
  const panel = page.getByLabel(panelName);
  const handle = panel.getByRole('separator', { name: 'Redimensionar columna Nombre' });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + delta, box!.y + box!.height / 2);
  await page.mouse.up();
}

async function nameColumnWidth(
  page: import('@playwright/test').Page,
  panelName: 'Panel izquierdo' | 'Panel derecho',
) {
  return page
    .getByLabel(panelName)
    .getByRole('columnheader', { name: /Nombre/ })
    .evaluate((element) => element.getBoundingClientRect().width);
}

test('redimensiona una columna sin alterar el panel opuesto', async ({ page }) => {
  await page.goto('/explorer?left=drive&right=ulima_drive');

  const leftBefore = await nameColumnWidth(page, 'Panel izquierdo');
  const rightBefore = await nameColumnWidth(page, 'Panel derecho');
  await resizeNameColumn(page, 'Panel izquierdo', 80);

  expect(await nameColumnWidth(page, 'Panel izquierdo')).toBeGreaterThan(leftBefore + 30);
  expect(await nameColumnWidth(page, 'Panel derecho')).toBeCloseTo(rightBefore, 0);
});

test('conserva el ancho de las columnas después de recargar', async ({ page }) => {
  await page.goto('/explorer?left=drive&right=ulima_drive');
  await resizeNameColumn(page, 'Panel izquierdo', 80);
  const resizedWidth = await nameColumnWidth(page, 'Panel izquierdo');

  await page.reload();

  expect(await nameColumnWidth(page, 'Panel izquierdo')).toBeCloseTo(resizedWidth, 0);
});

test('mantiene centradas y contenidas las acciones entre paneles', async ({ page }) => {
  await page.goto('/explorer');

  const actions = [
    ['Copiar hacia la derecha', 'Copiar →'],
    ['Copiar hacia la izquierda', '← Copiar'],
    ['Mover hacia la derecha', 'Mover →'],
    ['Mover hacia la izquierda', '← Mover'],
    ['Sincronizar hacia la derecha', 'Sync →'],
  ] as const;

  for (const [name, label] of actions) {
    const button = page.getByRole('button', { name });
    await expect(button).toHaveText(label);
    const fits = await button.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth &&
        element.scrollHeight <= element.clientHeight,
    );
    expect(fits).toBe(true);
  }

  const centers = await Promise.all(
    actions.map(([name]) =>
      page.getByRole('button', { name }).evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left + box.width / 2;
      }),
    ),
  );
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);

  const railWidth = await page
    .getByRole('button', { name: 'Copiar hacia la derecha' })
    .evaluate((element) => element.parentElement?.getBoundingClientRect().width ?? 0);
  expect(railWidth).toBeGreaterThanOrEqual(96);
});

test('distingue las operaciones con iconos visibles y colores semánticos', async ({ page }) => {
  await page.goto('/explorer');

  const names = [
    'Copiar hacia la derecha',
    'Copiar hacia la izquierda',
    'Mover hacia la derecha',
    'Mover hacia la izquierda',
    'Sincronizar hacia la derecha',
  ];

  for (const name of names) {
    await expect(page.getByRole('button', { name }).locator('svg')).toBeVisible();
  }

  const operationColors = await Promise.all(
    ['Copiar hacia la derecha', 'Mover hacia la derecha', 'Sincronizar hacia la derecha'].map(
      (name) =>
        page
          .getByRole('button', { name })
          .locator('svg')
          .evaluate((element) => getComputedStyle(element).color),
    ),
  );
  expect(new Set(operationColors).size).toBe(3);
});

test('alinea el encabezado de Explorer con el panel izquierdo', async ({ page }) => {
  await page.goto('/explorer');

  const heading = page.getByRole('heading', { name: 'Explorer' });
  const leftPanel = page.getByLabel('Panel izquierdo');
  const toolbar = leftPanel.locator(':scope > div').first();

  const [headingBox, toolbarBox] = await Promise.all([
    heading.boundingBox(),
    toolbar.boundingBox(),
  ]);
  expect(headingBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(Math.abs(headingBox!.x - (toolbarBox!.x + 8))).toBeLessThanOrEqual(1);
});
