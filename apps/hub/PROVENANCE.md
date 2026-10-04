# Provenance

This directory is a **point-in-time import** of `SyllabAI/syllabai-hub` (the
frozen Java-era product frontend).

- Source repo: https://github.com/SyllabAI/syllabai-hub (stays as-is, archived at cutover — never deleted)
- Imported commit: `93226a43edefafb3bfa9d0fddf119948da29fa9a`
- Import date: 2026-10-04
- Importer: SyllabAI operator + Super Z (session trace 347fbb29ca71934f658854f7261bdb83)

## What was pruned during import

- `.git/` — history remains in the original repo (blame/issues stay resolvable there).
- `.github/workflows/` — hub-era CI is superseded by the monorepo root CI.
  Other `.github/` content (templates etc.) was kept.

## Rules for agents working in apps/hub

1. `syllabai-hub` upstream is FROZEN — do not port new upstream changes here
   unless the operator explicitly orders a catch-up sync (re-import is the
   documented mechanism, see docs/MIGRATION_PLAN.md §Catch-up).
2. Adapt, do not re-architect: the only sanctioned structural changes are
   (a) switching API base URL to the v2 api, (b) importing shared code from
   `@syllabai/contracts` / `@syllabai/shared` to delete duplicated logic,
   (c) workspace/package renames in T-MIG-000.
3. `bun.lock` in this directory is the legacy standalone lockfile kept for
   version reference; it becomes stale the moment the root lockfile exists
   (T-MIG-000). Do not hand-edit it.
4. Everything else: treat as the product truth to be preserved. When in doubt,
   behaviour parity with the hub import wins over local elegance.
