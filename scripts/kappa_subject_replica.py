#!/usr/bin/env python3
"""
kappa_subject_replica.py — T-SM-KAPPA-SUBJECT pre-write replica check (READ-ONLY).
Runbook law: operator-order-r0 §6.2 / d57-disclosure-r0 §7.3 — do NOT POST /kappa/evaluate
unless D5.1–D5.4 hold on this replica.

Law source (identical at deployed cdc1cd2 and tip aadbd085 — 0 commits drift):
  - writer sample SQL: apps/api/src/services/teachermarking/index.ts:1082-1117 (verbatim)
  - collectPairs      : :1025-1064 (JS semantics ported: !== 0, typeof awarded === "boolean")
  - normalizeBreakdown: :503-512
  - cohenKappa        : :367-401 (incl. 1e-12 degenerate convention)
  - threshold         : KAPPA_DEFAULT_THRESHOLD = 0.6 (:94)
Self-verification: replay with cutoff 2026-10-21T19:02:00Z must reproduce eval-4ch1-r0 exactly
(287 sampled, 259 paper/28 tree, skips 164/12/26, 85 contributing answers, 93 pairs,
confusion 1/92/0/0, kappa 1.0). Any mismatch = port drift -> fix before trusting fresh numbers.
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

PROJ = "/home/z/my-project"
OUT_JSON = f"{PROJ}/scripts/recon/replica_r1_out.json"
SUBJECT_ID = "e56dc9ee-aa74-426f-94a6-4b72d3dc346b"  # 4CH1 (Chemistry)
R0_CUTOFF = "2026-10-21T19:02:00+00:00"
R0_EXPECTED = {
    "sampled": 287, "paper_lane": 259, "tree_lane": 28,
    "skip_null_ppd": 164, "skip_no_run": 12, "skip_key_intersect": 26,
    "contributing_answers": 85, "pairs": 93,
    "bothYes": 1, "bothNo": 92, "smartYesOnly": 0, "humanYesOnly": 0,
    # r0 prose said "129"; r0's own histogram left 1 mark unaccounted
    # (129+34=163 != 164). Reconciled value 130: 130+34=164 exact.
    "overrides_null_ppd": 130,
}
R0_NOTES = {
    "overrides_null_ppd": "r0 disclosure §2/§4 printed 129; r0's own skip histogram "
                          "leaves 1 mark unaccounted (129+34=163 vs 164). Replica "
                          "reconciles at 130 (+34 HUMAN_MARKED = 164 exact). D5.5 "
                          "verdict unchanged (FAIL)."
}

WRITER_SAMPLE_SQL = """
      with recursive qn as (
        select distinct question_id, node_id from question_topics
        union
        select distinct question_id, spec_point_node_id as node_id
        from question_spec_points where spec_point_node_id is not null
      ), up as (
        select qn.question_id, tn.id as node_id, 0 as depth,
               case when tn.node_type = 'SUBJECT' then tn.id end as subj_node
        from qn join knowledge_nodes tn on tn.id = qn.node_id
        union all
        select up.question_id, p.id, up.depth + 1,
               case when p.node_type = 'SUBJECT' then p.id else up.subj_node end
        from up
        join knowledge_edges e
          on e.source_node_id = up.node_id and e.relation_type = 'PART_OF'
        join knowledge_nodes p on p.id = e.target_node_id
        where up.subj_node is null and up.depth < 8
      ), qsub as (
        select q.id as question_id, ep.subject_id as subject_id
        from questions q join exam_papers ep on ep.id = q.exam_paper_id
        union
        select distinct u.question_id, s.id as subject_id
        from (select distinct question_id, subj_node from up
              where subj_node is not null) u
        join subjects s on s.knowledge_node_id = u.subj_node
      )
      select h.id, h.answer_id, h.marker_id, h.marks_awarded, h.per_point_decisions,
             h.comments, h.created_at, at.question_id,
             (q.exam_paper_id is not null) as paper_lane,
             ans.marking_state
      from human_marks h
      join answers ans on ans.id = h.answer_id
      join attempts at on at.id = ans.attempt_id
      join questions q on q.id = at.question_id
      join qsub on qsub.question_id = at.question_id
      where qsub.subject_id = %(subject_id)s
      order by h.created_at asc
"""

NEWEST_RUN_SQL = """
      select distinct on (sr.answer_id)
             sr.answer_id, sr.id, sr.marks_awarded, sr.validation_passed,
             sr.breakdown, sr.created_at
      from smart_mark_results sr
      where sr.answer_id = any(%(answer_ids)s::uuid[])
      order by sr.answer_id, sr.created_at desc
"""

QUEUE_INVENTORY_SQL = """
      with recursive qn as (
        select distinct question_id, node_id from question_topics
        union
        select distinct question_id, spec_point_node_id as node_id
        from question_spec_points where spec_point_node_id is not null
      ), up as (
        select qn.question_id, tn.id as node_id, 0 as depth,
               case when tn.node_type = 'SUBJECT' then tn.id end as subj_node
        from qn join knowledge_nodes tn on tn.id = qn.node_id
        union all
        select up.question_id, p.id, up.depth + 1,
               case when p.node_type = 'SUBJECT' then p.id else up.subj_node end
        from up
        join knowledge_edges e
          on e.source_node_id = up.node_id and e.relation_type = 'PART_OF'
        join knowledge_nodes p on p.id = e.target_node_id
        where up.subj_node is null and up.depth < 8
      ), qsub as (
        select q.id as question_id, ep.subject_id as subject_id
        from questions q join exam_papers ep on ep.id = q.exam_paper_id
        union
        select distinct u.question_id, s.id as subject_id
        from (select distinct question_id, subj_node from up
              where subj_node is not null) u
        join subjects s on s.knowledge_node_id = u.subj_node
      ), subject_answers as (
        select distinct ans.id, ans.marking_state
        from answers ans
        join attempts at on at.id = ans.attempt_id
        join qsub on qsub.question_id = at.question_id
        where qsub.subject_id = %(subject_id)s
      ), runs as (
        select distinct on (sr.answer_id)
               sr.answer_id, sr.marks_awarded, sr.validation_passed
        from smart_mark_results sr
        join subject_answers sa on sa.id = sr.answer_id
        order by sr.answer_id, sr.created_at desc
      )
      select sa.marking_state,
             count(*) as answers,
             count(*) filter (where r.answer_id is null) as no_newest_run,
             count(*) filter (where r.answer_id is not null
                              and r.validation_passed) as newest_validated,
             count(*) filter (where r.answer_id is not null and r.validation_passed
                              and r.marks_awarded > 0) as newest_validated_positive
      from subject_answers sa
      left join runs r on r.answer_id = sa.id
      group by sa.marking_state
"""

TIER_SQL = """
      with recursive qn as (
        select distinct question_id, node_id from question_topics
        union
        select distinct question_id, spec_point_node_id as node_id
        from question_spec_points where spec_point_node_id is not null
      ), up as (
        select qn.question_id, tn.id as node_id, 0 as depth,
               case when tn.node_type = 'SUBJECT' then tn.id end as subj_node
        from qn join knowledge_nodes tn on tn.id = qn.node_id
        union all
        select up.question_id, p.id, up.depth + 1,
               case when p.node_type = 'SUBJECT' then p.id else up.subj_node end
        from up
        join knowledge_edges e
          on e.source_node_id = up.node_id and e.relation_type = 'PART_OF'
        join knowledge_nodes p on p.id = e.target_node_id
        where up.subj_node is null and up.depth < 8
      ), qsub as (
        select q.id as question_id, ep.subject_id as subject_id
        from questions q join exam_papers ep on ep.id = q.exam_paper_id
        union
        select distinct u.question_id, s.id as subject_id
        from (select distinct question_id, subj_node from up
              where subj_node is not null) u
        join subjects s on s.knowledge_node_id = u.subj_node
      ), subject_answers as (
        select distinct ans.id, ans.marking_state
        from answers ans
        join attempts at on at.id = ans.attempt_id
        join qsub on qsub.question_id = at.question_id
        where qsub.subject_id = %(subject_id)s
      ), runs as (
        select distinct on (sr.answer_id)
               sr.answer_id, sr.marks_awarded, sr.validation_passed, sr.breakdown
        from smart_mark_results sr
        join subject_answers sa on sa.id = sr.answer_id
        order by sr.answer_id, sr.created_at desc
      )
      select sa.id as answer_id, sa.marking_state, r.marks_awarded as smart_marks,
             r.breakdown, at.question_id
      from subject_answers sa
      join runs r on r.answer_id = sa.id
      join answers ans2 on ans2.id = sa.id
      join attempts at on at.id = ans2.attempt_id
      where r.validation_passed
        and ( (%(tier)s = 1 and sa.marking_state in ('PENDING','SMART_MARKED')
               and r.marks_awarded > 0)
           or (%(tier)s = 2 and sa.marking_state in ('PENDING','SMART_MARKED')
               and r.marks_awarded = 0)
           or (%(tier)s = 3 and sa.marking_state = 'OVERRIDDEN') )
      order by r.marks_awarded desc, sa.id
"""


def js_string(v):
    """JS String(v) for JSON values (bool/None/int/float/str)."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, str):
        return v
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    return str(v)


def js_human_decision(v):
    """JS: humanDecision !== 0 ? 1 : 0  (strict — only the number 0 maps to 0)."""
    if isinstance(v, bool):
        return 1  # false !== 0 is TRUE in JS strict compare
    if isinstance(v, (int, float)) and v == 0:
        return 0
    return 1


def normalize_breakdown(raw):
    """Port of normalizeBreakdown (:503-512): string -> JSON.parse, else passthrough.
    JSON.parse failure returns the raw string (then Array.isArray fails -> skip)."""
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return raw
    return raw


def cohen_kappa(pairs):
    """Port of cohenKappa (:367-401) incl. validation order and 1e-12 convention."""
    if len(pairs) == 0:
        raise RuntimeError("kappa requires at least one paired decision")
    n = len(pairs)
    smart_yes = human_yes = both_yes = both_no = 0
    for pair in pairs:
        if len(pair) != 2:
            raise RuntimeError("decisions must be binary 0/1 pairs")
        smart, human = pair
        if (smart not in (0, 1)) or (human not in (0, 1)):
            raise RuntimeError("decisions must be binary 0/1 pairs")
        if smart == 1:
            smart_yes += 1
        if human == 1:
            human_yes += 1
        if smart == 1 and human == 1:
            both_yes += 1
        if smart == 0 and human == 0:
            both_no += 1
    observed = (both_yes + both_no) / n
    p_smart = smart_yes / n
    p_human = human_yes / n
    expected = p_smart * p_human + (1 - p_smart) * (1 - p_human)
    if expected >= 1.0 - 1e-12:
        kappa = 1.0 if observed >= 1.0 - 1e-12 else 0.0
    else:
        kappa = (observed - expected) / (1.0 - expected)
    return {
        "kappa": kappa, "observedAgreement": observed, "sampleSize": n,
        "bothYes": both_yes, "bothNo": both_no,
        "smartYesOnly": smart_yes - both_yes, "humanYesOnly": human_yes - both_yes,
        "expected": expected,
    }


def load_dsn():
    candidates = [f"{PROJ}/.creds/db.env", f"{PROJ}/.env"]
    for path in candidates:
        try:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        dsn = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if dsn.startswith(("postgres://", "postgresql://")):
                            return dsn
        except FileNotFoundError:
            continue
    print("BLOCKED: no postgres DATABASE_URL found (.creds/db.env / .env)")
    sys.exit(2)


def connect(dsn):
    fp = hashlib.sha256(dsn.encode()).hexdigest()[:16]
    conn = psycopg2.connect(
        dsn,
        application_name="t-sm-kappa-subject-replica/1",
        options="-c default_transaction_read_only=on -c statement_timeout=180000",
    )
    print(f"connected READ-ONLY (DSN fingerprint {fp})")
    return conn


def fetch_sample(cur, cutoff=None):
    sql = WRITER_SAMPLE_SQL
    params = {"subject_id": SUBJECT_ID}
    if cutoff:
        sql = sql.replace(
            "      order by h.created_at asc",
            "      and h.created_at <= %(cutoff)s\n      order by h.created_at asc")
        params["cutoff"] = cutoff
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def pair_packet(cur, marks, point_ids):
    """Port of collectPairs (:1025-1064) — newest run first THEN validation filter."""
    answer_ids = sorted({m["answer_id"] for m in marks})
    cur.execute(NEWEST_RUN_SQL, {"answer_ids": answer_ids})
    newest = {row[0]: {
        "marks_awarded": row[2], "validation_passed": row[3],
        "breakdown": row[4], "created_at": row[5],
    } for row in cur.fetchall()}

    pairs, stats = [], {
        "skip_null_ppd": 0, "skip_no_run": 0, "skip_run_invalid": 0,
        "skip_breakdown_not_array": 0, "skip_key_intersect": 0,
    }
    contributing_answers, uuid_keyed_marks, option_keyed_marks = set(), 0, 0
    for mark in marks:
        ppd = mark["per_point_decisions"]
        if ppd is None or len(ppd) == 0:
            stats["skip_null_ppd"] += 1
            continue
        keys = list(ppd.keys())
        if any(k in point_ids for k in keys):
            uuid_keyed_marks += 1
        elif all(len(str(k)) <= 3 for k in keys):
            option_keyed_marks += 1
        smart = newest.get(mark["answer_id"])
        if smart is None:
            stats["skip_no_run"] += 1
            continue
        if not smart["validation_passed"]:
            stats["skip_run_invalid"] += 1
            continue
        breakdown = normalize_breakdown(smart["breakdown"])
        if not isinstance(breakdown, list):
            stats["skip_breakdown_not_array"] += 1
            continue
        smart_decisions = {}
        for entry in breakdown:
            if not isinstance(entry, dict):
                continue
            point_id = entry.get("markPointId")
            awarded = entry.get("awarded")
            if point_id is not None and isinstance(awarded, bool):
                smart_decisions[js_string(point_id)] = 1 if awarded else 0
        hit = False
        for point_id, human_decision in ppd.items():
            smart_decision = smart_decisions.get(js_string(point_id))
            if smart_decision is not None:
                pairs.append([smart_decision, js_human_decision(human_decision)])
                hit = True
        if hit:
            contributing_answers.add(mark["answer_id"])
        else:
            stats["skip_key_intersect"] += 1
    return pairs, stats, contributing_answers, uuid_keyed_marks, option_keyed_marks


def main():
    dsn = load_dsn()
    conn = connect(dsn)
    out = {"subject_id": SUBJECT_ID, "run_utc": datetime.now(timezone.utc).isoformat()}

    with conn.cursor() as cur:
        cur.execute(
            "select id, name, knowledge_node_id is not null from subjects where id = %s",
            (SUBJECT_ID,))
        row = cur.fetchone()
        if not row:
            print("BLOCKED: subject row not found")
            sys.exit(2)
        out["subject"] = {"id": row[0], "name": row[1], "knowledge_node": bool(row[2])}
        print(f"subject: {row[1]} knowledge_node={bool(row[2])}")

        cur.execute("select coalesce(json_agg(id)::text, '[]') from mark_points")
        point_ids = set(json.loads(cur.fetchone()[0]))
        out["mark_points_count"] = len(point_ids)

        # ---- r0 reproduction (cutoff replay) ----
        r0_marks = fetch_sample(cur, cutoff=R0_CUTOFF)
        r0_pairs, r0_skips, r0_contrib, r0_uuid, r0_opt = pair_packet(cur, r0_marks, point_ids)
        r0_stats = cohen_kappa(r0_pairs) if r0_pairs else {"sampleSize": 0}
        paper = sum(1 for m in r0_marks if m["paper_lane"])
        repro = {
            "sampled": len(r0_marks), "paper_lane": paper,
            "tree_lane": len(r0_marks) - paper,
            "skip_null_ppd": r0_skips["skip_null_ppd"],
            "skip_no_run": r0_skips["skip_no_run"] + r0_skips["skip_run_invalid"],
            "skip_key_intersect": r0_skips["skip_key_intersect"],
            "contributing_answers": len(r0_contrib), "pairs": len(r0_pairs),
            "overrides_null_ppd": sum(
                1 for m in r0_marks
                if m["marking_state"] == "OVERRIDDEN"
                and (m["per_point_decisions"] is None
                     or len(m["per_point_decisions"]) == 0)),
            **{k: r0_stats.get(k) for k in ("bothYes", "bothNo", "smartYesOnly",
                                            "humanYesOnly", "kappa")},
        }
        mismatches = {k: (repro.get(k), v) for k, v in R0_EXPECTED.items()
                      if repro.get(k) != v}
        out["r0_reproduction"] = {"replay": repro, "expected": R0_EXPECTED, "notes": R0_NOTES,
                                  "MATCH": not mismatches, "mismatches": mismatches}
        print("r0 reproduction (cutoff 2026-10-21T19:02Z):",
              "MATCH ✓" if not mismatches else f"MISMATCH: {mismatches}")

        # ---- fresh packet ----
        marks = fetch_sample(cur)
        pairs, skips, contrib, uuid_keyed, opt_keyed = pair_packet(cur, marks, point_ids)
        stats = cohen_kappa(pairs) if pairs else None
        paper = sum(1 for m in marks if m["paper_lane"])
        cutoff_dt = datetime.fromisoformat(R0_CUTOFF)
        fresh = [m for m in marks if m["created_at"] > cutoff_dt]
        markers = sorted({str(m["marker_id"]) for m in marks})
        packet_overrides = [m for m in marks if m["marking_state"] == "OVERRIDDEN"]
        overrides_null_ppd = sum(
            1 for m in packet_overrides
            if m["per_point_decisions"] is None
            or len(m["per_point_decisions"]) == 0)
        self_marked_in_packet = sum(
            1 for m in marks if m["marking_state"] == "SELF_MARKED")
        scored_contrib = sum(1 for m in marks
                             if m["answer_id"] in contrib
                             and (m["marks_awarded"] or 0) > 0)
        floors = {
            "D5.1_bothYes>=25": {"value": stats["bothYes"] if stats else 0, "pass": bool(stats) and stats["bothYes"] >= 25},
            "D5.2_splits>=10": {"value": (stats["smartYesOnly"] + stats["humanYesOnly"]) if stats else 0, "pass": bool(stats) and (stats["smartYesOnly"] + stats["humanYesOnly"]) >= 10},
            "D5.3_scored>=50%": {"value": f"{scored_contrib}/{len(contrib)}", "pass": len(contrib) > 0 and scored_contrib / len(contrib) >= 0.5},
            "D5.4_capture>=80%": {"value": f"{uuid_keyed}/{len(marks)}", "pass": len(marks) > 0 and uuid_keyed / len(marks) >= 0.8},
            "D5.5_override_ppd": {"value": f"{overrides_null_ppd}/{len(packet_overrides)} packet overrides null-ppd", "pass": len(packet_overrides) == 0 or overrides_null_ppd == 0},
            "D5.6_authorship": {"value": f"{len(markers)} distinct markers; self-marked in packet: {self_marked_in_packet}", "pass": self_marked_in_packet == 0 and len(markers) > 0},
        }
        out["fresh_packet"] = {
            "sampled_utc": datetime.now(timezone.utc).isoformat(),
            "marks": len(marks), "answers": len({m['answer_id'] for m in marks}),
            "paper_lane": paper, "tree_lane": len(marks) - paper,
            "skip_null_ppd": skips["skip_null_ppd"],
            "skip_no_run": skips["skip_no_run"],
            "skip_run_invalid": skips["skip_run_invalid"],
            "skip_key_intersect": skips["skip_key_intersect"],
            "uuid_keyed_marks": uuid_keyed, "option_keyed_marks": opt_keyed,
            "contributing_answers": len(contrib), "pairs": len(pairs),
            "scored_contributing": scored_contrib,
            "stats": stats, "floors": floors,
            "new_marks_since_r0_cutoff": len(fresh),
            "distinct_markers": len(markers),
        }
        print(json.dumps(out["fresh_packet"], indent=2, default=str))

        # ---- queue inventory + tiers ----
        cur.execute(QUEUE_INVENTORY_SQL, {"subject_id": SUBJECT_ID})
        out["queue_inventory"] = [
            {"marking_state": r[0], "answers": r[1], "no_newest_run": r[2],
             "newest_validated": r[3], "newest_validated_positive": r[4]}
            for r in cur.fetchall()]
        print("queue inventory:", json.dumps(out["queue_inventory"], indent=2))

        out["tiers"] = {}
        for tier in (1, 2, 3):
            cur.execute(TIER_SQL, {"subject_id": SUBJECT_ID, "tier": tier})
            rows = [{
                "answer_id": r[0], "marking_state": r[1], "smart_marks": r[2],
                "question_id": r[4],
                "bound_points": sum(1 for e in (normalize_breakdown(r[3]) or [])
                                    if isinstance(e, dict) and e.get("markPointId") is not None
                                    and isinstance(e.get("awarded"), bool))
            } for r in cur.fetchall()]
            out["tiers"][f"tier{tier}"] = {
                "count": len(rows),
                "total_bound_points": sum(r["bound_points"] for r in rows),
                "answers": rows,
            }
            print(f"tier{tier}: {len(rows)} answers, "
                  f"{out['tiers'][f'tier{tier}']['total_bound_points']} bound points")

    conn.close()
    with open(OUT_JSON, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"artifact: {OUT_JSON}")


if __name__ == "__main__":
    main()
