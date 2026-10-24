#!/usr/bin/env python3
"""
T-SENECA-001 rollout wave — import the Seneca Resource Hub harvest for ALL
mapped hub courses into the sci-chem warehouse (W1 interim home), wh-v3 shape.

Operator rulings of record (trace 1a16fa6c496aa371):
  1. PLACEMENT (a): W1 (ep-calm-queen) stays the INTERIM home for every
     course group's Seneca pack; dedicated course-group warehouses later.
  2. IAL: Edexcel IAL courses map to Seneca "International A Level" content
     (level tag of record). Where a subject has NO IAL-tagged rows (Maths),
     the closest equivalent is the Edexcel A Level (UK) family — documented
     in the receipt; Decision 1 has no equivalent and stays honestly empty.
  3. VARIANTS: booster/revision/Predicted-Papers/HyperLearning families are
     INCLUDED per course (the whole matching group, not just the core course).

SHAPE (wh-v3): seneca_resources PK (id, course_slug) — a resource that serves
several hub courses is materialized once PER COURSE (the (resource, course)
pair is the unit). The API module needs NO change (D5/library queries keep
their exact semantics). DDL of record:
  scripts/provisioner/wh-v3-fragment-seneca-resources-multi-course.sql

Linking law (plan D3, extended D10): rules below name hub slugs that MUST
exist in apps/hub/content/courses.json AND in the LIVE main course_registry —
the run refuses otherwise (fail-closed; never invent a slug). Rows matching
no rule are skipped (the hub has no UK-GCSE courses — receipt counts them).

PII law: every row re-checked before insert; any leak aborts the run (S11).

Idempotence: upsert by (id, course_slug); the wh-v3 swap runs only when the
live PK is still (id) — re-runs converge.

Usage:
  python3 scripts/rollout_import_seneca_v3.py --corpus <resource-hub-content> --dry-run
  SYLLABAI_WAREHOUSE_URL_SCI_CHEM=… MAIN_DATABASE_URL=… \
  python3 scripts/rollout_import_seneca_v3.py --corpus <resource-hub-content>
"""
import argparse
import gzip
import glob
import json
import os
import sys

PII_KEYS = ("creatorName", "creatorId", "schoolId", "schoolGroupId")

# ── board/level predicates (the tag taxonomy of the harvest) ────────────────

def p_edx_igcse(boards, levels):
    return "Edexcel iGCSE" in boards or ("Edexcel" in boards and "iGCSE" in levels)

def p_cie_igcse(boards, levels):
    return bool({"Cambridge International", "CIE"} & boards) and "iGCSE" in levels

def p_cie_alevel(boards, levels):
    return bool({"Cambridge International", "CIE"} & boards) and bool(
        {"A Level", "AS Level"} & levels)

def p_ial(boards, levels):
    return "International A Level" in levels

def p_edx_al_uk(boards, levels):
    return "Edexcel" in boards and "A Level" in levels

PRED = {
    "EDX_IGCSE": p_edx_igcse,
    "CIE_IGCSE": p_cie_igcse,
    "CIE_ALEVEL": p_cie_alevel,
    "IAL": p_ial,
    "EDX_AL_UK": p_edx_al_uk,
}

ICT_SLICES = ["ICT", "Information Technology", "Information and Communication Technology"]
LIT_SLICES = ["English Literature", "English Literature - Quotations"]

def R(subject_files, pred, tier=None, combined=None, bc_exclude=None, bc_require=None):
    """One rule: subject slices + board/level predicate + refinements.
    tier: None | 'Foundation' | 'Higher' | 'BOTH'  (row tier tag gating)
    combined: None | True | False  (Triple/Combined tag gating)
    bc_exclude/bc_require: EQ breadcrumb-root prefix lists."""
    return {"subject_files": subject_files, "pred": pred, "tier": tier,
            "combined": combined, "bc_exclude": bc_exclude or [],
            "bc_require": bc_require or []}

# ── the rule table of record (hub slug → matching rules) ────────────────────
# Unmapped hub courses (honest empty state, receipt-documented): all
# Accounting (4AC1/0452/9706), Environmental Management (0680/8291), Further
# Maths (4PM1/0606/YFM01), Maths B (4MB1), IAL Maths Decision 1.

DOUBLE_AWARD = "Science (Double Award)"

RULES = {
    # ── Edexcel IGCSE Chemistry 4CH1 + 2024 modular units ──────────────────
    "igcse-chemistry-19": [R(["Chemistry"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-chemistry-modular-24-unit-1": [R(["Chemistry"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-chemistry-modular-24-unit-2": [R(["Chemistry"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    # ── Edexcel IGCSE Science (Double Award) 4SD0 chemistry components ─────
    "igcse-science-double-award-17-chemistry": [
        R(["Chemistry"], "EDX_IGCSE", combined=True),
        R(["Chemistry"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    "igcse-science-double-award-modular-24-chemistry-unit-1": [
        R(["Chemistry"], "EDX_IGCSE", combined=True),
        R(["Chemistry"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    "igcse-science-double-award-modular-24-chemistry-unit-2": [
        R(["Chemistry"], "EDX_IGCSE", combined=True),
        R(["Chemistry"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    # ── Edexcel IGCSE Biology 4BI1 ─────────────────────────────────────────
    "igcse-biology-19": [R(["Biology"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-biology-modular-24-unit-1": [R(["Biology"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-biology-modular-24-unit-2": [R(["Biology"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-science-double-award-17-biology": [
        R(["Biology"], "EDX_IGCSE", combined=True),
        R(["Biology"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    "igcse-science-double-award-modular-24-biology-unit-1": [
        R(["Biology"], "EDX_IGCSE", combined=True),
        R(["Biology"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    "igcse-science-double-award-modular-24-biology-unit-2": [
        R(["Biology"], "EDX_IGCSE", combined=True),
        R(["Biology"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    # ── Edexcel IGCSE Physics 4PH1 ─────────────────────────────────────────
    "igcse-physics-19": [R(["Physics"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-physics-modular-24-unit-1": [R(["Physics"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-physics-modular-24-unit-2": [R(["Physics"], "EDX_IGCSE", combined=False, bc_exclude=[DOUBLE_AWARD])],
    "igcse-science-double-award-17-physics": [
        R(["Physics"], "EDX_IGCSE", combined=True),
        R(["Physics"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    "igcse-science-double-award-modular-24-physics-unit-1": [
        R(["Physics"], "EDX_IGCSE", combined=True),
        R(["Physics"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    "igcse-science-double-award-modular-24-physics-unit-2": [
        R(["Physics"], "EDX_IGCSE", combined=True),
        R(["Physics"], "EDX_IGCSE", bc_require=[DOUBLE_AWARD]),
        R(["Science"], "EDX_IGCSE"),
    ],
    # ── Edexcel IGCSE Maths A 4MA1 (tier-split; untagged rows serve both) ──
    "igcse-maths-a-18-foundation": [R(["Maths"], "EDX_IGCSE", tier="BOTH_F")],
    "igcse-maths-a-18-higher": [R(["Maths"], "EDX_IGCSE", tier="BOTH_H")],
    "igcse-maths-a-modular-24-foundation-unit-1": [R(["Maths"], "EDX_IGCSE", tier="BOTH_F")],
    "igcse-maths-a-modular-24-foundation-unit-2": [R(["Maths"], "EDX_IGCSE", tier="BOTH_F")],
    "igcse-maths-a-modular-24-higher-unit-1": [R(["Maths"], "EDX_IGCSE", tier="BOTH_H")],
    "igcse-maths-a-modular-24-higher-unit-2": [R(["Maths"], "EDX_IGCSE", tier="BOTH_H")],
    # ── Edexcel IGCSE the rest ─────────────────────────────────────────────
    "igcse-economics-17": [R(["Economics"], "EDX_IGCSE")],
    "igcse-english-language-a-16-paper-1-non-fiction-texts-and-transactional-writing": [R(["English Language"], "EDX_IGCSE")],
    "igcse-english-language-a-16-paper-2-poetry-and-prose-texts-and-imaginative-writing": [R(["English Language"], "EDX_IGCSE")],
    "igcse-english-language-a-16-paper-3-coursework": [R(["English Language"], "EDX_IGCSE")],
    "igcse-english-literature-16": [R(LIT_SLICES, "EDX_IGCSE")],
    "igcse-geography-19": [R(["Geography"], "EDX_IGCSE")],
    "igcse-business-19": [R(["Business"], "EDX_IGCSE")],
    "igcse-ict-17": [R(ICT_SLICES, "EDX_IGCSE")],
    # ── CIE IGCSE ──────────────────────────────────────────────────────────
    "cie-igcse-chemistry-23": [R(["Chemistry"], "CIE_IGCSE")],
    "cie-igcse-biology-23": [R(["Biology"], "CIE_IGCSE")],
    "cie-igcse-physics-23": [R(["Physics"], "CIE_IGCSE")],
    "cie-igcse-maths-25-core": [R(["Maths"], "CIE_IGCSE", tier="BOTH_F")],
    "cie-igcse-maths-25-extended": [R(["Maths"], "CIE_IGCSE", tier="BOTH_H")],
    "cie-igcse-maths-international-maths-23-core": [R(["Maths"], "CIE_IGCSE", tier="BOTH_F")],
    "cie-igcse-maths-international-maths-23-extended": [R(["Maths"], "CIE_IGCSE", tier="BOTH_H")],
    "cie-igcse-science-combined-science-23-biology": [R(["Science", "Co-ordinated Science"], "CIE_IGCSE")],
    "cie-igcse-science-combined-science-23-chemistry": [R(["Science", "Co-ordinated Science"], "CIE_IGCSE")],
    "cie-igcse-science-combined-science-23-physics": [R(["Science", "Co-ordinated Science"], "CIE_IGCSE")],
    "cie-igcse-science-co-ordinated-sciences-double-award-23-biology": [R(["Science", "Co-ordinated Science"], "CIE_IGCSE")],
    "cie-igcse-science-co-ordinated-sciences-double-award-23-chemistry": [R(["Science", "Co-ordinated Science"], "CIE_IGCSE")],
    "cie-igcse-science-co-ordinated-sciences-double-award-23-physics": [R(["Science", "Co-ordinated Science"], "CIE_IGCSE")],
    "cie-igcse-english-language-20": [R(["English Language"], "CIE_IGCSE")],
    "cie-igcse-english-language-25": [R(["English Language"], "CIE_IGCSE")],
    "cie-igcse-english-literature-21": [R(LIT_SLICES, "CIE_IGCSE")],
    "cie-igcse-history-18": [R(["History"], "CIE_IGCSE")],
    "cie-igcse-geography-20": [R(["Geography"], "CIE_IGCSE")],
    "cie-igcse-geography-25": [R(["Geography"], "CIE_IGCSE")],
    "cie-igcse-economics-20": [R(["Economics"], "CIE_IGCSE")],
    "cie-igcse-economics-25": [R(["Economics"], "CIE_IGCSE")],
    "cie-igcse-business-23": [R(["Business"], "CIE_IGCSE")],
    "cie-igcse-business-25": [R(["Business"], "CIE_IGCSE")],
    "cie-igcse-religious-studies-23": [R(["Religious Studies"], "CIE_IGCSE")],
    "cie-igcse-ict-21": [R(ICT_SLICES, "CIE_IGCSE")],
    "cie-igcse-computer-science-23": [R(["Computer Science"], "CIE_IGCSE")],
    # ── CIE A-Level / AS ───────────────────────────────────────────────────
    "cie-a-level-biology-25": [R(["Biology"], "CIE_ALEVEL")],
    "cie-a-level-chemistry-25": [R(["Chemistry"], "CIE_ALEVEL")],
    "cie-a-level-physics-25": [R(["Physics"], "CIE_ALEVEL")],
    "cie-a-level-maths-20-pure-1": [R(["Maths"], "CIE_ALEVEL")],
    "cie-a-level-maths-20-pure-2": [R(["Maths"], "CIE_ALEVEL")],
    "cie-a-level-maths-20-pure-3": [R(["Maths"], "CIE_ALEVEL")],
    "cie-a-level-maths-20-mechanics": [R(["Maths"], "CIE_ALEVEL")],
    "cie-a-level-maths-20-probability-and-statistics-1": [R(["Maths"], "CIE_ALEVEL")],
    "cie-a-level-maths-20-probability-and-statistics-2": [R(["Maths"], "CIE_ALEVEL")],
    "cie-a-level-business-23": [R(["Business"], "CIE_ALEVEL")],
    "cie-a-level-economics-23": [R(["Economics"], "CIE_ALEVEL")],
    "cie-a-level-computer-science-19": [R(["Computer Science"], "CIE_ALEVEL")],
    "cie-as-english-general-paper-21": [R(["English", "English Language"], "CIE_ALEVEL"),
                                        R(["English", "English Language"], "CIE_IGCSE")],
    # ── Edexcel IAL (ruling 2: Seneca "International A Level") ─────────────
    "ial-biology-18": [R(["Biology"], "IAL")],
    "ial-chemistry-17": [R(["Chemistry"], "IAL")],
    "ial-physics-19": [R(["Physics"], "IAL")],
    # Maths: no IAL-tagged rows exist in the harvest → closest equivalent is
    # the Edexcel A Level (UK) family (receipt-documented). Decision 1: none.
    "ial-maths-20-pure-1": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-pure-2": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-pure-3": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-pure-4": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-mechanics-1": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-mechanics-2": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-statistics-1": [R(["Maths"], "EDX_AL_UK")],
    "ial-maths-20-statistics-2": [R(["Maths"], "EDX_AL_UK")],
}

# ── row extraction (byte-identical to the of-record importer's shapes) ──────

def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def pii_leak(blob: str) -> bool:
    return any(k in blob for k in PII_KEYS)


def row_from_section(d, slug):
    c = d.get("content") or {}
    return {
        "id": d["id"], "course_slug": slug, "kind": "courseSection",
        "title": clean(d.get("title")), "topic_path": None,
        "marks_total": None, "question_type": None,
        "content_json": {
            "description": clean(c.get("description")),
            "topicNotes": clean(c.get("topicNotes")),
            "imageUrl": clean(c.get("imageUrl") or c.get("previewUrl") or c.get("contentUrl")),
        },
    }


def row_from_eq(d, slug):
    c = d.get("content") or {}
    crumbs = [x.strip() for x in (c.get("topicBreadcrumbs") or []) if x.strip()]
    topic = crumbs[0] if crumbs else None
    return {
        "id": d["id"], "course_slug": slug, "kind": "examQuestion",
        "title": clean(d.get("title")), "topic_path": clean(topic),
        "marks_total": d.get("marksTotal"), "question_type": clean(d.get("questionType")),
        "content_json": {
            "questionTitleMd": clean(c.get("questionTitleMd")),
            "markScheme": clean(c.get("markScheme")),
            "generationScript": clean(c.get("generationScript")),
        },
    }


def row_from_quiz(d, slug):
    c = d.get("content") or {}
    return {
        "id": d["id"], "course_slug": slug, "kind": "quiz",
        "title": clean(d.get("title")), "topic_path": None,
        "marks_total": None, "question_type": None,
        "content_json": {
            "quizSummary": clean(c.get("quizSummary") or d.get("quizSummary")),
            "access": clean(d.get("access")),
            "isPublic": d.get("isPublic"),
            "saveCount": d.get("saveCount"),
        },
    }


ROW_FN = {"courseSection": row_from_section, "examQuestion": row_from_eq, "quiz": row_from_quiz}


def match_row(d, subject_file, boards, levels, tier_set, combined_set, bc_root):
    """Return the hub slugs this row serves."""
    hits = []
    for slug, rules in RULES.items():
        for r in rules:
            if subject_file not in r["subject_files"]:
                continue
            if not PRED[r["pred"]](boards, levels):
                continue
            if r["tier"] == "Foundation" and "Foundation" not in tier_set:
                continue
            if r["tier"] == "Higher" and "Higher" not in tier_set:
                continue
            if r["tier"] == "BOTH_F" and tier_set and "Foundation" not in tier_set:
                continue  # tagged rows must carry the tier; untagged pass
            if r["tier"] == "BOTH_H" and tier_set and "Higher" not in tier_set:
                continue
            if r["combined"] is True and "Combined" not in combined_set:
                continue
            if r["combined"] is False and "Combined" in combined_set:
                continue
            if r["bc_require"] and not any(bc_root and bc_root.startswith(p) for p in r["bc_require"]):
                continue
            if r["bc_exclude"] and bc_root and any(bc_root.startswith(p) for p in r["bc_exclude"]):
                continue
            hits.append(slug)
            break  # one matching rule per course is enough
    return hits


def load_t1_env():
    env = {}
    for line in open("/home/z/my-project/work/seneca-recon/.t1.env"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            env[k] = v
    return env


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--repo-root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--warehouse-url", default=os.environ.get("SYLLABAI_WAREHOUSE_URL_SCI_CHEM"))
    ap.add_argument("--main-url", default=os.environ.get("MAIN_DATABASE_URL"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    # ── fail-closed slug validation: courses.json AND live registry ─────────
    courses = json.load(open(os.path.join(args.repo_root, "apps/hub/content/courses.json")))["courses"]
    registry = {c["slug"] for c in courses}
    unknown = sorted(set(RULES) - registry)
    if unknown:
        sys.exit(f"BLOCKED: rule slugs not in courses.json: {unknown}")
    print(f"rule slugs valid vs courses.json: {len(RULES)} mapped courses "
          f"(of {len(registry)} registered; {len(registry) - len(RULES)} honestly unmapped)")

    env = load_t1_env()
    wh_url = args.warehouse_url or env.get("W1_URL")
    main_url = args.main_url or env.get("MAIN_URL")

    # ── stream the slices; classify; collect instances ──────────────────────
    BOARD_L = {"edexcel", "edexcel igcse", "cambridge international", "cie", "aqa", "ocr", "wjec", "eduqas", "ib"}
    LEVEL_L = {"gcse", "igcse", "a level", "as level", "international a level", "ks3", "higher", "foundation"}

    instances = {}   # (id, slug) -> row
    rows_by_id = {}  # id -> row (dedup; identical content per slug)
    skipped = 0
    for path in sorted(glob.glob(os.path.join(args.corpus, "by-subject", "*.jsonl.gz"))):
        subject_file = os.path.basename(path).replace(".jsonl.gz", "").replace("_", " ")
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                kind = d.get("type")
                if kind not in ROW_FN or not d.get("id"):
                    continue
                boards, levels, tiers, combined = set(), set(), set(), set()
                bc_root = None
                c = d.get("content") or {}
                crumbs = c.get("topicBreadcrumbs") or []
                if crumbs and crumbs[0].strip():
                    bc_root = crumbs[0].strip()
                for g in (d.get("tags") or {}).values():
                    for t in g:
                        v = (t or {}).get("value")
                        if not v:
                            continue
                        lv = v.strip().lower()
                        if lv in BOARD_L:
                            boards.add(v.strip())
                        elif lv in LEVEL_L:
                            levels.add(v.strip())
                        if v.strip() in ("Foundation", "Higher"):
                            tiers.add(v.strip())
                        if v.strip() in ("Triple", "Combined"):
                            combined.add(v.strip())
                hits = match_row(d, subject_file, boards, levels, tiers, combined, bc_root)
                if not hits:
                    skipped += 1
                    continue
                for slug in hits:
                    key = (d["id"], slug)
                    if key in instances:
                        continue
                    if d["id"] not in rows_by_id:
                        rows_by_id[d["id"]] = (kind, d)
                    instances[key] = None  # placeholder; row built at emit
    print(f"stream done: {len(instances)} (resource, course) instances | "
          f"{len(rows_by_id)} distinct resources | {skipped} rows matched no hub course (skipped)")

    # ── build rows + the PII gate (every instance) ──────────────────────────
    batch = []
    for (rid, slug) in instances:
        kind, d = rows_by_id[rid]
        row = ROW_FN[kind](d, slug)
        blob = json.dumps(row)
        if pii_leak(blob):
            sys.exit(f"BLOCKED: PII keys detected in resource {rid} (the S11 scrub law)")
        batch.append(row)

    census = {}
    per_course = {}
    for row in batch:
        census[row["kind"]] = census.get(row["kind"], 0) + 1
        pc = per_course.setdefault(row["course_slug"], {"courseSection": 0, "examQuestion": 0, "quiz": 0})
        pc[row["kind"]] += 1
    print("census (instances):", census, "total:", len(batch))
    for slug in sorted(per_course):
        pc = per_course[slug]
        print(f"  {slug:<70} sect={pc['courseSection']:>5} eq={pc['examQuestion']:>5} quiz={pc['quiz']:>5}")

    if args.dry_run:
        print("dry-run — no DB contact")
        return

    # ── real run ────────────────────────────────────────────────────────────
    if not wh_url or not main_url:
        sys.exit("BLOCKED: warehouse/main URLs not set (env or .t1.env fallback)")
    import psycopg2
    import psycopg2.extras

    wh = psycopg2.connect(wh_url, sslmode="require", connect_timeout=15)
    main_conn = psycopg2.connect(main_url, sslmode="require", connect_timeout=15)
    main_conn.autocommit = True
    wh.autocommit = False
    try:
        with main_conn.cursor() as cur:
            cur.execute("SELECT course_slug FROM course_registry WHERE course_slug = ANY(%s::text[])",
                        (sorted(RULES),))
            live = {r[0] for r in cur.fetchall()}
            missing = sorted(set(RULES) - live)
            if missing:
                sys.exit(f"BLOCKED: course_registry has no rows for {missing}")
            print(f"live course_registry anchor OK: {len(live)}/{len(RULES)} slugs")

        with wh.cursor() as cur:
            cur.execute("SELECT to_regclass('public.seneca_resources')")
            if cur.fetchone()[0] is None:
                sys.exit("BLOCKED: seneca_resources missing (template owns the DDL)")
            cur.execute("""
                SELECT a.attname, bool_or(ix.indisprimary)
                FROM pg_index ix JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
                WHERE ix.indrelid = 'public.seneca_resources'::regclass AND ix.indisprimary
                GROUP BY a.attname ORDER BY a.attname
            """)
            pk_cols = [r[0] for r in cur.fetchall() if r[1]]
            cur.execute("SELECT count(*) FROM seneca_resources")
            pre_count = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM warehouse_chunks")
            chunks = cur.fetchone()[0]
            cur.execute("SELECT key, value FROM warehouse_meta ORDER BY key")
            meta = dict(cur.fetchall())
            print(f"pre-swap: PK={pk_cols} rows={pre_count} chunks={chunks} meta_keys={sorted(meta)}")
            # pilot fingerprint of record (the carried rows): (id, kind) per slug
            cur.execute("SELECT id, kind, course_slug FROM seneca_resources")
            pilot = {}
            for rid, kind, slug in cur.fetchall():
                pilot.setdefault(slug, {}).setdefault(kind, set()).add(rid)

        swapped = False
        cur = wh.cursor()
        if pk_cols == ["id"]:
            # ── the wh-v3 atomic swap (fragment of record, one transaction) ─
            frag = open(os.path.join(args.repo_root,
                        "scripts/provisioner/wh-v3-fragment-seneca-resources-multi-course.sql")).read()
            # strip comment lines GLOBALLY first (a ';' inside a comment must
            # never split a statement), then split on ';'
            frag = "\n".join(l for l in frag.splitlines() if not l.strip().startswith("--"))
            stmts = [c.strip() for c in frag.split(";") if c.strip()]
            # apply the CREATE TABLE now; the indexes come AFTER the rename
            # (the old table owns the ix_seneca_resources_* names until DROP)
            index_stmts = [s for s in stmts if s.upper().startswith("CREATE INDEX")]
            for s in stmts:
                if not s.upper().startswith("CREATE INDEX"):
                    cur.execute(s)
            cur.execute("""
                INSERT INTO seneca_resources_v3
                    (id, course_slug, kind, title, topic_path, marks_total, question_type, content_json, created_at)
                SELECT id, course_slug, kind, title, topic_path, marks_total, question_type, content_json, created_at
                FROM seneca_resources
            """)
            cur.execute("SELECT count(*) FROM seneca_resources_v3")
            carried = cur.fetchone()[0]
            if carried != pre_count:
                raise RuntimeError(f"swap parity FAIL: carried {carried} != pre {pre_count}")
            cur.execute("DROP TABLE seneca_resources")
            cur.execute("ALTER TABLE seneca_resources_v3 RENAME TO seneca_resources")
            # the fragment names the v3 table; post-rename the final name applies
            for s in index_stmts:
                cur.execute(s.replace("seneca_resources_v3", "seneca_resources"))
            # meta flip of record (the run-006 same-tx precedent)
            cur.execute("UPDATE warehouse_meta SET value = 'wh-v3' WHERE key = 'template_version'")
            swapped = True
            print(f"wh-v3 swap: carried {carried} pilot rows; template_version -> wh-v3")

        UPSERT = """
            INSERT INTO seneca_resources
              (id, course_slug, kind, title, topic_path, marks_total, question_type, content_json)
            VALUES (%(id)s, %(course_slug)s, %(kind)s, %(title)s, %(topic_path)s,
                    %(marks_total)s, %(question_type)s, %(content_json)s::jsonb)
            ON CONFLICT (id, course_slug) DO UPDATE SET
              kind = EXCLUDED.kind, title = EXCLUDED.title, topic_path = EXCLUDED.topic_path,
              marks_total = EXCLUDED.marks_total, question_type = EXCLUDED.question_type,
              content_json = EXCLUDED.content_json
        """
        payload = [{**r, "content_json": psycopg2.extras.Json(r["content_json"])} for r in batch]
        for i in range(0, len(payload), 500):
            psycopg2.extras.execute_batch(cur, UPSERT, payload[i:i + 500], page_size=100)
        wh.commit()
        print(f"imported {len(batch)} (resource, course) instances (swapped={swapped})")

        # ── post-parity (UNION semantics: census ∪ carried pilot rows) ──────
        census_ids = {}
        for row in batch:
            census_ids.setdefault(row["course_slug"], {}).setdefault(row["kind"], set()).add(row["id"])
        expected = {}
        for slug in set(list(per_course) + list(pilot)):
            for kind in ("courseSection", "examQuestion", "quiz"):
                e = len(census_ids.get(slug, {}).get(kind, set())
                        | pilot.get(slug, {}).get(kind, set()))
                if e:
                    expected[(slug, kind)] = e
        cur.execute("SELECT course_slug, kind, count(*) FROM seneca_resources GROUP BY 1, 2")
        got = {(s, k): n for s, k, n in cur.fetchall()}
        mismatches = {k: (got.get(k, 0), v) for k, v in expected.items() if got.get(k, 0) != v}
        if mismatches:
            for k, (g, e) in list(mismatches.items())[:8]:
                print(f"  MISMATCH {k}: got={g} expected={e}")
            raise RuntimeError(f"post-parity FAIL: {len(mismatches)} mismatched (slug,kind) cells")
        cur.execute("SELECT count(*), count(distinct id) FROM seneca_resources")
        total_rows, distinct_ids = cur.fetchone()
        cur.execute("SELECT count(*) FROM warehouse_chunks")
        chunks_post = cur.fetchone()[0]
        cur.execute("SELECT key, value FROM warehouse_meta ORDER BY key")
        meta_post = dict(cur.fetchall())
        # PII rescan in-DB
        cur.execute("""
            SELECT count(*) FROM seneca_resources WHERE
              content_json::text LIKE '%creatorName%' OR content_json::text LIKE '%creatorId%'
              OR content_json::text LIKE '%schoolId%' OR content_json::text LIKE '%schoolGroupId%'
              OR title LIKE '%creatorName%' OR title LIKE '%schoolId%'
        """)
        pii_hits = cur.fetchone()[0]
        if pii_hits:
            raise RuntimeError(f"PII rescan FAIL: {pii_hits}")
        if chunks_post != chunks:
            raise RuntimeError(f"maths plane FAIL: chunks {chunks} -> {chunks_post}")
        print(f"post-parity PASS: total={total_rows} distinct_ids={distinct_ids} "
              f"chunks={chunks_post} (unchanged) meta={meta_post} pii=0")
    finally:
        wh.close()
        main_conn.close()


if __name__ == "__main__":
    main()
