---
name: verify
description: Verifica que los cambios en CloudBridge compilan, tipan, pasan lint y los tests unitarios antes de dar una tarea por terminada. Usar antes de reportar un fix o feature como completo, o antes de commitear. No hay CI de tests/lint en este repo (solo build+push de imagen Docker), así que esta verificación es la única red de seguridad.
---

Corre, en este orden, y reporta el resultado real de cada paso (no asumas que pasó):

1. `npm run typecheck` — tsc --noEmit en todos los workspaces (api, web, shared). **Ya hay ~80 errores
   preexistentes en `apps/web`** (verificado con `git stash`, no los introdujo el setup de tooling): no
   los cuentes como regresión salvo que tu cambio los toque; sí bloquea si tu cambio agrega errores nuevos.
2. `npm run lint` — eslint sobre todo el repo. Nuevos errores (no warnings preexistentes) bloquean.
3. `npm run build:shared` — necesario antes de `test` si no corriste `dev`/`build` en esta sesión:
   `apps/api` resuelve `@cloudbridge/shared` en runtime de los tests, no solo en tipos.
4. `npm run test` — vitest run en `apps/api` (cliente rclone, saneador de rutas, mapeo de opciones de
   transferencia).
5. `npm run build` — build completo (shared → api → web) para atrapar errores que typecheck aislado no ve
   (p. ej. imports rotos entre paquetes).

Si algún paso falla:
- Muestra el output relevante (no lo resumas de más, el usuario necesita ver el error real).
- No marques la tarea como completa ni propongas commit hasta que los tres pasen.
- Si el fallo es en tests preexistentes no relacionados con el cambio actual, dilo explícitamente en vez de
  ocultarlo.

No corras `npm run test:e2e` como parte de esta verificación estándar — requiere el stack de Docker
levantado y remotos `e2e-src`/`e2e-dst` creados manualmente (ver README, sección E2E). Solo corre e2e si el
usuario lo pide explícitamente o el cambio toca flujos de UI/Explorer/Jobs que ameritan esa cobertura.

El repo aún no está formateado con Prettier de punta a punta (hay ~120 archivos preexistentes con
diferencias de estilo) — no corras `npm run format` sobre todo el repo como parte de esta verificación,
solo sobre los archivos que tocaste si hace falta.
