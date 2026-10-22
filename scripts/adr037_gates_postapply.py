#!/usr/bin/env python3
"""
ADR-037 B3 post-apply GATES 1-5 — READ-ONLY live-DB verification of the
committed per-point replace (run 39708335185 of record).

  G1  sum-invariant post-state: every ACTIVE slice part obeys the selection
      law — multi-row (per-point) parts sum EXACTLY to part.marks, single-row
      (whole-block) parts equal part.marks, MCQ-direct rows equal q.marks
  G2  EXACT-vs-summary: live active-slice counts == the apply summary
      {parts 2635, options 1260, markPoints 3907, joins 2917} + the 11
      survivors' contribution (computed directly, never assumed); corpus
      rows == census 958 + 11; deactivated inactive rows == 591
  G3  the per-point law shape: the active slice carries BOTH laws side by
      side — per-point multi-row parts exist and sum exactly; whole-block
      1:1 parts remain exactly 1 row; no part has 0 rows
  G4  survivors intact: the 11 old-law refs still ACTIVE with their
      mark_points/parts/options present (the zero-deletion proof)
  G5  untouched classes: smart_mark_results 368, answers 655,
      question_asset 585, knowledge_nodes 4CH1 SPEC_POINT 182

Read-only enforced at session level. SEED_DATABASE_URL inline-only.
"""

import json
import os
import sys
from collections import OrderedDict

import psycopg2

REF_PREFIX = "sme-eq-igcse-chemistry-19-"
SURVIVOR_LIKE = REF_PREFIX + "official-past-papers-%"
APPLY_SUMMARY = {
    "questions": 803, "structured": 803, "parts": 2635, "options": 1260,
    "markPoints": 3907, "specPointMappings": 2917, "assets": 0,
    "deactivated": 591,
}
CENSUS = {
    "corpus_rows": 958, "structured_rows": 643, "mcq_rows": 315,
    "mark_point_rows": 3907, "per_point_rows": 2414, "partless_rows": 315,
    "whole_block_rows": 1178, "options": 1260, "spec_joins": 2917,
    "emitted_refs": 1219,
}


def main() -> int:
    uri = os.environ.get("SEED_DATABASE_URL")
    if not uri:
        print("SEED_DATABASE_URL missing (inline env only)")
        return 2
    conn = psycopg2.connect(uri)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor()
    out = OrderedDict(probe="adr037-b3-postapply-gates-1-5", readonly_session=True)

    cur.execute("SELECT current_setting('transaction_read_only')")
    out["session_read_only"] = cur.fetchone()[0]

    # ── G2 first: the raw post-apply census ──────────────────────────────
    cur.execute(
        "SELECT count(*), count(DISTINCT external_ref) FROM questions "
        "WHERE external_ref LIKE %s AND active", (REF_PREFIX + "%",))
    act, adist = cur.fetchone()
    cur.execute(
        "SELECT count(*) FROM questions WHERE external_ref LIKE %s AND NOT active",
        (REF_PREFIX + "%",))
    inact = cur.fetchone()[0]
    cur.execute(
        "SELECT question_type, count(*) FROM questions "
        "WHERE external_ref LIKE %s AND active GROUP BY question_type",
        (REF_PREFIX + "%",))
    by_type = dict(cur.fetchall())
    out["g2_active_rows"] = act
    out["g2_active_distinct_refs"] = adist
    out["g2_inactive_rows_deactivated"] = inact
    out["g2_active_by_type"] = by_type
    out["g2_expected_active_rows"] = CENSUS["corpus_rows"] + 11
    out["g2_expected_inactive"] = APPLY_SUMMARY["deactivated"]

    # survivors' contribution (computed directly from the 11)
    cur.execute(
        "SELECT count(*) FROM question_parts qp "
        "JOIN question_versions qv ON qp.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (SURVIVOR_LIKE,))
    surv_parts = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM question_options qo "
        "JOIN questions q ON qo.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (SURVIVOR_LIKE,))
    surv_opts = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN mark_schemes ms ON mp.mark_scheme_id = ms.id "
        "JOIN question_versions qv ON ms.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (SURVIVOR_LIKE,))
    surv_mp = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM question_spec_points qsp "
        "JOIN questions q ON qsp.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (SURVIVOR_LIKE,))
    surv_joins = cur.fetchone()[0]
    out["g2_survivor_contribution"] = {
        "parts": surv_parts, "options": surv_opts,
        "mark_points": surv_mp, "joins": surv_joins,
    }

    # totals vs summary + survivors
    cur.execute(
        "SELECT count(*) FROM question_parts qp "
        "JOIN question_versions qv ON qp.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (REF_PREFIX + "%",))
    parts_total = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM question_options qo "
        "JOIN questions q ON qo.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (REF_PREFIX + "%",))
    opts_total = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN mark_schemes ms ON mp.mark_scheme_id = ms.id "
        "JOIN question_versions qv ON ms.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (REF_PREFIX + "%",))
    mp_total = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM question_spec_points qsp "
        "JOIN questions q ON qsp.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active", (REF_PREFIX + "%",))
    joins_total = cur.fetchone()[0]
    out["g2_vs_summary"] = {
        "parts": {"live": parts_total,
                  "expected": APPLY_SUMMARY["parts"] + surv_parts,
                  "ok": parts_total == APPLY_SUMMARY["parts"] + surv_parts},
        "options": {"live": opts_total,
                    "expected": APPLY_SUMMARY["options"] + surv_opts,
                    "ok": opts_total == APPLY_SUMMARY["options"] + surv_opts},
        "markPoints": {"live": mp_total,
                       "expected": APPLY_SUMMARY["markPoints"] + surv_mp,
                       "ok": mp_total == APPLY_SUMMARY["markPoints"] + surv_mp},
        "joins": {"live": joins_total,
                  "expected": APPLY_SUMMARY["specPointMappings"] + surv_joins,
                  "ok": joins_total == APPLY_SUMMARY["specPointMappings"] + surv_joins},
    }

    # ── G1: sum-invariant post-state ─────────────────────────────────────
    # multi-row parts: sum(mp.marks) == part.marks
    cur.execute(
        "SELECT count(*) FROM ("
        "  SELECT qp.id, qp.marks AS pmarks, sum(mp.marks) AS s, count(*) AS n "
        "  FROM mark_points mp "
        "  JOIN question_parts qp ON mp.question_part_id = qp.id "
        "  JOIN question_versions qv ON qp.question_version_id = qv.id "
        "  JOIN questions q ON qv.question_id = q.id "
        "  WHERE q.external_ref LIKE %s AND q.active "
        "  GROUP BY qp.id, qp.marks HAVING count(*) > 1) t "
        "WHERE s <> pmarks", (REF_PREFIX + "%",))
    out["g1_perpoint_parts"] = {
        "violating": cur.fetchone()[0]}
    # single-row parts: mp.marks == part.marks
    cur.execute(
        "SELECT count(*) FROM ("
        "  SELECT qp.id, qp.marks AS pmarks, sum(mp.marks) AS s, count(*) AS n "
        "  FROM mark_points mp "
        "  JOIN question_parts qp ON mp.question_part_id = qp.id "
        "  JOIN question_versions qv ON qp.question_version_id = qv.id "
        "  JOIN questions q ON qv.question_id = q.id "
        "  WHERE q.external_ref LIKE %s AND q.active "
        "  GROUP BY qp.id, qp.marks HAVING count(*) = 1) t "
        "WHERE s <> pmarks", (REF_PREFIX + "%",))
    out["g1_wholeblock_parts_violating"] = cur.fetchone()[0]
    # every active part-bound mp sits on an ACTIVE part with >=1 row; parts
    # with ZERO mp rows (the silent under-award class)
    cur.execute(
        "SELECT count(*) FROM ("
        "  SELECT qp.id FROM question_parts qp "
        "  JOIN question_versions qv ON qp.question_version_id = qv.id "
        "  JOIN questions q ON qv.question_id = q.id "
        "  LEFT JOIN mark_points mp ON mp.question_part_id = qp.id "
        "  WHERE q.external_ref LIKE %s AND q.active "
        "  GROUP BY qp.id HAVING count(mp.id) = 0) t", (REF_PREFIX + "%",))
    out["g1_parts_with_zero_mp_rows"] = cur.fetchone()[0]
    # MCQ-direct: mp.marks == q.marks
    cur.execute(
        "SELECT count(*) FROM mark_points mp "
        "JOIN mark_schemes ms ON mp.mark_scheme_id = ms.id "
        "JOIN question_versions qv ON ms.question_version_id = qv.id "
        "JOIN questions q ON qv.question_id = q.id "
        "WHERE q.external_ref LIKE %s AND q.active AND mp.question_part_id IS NULL "
        "AND mp.marks <> q.marks", (REF_PREFIX + "%",))
    out["g1_mcq_direct_mismatch"] = cur.fetchone()[0]
    # G3: the shape counts
    cur.execute(
        "SELECT count(*) FROM ("
        "  SELECT qp.id FROM mark_points mp "
        "  JOIN question_parts qp ON mp.question_part_id = qp.id "
        "  JOIN question_versions qv ON qp.question_version_id = qv.id "
        "  JOIN questions q ON qv.question_id = q.id "
        "  WHERE q.external_ref LIKE %s AND q.active "
        "  GROUP BY qp.id HAVING count(*) > 1) t", (REF_PREFIX + "%",))
    out["g3_perpoint_multirow_parts"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM ("
        "  SELECT qp.id FROM mark_points mp "
        "  JOIN question_parts qp ON mp.question_part_id = qp.id "
        "  JOIN question_versions qv ON qp.question_version_id = qv.id "
        "  JOIN questions q ON qv.question_id = q.id "
        "  WHERE q.external_ref LIKE %s AND q.active "
        "  GROUP BY qp.id HAVING count(*) = 1) t", (REF_PREFIX + "%",))
    out["g3_wholeblock_1to1_parts"] = cur.fetchone()[0]

    # ── G4: survivors intact ─────────────────────────────────────────────
    cur.execute(
        "SELECT count(*), sum(CASE WHEN active THEN 1 ELSE 0 END) FROM questions "
        "WHERE external_ref LIKE %s", (SURVIVOR_LIKE,))
    tot, act_s = cur.fetchone()
    out["g4_survivors"] = {"rows": tot, "active": act_s,
                           "expected_active": 11, "ok": act_s == 11}
    out["g4_survivor_mp_intact"] = surv_mp  # from G2 block

    # ── G5: untouched classes ────────────────────────────────────────────
    cur.execute("SELECT count(*) FROM smart_mark_results")
    out["g5_smart_mark_results"] = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM answers")
    out["g5_answers"] = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM question_asset")
    out["g5_question_asset"] = cur.fetchone()[0]
    cur.execute(
        "SELECT count(*) FROM knowledge_nodes "
        "WHERE node_type = 'SPEC_POINT' AND code LIKE %s", ("4CH1%",))
    out["g5_spec_point_nodes_4ch1"] = cur.fetchone()[0]

    # verdict
    ok = (
        out["g2_active_rows"] == out["g2_expected_active_rows"]
        and out["g2_inactive_rows_deactivated"] == out["g2_expected_inactive"]
        and all(v["ok"] for v in out["g2_vs_summary"].values())
        and out["g1_perpoint_parts"]["violating"] == 0
        and out["g1_wholeblock_parts_violating"] == 0
        and out["g1_parts_with_zero_mp_rows"] == 0
        and out["g1_mcq_direct_mismatch"] == 0
        and out["g3_perpoint_multirow_parts"] > 0
        and out["g4_survivors"]["ok"]
        and out["g5_smart_mark_results"] == 368
        and out["g5_answers"] == 655
        and out["g5_question_asset"] == 585
        and out["g5_spec_point_nodes_4ch1"] == 182
    )
    out["ALL_GATES"] = "GREEN" if ok else "RED"
    print(json.dumps(out, indent=1))
    with open("scripts/adr037_gates_postapply_result.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    conn.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
