#!/bin/bash
# RN-DEBRIS-11 run-009 — official-doc fetch of record (evidence pass).
# Source of record: syllabai-resources @ 4e3a1c6843b0 (the same upstream tip the
# run-005 content-map pins and run-008's 4GE1 PDF pin resolve against).
# Fetches the 6 family PDFs + the upstream independent parses (cross-check
# sources), then byte-pins the PDFs (sha256 + sha1).
set -euo pipefail
export GIT_ASKPASS=/home/z/my-project/work/git_askpass.sh
RES=/home/z/my-project/work/resources
OUT=/home/z/my-project/work/run009
mkdir -p "$OUT/parsed"

fetch() { git -C "$RES" show "HEAD:$1" > "$2"; }

# --- the 6 family PDFs ---
fetch Official-Specifications/cie-igcse-english-language-2024-2026/635230-2024-2026-syllabus.pdf "$OUT/0500-2024-2026-syllabus.pdf"
fetch Official-Specifications/cie-igcse-english-language-2027-2029/718783-2027-2029-syllabus.pdf "$OUT/0500-2027-2029-syllabus.pdf"
fetch Official-Specifications/cie-igcse-religious-studies-2025-2027/663158-2025-2027-syllabus.pdf "$OUT/0490-2025-2027-syllabus.pdf"
fetch Official-Specifications/cie-igcse-business-2027-2029/718123-2027-2029-syllabus.pdf "$OUT/0264-2027-2029-syllabus.pdf"
fetch Official-Specifications/cie-a-level-maths-2023-2025/597421-2023-2025-syllabus.pdf "$OUT/9709-2023-2025-syllabus.pdf"
fetch Official-Specifications/igcse-business/9781446942765-international-gcse-business-specification.pdf "$OUT/4BS1-international-gcse-business-specification.pdf"

# --- upstream independent parses (cross-check sources) ---
for d in cie-igcse-english-language-2024-2026 cie-igcse-english-language-2027-2029 \
         cie-igcse-religious-studies-2025-2027 cie-igcse-business-2027-2029 \
         cie-a-level-maths-2023-2025; do
  mkdir -p "$OUT/parsed/$d"
  for f in $(git -C "$RES" ls-tree --name-only "HEAD:Official-Specifications/parsed/$d"); do
    fetch "Official-Specifications/parsed/$d/$f" "$OUT/parsed/$d/$f"
  done
done
mkdir -p "$OUT/parsed/igcse-business"
for f in spec_points.json topics.json parse_report.json assessment_objectives.json; do
  fetch "Official-Specifications/parsed/igcse-business/$f" "$OUT/parsed/igcse-business/$f"
done

# --- byte pins of record ---
sha256sum "$OUT"/*.pdf | tee "$OUT/pdf_sha256.txt"
echo "---"
sha1sum  "$OUT"/*.pdf | tee "$OUT/pdf_sha1.txt"
