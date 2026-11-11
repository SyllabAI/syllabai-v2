#!/bin/bash
# RN-DEBRIS-11 run-018 — official-doc fetch of record (evidence pass).
# Source of record: syllabai-resources @ 4e3a1c6843b0 (same tip as run-005/008/009/016/017 pins).
# Fetches the 9709 2023-2025 syllabus PDF + upstream independent parse, then byte-pins.
# Continuity law: sha256 must byte-match the pin of record
#   3a7a37692399f47ff5e0d94cc41f9dd33d3b99467ce83aa4bad28c6136f96256 (run-009/016/017)
set -euo pipefail
export GIT_ASKPASS=/home/z/my-project/work/git_askpass.sh
RES=/home/z/my-project/work/resources
OUT=/home/z/my-project/work/run018
PIN_TIP=4e3a1c6843b0
PIN_SHA256=3a7a37692399f47ff5e0d94cc41f9dd33d3b99467ce83aa4bad28c6136f96256

if [ ! -d "$RES/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/SyllabAI/syllabai-resources.git "$RES"
fi
git -C "$RES" fetch origin "$PIN_TIP" 2>/dev/null || true
git -C "$RES" checkout --detach "$PIN_TIP" >/dev/null 2>&1
echo "resources HEAD: $(git -C "$RES" rev-parse HEAD)"
RES_TIP=$(git -C "$RES" rev-parse HEAD)
case "$RES_TIP" in "$PIN_TIP"*) ;; *) echo "WARN: resources tip $RES_TIP does not start with pin prefix" ;; esac

mkdir -p "$OUT/parsed/cie-a-level-maths-2023-2025"
fetch() { git -C "$RES" show "HEAD:$1" > "$2"; }

fetch "Official-Specifications/cie-a-level-maths-2023-2025/597421-2023-2025-syllabus.pdf" "$OUT/9709-2023-2025-syllabus.pdf"

for f in $(git -C "$RES" ls-tree --name-only "HEAD:Official-Specifications/parsed/cie-a-level-maths-2023-2025"); do
  fetch "Official-Specifications/parsed/cie-a-level-maths-2023-2025/$f" "$OUT/parsed/cie-a-level-maths-2023-2025/$f"
done
ls -la "$OUT/parsed/cie-a-level-maths-2023-2025/"

sha256sum "$OUT/9709-2023-2025-syllabus.pdf" | tee "$OUT/pdf_sha256.txt"
sha1sum  "$OUT/9709-2023-2025-syllabus.pdf" | tee "$OUT/pdf_sha1.txt"
ACTUAL=$(sha256sum "$OUT/9709-2023-2025-syllabus.pdf" | cut -d' ' -f1)
if [ "$ACTUAL" = "$PIN_SHA256" ]; then
  echo "CONTINUITY PASS: sha256 == pin of record (run-009/016/017)"
else
  echo "CONTINUITY FAIL: $ACTUAL != $PIN_SHA256"
  exit 1
fi
