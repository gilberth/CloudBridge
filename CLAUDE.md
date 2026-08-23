# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

CloudBridge es un gestor multi-nube self-hosted: frontend + backend propio sobre la **RC API de rclone**
(motor real de transferencia). CloudBridge nunca reimplementa lógica de transferencia — todo se delega a
rclone vía `RcloneClient` (`apps/api/src/rclone/client.ts`), único punto de contacto con la RC API.

Monorepo con **npm workspaces** (⚠️ no pnpm — ver "Gestor de paquetes" abajo):
- `apps/api` — Fastify 5 + TypeScript. Rutas en `src/routes/`, lógica en `src/services/`, cliente rclone en
  `src/rclone/`, SQLite/Drizzle en `src/db/`.
- `apps/web` — React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Query/Table + `@dnd-kit/core`.
- `packages/shared` — tipos y esquemas `zod` compartidos por ambos lados.
- rclone corre como daemon aparte (`rclone rcd`) en otro contenedor Docker, nunca expuesto al host.

## Gestor de paquetes

Este repo usa **npm workspaces** (`package-lock.json`, scripts con `-w @cloudbridge/X`), no pnpm, a pesar
de la preferencia por defecto de usar pnpm. **No migres a pnpm sin confirmación explícita del usuario** —
tocaría Dockerfile, CI (`.github/workflows/docker-build.yml`) y todos los scripts. Usa `npm install`,
`npm run <script>`, `npm run <script> -w @cloudbridge/<paquete>`.

## Comandos

```bash
npm install                          # instalar dependencias
npm run dev                          # build shared + api (tsx watch) + web (Vite) en paralelo
npm run build                        # build shared -> api -> web, en ese orden
npm run typecheck                    # tsc --noEmit en todos los workspaces
npm run test                         # vitest run en apps/api (único paquete con tests unitarios)
npm run test:e2e                     # playwright en apps/web (requiere stack levantado, ver abajo)
npm run db:generate                  # drizzle-kit generate (apps/api)
npm run db:migrate                   # aplica migraciones (apps/api)
npm run seed                         # seed de datos (apps/api)
```

Test unitario individual:
```bash
cd apps/api && npx vitest run src/lib/__tests__/path.test.ts
```

`apps/api` importa tipos de `@cloudbridge/shared` en tiempo de ejecución de los tests (no solo de tipos) —
si `packages/shared` no está compilado, `npm run test` falla con "Failed to resolve entry for package
'@cloudbridge/shared'". Corre `npm run build:shared` antes si no venís de `npm run dev`/`npm run build`.

`npm run typecheck` tiene ~80 errores preexistentes en `apps/web` (no relacionados con tooling nuevo,
confirmado con `git stash`) — no son introducidos por cambios de configuración; si tu tarea no toca esos
archivos, no los arrastres a tu diff sin que te lo pidan.

E2E (Playwright) necesita el stack corriendo y dos remotos `local` (`e2e-src`/`e2e-dst`) creados de
antemano — pasos completos en el README, sección "End-to-end (Playwright)". No lo lances sin haber leído
esos pasos: falla si el stack no está arriba o los remotos no existen.

Desarrollo local del backend requiere un daemon rclone accesible vía `RCLONE_RC_URL` (`docker compose up -d
rclone` + `RCLONE_RC_URL=http://localhost:5572` en `.env`, o `rclone rcd` manual).

```bash
npm run lint                         # eslint . (flat config en eslint.config.js, raíz)
npm run format                       # prettier --write .
npm run format:check                 # prettier --check . (sin escribir)
```

`react-hooks` está fijado solo a `rules-of-hooks` + `exhaustive-deps` — el resto del set "recommended" de
`eslint-plugin-react-hooks@7` son reglas del React Compiler (`refs`, `set-state-in-effect`, `purity`...)
que no aplican a este código y generaban ~19 falsos positivos. El repo aún no está formateado con Prettier
(`npm run format:check` falla en ~120 archivos preexistentes) — no lo reformatees todo de golpe sin que el
usuario lo pida, sería un diff enorme sin relación con el cambio en curso.

CI (`.github/workflows/docker-build.yml`) solo hace build+push de la imagen a GHCR — no corre tests ni
lint. Antes de dar una tarea por terminada corre `npm run typecheck` y `npm run test` (ver skill
`/verify`).

## Decisiones de arquitectura que condicionan el código

- **`fs` lleva la ruta completa; `remote` va vacío** en las llamadas `operations/*`. Un remoto `local`
  resuelve `disco:` contra el cwd del daemon, así que separar la ruta entre ambos argumentos rompe con
  backends de raíz fija.
- **El saneador de rutas** (`apps/api/src/lib/path.ts`) conserva la barra inicial y solo rechaza `..` — los
  remotos `local` necesitan rutas absolutas, los object stores recortan la barra por su cuenta.
- **`--bwlimit` no funciona en `_config`**: rclone lo ignora silenciosamente porque el limitador es un
  único depósito de tokens por proceso (`core/bwlimit`). Por eso existe `BandwidthManager`
  (`apps/api/src/services/bandwidth.ts`), que aplica el límite más restrictivo entre ejecuciones activas.
- **No existe pausar/reanudar real en rclone.** "Pausar" llama a `job/stop`; "reanudar" relanza la misma
  operación (rclone omite archivos ya idénticos, pero se pierde el progreso del archivo en vuelo).
- **Drive → Drive** necesita `server_side_across_configs=true` como opción de connection-string o rclone
  descarga/resube en vez de copiar server-side.

## Variables de entorno clave

`RCLONE_RC_USER`/`RCLONE_RC_PASS` y `JWT_SECRET` (≥32 chars) son obligatorias. `RCLONE_TIMEOUT_MS` (default
30000) hay que subirlo si se navega un remoto con root muy grande/lento. `ADMIN_USER`/`ADMIN_PASSWORD` solo
se usan si no existe ningún usuario aún (idempotente, no reescribe password después). Lista completa en
`.env.example`; variables extra de dev local sin Docker están en `apps/api/src/config/env.ts`.

## Seguridad

El daemon rclone (puerto 5572) **nunca debe publicarse al host** — verificar con `docker compose ps` tras
cualquier cambio a `docker-compose.yml`. Nunca correr rclone con `--rc-no-auth`. Todas las rutas de archivo
deben pasar por el saneador común (`apps/api/src/lib/path.ts`) antes de construir un `remote:path`.

## Convenciones del repo

- Mensajes de commit en **español**, imperativo/descriptivo, sin prefijos tipo Conventional Commits (p. ej.
  "Corrige timeout de operations/list...").
- `prompt.md` (raíz) es el spec original del producto — útil como referencia de diseño/UX/API si hace
  falta contexto de por qué algo está estructurado así.
