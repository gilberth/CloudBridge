# Persistent Comparisons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Explorer comparisons as runs that remain visible and inspectable in Transfers.

**Architecture:** Add a `RunMode` separate from `JobMode`, then add a focused compare-start path in `TransferService` that saves the result in the run parameters. Explorer calls that path rather than directly calling the synchronous filesystem endpoint; Transfers renders persisted comparison details.

**Tech Stack:** TypeScript, Fastify, Drizzle/SQLite, TanStack Query, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-persistent-comparisons-design.md`

## Global Constraints

- Comparisons are read-only and are never scheduleable jobs.
- `deep: true` must preserve the existing rclone hash-check behavior.
- Use pnpm for every script.

---

### Task 1: Persist comparison runs in the API

**Files:** `packages/shared/src/common.ts`, `packages/shared/src/transfers.ts`, `apps/api/src/services/runs.ts`, `apps/api/src/services/transfers.ts`, `apps/api/src/routes/fs.ts`, `apps/api/src/services/__tests__/transfers.test.ts`.

- [ ] Write a failing service test proving a deep comparison creates and completes a `compare` run.
- [ ] Add `RunMode`, a `TransferService.compare()` method, and a tracked `/api/fs/compare` route. Differences remain successful results, not run errors.
- [ ] Verify the focused API test and full API suite.

### Task 2: Launch and inspect persistent comparisons in the web app

**Files:** `apps/web/src/lib/api.ts`, `apps/web/src/pages/Explorer.tsx`, `apps/web/src/pages/Transfers.tsx`, `apps/web/e2e/explorer-compare.spec.ts`.

- [ ] Replace Explorer's direct request with the tracked API call and navigate to Transfers.
- [ ] Show comparison counts and individual paths in a Transfers details dialog.
- [ ] Verify typecheck, tests, and production build.
