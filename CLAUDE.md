# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

CloudBridge es un gestor multi-nube self-hosted: frontend + backend propio sobre la **RC API de rclone**
(motor real de transferencia). CloudBridge nunca reimplementa lógica de transferencia — todo se delega a
rclone vía `RcloneClient` (`apps/api/src/rclone/client.ts`), único punto de contacto con la RC API.

Monorepo con **pnpm workspaces**:
- `apps/api` — Fastify 5 + TypeScript. Rutas en `src/routes/`, lógica en `src/services/`, cliente rclone en
  `src/rclone/`, SQLite/Drizzle en `src/db/`.
- `apps/web` — React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack Query/Table + `@dnd-kit/core`.
- `packages/shared` — tipos y esquemas `zod` compartidos por ambos lados.
- rclone corre como daemon aparte (`rclone rcd`) en otro contenedor Docker, nunca expuesto al host.

## Gestor de paquetes

Este repo usa **pnpm workspaces** (`pnpm-lock.yaml`, `pnpm-workspace.yaml` y dependencias internas con
`workspace:*`). Usa `ppnpm install`, `ppnpm run <script>` y `pnpm --filter @cloudbridge/<paquete> <script>`.

## Comandos

```bash
pnpm install                          # instalar dependencias
pnpm run dev                          # build shared + api (tsx watch) + web (Vite) en paralelo
pnpm run build                        # build shared -> api -> web, en ese orden
pnpm run typecheck                    # tsc --noEmit en todos los workspaces
pnpm run test                         # vitest run en apps/api (único paquete con tests unitarios)
pnpm run test:e2e                     # playwright en apps/web (requiere stack levantado, ver abajo)
pnpm run db:generate                  # drizzle-kit generate (apps/api)
pnpm run db:migrate                   # aplica migraciones (apps/api)
pnpm run seed                         # seed de datos (apps/api)
```

Test unitario individual:
```bash
pnpm --filter @cloudbridge/api exec vitest run src/lib/__tests__/path.test.ts
```

`apps/api` importa tipos de `@cloudbridge/shared` en tiempo de ejecución de los tests (no solo de tipos) —
si `packages/shared` no está compilado, `pnpm run test` falla con "Failed to resolve entry for package
'@cloudbridge/shared'". Corre `pnpm run build:shared` antes si no venís de `pnpm run dev`/`pnpm run build`.

`pnpm run typecheck` tiene ~80 errores preexistentes en `apps/web` (no relacionados con tooling nuevo,
confirmado con `git stash`) — no son introducidos por cambios de configuración; si tu tarea no toca esos
archivos, no los arrastres a tu diff sin que te lo pidan.

E2E (Playwright) necesita el stack corriendo y dos remotos `local` (`e2e-src`/`e2e-dst`) creados de
antemano — pasos completos en el README, sección "End-to-end (Playwright)". No lo lances sin haber leído
esos pasos: falla si el stack no está arriba o los remotos no existen.

Desarrollo local del backend requiere un daemon rclone accesible vía `RCLONE_RC_URL` (`docker compose up -d
rclone` + `RCLONE_RC_URL=http://localhost:5572` en `.env`, o `rclone rcd` manual).

```bash
pnpm run lint                         # eslint . (flat config en eslint.config.js, raíz)
pnpm run format                       # prettier --write .
pnpm run format:check                 # prettier --check . (sin escribir)
```

`react-hooks` está fijado solo a `rules-of-hooks` + `exhaustive-deps` — el resto del set "recommended" de
`eslint-plugin-react-hooks@7` son reglas del React Compiler (`refs`, `set-state-in-effect`, `purity`...)
que no aplican a este código y generaban ~19 falsos positivos. El repo aún no está formateado con Prettier
(`pnpm run format:check` falla en ~120 archivos preexistentes) — no lo reformatees todo de golpe sin que el
usuario lo pida, sería un diff enorme sin relación con el cambio en curso.

CI (`.github/workflows/docker-build.yml`) solo hace build+push de la imagen a GHCR — no corre tests ni
lint. Antes de dar una tarea por terminada corre `pnpm run typecheck` y `pnpm run test` (ver skill
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
- **Drive → Drive** solo fuerza `server_side_across_configs=true` para archivos individuales, donde un 404
  puede reintentarse sin esa opción. Los trabajos de carpetas usan el comportamiento normal de rclone para
  evitar que la cuenta destino intente leer IDs pertenecientes únicamente a la cuenta origen.

## Variables de entorno clave

`RCLONE_RC_USER`/`RCLONE_RC_PASS` y `JWT_SECRET` (≥32 chars) son obligatorias. `RCLONE_TIMEOUT_MS` (default
30000) hay que subirlo si se navega un remoto con root muy grande/lento. `ADMIN_USER`/`ADMIN_PASSWORD` solo
se usan si no existe ningún usuario aún (idempotente, no reescribe password después). Lista completa en
`.env.example`; variables extra de dev local sin Docker están en `apps/api/src/config/env.ts`.

`GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` (opcionales, en `apps/api/src/config/env.ts`, **no**
en `.env.example` — son específicas de este despliegue): client_id OAuth propio para Drive. Si están
seteadas, `RemotesService.create()` (`apps/api/src/services/remotes.ts`) las inyecta automáticamente en
cualquier remoto nuevo de tipo `drive` que no traiga su propio `client_id`, así no hace falta repetir el
proceso manual de `rclone authorize` con credenciales propias para cada remoto de Drive que se agregue.
El client_id compartido de rclone por defecto se retira durante 2026 y además da 404 erráticos exportando
Google Docs/Sheets nativos bajo carga — ver el incidente de abajo.

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

### Incidente 2026-08-23 (cont.): transferencias que abortaban en el primer archivo roto

**Síntoma**: `copy drive: → ulima_drive:` fallaba en ~30s, 0 archivos copiados, por un solo error
`googleapi: Error 404: File not found` en un archivo cualquiera.

**Causa**: rclone aborta toda la operación en el primer error salvo que se le pase `--ignore-errors`.
CloudBridge no exponía esa opción. **Fix** (commit `5cba939`): se agregó `ignoreErrors` a `TransferOptions`
(`packages/shared/src/jobs.ts` y `schemas.ts`), mapeado a `_config.IgnoreErrors` en
`apps/api/src/rclone/options.ts`, con checkbox en `TransferDialog.tsx` (Explorer) y `JobWizard.tsx` (jobs
programados). Confirmado que funciona: con la opción activa, la transferencia sigue con el resto de
archivos en vez de abortar.

**Por qué había tantos 404 — IDs inestables de "Google Fotos" dentro de Drive, no archivos rotos.** La
mayoría de los 404 masivos (cientos seguidos) fueron en archivos dentro de la carpeta virtual `Google
Fotos` de `drive:`. Dos hipótesis se descartaron **con evidencia directa**, no solo por sospecha:

- *"Son archivos rotos / no descargables vía API"* — falso. Tomando el path exacto de un archivo que
  acababa de fallar en el job masivo y pidiéndolo aislado con `operations/copyfile`, copia perfecto.
- *"Es cuota/rate-limit del client_id nuevo bajo concurrencia"* — falso. Se repitió el mismo copy masivo
  con `transfers:1, checkers:1` (sin ninguna concurrencia) y los 404 siguieron apareciendo igual.

La causa real, confirmada: **el mismo path devuelve un ID de Google distinto según cómo se resuelva.** El
listado masivo (`sync/copy` recorriendo el árbol) capturó `12bdLZTQp82p8W56YXXGOa3jEX4e4CP-zxQ` para
`Google Fotos/2016/2016-09-23.jpg`; segundos después, resolver ese mismo path de forma aislada devolvió
`1J1g4rSV9HvtdKpFnmhlVRwICk-3PWFeY` — un ID totalmente distinto, y con ese sí copia. Es decir: los ítems
de Google Photos expuestos dentro de Drive tienen **IDs virtuales inestables** — el ID que se captura al
listar ya no es válido para cuando la transferencia intenta usarlo. Esto es indiferente a: `--ignore-errors`
(ayuda a no abortar todo, pero no evita el 404 puntual), `--transfers`/concurrencia, o qué client_id se use.
**Workaround real**: excluir la carpeta `Google Fotos` del filtro antes de copiar/sincronizar ese remoto —
no hay fix de código posible del lado de CloudBridge ni de rclone para esto, es cómo Google expone esos
ítems. Aparte de ese patrón, también pueden aparecer 404 sueltos por shares genuinamente rotos en otros
archivos — esos sí se benefician de `--ignore-errors`.

**Regla para no repetir el error de diagnóstico de esta sesión**: ante un 404/error intermitente de Drive,
no asumas "está roto" ni "es cuota" sin reproducirlo — usa `operations/copyfile`/`operations/stat` con el
path exacto del ítem fallido justo después de la falla para comparar. Si el ID cambia entre listado y
transferencia, es este bug de IDs de Google Photos, no algo que arreglar en el código.

### Incidente 2026-08-23 (cont. 2): "object not found" copiando archivos en subcarpetas — bug propio, no de Google

Después de los fixes anteriores (retry, fallback server-side→normal), copiar un archivo dentro de una
subcarpeta (no en la raíz del remoto) seguía fallando **siempre**, con `"object not found"` — un mensaje
de rclone distinto al `"File not found"` de la API de Google (por eso el primer fix de detección de
reintento, que solo miraba `/file not found/i`, no lo agarraba — ver commit `f9bb33a` que amplió la regex
a `/(file|object) not found/i`; ayudó pero no resolvió el fondo).

**Causa real, encontrada recién con `RCLONE_LOG_LEVEL=DEBUG` comparando el payload exacto que manda la
app contra un curl manual**: en el bloque de copia directa de `TransferService.issue()` (el que evita
`sync/copy`+filtro, ver más arriba), `srcFs`/`dstFs` ya incluyen `source.path`/`destination.path` como raíz
del filesystem (vía `fsPath(remote, path, options)` — construye `"remote:path"`), pero el código armaba
`srcRemote`/`dstRemote` con `joinPath(source.path, name)`, **agregando el mismo path de nuevo**. Para
archivos en la raíz del remoto (`path === ''`) no se notaba (`joinPath('', name) === name`); para
cualquier archivo dentro de una subcarpeta, terminaba pidiéndole a rclone algo como
`.../01 - Introducción/01 - Introducción/external-links .txt` — una ruta que nunca existió, así que
fallaba el 100% de las veces, sin importar reintentos, fallback server-side, ni credenciales.

Todos los "hallazgos" de intermitencia/IDs inestables/cuota de las secciones anteriores de este incidente
fueron reales *para los casos puntuales que se probaron* (archivos en la raíz de un remoto, o pruebas
manuales aisladas que por construcción no duplicaban el path) — pero el patrón dominante que el usuario
seguía viendo ("mismo error", "cuando yo ejecuto siempre da error") era este bug de path duplicado, no la
inestabilidad de Google Photos. **Fix** (commit `15ed71d`): `srcRemote`/`dstRemote` en ese bloque ahora
son solo `sanitizeName(item.name)` — el path del padre ya lo aporta `srcFs`/`dstFs`.

**Lección para la próxima vez que algo similar aparezca**: cuando una reproducción manual aislada
funciona pero la app siempre falla con los mismos parámetros de alto nivel, **comparar el payload exacto
que la app le manda a rclone** (`RCLONE_LOG_LEVEL=DEBUG`, grepear `rc: "operations/..."`) contra lo que se
está probando a mano — no asumir que "misma operación" significa "mismos argumentos reales". Aquí la
diferencia (`joinPath` de más) era invisible a menos que se mirara el string final `dstFs`/`dstRemote` que
llega al daemon.

### client_id propio de Google Drive por remoto

`ulima_drive` y `drive` ya tienen client_id/secret OAuth propios (dos proyectos de Google Cloud distintos,
uno por cada uno — ver historial de esta sesión si hace falta rotar credenciales). Desde el commit que
agrega `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET` a `apps/api/src/config/env.ts`, **cualquier
remoto nuevo de tipo `drive` que se cree desde CloudBridge recibe automáticamente esas credenciales** si
están seteadas en el `.env` del LXC y el remoto no trae su propio `client_id` (ver
`RemotesService.create()` en `apps/api/src/services/remotes.ts`) — no hace falta repetir el proceso manual
de `rclone authorize` para cada remoto nuevo, solo para el primero que se configuró sin este mecanismo.
