---

## Contexto y objetivo

Quiero que construyas **CloudBridge**, una aplicación web selfhosted que funcione como un MultCloud/RcloneView propio: gestor multi-nube con interfaz web moderna, drag & drop entre proveedores y tareas de sincronización programadas.

El motor será **rclone** corriendo en modo daemon (`rclone rcd`), y la app será un frontend + backend que consume la **rclone RC API** (HTTP JSON, documentada en https://rclone.org/rc/). No reimplementes lógica de transferencia: todo lo delega a rclone.

Destino de despliegue: contenedor Docker en un LXC de Proxmox (Debian 12), expuesto detrás de Traefik/Cloudflare Tunnel. Todo debe correr con `docker compose up -d`.

---

## Stack obligatorio

- **Backend:** Node.js 22 + TypeScript + Fastify. Cliente HTTP hacia la RC API de rclone.
- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui + lucide-react. Estado con TanStack Query. Tablas con TanStack Table. Drag & drop con `@dnd-kit/core`.
- **Base de datos:** SQLite vía Drizzle ORM (tareas, historial, usuarios, logs). Persistida en volumen.
- **Scheduler:** `node-cron` en el backend, con soporte cron estándar de 5 campos.
- **Tiempo real:** WebSocket (`@fastify/websocket`) para progreso de transferencias; el backend hace polling a `core/stats` de rclone cada 1s y hace broadcast.
- **Auth:** login local con usuario/contraseña (argon2 + sesión JWT httpOnly). Dejar preparado un hook para OIDC en el futuro, pero no implementarlo ahora.
- **Contenedor:** imagen multi-stage. Un solo `docker-compose.yml` con dos servicios: `cloudbridge` (app) y `rclone` (daemon `rclone rcd --rc-addr 0.0.0.0:5572 --rc-user ... --rc-pass ... --rc-serve`), compartiendo el volumen del `rclone.conf`.

---

## Referencia visual — replicar la UX de RcloneView

RcloneView (https://rcloneview.com) es la referencia de intuitividad. Replica estas capacidades en web:

1. Explorador de **dos paneles** lado a lado para arrastrar y soltar entre remotos sin scripts.
2. **Comparación visual de carpetas**: resalta archivos únicos, diferencias de tamaño y coincidencias antes de copiar.
3. **Sync uno-a-uno y 1:N** (un origen hacia varios destinos en una sola operación).
4. **Jobs reutilizables con programación** por horario o cron.
5. **Monitoreo y logs**: progreso en vivo de las transferencias y logs detallados de jobs completados.
6. **Dry-run y filtros** include/exclude para controlar exactamente qué se mueve.

No copies assets, logos ni texto de RcloneView. Solo la estructura de interacción.

---

## Diseño visual

- Estética limpia y densa tipo herramienta profesional (Linear / Raycast), **no** dashboard genérico con cards gigantes.
- Modo claro y oscuro, toggle persistido en localStorage; oscuro por defecto.
- Paleta: fondo neutro (zinc/slate), acento único configurable (por defecto `#f97316` ámbar). Nada de gradientes decorativos.
- Tipografía: Inter para UI, JetBrains Mono para rutas y logs. Tamaño base 14px — la app es densa en información.
- Iconos por proveedor: usa `simple-icons` para Google Drive, OneDrive, Dropbox, S3, Box, Mega, Backblaze, pCloud; fallback genérico de nube para el resto.
- Skeletons durante carga, nunca spinners a pantalla completa. Toasts para resultados de operaciones.
- Responsive: en <1024px los dos paneles colapsan a uno con selector de panel activo.

---

## Estructura de la interfaz

### Layout general
Sidebar izquierdo fijo (~220px, colapsable a iconos) + área principal.

**Sidebar:**
- Logo/nombre arriba.
- Navegación: Explorer, Transfers, Jobs, Logs, Remotes, Settings.
- Sección "Remotos" con lista de remotos configurados: icono del proveedor, nombre, indicador de estado (verde/rojo según `config/get` + un `about` de prueba), y espacio usado si el backend lo reporta.
- Botón "+ Añadir remoto" abajo.

### 1. Explorer (vista principal)
- Dos paneles independientes, divisor arrastrable, ancho persistido.
- Cada panel: selector de remoto (combobox con búsqueda), breadcrumb navegable, barra de búsqueda dentro de la ruta, toggle lista/cuadrícula, botón refrescar.
- Tabla por panel: checkbox, icono por tipo de archivo, nombre, tamaño legible, fecha de modificación, menú contextual (⋮).
- **Drag & drop:** arrastrar selección de un panel al otro dispara la operación. Al soltar, modal de confirmación mostrando origen → destino, cantidad de archivos, tamaño total, y elección entre Copy / Move, con checkbox de `--dry-run`.
- Botones centrales entre paneles: `Copy →`, `← Copy`, `Move →`, `← Move`, `Compare`, `Sync →`.
- **Compare:** ejecuta comparación de las dos rutas y colorea filas — verde solo en origen, azul solo en destino, ámbar mismo nombre distinto tamaño/fecha, gris idénticos. Barra superior con conteo por categoría y filtros para mostrar solo una categoría.
- Menú contextual por archivo: Descargar, Renombrar, Mover a…, Copiar a…, Eliminar, Copiar ruta, Propiedades.
- Multiselección con Shift/Ctrl, `Ctrl+A`, `Delete` para borrar.

### 2. Transfers
- Tabla en vivo de transferencias activas: nombre de archivo, origen → destino, barra de progreso, velocidad, ETA, bytes transferidos/total.
- Cabecera con agregados: velocidad total, archivos en cola, tiempo transcurrido.
- Botones pausar/reanudar/cancelar por job (usa `job/stop` de la RC API).
- Sección inferior con transferencias completadas en esta sesión, con estado y duración.

### 3. Jobs (el diferenciador frente a un simple file manager)
- Tabla de tareas guardadas: nombre, origen, destino(s), modo (copy/sync/move), horario legible ("Diario a las 03:00"), última ejecución con badge de estado, próxima ejecución, toggle enabled/disabled, acciones (Ejecutar ahora, Editar, Duplicar, Ver historial, Eliminar).
- **Modal de creación en 4 pasos** (wizard con stepper):
  1. **Origen** — selector de remoto + navegador de carpetas embebido para elegir la ruta.
  2. **Destino(s)** — igual, pero permitiendo **añadir varios destinos** (1:N).
  3. **Opciones** — modo (Copy / Sync / Move / Bisync), filtros include/exclude (lista editable de patrones), toggles: `--dry-run`, `--check-first`, `--track-renames`, `--transfers` (número), `--bandwidth-limit`, borrar en destino (solo en sync, con advertencia explícita en rojo porque destruye datos).
  4. **Programación** — presets (Manual / Cada hora / Diario / Semanal / Mensual) o expresión cron personalizada con vista previa en lenguaje natural de las próximas 5 ejecuciones. Toggle de notificación por webhook al terminar o al fallar.
- Al guardar, persistir en SQLite y registrar en el scheduler.
- Vista de historial por job: ejecuciones pasadas con timestamp, duración, archivos transferidos, bytes, errores y log completo expandible.

### 4. Logs
- Visor de log unificado con filtro por nivel (INFO/WARN/ERROR), por job y por rango de fechas. Búsqueda de texto. Botón de exportar a `.txt`.

### 5. Remotes
- Grid de tarjetas por remoto: icono, nombre, tipo, espacio usado/total con barra si `about` está disponible, botones Probar conexión / Editar / Eliminar.
- **Añadir remoto:** modal con selector de tipo. Para proveedores OAuth (Google Drive, OneDrive, Dropbox, Box), implementar el flujo usando `config/create` de la RC API con opción de pegar el token obtenido con `rclone authorize` en una máquina con navegador — muestra el comando exacto a ejecutar. Para el resto (S3, WebDAV, SFTP, FTP, SMB, Backblaze), formulario dinámico con los campos requeridos por proveedor.
- Nunca mostrar secretos en claro después de guardados; enmascarar y permitir solo reemplazo.

### 6. Settings
- Conexión al daemon rclone (host, puerto, usuario, contraseña) con botón "Probar conexión".
- Valores por defecto globales: `--transfers`, `--checkers`, límite de ancho de banda, nivel de log, retención de historial en días.
- Gestión de usuarios (crear, cambiar contraseña, eliminar).
- Webhook global para notificaciones (URL + plantilla del payload JSON).
- Zona horaria del scheduler.
- Import/export del `rclone.conf`.

---

## API del backend (implementar toda)

```
POST   /api/auth/login            /api/auth/logout            GET /api/auth/me
GET    /api/remotes               POST /api/remotes           DELETE /api/remotes/:name
POST   /api/remotes/:name/test    GET  /api/remotes/:name/about
GET    /api/fs/list?remote=&path=
POST   /api/fs/mkdir              POST /api/fs/delete         POST /api/fs/rename
POST   /api/fs/copy               POST /api/fs/move           POST /api/fs/compare
GET    /api/transfers             POST /api/transfers/:id/stop
GET    /api/jobs                  POST /api/jobs              PUT  /api/jobs/:id
DELETE /api/jobs/:id              POST /api/jobs/:id/run      GET  /api/jobs/:id/history
GET    /api/logs
GET    /api/settings              PUT  /api/settings
WS     /ws/stats
```

Todas las operaciones largas deben lanzarse en rclone con `_async: true` y devolver el `jobid` para seguimiento vía `job/status`.

---

## Requisitos no funcionales

- **Seguridad:** rclone rcd nunca expuesto fuera de la red interna de Docker. Credenciales de la RC API por variables de entorno. Nada de `--rc-no-auth`. Validar y sanear todas las rutas para evitar traversal. Rate limiting en el login.
- **Protección contra pérdida de datos:** `sync` con borrado en destino requiere una confirmación explícita escribiendo el nombre del job. Mostrar siempre el resultado del dry-run cuando esté activo antes de permitir la ejecución real.
- **Manejo de errores:** si el daemon rclone está caído, la UI muestra un banner claro y desactiva las acciones en vez de fallar silenciosamente.
- **Persistencia:** un job en ejecución que se interrumpe por reinicio del contenedor se marca como `interrupted` en el historial al arrancar.
- **Logs estructurados** en JSON hacia stdout (compatible con Loki/Promtail).

---

## Entregables

1. Monorepo con `apps/api`, `apps/web`, `packages/shared` (tipos compartidos).
2. `docker-compose.yml` funcional + `Dockerfile` multi-stage + `.env.example` documentado.
3. Migraciones de Drizzle y script de seed que crea el usuario admin inicial desde env.
4. `README.md` con: arquitectura, diagrama de componentes en Mermaid, instalación paso a paso, cómo añadir remotos OAuth, y variables de entorno.
5. Tests: unitarios de la capa cliente de rclone (Vitest, con la RC API mockeada) y un E2E de Playwright del flujo "crear job → ejecutar → ver historial".

---

## Cómo quiero que trabajes

Trabaja por fases, verificando que cada una compile y corra antes de seguir:

1. Scaffolding del monorepo + Docker Compose con rclone rcd conectado y un `/api/health` que responda con la versión de rclone.
2. Auth + esquema de base de datos + CRUD de remotos.
3. Explorer de dos paneles con navegación y operaciones básicas (sin drag & drop todavía).
4. Drag & drop + Compare + WebSocket de progreso + vista de Transfers.
5. Jobs: CRUD, wizard, scheduler, historial.
6. Logs, Settings, pulido visual, tests, README.

Antes de escribir código en cada fase, muéstrame el plan y espera confirmación. Si algún endpoint de la RC API de rclone no se comporta como esperas, consulta https://rclone.org/rc/ en lugar de asumir.
