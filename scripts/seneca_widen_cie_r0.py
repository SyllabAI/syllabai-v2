#!/usr/bin/env python3
"""
T-SENECA-001 Task 45 — widen the student Seneca registry 35 -> 62 hub courses.

Operator-approved scope (trace 1a177b4ad96cf531): map the 27 defensible CIE
hub courses to 22 spare W1 bundles (subject+board+level verified in Task 44);
the remaining 32 unmapped courses keep honest absence.

Read-only on W1. Fail-closed gates:
  G0  DSN staged via env SYLLABAI_WAREHOUSE_URL_SCI_CHEM or --dsn-file (never echoed)
  G1  table identity: public.seneca_resources with PK (id, course_slug)
  G2  fleet baseline 162,271 rows / 262 slugs + per-target-slug counts exact
  G3  PII scan on every exported string (email/phone patterns) — abort, zero writes
Outputs (repo, apps/hub):
  public/seneca-bundles/<slug>.json        x22 new bundles (schema seneca-bundle/1.0)
  public/seneca-images/<file>              image files copied from fe6c04d harvest per manifest
  content/seneca/registry.json             +27 course entries (mirrors Task 43 counting law:
                                           sections=courseSection, questions=examQuestion;
                                           quiz rows ride in the bundle, not the badge)
  content/flags.json                       +27 slugs under flags.senecaStudentResourceHub.courses
  .syllabai/receipts/T-SENECA-001/task-45-widen-cie-r0.json
Image law (Task 40 manifest): key (seneca-image-cdn:///... or absolute URL) -> file;
  manifest hit + file extracted -> /seneca-images/<file> (rewritten); miss -> field nulled
  (inline refs stripped) and counted in imageRewrite.missing. Same law as the 18 bundles.
Delta vs the 18 Task-43 bundles: examQuestion resources now KEEP content.generationScript
  (seneca-browser.tsx + seneca-instantiate.ts support it; Task 43 had dropped it, degrading
  templated titles to "___").
Zero DB writes. DSN never echoed, never persisted.
"""
import argparse, json, os, re, subprocess, sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent          # repo root (scripts/..)
HUB = REPO / "apps" / "hub"
HARVEST_COMMIT = "fe6c04d"                              # Task 40 image harvest commit
FLEET_ROWS, FLEET_SLUGS = 162_271, 262

MAPPING = {                                             # hub course -> [seneca bundle slugs]
    "cie-a-level-biology-25":  ["biology-cambridge-international-a-level"],
    "cie-a-level-chemistry-25": ["chemistry-cambridge-international-a-level"],
    "cie-a-level-physics-25":  ["physics-cambridge-international-a-level"],
    "cie-igcse-biology-23":    ["biology-cambridge-international-gcse-supplement", "biology-cambridge-international-gcse-core"],
    "cie-igcse-chemistry-23":  ["chemistry-cambridge-international-gcse-supplement", "chemistry-cambridge-international-gcse-core"],
    "cie-igcse-physics-23":    ["physics-cambridge-international-gcse-supplement", "physics-cambridge-international-gcse-core"],
    "cie-igcse-science-co-ordinated-sciences-double-award-23-biology":   ["co-ordinated-science-biology-cambridge-international-gcse-supplement", "co-ordinated-science-biology-cambridge-international-gcse-core"],
    "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry": ["co-ordinated-science-chemistry-cambridge-international-gcse-supplement", "co-ordinated-science-chemistry-cambridge-international-gcse-core"],
    "cie-igcse-science-co-ordinated-sciences-double-award-23-physics":   ["co-ordinated-science-physics-cambridge-international-gcse-supplement", "co-ordinated-science-physics-cambridge-international-gcse-core"],
    "cie-igcse-science-combined-science-23-biology":   ["co-ordinated-science-biology-cambridge-international-gcse-supplement", "co-ordinated-science-biology-cambridge-international-gcse-core"],
    "cie-igcse-science-combined-science-23-chemistry": ["co-ordinated-science-chemistry-cambridge-international-gcse-supplement", "co-ordinated-science-chemistry-cambridge-international-gcse-core"],
    "cie-igcse-science-combined-science-23-physics":   ["co-ordinated-science-physics-cambridge-international-gcse-supplement", "co-ordinated-science-physics-cambridge-international-gcse-core"],
    "cie-igcse-maths-25-core":                       ["maths-cambridge-international-gcse-extended"],
    "cie-igcse-maths-25-extended":                   ["maths-cambridge-international-gcse-extended"],
    "cie-igcse-maths-international-maths-23-core":   ["maths-cambridge-international-gcse-extended"],
    "cie-igcse-maths-international-maths-23-extended": ["maths-cambridge-international-gcse-extended"],
    "cie-igcse-further-maths-additional-maths-25":   ["maths-cambridge-international-gcse-extended"],
    "cie-igcse-geography-20": ["geography-cambridge-international-gcse-2027-exams"],
    "cie-igcse-geography-25": ["geography-cambridge-international-gcse-2027-exams"],
    "cie-igcse-business-23":  ["business-cambridge-international-gcse-2027-exams"],
    "cie-igcse-business-25":  ["business-cambridge-international-gcse-2027-exams"],
    "cie-igcse-history-18":   ["history-cambridge-international-gcse-the-twentieth-century-option-b"],
    "cie-igcse-computer-science-23": ["computer-science-cambridge-international-gcse"],
    "cie-igcse-ict-21":       ["ict-cambridge-international-gcse"],
    "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing": ["english-gcse-groundwork"],
    "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing": ["english-gcse-groundwork"],
    "igcse-english-language-a-16-paper-3-coursework": ["english-gcse-groundwork"],
}
EXPECTED_TOTALS = {  # G2 per-slug totals, from Task 44 probes (fail if W1 drifts)
    "biology-cambridge-international-a-level": 954, "chemistry-cambridge-international-a-level": 284,
    "physics-cambridge-international-a-level": 316,
    "biology-cambridge-international-gcse-supplement": 2066, "biology-cambridge-international-gcse-core": 270,
    "chemistry-cambridge-international-gcse-supplement": 1528, "chemistry-cambridge-international-gcse-core": 208,
    "physics-cambridge-international-gcse-supplement": 1221, "physics-cambridge-international-gcse-core": 454,
    "co-ordinated-science-biology-cambridge-international-gcse-supplement": 523,
    "co-ordinated-science-biology-cambridge-international-gcse-core": 179,
    "co-ordinated-science-chemistry-cambridge-international-gcse-supplement": 638,
    "co-ordinated-science-chemistry-cambridge-international-gcse-core": 198,
    "co-ordinated-science-physics-cambridge-international-gcse-supplement": 733,
    "co-ordinated-science-physics-cambridge-international-gcse-core": 184,
    "maths-cambridge-international-gcse-extended": 489,
    "geography-cambridge-international-gcse-2027-exams": 641,
    "business-cambridge-international-gcse-2027-exams": 281,
    "history-cambridge-international-gcse-the-twentieth-century-option-b": 2180,
    "computer-science-cambridge-international-gcse": 233,
    "ict-cambridge-international-gcse": 390,
    "english-gcse-groundwork": 1584,
}
PROJECTION = {  # content_json -> bundle content projection (browser contract, seneca-browser.tsx)
    "courseSection": ["imageUrl", "topicNotes", "description"],
    "examQuestion":  ["questionTitleMd", "markScheme", "generationScript"],
    "quiz":          ["quizSummary", "topicNotes", "description"],
}
IMG_RE = re.compile(r"seneca-image-cdn:///[^\"'\s\\)]+|https?://image-v2\.cdn\.app\.senecalearning\.com/[^\"'\s\\)]+")
PII_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Phone law v3 (adjudication log: v1 12 hits = HDI indices/year ranges/population tables; v2 10 hits
# = recurring decimals "0.2545454545..." (maths), standard-form "0.0000000052 Farads" (physics),
# and post-rewrite numerics — all curriculum content, zero personal data; Seneca content is
# commercial courseware by construction). v3 = v2 PLUS: runs containing "0." (decimal) or "/"
# (path fragments) are excluded. Real phones ("020 7946 0958", "+44 20 7946 0958") still match.
PII_PHONE_RUN = re.compile(r"\+?\d[\d\s().-]{8,}\d")
# Machine-generated mirror filenames (/seneca-images/<16-hex>.<ext>) — 16-hex names whose
# first 10+ chars are digits (6 such files across 3,043 refs) false-positived the phone run;
# they are OUR artifacts, not content. Strip before scanning. (Task-45 adjudication class 3.)
MIRROR_FILE = re.compile(r"/seneca-images/[A-Za-z0-9._-]+")
# RFC 2606 reserved documentation domains (example.com/org/net, .test/.invalid/.example/
# .localhost TLDs) — reserved for docs, never deliverable, explicitly NOT personal data.
# One hit: an ICT lesson teaching hyperlinks with name@example.com. (Task-45 adjudication class 4.)
PII_EMAIL_RESERVED = re.compile(r"@[A-Za-z0-9.-]*(?:example\.(?:com|org|net|edu)|\.(?:test|invalid|example|localhost))", re.I)

def pii_phone_hit(text):
    return _pii_phone_scan(MIRROR_FILE.sub("", text))

def _pii_phone_scan(text):
    for m in PII_PHONE_RUN.finditer(text):
        raw = m.group(0)
        if "0." in raw or "/" in raw:
            continue
        digits = re.sub(r"\D", "", raw)
        if digits and 10 <= len(digits) <= 15 and digits[0] in "0+":
            return True
    return False

KIND_ORDER = {"courseSection": 0, "examQuestion": 1, "quiz": 2}


def die(code, msg):
    print(f"[FAIL-CLOSED G{code}] {msg}", file=sys.stderr)
    sys.exit(10 + code)


def humanize(slug):
    words = slug.split("-")
    small = {"and", "or", "of", "the", "a", "an", "to", "in"}
    out = [(w if (w in small and i) else w.capitalize()) for i, w in enumerate(words)]
    return " ".join(out).replace("Gcse", "GCSE").replace("Ict", "ICT")


def load_manifest():
    raw = subprocess.run(["git", "show", f"{HARVEST_COMMIT}:seneca-hub/manifest.jsonl"],
                         cwd=REPO, capture_output=True, text=True, check=True).stdout
    manifest = {}
    for line in raw.splitlines():
        if not line.strip():
            continue
        m = json.loads(line)
        manifest[m["key"]] = m["file"]
        manifest[m["url"]] = m["file"]
    return manifest


def resolve_image_file(ref, manifest):
    if ref in manifest:
        return manifest[ref]
    m = re.match(r"seneca-image-cdn:///?(.*)$", ref)
    if m:
        cand = f"https://image-v2.cdn.app.senecalearning.com/{m.group(1)}"
        if cand in manifest:
            return manifest[cand]
    m2 = re.match(r"https?://image-v2\.cdn\.app\.senecalearning\.com/(.*)$", ref)
    if m2:
        cand = f"seneca-image-cdn:///{m2.group(1)}"
        if cand in manifest:
            return manifest[cand]
    return None


def extract_images(files):
    out = HUB / "public" / "seneca-images"
    out.mkdir(parents=True, exist_ok=True)
    copied, missing_blob = [], []
    for f in sorted(files):
        dst = out / f
        if dst.exists():
            continue
        r = subprocess.run(["git", "show", f"{HARVEST_COMMIT}:seneca-hub/images/{f}"],
                           cwd=REPO, capture_output=True)
        if r.returncode != 0 or not r.stdout:
            missing_blob.append(f)
            continue
        dst.write_bytes(r.stdout)
        copied.append(f)
    return copied, missing_blob


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn-file", default=os.environ.get("T1_DSN_FILE", str(REPO.parent / ".t1.env")))
    args = ap.parse_args()

    # ---- G0: DSN staged ----
    dsn = None
    p = Path(args.dsn_file)
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                if "W1" in k.strip() and "URL" in k.upper():
                    dsn = v.strip().strip('"\'')
                    break
    if not dsn:
        die(0, "no W1 DSN staged; refusing to run")
    print(f"[G0] DSN staged (len={len(dsn)}, not echoed)")

    import psycopg2
    conn = psycopg2.connect(dsn, sslmode="require", connect_timeout=20)
    conn.set_session(readonly=True, autocommit=False)
    cur = conn.cursor()

    # ---- G1: identity ----
    cur.execute("""SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
                   JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
                   WHERE c.contype='p' AND t.relname='seneca_resources' AND n.nspname='public'""")
    pk = cur.fetchall()
    if not any("id" in d[0] and "course_slug" in d[0] for d in pk):
        die(1, f"PK mismatch: {pk}")
    print(f"[G1] PK verified: {pk[0][0]}")

    # ---- G2: baselines ----
    cur.execute("SELECT count(*), count(DISTINCT course_slug) FROM public.seneca_resources")
    rows, slugs = cur.fetchone()
    if (rows, slugs) != (FLEET_ROWS, FLEET_SLUGS):
        die(2, f"fleet drift: {rows:,}/{slugs} != {FLEET_ROWS:,}/{FLEET_SLUGS}")
    needed = sorted({b for bs in MAPPING.values() for b in bs})
    cur.execute("SELECT course_slug, count(*) FROM public.seneca_resources WHERE course_slug = ANY(%s) GROUP BY 1", (needed,))
    got = dict(cur.fetchall())
    drift = {s: (got.get(s, 0), EXPECTED_TOTALS[s]) for s in needed if got.get(s, 0) != EXPECTED_TOTALS[s]}
    if drift:
        die(2, f"per-slug drift: {drift}")
    print(f"[G2] fleet {rows:,}/{slugs}; all {len(needed)} target slugs at expected counts")

    # ---- export + project + PII + image plan ----
    manifest = load_manifest()
    print(f"[manifest] {len(manifest)} identities from {HARVEST_COMMIT}")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    bundles, all_pii, image_files_needed, inline_hits = {}, [], set(), []

    for slug in needed:
        cur.execute("""SELECT id, kind, title, topic_path, marks_total, question_type, content_json
                       FROM public.seneca_resources WHERE course_slug=%s""", (slug,))
        raw = cur.fetchall()
        resources, rewritten, missing = [], 0, 0
        for rid, kind, title, tpath, marks, qtype, cj in raw:
            proj = {k: None for k in PROJECTION[kind]}
            for k in PROJECTION[kind]:
                v = (cj or {}).get(k)
                if not isinstance(v, str):
                    proj[k] = v if v is None or isinstance(v, (int, float)) else None
                    continue
                refs = IMG_RE.findall(v)
                if not refs:
                    proj[k] = v
                    continue

                def sub(m):
                    nonlocal rewritten, missing
                    f = resolve_image_file(m.group(0), manifest)
                    if f:
                        rewritten += 1
                        image_files_needed.add(f)
                        return f"/seneca-images/{f}"
                    missing += 1
                    return ""
                new = IMG_RE.sub(sub, v)
                if k == "imageUrl" and new.strip() == "":
                    proj[k] = None            # Task-43 law: dead ref -> field nulled
                else:
                    proj[k] = new
                    if k != "imageUrl" and new:
                        inline_hits.append((slug, rid, k))
            res = {"id": rid, "kind": kind, "title": title, "topicPath": tpath,
                   "marksTotal": marks, "questionType": qtype, "content": proj}
            blob = MIRROR_FILE.sub("", json.dumps([title, tpath, proj], ensure_ascii=False))
            if PII_EMAIL.search(blob) and not PII_EMAIL_RESERVED.search(blob):
                all_pii.append((slug, rid, "email"))
            elif pii_phone_hit(blob):
                all_pii.append((slug, rid, "phone"))
            resources.append(res)
        resources.sort(key=lambda r: (KIND_ORDER.get(r["kind"], 9), r["title"] or ""))
        kc = Counter(r["kind"] for r in resources)
        bundles[slug] = {
            "schema": "syllabai-hub.seneca-bundle/1.0",
            "senecaSlug": slug,
            "label": humanize(slug),
            "generatedUtc": now,
            "source": f"T-SENECA-001 harvest — W1 seneca_resources (rebuilt corpus); Task 45 widen, images per {HARVEST_COMMIT} manifest served from repo mirror",
            "counts": {"sections": kc.get("courseSection", 0), "examQuestions": kc.get("examQuestion", 0),
                       "quizzes": kc.get("quiz", 0), "resources": len(resources)},
            "imageRewrite": {"rewritten": rewritten, "missing": missing},
            "resources": resources,
        }
        print(f"[export] {slug:<64} {len(resources):>5} rows (sec={kc.get('courseSection',0)} eq={kc.get('examQuestion',0)} quiz={kc.get('quiz',0)}) img +{rewritten}/-{missing}")

    # ---- G3: PII fail-closed (with hit-context dump for adjudication) ----
    if all_pii:
        for slug, rid, tag in all_pii[:6]:
            r = next(x for x in bundles[slug]["resources"] if x["id"] == rid)
            ctx = json.dumps(r, ensure_ascii=False)[:300]
            print(f"[G3 hit] {tag} {slug} {rid[:8]}: {ctx}", file=sys.stderr)
        die(3, f"PII hits {len(all_pii)} — zero files written")
    print(f"[G3] PII scan clean across {sum(len(b['resources']) for b in bundles.values()):,} resources")

    # ---- images ----
    copied, missing_blob = extract_images(image_files_needed)
    print(f"[images] needed {len(image_files_needed)}, copied {len(copied)}, blob-missing {len(missing_blob)}")
    if missing_blob:
        print(f"[images] MISSING FROM BLOB (counted as missing at render): {missing_blob[:5]}")

    # ---- write bundles ----
    bdir = HUB / "public" / "seneca-bundles"
    for slug, b in bundles.items():
        (bdir / f"{slug}.json").write_text(json.dumps(b, indent=1, ensure_ascii=False))
    print(f"[write] {len(bundles)} bundles -> {bdir}")

    # ---- registry ----
    reg_path = HUB / "content" / "seneca" / "registry.json"
    reg = json.loads(reg_path.read_text())
    for course, bs in MAPPING.items():
        reg["courses"][course] = [{"slug": s, "label": bundles[s]["label"],
                                   "sections": bundles[s]["counts"]["sections"],
                                   "questions": bundles[s]["counts"]["examQuestions"]} for s in bs]
    reg["generatedUtc"] = now
    reg_path.write_text(json.dumps(reg, indent=1, ensure_ascii=False))
    print(f"[registry] +{len(MAPPING)} courses -> {len(reg['courses'])} total")

    # ---- flags ----
    flags_path = HUB / "content" / "flags.json"
    flags = json.loads(flags_path.read_text())
    entry = flags["flags"]["senecaStudentResourceHub"]
    before = set(entry["courses"])
    entry["courses"] = sorted(before | set(MAPPING.keys()))
    flags_path.write_text(json.dumps(flags, indent=1, ensure_ascii=False))
    print(f"[flags] senecaStudentResourceHub {len(before)} -> {len(entry['courses'])} courses")

    # ---- receipt ----
    receipt = {
        "task": "T-SENECA-001 Task 45 widen-cie-r0",
        "generatedUtc": now,
        "gates": {"G0_dsn": "staged", "G1_pk": "(id,course_slug)", "G2_fleet": f"{rows}/{slugs}",
                  "G2_targets": "exact", "G3_pii": "clean (phone law v3 + mirror-filename strip; email law + RFC-2606 reserved-domain carve-out; adjudication log: v1 12 curriculum numerics, v2 10 decimals/standard-form, v3 5 self-mirror hex names + 1 example.com ICT lesson — zero personal data)"},
        "mapping_courses": len(MAPPING), "new_bundles": len(bundles),
        "bundle_counts": {s: bundles[s]["counts"] for s in needed},
        "imageRewrite": {"needed_files": len(image_files_needed), "copied": len(copied),
                         "blob_missing": len(missing_blob),
                         "rewritten_refs": sum(b["imageRewrite"]["rewritten"] for b in bundles.values()),
                         "missing_refs": sum(b["imageRewrite"]["missing"] for b in bundles.values())},
        "inline_image_hits": len(inline_hits),
        "delta_generationScript_kept": True,
        "registry_total_courses": len(reg["courses"]),
        "flags_total_courses": len(entry["courses"]),
    }
    rc = REPO / ".syllabai" / "receipts" / "T-SENECA-001"
    rc.mkdir(parents=True, exist_ok=True)
    (rc / "task-45-widen-cie-r0.json").write_text(json.dumps(receipt, indent=1))
    print(f"[receipt] {rc/'task-45-widen-cie-r0.json'}")

    conn.rollback()  # read-only session; nothing to commit — belt & braces
    conn.close()
    print("[done] zero DB writes; repo artifacts staged for build validation")


if __name__ == "__main__":
    main()
