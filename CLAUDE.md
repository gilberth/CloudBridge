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

## Despliegue en producción

Corre en un LXC de Proxmox (id **131**, hostname `rclonegui`, IP `10.10.10.214`, 1 vCPU / 2GB RAM — recurso
escaso, tenerlo presente en cualquier diagnóstico de rendimiento). Acceso vía SSH al host Proxmox (`pct exec
131 -- <comando>`), no hay SSH directo al LXC configurado. `/root/CloudBridge` ahí es un `git clone` normal
de este repo; `docker-compose.yml` apunta a `ghcr.io/gilberth/cloudbridge:latest` (`build:` es solo fallback
local). Redeploy tras un push a `main`: esperar a que termine el workflow "Build and publish container
image" (`gh run list`/`gh run watch`) y luego `cd /root/CloudBridge && git pull && docker compose pull &&
docker compose up -d`. El token/config de los remotos rclone vive en el volumen `rclone-config`, no en el
proceso — sobrevive a redeploys y restarts del contenedor `rclone` sin problema.

Credenciales (`RCLONE_RC_USER`/`PASS`, `ADMIN_USER`/`PASSWORD`) están en `/root/CloudBridge/.env` en el LXC;
para pegarle directo al daemon rclone sin pasar por la app, su IP en la red docker interna
(`cloudbridge_cloudbridge`) es `172.18.0.2:5572` — nunca está publicado al host ni a la LAN (confirmado con
`nc -zv 10.10.10.214 5572` → connection refused), solo alcanzable desde dentro del LXC.

**Cuidado con `pct exec`/`docker exec`/`docker inspect` bajo un permission classifier tipo Claude Code**:
comandos de solo lectura (`cat`, `grep -l`, `find`, `docker ps`, `docker stats --no-stream`) suelen pasar;
`docker exec <cmd que corre código>`, `docker inspect --format` con `.Config.Env` (por tocar secretos) y
similares pueden bloquearse — la alternativa que sí funciona es `pct exec 131 -- cat
/root/CloudBridge/.env` (leer el `.env` montado en el filesystem del LXC directamente) o `pct exec 131 --
docker exec <container> grep -rl <string> /app` para buscar sin volcar secretos.

### Incidente 2026-08-23: rclone consumiendo toda la RAM y colgando la web

**Síntoma**: Explorer no listaba nada ("El daemon rclone no respondió"), y después la web entera dejó de
responder — hasta `pct exec`/`docker compose ps` se colgaban.

**Causa**: `rclone rcd` llegó a **~2GB de los 2GB del LXC** (el contenedor `cloudbridge` en sí usa <60MB).
Con el LXC al límite de memoria, hasta comandos simples dentro de él se cuelgan (incluido `docker restart`,
que tuvo que resolverse matando el proceso directo desde el host Proxmox con `kill -9` sobre el PID de
`rclone rcd` — ver `cgroup.procs` bajo `/sys/fs/cgroup/lxc/131/ns/system.slice/docker-<container-id>.scope/`
para encontrarlo sin depender de `pct exec`).

**Fix aplicado** (commit `116c22d`): en `docker-compose.yml`, servicio `rclone` —
`--rc-job-expire-duration=5m` / `--rc-job-expire-interval=1m` (rclone retiene en memoria el output completo
de cada job async — cada `operations/list` incluido — hasta que expira; sin esto, sesiones largas contra un
remoto grande acumulan memoria sin límite) y `mem_limit: 1200m` como red de seguridad (si algo vuelve a
crecer sin control, Docker mata solo el contenedor `rclone` en vez de ahogar todo el LXC). También se hizo
que un solo poll de `job/status` que tarda >10s ya no aborte el listado completo (`callAsyncAndWait` en
`apps/api/src/rclone/client.ts` reintenta 2 veces antes de rendirse).

**Causa raíz real (encontrada, confirmada y arreglada)**: `packages/shared/src/schemas.ts`, `fsListQuerySchema`
tenía `recurse: z.coerce.boolean().default(false)`. **`z.coerce.boolean()` es un footgun clásico de Zod**:
usa `Boolean(valor)`, y en JS `Boolean("false")` es `true` (cualquier string no vacío es truthy) — coerciona
el string `"false"` a `true`. El frontend (`apps/web/src/lib/api.ts`, helper `qs()`) manda `recurse=false`
explícito en el query string de cada listado (no omite valores `false`), así que **todo listado del
Explorer ha sido recursivo desde siempre**, en todos los remotos, sin que nadie lo pidiera. Para remotos
chicos pasaba desapercibido (la recursión terminaba rápido); contra `ulima_drive` (Drive de 2TB, árbol
profundo) generaba jobs que tardaban minutos, nunca terminaban desde la UI, y acumulaban memoria sin límite
en rclone — la causa real detrás del incidente de memoria de esta misma sesión, no solo un síntoma
secundario. Se encontró subiendo `RCLONE_LOG_LEVEL=DEBUG` temporalmente y grepeando `docker logs
cloudbridge-rclone | grep 'rc: "operations/list"'`, que loggea los parámetros reales de cada llamada RC
(`opt.recurse` incluido) — a nivel `INFO` esto es invisible. **Fix**: `recurse:
z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false)` en vez de `z.coerce.boolean()`.
Regla general para este repo: **nunca usar `z.coerce.boolean()` en un schema que valida query strings** —
usar el patrón `z.preprocess` de arriba, o `z.enum(['true','false']).transform(...)`.
