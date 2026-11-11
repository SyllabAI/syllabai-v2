#!/usr/bin/env bash
# Build the API prebuilt stage — the serving recipe of record for the
# syllabai-v2 Vercel project (recovered 2026-11-11 from the last serving
# deployment dpl_7Q3CRpcTWavgD6VMbXvSrpshCVKV; see
# docs/T-VERCEL-API-SERVING-RECOVERY.md).
#
# WHY THIS EXISTS: the project's Vercel settings are ALL unset (framework,
# buildCommand, outputDirectory, rootDirectory — null on the old account AND
# the new one). Serving works because the deployable is a PREBUILT stage:
#   vercel.json           (rewrites /api/v1/(.*) and /actuator/health -> /api/index)
#   api/index.js          (ONE esbuild-bundled Node lambda, default-exported handler)
#   api/concept-graph/    (SHA-256-pinned snapshot yamls the loader readFileSync's)
# Deploying the monorepo root instead produces an EMPTY deployment — the
# 2026-11-10 incident (api.syllab-ai.com 404 on every path). This script is
# the only sanctioned way to produce the deployable.
#
# Validated 2026-11-11 against main: bundle boots via localgate, and the
# probes are byte-shape parity with the live surface (health 200 UP,
# login-garbage 400 validation_failed, /api/v1/* anonymous 401).
#
# Usage: scripts/api-stage/build.sh <output-stage-dir>
#   (run from the repo root; requires bun + network for bunx esbuild)
set -euo pipefail

STAGE="${1:?usage: build.sh <output-stage-dir]}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[api-stage] staging to $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE/api/concept-graph"

# 1. deps for the bundle graph (workspace-filtered, frozen lockfile)
cd "$REPO_ROOT"
bun install --frozen-lockfile --filter=@syllabai/api >/dev/null

# 2. bundle: ONE CJS lambda, default-exported Node handler (the recovered
#    shape — apps/api/src/vercel.ts). Node builtins stay external.
#    - --inject  apps/api/src/vercel-shims.ts : Bun-runtime shims for Node
#      (Bun.CryptoHasher -> node:crypto, Bun.YAML.parse -> js-yaml)
#    - --define  import.meta.dir=__dirname    : Bun dir-global -> lambda dir
#      (the SHA-pinned snapshot loader readFileSync's from here; the yamls
#      ship INSIDE the lambda at api/concept-graph/)
bunx esbuild apps/api/src/vercel.ts \
  --bundle --platform=node --format=cjs --target=node24 \
  --legal-comments=none \
  --define:import.meta.dir=__dirname \
  --inject:apps/api/src/vercel-shims.ts \
  --outfile="$STAGE/api/index.js"

# 3. the rewrite config — byte-identical to the serving lane's
cp "$(dirname "$0")/vercel.json" "$STAGE/vercel.json"

# 4. the packaged snapshot resources the loader reads from __dirname
cp apps/api/src/services/learner-me/concept-graph/*.yaml "$STAGE/api/concept-graph/"

# 5. sanity: syntax + size class (the serving lane's bundle was ~3.8MB)
node --check "$STAGE/api/index.js"
SIZE=$(stat -c%s "$STAGE/api/index.js")
if [ "$SIZE" -lt 1000000 ]; then
  echo "[api-stage] REFUSING: bundle is only ${SIZE}B — expected ~3-4MB; aborting"
  exit 1
fi
echo "[api-stage] bundle $SIZE bytes, syntax OK, stage ready: $STAGE"
echo "[api-stage] next: gate it — scripts/api-stage/localgate-server.cjs \"$STAGE\""
