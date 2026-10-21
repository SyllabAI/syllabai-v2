#!/usr/bin/env python3
"""
ADR-037 v0.7 re-apply census — repo-side mirror of the shim + frozen ingest
emission laws (trace 1a15f8051fc9c785, operator ruling "per-point").

Mirrors, verbatim in law:
  - bundle-questions.ts admission gates: unmapped (no part carries
    specPointCodes) -> badSum (parts do not close on totalMarks) -> dupOrder
    ((topicSlug, order) namespace, first occurrence wins)
  - externalRef = sme-eq-<courseSlug>-<topicSlug>-q<order>
  - emittedRowRefs (sme/index.ts:111-127): base ref + -pK per option-bearing
    part + -s when mixed  -> the slice-scoped deactivate set
  - corpus rows: pure-structured = 1; option-bearing parts = 1 MCQ_SINGLE row
    each (1 part-less mark_point row each, sme/index.ts:299); plain parts of
    mixed = the -s STRUCTURED row
  - mark_point rows (the ruling's subject): option-bearing part -> 1 part-less
    row; plain part with markPoints -> ONE ROW PER POINT (ref <label>.<n>);
    plain part without -> frozen whole-block row (markPointRowsFor law,
    sme/index.ts:50-55; shim labels are always non-null so the null-label
    fallback never fires from this path)
  - G7 (shim :364-373 + validate :639-644): markPoints-carrying parts must be
    all-positive and sum EXACTLY to part.marks — violations are refusals,
    counted, never rewritten
  - spec joins: ordered dedupe union across parts; PRIMARY = all codes of the
    anchoring part, SECONDARY = the rest (shim :393-410)

Read-only over apps/hub/content/igcse-chemistry-19/questions.json.
"""

import json
import sys
from collections import OrderedDict

BUNDLE = "apps/hub/content/igcse-chemistry-19/questions.json"
COURSE_SLUG = "igcse-chemistry-19"

# lane C of-record comparison points (receipt
# R0-4CH1-CORPUS-DB-INGEST/laneC-rulingA-apply-r0.json, applied at the
# pre-v0.7 corpus 1.1@de4d8da8)
LANE_C = {
    "admitted_questions": 528,
    "excluded": 165,
    "corpus_rows": 602,
    "parts": 1202,
    "mcq_direct": 233,
    "mark_point_rows": 1435,
    "options": 932,
    "spec_joins": 1560,
}


def main() -> int:
    with open(BUNDLE, "r", encoding="utf-8") as fh:
        sets = json.load(fh)

    totals = {
        "sets": 0,
        "raw_questions": 0,
        "raw_parts": 0,
        "unmapped": 0,
        "bad_sum": 0,
        "dup_order": 0,
        "admitted_questions": 0,
        "admitted_parts": 0,      # plain parts riding STRUCTURED rows
        "admitted_parts_all": 0,  # lane-C comparable: plain + option-bearing
        "emitted_refs": 0,        # base + members = the deactivate slice law
        "corpus_rows": 0,         # questions table rows the ingest inserts
        "structured_rows": 0,
        "mcq_rows": 0,
        "mark_point_rows": 0,     # THE number this ruling re-shapes
        "per_point_rows": 0,      # rows bound to a question_part_id
        "partless_rows": 0,       # MCQ-direct rows (question_part_id NULL)
        "whole_block_rows": 0,    # 1:1 fallback rows (Law 1 posture)
        "g7_violations": 0,
        "options": 0,
        "spec_joins": 0,
        "spec_primary": 0,
        "spec_secondary": 0,
    }
    per_set = []

    for s in sets:
        topic_slug = s.get("topicSlug") or ""
        st = {
            "set": s.get("slug"),
            "topicSlug": topic_slug,
            "raw_questions": len(s.get("questions", [])),
            "admitted": 0,
            "refs": 0,
            "corpus_rows": 0,
            "parts": 0,
            "mark_point_rows": 0,
            "per_point": 0,
            "whole_block": 0,
            "partless": 0,
            "g7_violations": 0,
            "options": 0,
            "joins": 0,
        }
        orders = set()
        for q in s.get("questions", []):
            totals["raw_questions"] += 1
            parts = q.get("parts") or []
            totals["raw_parts"] += len(parts)

            # ── admission gate 1: the anchor law ──────────────────────────
            anchor_idx = next(
                (i for i, p in enumerate(parts) if (p.get("specPointCodes") or [])), -1
            )
            if anchor_idx == -1:
                totals["unmapped"] += 1
                continue
            # ── admission gate 2: the part-sum law ────────────────────────
            if sum(p.get("marks", 0) for p in parts) != q.get("totalMarks"):
                totals["bad_sum"] += 1
                continue
            # ── admission gate 3: the order-identity law ──────────────────
            if q.get("order") in orders:
                totals["dup_order"] += 1
                continue
            orders.add(q.get("order"))

            st["admitted"] += 1
            totals["admitted_questions"] += 1
            base_ref = f"sme-eq-{COURSE_SLUG}-{topic_slug}-q{q.get('order')}"

            option_parts = [p for p in parts if (p.get("choices") or [])]
            plain_parts = [p for p in parts if not (p.get("choices") or [])]

            # ── emittedRowRefs law: base + -pK members + -s when mixed ────
            members = 0
            if option_parts:
                members += len(option_parts)          # -pK rows
                if plain_parts:
                    members += 1                       # -s row
            st["refs"] += 1 + members
            totals["emitted_refs"] += 1 + members

            # ── G7 pre-check on markPoints-carrying parts ─────────────────
            for p in parts:
                mp = p.get("markPoints") or []
                if mp:
                    if any((m.get("marks") or 0) <= 0 for m in mp) or sum(
                        m.get("marks", 0) for m in mp
                    ) != p.get("marks"):
                        st["g7_violations"] += 1
                        totals["g7_violations"] += 1

            # ── corpus rows + mark_point rows ─────────────────────────────
            st["options"] += sum(len(p.get("choices") or []) for p in option_parts)
            totals["options"] += sum(len(p.get("choices") or []) for p in option_parts)

            if not option_parts:
                # pure structured: 1 corpus row, all parts ride it
                st["corpus_rows"] += 1
                totals["corpus_rows"] += 1
                totals["structured_rows"] += 1
                st["parts"] += len(parts)
                totals["admitted_parts"] += len(parts)
                totals["admitted_parts_all"] += len(parts)
                for p in parts:
                    mp = p.get("markPoints") or []
                    if mp:
                        st["mark_point_rows"] += len(mp)
                        st["per_point"] += len(mp)
                        totals["mark_point_rows"] += len(mp)
                        totals["per_point_rows"] += len(mp)
                    else:
                        st["mark_point_rows"] += 1
                        st["whole_block"] += 1
                        totals["mark_point_rows"] += 1
                        totals["whole_block_rows"] += 1
            else:
                # option-bearing parts: 1 MCQ corpus row + 1 part-less point each
                st["corpus_rows"] += len(option_parts)
                totals["corpus_rows"] += len(option_parts)
                totals["mcq_rows"] += len(option_parts)
                st["mark_point_rows"] += len(option_parts)
                st["partless"] += len(option_parts)
                totals["mark_point_rows"] += len(option_parts)
                totals["partless_rows"] += len(option_parts)
                totals["admitted_parts_all"] += len(option_parts)
                if plain_parts:
                    # the -s STRUCTURED row carries the plain parts
                    st["corpus_rows"] += 1
                    totals["corpus_rows"] += 1
                    totals["structured_rows"] += 1
                    st["parts"] += len(plain_parts)
                    totals["admitted_parts"] += len(plain_parts)
                    totals["admitted_parts_all"] += len(plain_parts)
                    for p in plain_parts:
                        mp = p.get("markPoints") or []
                        if mp:
                            st["mark_point_rows"] += len(mp)
                            st["per_point"] += len(mp)
                            totals["mark_point_rows"] += len(mp)
                            totals["per_point_rows"] += len(mp)
                        else:
                            st["mark_point_rows"] += 1
                            st["whole_block"] += 1
                            totals["mark_point_rows"] += 1
                            totals["whole_block_rows"] += 1

            # ── spec joins: ordered dedupe union; anchor part = PRIMARY ───
            seen = set()
            joins = 0
            primary = 0
            for i, p in enumerate(parts):
                for code in p.get("specPointCodes") or []:
                    if code in seen:
                        continue
                    seen.add(code)
                    joins += 1
                    if i == anchor_idx:
                        primary += 1
            st["joins"] += joins
            totals["spec_joins"] += joins
            totals["spec_primary"] += primary
            totals["spec_secondary"] += joins - primary

        totals["sets"] += 1
        per_set.append(st)

    result = OrderedDict(
        census="adr037-reapply-v07-emission-mirror",
        bundle=BUNDLE,
        totals=totals,
        lane_c_of_record=LANE_C,
        delta_vs_lane_c=OrderedDict(
            (k,
             (totals["unmapped"] + totals["bad_sum"] + totals["dup_order"]) - v
             if k == "excluded"
             else totals["partless_rows"] - v
             if k == "mcq_direct"
             else totals["admitted_parts_all"] - v
             if k == "parts"
             else totals[k] - v)
            for k, v in LANE_C.items()
        ),
        per_set=per_set,
    )
    print(json.dumps(result, indent=2))
    with open("scripts/adr037_reapply_census_result.json", "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
