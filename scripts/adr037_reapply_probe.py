#!/usr/bin/env python3
"""
ADR-037 v0.7 re-apply Stage-B2 probe — READ-ONLY live-DB verification
(trace 1a15f8cd84de4909, B2 of the staged per-point lane).

Mirrors the emission law for the deactivate-slice candidate set (base ref +
-pK per option-bearing part + -s when mixed, admission-gated exactly like
scripts/adr037_reapply_census.py) and probes the live corpus DB:

  P1  questions slice (external_ref LIKE 'sme-eq-igcse-chemistry-19-%')
  P2  parts / options / spec joins of the ACTIVE slice
  P3  mark_points: slice part-bound, slice MCQ-direct, total
  P4  history tables (smart_mark_results, answers) — no-FK safety pre-state
  P5  THE INTERSECTION PROBE: live-active refs ∩ v0.7 emittedRefs
      (the deactivate slice — never assumed, always probed)
  P6  sum-invariant baseline (Gate 1 pre-state): 1:1 row.marks == part.marks
  P7  knowledge_nodes SPEC_POINT ground (join ground for validate())
  P8  question_asset count (untouched class of record)

Read-only enforced at session level (default_transaction_read_only).
Credentials: SEED_DATABASE_URL env, inline-only law — never printed.
"""

import json
import os
import sys
from collections import OrderedDict

import psycopg2

BUNDLE = "apps/hub/content/igcse-chemistry-19/questions.json"
COURSE_SLUG = "igcse-chemistry-19"
REF_PREFIX = f"sme-eq-{COURSE_SLUG}-"
COURSE_CODE = "4CH1"

LANE_C = {
    "corpus_rows": 602, "mcq_single": 233, "structured": 369,
    "parts": 1202, "options": 932, "spec_joins_this_apply": 1560,
    "mark_points_total": 1435, "mark_points_part_bound": 1202,
    "mark_points_mcq_direct": 233, "question_asset": 585,
    "spec_point_nodes_4ch1": 182,
}


FNV_OFFSET = 0x811C9DC5
FNV_PRIME = 0x01000193
SME_REF_MAX = 80


def fnv1a_hex8(text: str) -> str:
    h = FNV_OFFSET
    for ch in text:
        h ^= ord(ch)
        h = (h * FNV_PRIME) & 0xFFFFFFFF
    return format(h, "08x")


def member_suffix_reserve(parts) -> int:
    option_parts = sum(
        1 for p in parts if p.get("choices"))
    if option_parts == 0:
        return 0
    plain_parts = len(parts) - option_parts
    mx = max(len(f"-p{i}") for i in range(1, option_parts + 1))
    if plain_parts > 0:
        mx = max(mx, 2)
    return mx


def sme_question_ref(course_slug: str, topic_slug: str, order: int, reserved: int) -> str:
    tail = f"-q{order}"
    head = f"sme-eq-{course_slug}-"
    room = SME_REF_MAX - len(head) - len(tail) - reserved
    if room < 10:
        raise RuntimeError("course-compression branch out of law scope for this probe")
    hash_room = 9
    slug_part = topic_slug
    if len(slug_part) > room - hash_room:
        slug_part = slug_part[: room - hash_room] + "-" + fnv1a_hex8(topic_slug)
    ref = head + slug_part + tail
    if len(ref) > SME_REF_MAX - reserved:
        raise RuntimeError("ref bound violated (unreachable by construction)")
    return ref


def emitted_refs_of_record():
    """Repo-side mirror of the v0.7 emission — BYTE-EXACT shared ref law
    (packages/shared/src/smeRef.ts: smeQuestionRef + smeMemberSuffixReserve),
    per-set admission gates (bundle-questions.ts:263-299) + the package-global
    seenRefs uniqueness law (bundle-questions.ts:316-319)."""
    with open(BUNDLE, "r", encoding="utf-8") as fh:
        sets = json.load(fh)
    refs, admitted = [], 0
    dup_package_refs = {}
    for s in sets:
        topic_slug = s.get("topicSlug") or ""
        orders = set()
        for q in s.get("questions", []):
            parts = q.get("parts") or []
            if not any(p.get("specPointCodes") for p in parts):
                continue
            if sum(p.get("marks", 0) for p in parts) != q.get("totalMarks"):
                continue
            if q.get("order") in orders:
                continue
            orders.add(q.get("order"))
            admitted += 1
            reserved = member_suffix_reserve(parts)
            base = sme_question_ref(COURSE_SLUG, topic_slug, q.get("order"), reserved)
            dup_package_refs[base] = dup_package_refs.get(base, 0) + 1
            refs.append(base)
            p_idx = 0
            has_plain = False
            for p in parts:
                if p.get("choices"):
                    p_idx += 1
                    refs.append(f"{base}-p{p_idx}")
                else:
                    has_plain = True
            if p_idx > 0 and has_plain:
                refs.append(f"{base}-s")
    collisions = {k: v for k, v in dup_package_refs.items() if v > 1}
    return refs, admitted, collisions


def main() -> int:
    uri = os.environ.get("SEED_DATABASE_URL")
    if not uri:
        print("SEED_DATABASE_URL missing (inline env only — never printed)")
        return 2

    refs, admitted, collisions = emitted_refs_of_record()
    conn = psycopg2.connect(uri)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor()
    out = OrderedDict(
        probe="adr037-v07-reapply-stage-b2",
        readonly_session=True,
        emitted_refs_repo=len(refs),
        emitted_refs_repo_distinct=len(set(refs)),
        admitted_repo=admitted,
        package_ref_collisions=len(collisions),
        package_ref_collision_sample=sorted(collisions.items(), key=lambda kv: -kv[1])[:12],
    )

    cur.execute("SELECT current_setting('transaction_read_only')")
    out["session_read_only"] = cur.fetchone()[0]

    # ── P1 questions slice ────────────────────────────────────────────────
    cur.execute(
        "SELECT count(*), count(DISTINCT external_ref) FROM questions "
        "WHERE external_ref LIKE %s AND active", (REF_PREFIX + "%",))
    act, adist = cur.fetchone()
    cur.execute(
        "SELECT count(*), count(DISTINCT external_ref) FROM questions "
        "WHERE external_ref LIKE %s", (REF_PREFIX + "%",))
    tot, tdist = cur.fetchone()
    cur.execute(
        "SELECT question_type, count(*) FROM questions "
        "WHERE external_ref LIKE %s AND active GROUP BY question_type",
        (REF_PREFIX + "%",))
    by_type = dict(cur.fetchall())
    out["p1_questions_active"] = act
    out["p1_questions_active_distinct_refs"] = adist
    out["p1_questions_total_incl_inactive"] = tot
    out["p1_questions_by_type_active"] = by_type

    # ── P2 parts / options / joins of ACTIVE slice ────────────────────────
    cur.execute(
        "SELECT count(*) FROM question_parts qp "
        "JOIN question_versions qv ON qp.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active",
        (REF_PREFIX + "%",))
    out["p2_parts_active_slice"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM question_options qo "
        "JOIN questions q ON qo.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active",
        (REF_PREFIX + "%",))
    out["p2_options_active_slice"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM question_spec_points qsp "
        "JOIN questions q ON qsp.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active",
        (REF_PREFIX + "%",))
    out["p2_spec_joins_active_slice"] = cur.fetchone()[0]

    # ── P3 mark_points ────────────────────────────────────────────────────
    cur.execute("SELECT count(*) FROM mark_points")
    out["p3_mark_points_total_all_time"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN question_parts qp ON mp.question_part_id = qp.id "
        "JOIN question_versions qv ON qp.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active",
        (REF_PREFIX + "%",))
    out["p3_mark_points_part_bound_active_slice"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN mark_schemes ms ON mp.mark_scheme_id = ms.id "
        "JOIN question_versions qv ON ms.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active AND mp.question_part_id IS NULL",
        (REF_PREFIX + "%",))
    out["p3_mark_points_mcq_direct_active_slice"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN mark_schemes ms ON mp.mark_scheme_id = ms.id "
        "JOIN question_versions qv ON ms.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active",
        (REF_PREFIX + "%",))
    out["p3_mark_points_active_slice_total"] = cur.fetchone()[0]

    # ── P4 history (no-FK safety pre-state) ───────────────────────────────
    cur.execute("SELECT count(*) FROM smart_mark_results")
    out["p4_smart_mark_results"] = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM answers")
    out["p4_answers"] = cur.fetchone()[0]

    # ── P5 THE INTERSECTION PROBE ─────────────────────────────────────────
    cur.execute(
        "SELECT DISTINCT external_ref FROM questions "
        "WHERE external_ref LIKE %s AND active", (REF_PREFIX + "%",))
    live_refs = {r[0] for r in cur.fetchall()}
    live_all = set(live_refs)
    emitted = set(refs)
    out["p5_live_active_refs"] = len(live_refs)
    out["p5_emitted_refs_repo"] = len(emitted)
    out["p5_deactivate_slice_intersection"] = len(live_refs & emitted)
    out["p5_live_active_not_reemitted_survivors"] = len(live_refs - emitted)
    out["p5_emitted_not_live_new"] = len(emitted - live_refs)
    out["p5_survivor_refs_sample"] = sorted(live_refs - emitted)[:10]

    # ── P6 sum-invariant baseline (Gate 1 pre-state) ──────────────────────
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN question_parts qp ON mp.question_part_id = qp.id "
        "JOIN question_versions qv ON qp.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active AND mp.marks <> qp.marks",
        (REF_PREFIX + "%",))
    out["p6_wholeblock_marks_drift_rows"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM ("
        "  SELECT qp.id FROM question_parts qp "
        "  JOIN question_versions qv ON qp.question_version_id = qv.id "
        "  JOIN questions q ON qv.question_id = q.id "
        "  LEFT JOIN mark_points mp ON mp.question_part_id = qp.id "
        "  WHERE q.external_ref LIKE %s AND q.active "
        "  GROUP BY qp.id HAVING count(mp.id) <> 1) t",
        (REF_PREFIX + "%",))
    out["p6_parts_violating_1to1_live"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN mark_schemes ms ON mp.mark_scheme_id = ms.id "
        "JOIN question_versions qv ON ms.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active AND mp.question_part_id IS NULL "
        "AND mp.marks <> q.marks",
        (REF_PREFIX + "%",))
    out["p6_mcq_direct_marks_mismatch"] = cur.fetchone()[0]

    # ── P7 knowledge_nodes ground ─────────────────────────────────────────
    cur.execute(
        "SELECT count(*) FROM knowledge_nodes "
        "WHERE node_type = 'SPEC_POINT' AND code LIKE %s", (COURSE_CODE + "%",))
    out["p7_spec_point_nodes_4ch1"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(DISTINCT qsp.spec_point_node_id) FROM question_spec_points qsp "
        "JOIN questions q ON qsp.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (REF_PREFIX + "%",))
    out["p7_distinct_nodes_joined_by_slice"] = cur.fetchone()[0]

    # ── P8 untouched class ────────────────────────────────────────────────
    cur.execute("SELECT count(*) FROM question_asset")
    out["p8_question_asset"] = cur.fetchone()[0]

    out["lane_c_of_record"] = LANE_C
    print(json.dumps(out, indent=2))
    with open("scripts/adr037_reapply_probe_result.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
