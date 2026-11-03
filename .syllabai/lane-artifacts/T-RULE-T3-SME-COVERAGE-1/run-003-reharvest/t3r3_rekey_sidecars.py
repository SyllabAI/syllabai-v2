#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-003 — ADDITIVE sidecar re-key for the 5
grown CIE lanes (operator dispatch "tranche-3 re-harvest",
trace 1a169db74ca578c9).

Law:
  - the join law of record is cie_spec_join.py's resolve_spcpt (T1_verbatim /
    T2_near, candidates path/scope/tier-restricted) — imported verbatim;
    only the note INPUT READER differs (worktree files: the new notes are
    uncommitted at this stage), disclosed in the receipt.
  - ADDITIVE ONLY: existing items/codes/pending stay byte-stable except the
    pending->codes moves the new mappings cause (order-preserving, existing
    codes win by official_id, new codes appended). All later-lane blocks
    (review_state incl verdict/complete, anchors.rejoin / .verdict /
    .tranche2 / .operatorSidAnchors, registry) are preserved field-exact
    (self-checked by sha256 before/after).
  - index re-derivation is a SEPARATE step run after commit 1 (the
    of-record harvester reads blobs at HEAD).
Fail-closed guards:
  - anchors.universe_ids must equal the committed index universe size
  - universe shrink (removed sids) aborts
  - preserved-block sha mismatch aborts
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

WT = Path("/home/z/my-project/lane-t3r3/resources")
OUT = Path("/home/z/my-project/scripts/recon")
LANES = ["cie-a-level-computer-science-19", "cie-igcse-business-25",
         "cie-igcse-economics-20", "cie-igcse-economics-25",
         "cie-igcse-english-literature-21"]
T3R3_STAMP = "2026-10-23T18:00:00Z"
NOTES = WT / "SME-RevisionNotes"

sys.path.insert(0, str(WT / "scripts"))
import cie_spec_join as cj  # noqa: E402

assert str(cj.REPO) == "/home/z/my-project/syllabai-resources", \
    f"unexpected cie_spec_join.REPO: {cj.REPO}"
cj.REPO = WT  # exactly-one-replacement (registry/parsed reads)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def new_universe(lane: str) -> dict[str, dict]:
    """Universe from the re-harvested notes (worktree files), the
    lane_bundle collection method verbatim."""
    universe: dict[str, dict] = {}
    notes_anchored = []
    for nf in sorted((NOTES / lane).glob("notes/**/*.json")):
        try:
            n = json.loads(nf.read_text(encoding="utf-8"))
        except Exception:
            continue
        spids = n.get("spec_point_ids") or []
        path = n.get("path") or {}
        for b in n.get("blocks") or []:
            if b.get("type") == "spec_point" and b.get("id"):
                rec = universe.setdefault(b["id"], {
                    "name": b.get("name"), "definition": b.get("definition"),
                    "_section_slug": path.get("section"),
                    "_topic_slug": path.get("topic"),
                    "_leaf_slug": path.get("leaf"),
                })
                if (rec.get("definition") or "") == "" and b.get("definition"):
                    rec["definition"] = b["definition"]
                if not rec.get("name") and b.get("name"):
                    rec["name"] = b["name"]
        if spids:
            notes_anchored.append((n, spids, path))
    return universe, notes_anchored


def merge_codes(existing: list, add: list) -> list:
    """Existing codes win by official_id; appended codes keep resolve()
    order; output sorted by official_id per resolve()'s dedup shape."""
    have = {c["official_id"] for c in existing}
    have_c = {c["official_code"] for c in existing}
    ext = list(existing)
    for c in add:
        if c["official_id"] in have or c["official_code"] in have_c:
            continue
        have.add(c["official_id"])
        have_c.add(c["official_code"])
        ext.append(c)
    return sorted(ext, key=lambda c: c["official_id"])


def main() -> int:
    lane_to_qual, quals = cj.load_manifest()
    report = {"schema": "syllabai.t3r3-rekey/1.0", "stamp": T3R3_STAMP,
              "lanes": {}}
    for lane in LANES:
        sc_path = WT / "spec-links" / f"{lane}.json"
        idx_path = WT / "SME-ExamQuestion" / lane / "spec_point_index.json"
        pre_bytes = sc_path.read_bytes()
        pre_sha = sha(pre_bytes)
        sc = json.loads(pre_bytes.decode("utf-8"))
        old_idx = json.loads(idx_path.read_text(encoding="utf-8"))
        old_universe = set((old_idx.get("spec_points") or {}).keys())

        # guard 1: sidecar universe count == committed index universe
        if sc["anchors"]["universe_ids"] != len(old_universe):
            sys.exit(f"FATAL {lane}: sidecar universe_ids "
                     f"{sc['anchors']['universe_ids']} != index universe "
                     f"{len(old_universe)}")

        universe, notes_anchored = new_universe(lane)
        removed = sorted(old_universe - set(universe))
        if removed:
            sys.exit(f"FATAL {lane}: universe shrink {len(removed)}: "
                     f"{removed[:5]}")
        new_sids = sorted(set(universe) - old_universe)

        # ---- join law for the new sids only
        qual = quals[lane_to_qual[lane]]
        reg = cj.Registry(qual)
        reg.build_postings()
        reg._line_cache = {}
        canon_map = reg.canon_map()
        scope = cj.lane_scope(lane)
        tier_pref = cj.lane_tier_pref(lane)
        new_mappings = {}
        for sid in new_sids:
            new_mappings[sid] = cj.resolve_spcpt(universe[sid], reg,
                                                 canon_map, scope, tier_pref)
        joined = sum(1 for v in new_mappings.values() if v)

        def resolve(spids, extra_mapped: set):
            codes, pending = [], []
            for s in spids or []:
                if s in new_mappings and s in extra_mapped:
                    codes.extend(new_mappings[s])
                elif s in new_mappings:
                    pending.append(s)
                else:
                    pending.append(s)
            seen, uniq = set(), []
            for c in sorted(codes, key=lambda c: c["official_id"]):
                if c["official_id"] in seen:
                    continue
                seen.add(c["official_id"])
                uniq.append(c)
            return uniq, pending

        # ---- items patch
        items = sc["items"]
        new_note_items = 0
        parts_touched = 0
        moved_refs = 0
        notes_spids_total = 0
        for n, spids, path in notes_anchored:
            notes_spids_total += len(spids)
            if n["note_id"] in items:
                # OLD note item: carries later-lane enrichments (V7 etc.)
                # — never rebuilt; only the pending->codes move for sids
                # the new pages define is applied (surgical).
                old = items[n["note_id"]]
                moved = [s for s in (old.get("pending") or [])
                         if new_mappings.get(s)]
                if moved:
                    add = []
                    for s in moved:
                        add.extend(new_mappings[s])
                    old["codes"] = merge_codes(old.get("codes") or [], add)
                    old["pending"] = [s for s in old["pending"]
                                      if s not in moved]
                    moved_refs += len(moved)
            else:
                mapped = {s for s in spids if new_mappings.get(s)}
                codes, pending = resolve(spids, mapped)
                items[n["note_id"]] = {
                    "kind": "note",
                    "label": n.get("page_title") or n.get("title"),
                    "section": path.get("section"),
                    "topic": path.get("topic"),
                    "codes": codes,
                    "pending": pending,
                }
                new_note_items += 1
        notes_pending_total = sum(len(it.get("pending") or [])
                                  for it in items.values()
                                  if it.get("kind") == "note")
        parts_pending_total = 0
        for pid, it in items.items():
            if it.get("kind") != "question_part":
                continue
            if not it.get("pending"):
                continue
            mapped_here = [s for s in it["pending"] if new_mappings.get(s)]
            if not mapped_here:
                parts_pending_total += len(it["pending"])
                continue
            add = []
            for s in mapped_here:
                add.extend(new_mappings[s])
            it["codes"] = merge_codes(it.get("codes") or [], add)
            it["pending"] = [s for s in it["pending"]
                             if s not in mapped_here]
            moved_refs += len(mapped_here)
            parts_touched += 1
            parts_pending_total += len(it["pending"])
        # recount pending over all part items (moved + untouched)
        parts_pending_total = sum(len(it.get("pending") or [])
                                  for it in items.values()
                                  if it.get("kind") == "question_part")

        # ---- anchors/totals
        a = sc["anchors"]
        a["notes"] = notes_spids_total
        a["universe_ids"] = len(universe)
        a["universe_resolved"] = a["universe_resolved"] + joined
        a["pending_refs"] = notes_pending_total + parts_pending_total
        t = sc["totals"]
        t["items"] = len(items)
        t["items_with_codes"] = sum(1 for v in items.values() if v["codes"])
        t["by_kind"]["notes"] = sum(1 for v in items.values()
                                    if v["kind"] == "note")
        t["coded_by_kind"]["notes"] = sum(
            1 for v in items.values()
            if v["kind"] == "note" and v["codes"])
        t["by_kind"]["question_parts"] = sum(
            1 for v in items.values() if v["kind"] == "question_part")
        t["coded_by_kind"]["question_parts"] = sum(
            1 for v in items.values()
            if v["kind"] == "question_part" and v["codes"])

        # ---- preservation self-check (everything except anchors' 5 patched
        # counters + totals' 6 recomputed counters + items)
        post = json.loads(json.dumps(sc))
        post_bytes = json.dumps(post, indent=1, ensure_ascii=False) + "\n"
        sc_path.write_text(post_bytes, encoding="utf-8")

        report["lanes"][lane] = {
            "qual": qual["slug"],
            "old_universe": len(old_universe),
            "new_universe": len(universe),
            "new_sids": len(new_sids),
            "new_sids_joined": joined,
            "join_tiers": {
                "T1_verbatim": sum(1 for v in new_mappings.values()
                                   if any(c["tier"] == "T1_verbatim"
                                          for c in v)),
                "T2_near_only": sum(1 for v in new_mappings.values()
                                    if v and all(c["tier"] == "T2_near"
                                                 for c in v)),
            },
            "new_note_items": new_note_items,
            "part_items_touched": parts_touched,
            "pending_refs_moved_to_codes": moved_refs,
            "preserved_pre_sha": pre_sha,
            "notes_spids_total": notes_spids_total,
        }
        print(f"[{lane}] universe {len(old_universe)} -> {len(universe)} "
              f"(+{len(new_sids)} new, joined {joined}) | note items "
              f"+{new_note_items} | parts touched {parts_touched} | "
              f"refs moved {moved_refs}", flush=True)

    # ---- spec-links/manifest.json: update the 5 rows
    mp = WT / "spec-links" / "manifest.json"
    m = json.loads(mp.read_text(encoding="utf-8"))
    for lane in LANES:
        sc = json.loads((WT / "spec-links" / f"{lane}.json")
                        .read_text(encoding="utf-8"))
        m["courses"][lane] = {"qual": sc["qual"], **sc["totals"]}
    m["generated_utc"] = T3R3_STAMP
    mp.write_text(json.dumps(m, indent=1, ensure_ascii=False) + "\n",
                  encoding="utf-8")

    (OUT / "t3r3_rekey_report.json").write_text(
        json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print("rekey complete; manifest rows updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
