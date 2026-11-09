#!/usr/bin/env bash
# T-SIB-INGEST-001 — rebuild the corpus stage of record from the source repo
# (syllabai-resources@main SubjectIntelligence/CHEMISTRY_4CH1/chunks/) and
# verify byte-identity against the COMMITTED run-001 dry receipt pins.
#
# Fail-closed: ANY pin mismatch aborts nonzero BEFORE anything downstream
# runs (this is the load-bearing corpus-drift check of the CI apply path —
# sib-ingest.ts itself re-verifies per-chunk content_sha256, but the FILE
# pins prove the fetched corpus is byte-identical to the corpus the
# operator rulings were made on).
#
# Usage: fetch-stage.sh <out-stage-dir>
# Output: <out>/chunks/<ART>.chunks.jsonl (95 files) — ready for sib-ingest.ts
set -euo pipefail

OUT="${1:?usage: fetch-stage.sh <out-stage-dir>}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RECEIPT="$REPO_ROOT/.syllabai/receipts/T-SIB-INGEST-001/run-001-dry-receipt.json"
BASE="https://raw.githubusercontent.com/SyllabAI/syllabai-resources/main/SubjectIntelligence/CHEMISTRY_4CH1/chunks"

[ -f "$RECEIPT" ] || { echo "receipt of record missing: $RECEIPT"; exit 2; }
mkdir -p "$OUT/chunks"

python3 - "$RECEIPT" "$OUT/chunks" "$BASE" <<'PY'
import hashlib, json, os, sys, urllib.request

receipt, chunks_dir, base = sys.argv[1], sys.argv[2], sys.argv[3]
pins = json.load(open(receipt))["source_of_record"]["file_pins"]
print(f"fetching + pin-verifying {len(pins)} corpus files from the source of record ...")
bad = []
for art, pin in sorted(pins.items()):
    url = f"{base}/{art}.chunks.jsonl"
    with urllib.request.urlopen(url, timeout=60) as r:
        raw = r.read()
    got = hashlib.sha256(raw).hexdigest()
    if got != pin:
        bad.append(f"  {art}: pin {pin[:12]} != fetched {got[:12]}")
        continue
    with open(os.path.join(chunks_dir, f"{art}.chunks.jsonl"), "wb") as f:
        f.write(raw)
print(f"verified + staged: {len(pins) - len(bad)}/{len(pins)}")
if bad:
    print("PIN MISMATCH — corpus drifted from the source of record (fail-closed):", file=sys.stderr)
    print("\n".join(bad), file=sys.stderr)
    sys.exit(1)
PY

echo "stage of record rebuilt at $OUT (95 files, byte-identical to the run-001 pins)"
