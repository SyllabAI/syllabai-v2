#!/usr/bin/env python3
"""T-SPECS-CIE-CONSUME-1 — learner-UI consumption of the ACCEPTED spec-links sidecars.

Fires REJOIN-1 record NEXT #2 (== GATE-1 record NEXT #1) on the operator's
explicit 'Start' directive (2026-10-20, zai-web, gateway trace 1a1585c244ccd141).

Consumption law (REJOIN-1 NEXT #2 verbatim semantics):
  - verdict semantics: operator-verdict entries (V1-V4) are authoritative;
  - T2_near: accepted-near, NON-AUTHORITATIVE hint — carried in the map as
    items[].t2HintCodes, NEVER in items[].codes, NEVER in bundle linkage;
  - the rejoin's J*-tier entries: consumed post-gate (ACCEPTED, identity-grade);
  - operator sid-anchors (anchors.operatorSidAnchors, T-RULE-T2-APPLY-2):
    sid-level operator rulings -> spcptToOfficial add-if-absent / verify-if-equal /
    conflict-keep+disclose (NO-GUESS); added sids leave spcptUnmapped; battery A1.

Pipeline (deterministic, fixed stamp, fail-loud):
  A  pins      sidecar review states + sha256s + registry/spine/bundle presence
  B  merge     sidecar ACCEPTED codes -> content-maps items (strongest-lineage
               dedup) + REJOIN sheet sid->code upgrades -> spcptToOfficial
  C  rekey     refreshed bundles from the COMMITTED bundles (math-repair and
               prune work preserved verbatim; only linkage fields + manifest
               pin move) -> staging
  D  battery   B1..X1 in-engine, all fail-closed
  E  write     staging tree + _report_cie_consume.json (repo apply is a
               separate, explicit step)

Lineage precedence for dedup (strongest first):
  sidecar operator-verdict (V*) > sidecar T1_verbatim > sidecar J* >
  upstream_item_join (ladder) > sme_declared_link_rekey > subtopic_title_scope

Pin of record: syllabai-resources origin/main 3838a264 (the T-RULE-T2-APPLY-2
ADOPTION advance, operator order 'adopt the consume-law on v2 branch', trace
1a164dcf6cff9061): consumed vintage c5f20c52 (the CIE-REFRESH-1 re-key, v2
8e740fc4) -> the PR-#49-merged tip 3838a264, verified: SME-RevisionNotes,
SME-ExamQuestion, Official-Specifications tree-sha-IDENTICAL to the c5f20c52
pin; Official-ExamQuestion moved but 100% igcse-chemistry-19 wave-19 exporter
surface (not an engine input); scripts moved but the engine's ONE script input
cie_rejoin_resolutions.yaml is blob-identical (2bcd4db3, sheet 634/166 pins
hold); the ONLY consumed-input delta is spec-links/ — 8 sidecars of record:
the 23 tranche-2 operator sid-anchors (anchors.operatorSidAnchors, PR #49,
5b85ea3) + the pending item-plane verdict rounds (T-RULE-T2-B01 132c4b6,
B02 e4f4a34, COMPLETE-1-BAND-B geo-25 58d7f68, PARSE-REPAIR-1/2 06de1f2a +
b83a3799), all consume-authoritative by the sidecar_rank law.

TRANCHE-1 RE-RUN (2026-10-21, operator order 'tranche-1', trace
1a15e4200e6af579): consumes the tranche-1 verdict sidecars — the 155-part
T2_near review queue of the anchor-gap census receipt promoted to the V*
authoritative class. The consumption law is UNCHANGED (this engine's semantics
already rank V* first and hold T2_near as hints).

T-RULE-T2-APPLY-2 ADOPTION (2026-10-22, operator order 'adopt the consume-law
on v2 branch', trace 1a164dcf6cff9061): the Stage B operator sid-anchor law
(anchors.operatorSidAnchors -> spcptToOfficial add-if-absent / verify-if-equal /
conflict-keep+disclose; added sids leave spcptUnmapped; census sidAnchors;
battery A1) adopted of record at the pin advance to the PR-#49-merged tip.

T-RULE-T2-V8-RETRACT-1 run-003 (2026-10-23, operator order '7-sid V8 retraction
batch', trace 1a16541e55a06bd1): the operator V8-retraction law — the Stage B
surgical (item, code) drops from anchors.v8Retraction (L_SIDECAR V8 operator-
verdict mirrors only, NO-GUESS), the zero-code mirror, the M1 provenance-checked
exemption, the per-course guard — of record at the pin advance to the PR-#68-
merged tip e7c7a68.

T-RULE-T2-MISTAG-1 (2026-10-23, operator order '10-mis-tag re-point batch',
trace 1a1658227c0c0365): the operator mis-tag re-point law — the 10 mis-tagged
question parts (T-RULE-T2-COND-1 misTags[10]) re-pointed to their spine-verified
true homes in anchors.misTagRepoints (schema syllabai.operator-mis-tag-repoint/
1.0): the SAME surgical (item, code) drop semantics as the V8-retraction law
(L_SIDECAR V8 operator-verdict mirrors only, NO-GUESS) + additions flow through
the normal sidecar_rank law (tier tranche2_mis_tag_repoint, method
operator_verdict); the sid-anchor plane stays byte-frozen (sidAnchors 0/23/0
fixed point); per-course guard: misTagRepointDropped <=
anchors.misTagRepoints.counts.entriesRemoved — of record at the pin advance to
the PR-#69-merged tip ea21a72.

T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-001 (2026-10-25, operator order 'v2
consume-lane pin advance', trace 1a16dda5d7cfb325): the wave-vintage pin
advance — the committed-substrate residue wave (T-RULE-T3-SUBSTRATE-1 run-002)
moved the SME trees 4,342 carriers formatting-only (transpile_alt KaTeX alt);
consumed-input delta ZERO at 6dc1f0a2..31b0ef4a (spec-links/ tree-identical
e6b0b3a9, rejoin sheet blob-identical, SME-ExamQuestion/*/spec_point_index.json
0-file delta fleet-wide, Official-Specifications tree-sha-identical c95ed99f);
quiescent pin-vintage convergence of the fleet at the resources tip 31b0ef4a
(the run-006/007 shape on a moved vintage) — of record at the pin advance from
6dc1f0a2.

T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-002 (2026-10-25, operator order 'Fire',
trace 1a16f39798b9d6c1 — the named next rung disclosed at the run-001 landing):
the second pin-vintage rung. Input classification at 31b0ef4a..09842f9f (10
commits: T-BOOK-047 u2:c14 authoring+flip, the UGM-Assets image plane 976
figures, the handover-rule docs, the f-0019 filing, T-PARSE-YCH11-1 R2 polish
harvest, T-PARSE-YCH12-1 SB2 parse — all CourseLessons/UGM-Assets/books/parsed
planes): consumed-input delta ZERO — spec-links/ tree-identical, rejoin sheet
blob-identical 2bcd4db3; quiescent pin-vintage convergence of the fleet at the
resources tip 09842f9f (the run-006/007/001 shape on a moved vintage) — of
record at the pin advance from 31b0ef4a.

T-RULE-T3-CONSUME-PIN-ADVANCE-1 run-003 (2026-10-25, operator order 'Ok proceed',
trace 1a17484361a63449 — the named next rung disclosed at the run-002 landing):
the third pin-vintage rung. Input classification at 09842f9f..e481cb47 (~26
commits: T-BOOK-054 u3:c21 and T-BOOK-055 u4:c22 authoring+flips, UGM lanes 11/12
corpora + enrichments, converter v0.17.0-v0.17.3, the wave-24 G8 fixes, BL-008
waves, SIB v1.2.2, the physics PUA tranche — all
SME-GuidedLessons/CourseLessons/Official-ExamQuestion/UGM-Resources/
SubjectIntelligence/books/Official-Specifications planes): consumed-input delta
ZERO — spec-links/ tree-identical (95 files at both pins), rejoin sheet
blob-identical 2bcd4db3; quiescent pin-vintage convergence of the fleet at the
resources tip 22543473 (the run-006/007/001/002 shape on a moved vintage) — of
record at the pin advance from 09842f9f (the tip moved twice in-run —
22543473 -> 64f45861 -> e481cb47, consumed-input delta ZERO at every sub-range
— the rung re-targeted to the commit-time tip per the run-002 discipline).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

HUB = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = os.path.dirname(os.path.dirname(HUB))
sys.path.insert(0, os.path.join(HUB, "scripts"))
import attach_official_map as AOM  # noqa: E402
import build_official_content as BOC  # noqa: E402  (item_codes + SPCPT_RE reused verbatim)

RESOURCES = os.environ.get("CIE_RESOURCES", "/home/z/my-project/syllabai-resources")
SIDECAR_DIR = os.path.join(RESOURCES, "spec-links")
SHEET_PATH = os.path.join(RESOURCES, "scripts", "cie_rejoin_resolutions.yaml")
# T-SPECS-CIE-CONSUME-2 run-001 (the JOIN-2 chain of record stage #3, operator
# directive "verdict fills -> review gate -> v2 consume", trace
# 1a183e66619bd6dd): the wave-2 AS lanes' re-join resolutions of record live
# in the REJOIN-2 sheet — consumed as a second sheet input with per-sheet
# via provenance; every other engine method untouched.
SHEET2_PATH = os.path.join(RESOURCES, "scripts", "cie_rejoin_wave2as_resolutions.yaml")
SHEET3_PATH = os.path.join(RESOURCES, "scripts", "cie_wave3_resolutions.yaml")  # REJOIN-3 (the wave3 chain, trace 1a18bc6701800065)
STAGING = os.environ.get("CIE_CONSUME_STAGING", "/home/z/my-project/work/cie-consume-staging")
PIN = "9cf6037e31c1ac8eb88a0cb6f545438689728a1d"  # advanced of record: the T-SPECS-CIE-WAVE3 chain tip (JOIN-3/REJOIN-3/VERDICT-3/GATE-3 + the sheet sid fix + the F119 4CH1 r2-consumed closing disclosure), operator trace 1a18bc6701800065
STAMP = "2026-10-29T16:00:00Z"
GATE_TRACE = "1a183e66619bd6dd"
SCHEMA = "syllabai.official-attachment/1.0"
L_SIDECAR = "spec_links_sidecar_accepted"
RANK = {  # lower wins on the same (item, code) key
    "operator_verdict": 0, "T1_verbatim": 1, "J": 2,
    "upstream_item_join": 3, "sme_declared_link_rekey": 4, "subtopic_title_scope": 5,
}


def die(msg):
    print(f"ABORT: {msg}", flush=True)
    sys.exit(1)


def sha256_file(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def load_json(p):
    return json.load(open(p, encoding="utf8"))


def dumps_map(obj):
    return json.dumps(obj, indent=1, sort_keys=True) + "\n"


def dumps_bundle(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def sidecar_rank(entry):  # noqa: C901
    """(rank, seq-class) for dedup: sidecar V* < T1 < J*; ladder classes after."""
    t = entry.get("tier") or ""
    m = entry.get("method") or ""
    if entry.get("lineage") == L_SIDECAR:
        if m == "operator_verdict" or t.startswith("V"):
            return 0
        if t == "T1_verbatim":
            return 1
        if t.startswith("J"):
            return 2
        die(f"unranked sidecar tier {t!r}")
    ln = entry.get("lineage")
    if ln in RANK:
        return RANK[ln]
    die(f"unranked lineage {ln!r}")


def load_sheet():
    import yaml
    resolves, other = {}, defaultdict(int)
    for path, via in ((SHEET_PATH, "REJOIN-1:gate-1"),
                      (SHEET2_PATH, "REJOIN-2:gate-2"),
                      (SHEET3_PATH, "REJOIN-3:gate-3")):
        doc = yaml.safe_load(open(path, encoding="utf8"))
        for v in doc["verdicts"]:
            key = (v["lane"], v["id"])
            if v["verdict"] == "resolve":
                if key in resolves:
                    die(f"sheet resolve overlap {key}")
                resolves[key] = dict(v, via=via)
            else:
                other[v["verdict"]] += 1
        other["ambiguous"] += len(doc.get("ambiguous") or [])
    return None, resolves, dict(other)


def retraction_pairs(sd):
    """T-RULE-T2-V8-RETRACT-1: the operator V8-retraction law.

    Returns the exact {(item_id, official_code): sid} surface the operator
    ruling retracted (anchors.v8Retraction.sids[*].removed, resources PR #68).
    The map is a DERIVED mirror of the sidecar for L_SIDECAR codes: when the
    sidecar of record no longer carries a verdict, its mirror must not be
    resurrected by the ladder. Surgical keying on (item, code) pairs only;
    any other lineage carrying the same code is preserved verbatim."""
    out = {}
    blk = ((sd.get("anchors") or {}).get("v8Retraction") or {})
    for k, r in (blk.get("sids") or {}).items():
        for e in (r.get("removed") or []):
            out[(e["item"], e["code"])] = k
    return out


def mistag_pairs(sd):
    """T-RULE-T2-MISTAG-1: the operator mis-tag re-point law.

    Returns the exact {(item_id, official_code): part} surface the operator
    batch re-pointed (anchors.misTagRepoints.parts[*].removed, resources
    PR #69). Same surgical semantics as retraction_pairs: the sidecar of
    record no longer carries these V8 mirrors on the re-pointed parts, so
    their ladder mirrors must drop; any other lineage carrying the same code
    is preserved verbatim (NO-GUESS)."""
    out = {}
    blk = ((sd.get("anchors") or {}).get("misTagRepoints") or {})
    for k, r in (blk.get("parts") or {}).items():
        for e in (r.get("removed") or []):
            out[(e["item"], e["code"])] = k
    return out


def merge_course(slug, sd, att, spine, ctx, spine_set, sheet_rows, retract=None, mistag=None, bundle_ids=None):
    """Stage B: sidecar -> map merge. Returns (new_att, stats).

    T-SPECS-CIE-CONSUME-3 addition (the wave3 chain, operator trace
    1a18bc6701800065): the EQ/FC wave consume was content-maps byte-untouched,
    so the wave's new items exist in the hub bundles WITHOUT map rows. The
    additive item-creation law: a sidecar item absent from the map is CREATED
    (kind from the sidecar; codes merged by the strongest-lineage law below)
    IFF its id is verbatim-present in the hub bundle plane (bundle_ids); ids
    absent from BOTH map and bundle are the honest sidecar_only class (the
    corpus-beyond-hub census the original guard was built for)."""
    st = defaultdict(int)
    items = att["items"]
    new_items = OrderedDict()
    sidecar_only = []
    for iid, rec in items.items():
        new_items[iid] = OrderedDict(rec)  # shallow copy; codes replaced below

    tier_census, method_census = defaultdict(int), defaultdict(int)
    t2_total = 0
    codes_added = codes_kept_ladder = 0

    for iid, sit in sd["items"].items():
        if iid not in new_items:
            if bundle_ids is not None and iid in bundle_ids:
                # the additive item-creation law (CONSUME-3): the hub serves
                # this id; the map row is created here from the sidecar
                st["itemsCreated"] += 1
                rec = OrderedDict(kind=sit.get("kind"), codes=[])
                new_items[iid] = rec
            else:
                sidecar_only.append(iid)
                continue
        rec = new_items[iid]
        if rec.get("kind") != sit.get("kind"):
            die(f"{slug}: kind mismatch {iid}: map {rec.get('kind')!r} vs sidecar {sit.get('kind')!r}")
        existing = list(rec.get("codes") or [])
        cand = []
        for seq, e in enumerate(existing):
            if retract and (iid, e.get("officialCode")) in retract:
                # the operator V8-retraction law (T-RULE-T2-V8-RETRACT-1):
                # drop the L_SIDECAR V8 mirror the ruling retracted; a same-code
                # entry from any OTHER lineage is preserved verbatim (NO-GUESS).
                if (e.get("lineage") != L_SIDECAR
                        or not str(e.get("tier", "")).startswith("V8")
                        or e.get("method") != "operator_verdict"):
                    die(f"{slug}: retraction {iid}/{e.get('officialCode')} targets a "
                        f"non-sidecar entry (lineage {e.get('lineage')!r}, "
                        f"tier {e.get('tier')!r}, method {e.get('method')!r}) — NO-GUESS")
                st["retractDropped"] += 1
                continue
            if mistag and (iid, e.get("officialCode")) in mistag:
                # the operator mis-tag re-point law (T-RULE-T2-MISTAG-1): drop
                # the L_SIDECAR V8 mirror the batch re-pointed; same surgical
                # semantics and NO-GUESS guard as the retraction law.
                if (e.get("lineage") != L_SIDECAR
                        or not str(e.get("tier", "")).startswith("V8")
                        or e.get("method") != "operator_verdict"):
                    die(f"{slug}: mis-tag re-point {iid}/{e.get('officialCode')} targets a "
                        f"non-sidecar entry (lineage {e.get('lineage')!r}, "
                        f"tier {e.get('tier')!r}, method {e.get('method')!r}) — NO-GUESS")
                st["mistagDropped"] += 1
                continue
            cand.append((sidecar_rank(e), seq, e, "ladder"))
        accepted = [e for e in (sit.get("codes") or []) if e.get("tier") != "T2_near"]
        hints = [e for e in (sit.get("codes") or []) if e.get("tier") == "T2_near"]
        t2_total += len(hints)
        for seq, e in enumerate(accepted):
            sc = AOM.resolve_spine_code(e.get("official_code"), e.get("official_id"), None, ctx, spine_set)
            entry = OrderedDict(
                officialId=e.get("official_id"), officialCode=e.get("official_code"),
                unit=None, tier=e.get("tier"), method=e.get("method"), score=None,
                lineage=L_SIDECAR, spineCode=sc)
            cand.append((sidecar_rank(entry), 1000 + seq, entry, "sidecar"))
            tier_census[e.get("tier")] += 1
            method_census[e.get("method")] += 1
        # dedup strongest-wins per code key, deterministic order
        by_key, order = {}, []
        for rank, seq, e, origin in sorted(cand, key=lambda t: (t[2].get("spineCode") or t[2].get("officialCode") or "", t[0], t[1])):
            k = e.get("spineCode") or e.get("officialCode")
            if k not in by_key:
                by_key[k] = e
                order.append((k, origin))
        merged = [by_key[k] for k, _ in order]
        # final order: sidecar-class first (sidecar seq), then ladder (original order)
        side = [e for e in merged if e.get("lineage") == L_SIDECAR]
        ladd = [e for e in merged if e.get("lineage") != L_SIDECAR]
        # the zero-code mirror (T-RULE-T2-V8-RETRACT-1): a sidecar item whose
        # codes all retracted mirrors to the empty unmapped state — the stale
        # committed codes must not survive a `merged`-empty guard.
        rec["codes"] = side + ladd
        if side + ladd:
            rec.pop("unmapped", None)
        else:
            rec["unmapped"] = True
        codes_added += len(side)
        codes_kept_ladder += len(ladd)
        if hints:
            rec["t2HintCodes"] = [
                OrderedDict(officialId=h.get("official_id"), officialCode=h.get("official_code"),
                            tier=h.get("tier"), method=h.get("method"),
                            spineCode=AOM.resolve_spine_code(h.get("official_code"), h.get("official_id"), None, ctx, spine_set))
                for h in hints]
        elif "t2HintCodes" in rec:
            # tranche-1 amendment (trace 1a15e4200e6af579): the map mirrors the
            # sidecar's CURRENT hint set — when the sidecar no longer carries
            # T2_near on this item (the verdict round promoted them to V*), the
            # stale hints copied forward from the prior consume are dropped.
            # Remaining hints (sidecar still T2_near) are rebuilt fresh above.
            rec.pop("t2HintCodes")
        new_items[iid] = rec

    # ---- sheet: sid -> code upgrades onto spcptToOfficial ------------------
    spcpt = OrderedDict((k, OrderedDict(v)) for k, v in att["spcptToOfficial"].items())
    sheet_added = sheet_upgraded = sheet_conflict = 0
    for (lane, sid), v in sheet_rows.items():
        code = v.get("official_code")
        if not code:
            continue
        row = spcpt.get(sid)
        if row is not None:
            if row.get("officialCode") != code:
                sheet_conflict += 1  # NO-GUESS: keep the ladder row, disclose
                continue
            if row.get("lineage") == L_SIDECAR:
                continue
            row["tier"] = v.get("tier")
            row["method"] = "cie_index_rejoin"
            row["lineage"] = L_SIDECAR
            row["via"] = v.get("via", "REJOIN-1:gate-1")
            sheet_upgraded += 1
        else:
            spcpt[sid] = OrderedDict(
                officialId=v.get("official_id"), officialCode=code, officialCodes=[code],
                unit=None, tier=v.get("tier"), method="cie_index_rejoin", score=None,
                lineage=L_SIDECAR, via=v.get("via", "REJOIN-1:gate-1"))
            sheet_added += 1

    # ---- sidecar operator sid-anchors -> spcptToOfficial ---------------------
    # T-RULE-T2-APPLY-2 law (sidecar block anchors.operatorSidAnchors, schema
    # syllabai.operator-sid-anchors/1.0): add-if-absent / verify-if-equal /
    # conflict-keep+disclose (NO-GUESS — the sheet law's conflict posture);
    # added sids leave spcptUnmapped (registry-plane law of v2 @ a9bd2488,
    # T-RULE-T2-APPLY-1). Sheet rows carry ZERO entries for these sids
    # (censused of record) — no provenance-overwrite vector.
    an_added = an_verified = an_kept = 0
    oan = ((sd.get("anchors") or {}).get("operatorSidAnchors") or {}).get("anchors") or {}
    unmapped = list(att.get("spcptUnmapped") or [])
    for sid, ar in oan.items():
        codes = list(ar.get("officialCodes") or [])
        if not codes:
            continue
        row = spcpt.get(sid)
        if row is None:
            spcpt[sid] = OrderedDict(
                officialId=ar.get("officialId") or codes[0],
                officialCode=codes[0], officialCodes=codes,
                unit=None, tier=ar.get("tier"), method=ar.get("method"),
                score=None, lineage=ar.get("lineage") or L_SIDECAR,
                via=ar.get("via"))
            if sid in unmapped:
                unmapped.remove(sid)
            an_added += 1
        else:
            have = list(row.get("officialCodes") or
                        ([row.get("officialCode")] if row.get("officialCode") else []))
            if have != codes:
                an_kept += 1  # NO-GUESS: keep the committed row, disclose
            else:
                an_verified += 1

    new_att = OrderedDict(att)
    new_att["items"] = new_items
    new_att["spcptToOfficial"] = spcpt
    new_att["spcptUnmapped"] = unmapped

    # ---- recompute coverage / reconciliation --------------------------------
    def cov(kind, total):
        ids = [i for i, r in new_items.items() if r["kind"] == kind]
        coded = [i for i in ids if new_items[i].get("codes")]
        return OrderedDict(total=total, coded=len(coded), unmapped=len(ids) - len(coded),
                           viaSubtopicScope=len([i for i in ids if new_items[i].get("subtopicScopedIds")]))

    attached = defaultdict(list)
    for iid, rec in new_items.items():
        for c in rec.get("codes") or []:
            attached[c.get("spineCode")].append(iid)
    spine_hit = {c for c in attached if c is not None}
    outside = len(attached.get(None, []))
    uncovered = sorted(spine_set - spine_hit)

    inputs = OrderedDict(att["inputs"])
    sc_path = os.path.join(SIDECAR_DIR, f"{slug}.json")
    inputs[f"spec-links/{slug}.json"] = OrderedDict(sha256=sha256_file(sc_path))
    if sheet_rows:
        inputs["scripts/cie_rejoin_resolutions.yaml"] = OrderedDict(sha256=sha256_file(SHEET_PATH))
        inputs["scripts/cie_rejoin_wave2as_resolutions.yaml"] = OrderedDict(sha256=sha256_file(SHEET2_PATH))
        inputs["scripts/cie_wave3_resolutions.yaml"] = OrderedDict(sha256=sha256_file(SHEET3_PATH))

    new_att["resourcesSha"] = PIN
    new_att["generatedUtc"] = STAMP
    new_att["inputs"] = inputs
    src = new_att["sources"]
    src["specLinks"] = OrderedDict(
        regime=L_SIDECAR,
        derivation="ACCEPTED spec-links sidecar (T-SPECS-CIE join/verdict/gate/rejoin chain) merged "
                   "item-level: operator-verdict authoritative, T1 gate-verified, J* post-gate "
                   "identity-grade; T2_near carried as non-authoritative items[].t2HintCodes only; "
                   "REJOIN sheet sid->code rows upgrade/add spcptToOfficial (conflicts kept, disclosed)",
        sidecar=f"spec-links/{slug}.json",
        reviewState=OrderedDict(state=sd["review_state"].get("state"),
                                rejoin=(sd["review_state"].get("rejoin") or {}).get("state"),
                                verdict=(sd["review_state"].get("verdict") or {}).get("state")),
        census=OrderedDict(
            codesByTier=dict(sorted(tier_census.items())), codesByMethod=dict(sorted(method_census.items())),
            sidecarItems=len(sd["items"]), itemsWithCodes=len([1 for it in sd["items"].values() if it.get("codes")]),
            sidecarCodes=len([1 for it in sd["items"].values() for e in (it.get("codes") or [])]),
            t2Hints=t2_total, sidecarOnlyItems=len(sidecar_only),
            codesAttachedFromSidecar=codes_added, ladderCodesRetained=codes_kept_ladder,
            sidAnchors=OrderedDict(added=an_added, verified=an_verified, conflictsKept=an_kept)),
        sheetUpgrades=OrderedDict(added=sheet_added, upgraded=sheet_upgraded, conflictsKept=sheet_conflict) if (sheet_rows or sheet_upgraded or sheet_added) else None,
        t2Policy="T2_near is a non-authoritative hint (GATE-1 tier_policy); never in codes/linkage")
    sp = new_att["sources"]["specPointMap"]
    sp["sidecarConsumed"] = True
    new_att["reconciliation"] = OrderedDict(
        spineSpecPoints=len(spine_set), distinctCodesAttached=len(spine_hit),
        spineHitCodes=len(spine_hit),
        codesOutsideSpine=([OrderedDict(items=outside, note="declarations whose derived code has no verbatim match in this course's spine — kept, not dropped")] if outside else []),
        itemsOutsideSpine=outside, uncoveredSpineCodes=len(uncovered),
        uncoveredSpineCodeList=uncovered)
    pre_cov = att["contentCoverage"]
    new_att["contentCoverage"] = OrderedDict(
        notes=cov("note", pre_cov["notes"]["total"]),
        questionParts=cov("question_part", pre_cov["questionParts"]["total"]),
        flashcards=cov("flashcard", pre_cov["flashcards"]["total"]))
    return new_att, dict(tier_census), dict(method_census), sidecar_only, \
        (sheet_added, sheet_upgraded, sheet_conflict), (len(spine_hit), len(uncovered), outside), \
        st["retractDropped"], st["mistagDropped"]


def spcpt_display_map(att, ctx, spine_set):
    """spcpt -> display code (spine-resolved preferred), the BOC lines 90-98 form."""
    return {
        sid: {
            "spineCode": AOM.resolve_spine_code(m.get("officialCode"), m.get("officialId"), m.get("unit"), ctx, spine_set),
            "officialCode": m.get("officialCode"),
        }
        for sid, m in att["spcptToOfficial"].items()
    }


def refresh_bundle(slug, att):
    """Stage C: rekey refresh from the COMMITTED bundle (already official-spine).

    Preserves the phase-3 math repair + prune work verbatim: source files are
    the committed ones; only linkage fields + manifest.officialSpine.resourcesSha
    move. smeSpecPointIds sourced from the committed smeSpecPointIds (the
    already-rekeyed form — the BOC specPointIds fallback would corrupt them)."""
    cdir = os.path.join(HUB, "content", slug)
    manifest = load_json(os.path.join(cdir, "manifest.json"))
    if manifest.get("treeKind") != "official-spine":
        die(f"{slug}: committed bundle is {manifest.get('treeKind')!r}, expected official-spine")
    board = (manifest.get("curriculum") or {}).get("board")
    spine = load_json(os.path.join(HUB, "spines", f"{slug}.json"))
    spine_codes = {n["code"] for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"}
    ctx = AOM.course_ctx(spine["meta"].get("scopeRule") or {}, spine_codes)
    spcpt_map = spcpt_display_map(att, ctx, spine_codes)
    items = att["items"]
    _ic = lambda e: BOC.item_codes(e, spine_codes)  # noqa: E731
    stats = {"boardCarried": board, "smeFallbacks": 0, "inlineNewRewrites": 0}

    curriculum = load_json(os.path.join(cdir, "curriculum.json"))

    src_notes = load_json(os.path.join(cdir, "notes.json"))
    notes = []
    for n in src_notes:
        entry = items.get(n["noteId"], {})
        codes = _ic(entry)
        sme = n.get("smeSpecPointIds")
        if sme is None:
            sme = n.get("specPointIds") or []
            stats["smeFallbacks"] += 1
        body = n.get("bodyMd") or ""
        resid = []

        def sub(m: re.Match) -> str:
            sid = m.group(0)
            mapped = spcpt_map.get(sid) or {}
            code = mapped.get("spineCode") or mapped.get("officialCode")
            if not code:
                resid.append(sid)
                return sid
            return code

        n_tokens = len(BOC.SPCPT_RE.findall(body))
        new_body = BOC.SPCPT_RE.sub(sub, body)
        stats["inlineNewRewrites"] += n_tokens - len(resid)
        notes.append({**n, "specPointIds": codes, "specPointCodes": codes,
                      "smeSpecPointIds": sme, "bodyMd": new_body})

    fc_path = os.path.join(cdir, "flashcards.json")
    src_cards = load_json(fc_path) if os.path.exists(fc_path) else []
    cards = []
    for f in src_cards:
        codes = _ic(items.get(f["id"], {}))
        sme = f.get("smeSpecPointIds")
        if sme is None:
            sme = f.get("specPointIds") or []
            stats["smeFallbacks"] += 1
        cards.append({**f, "specPointIds": codes, "specPointCode": codes[0] if codes else None,
                      "smeSpecPointIds": sme})

    src_sets = load_json(os.path.join(cdir, "questions.json"))
    qsets = []
    for s in src_sets:
        s2 = {**s, "questions": []}
        for q in s.get("questions", []):
            q2 = {**q, "parts": []}
            for p in q.get("parts", []):
                codes = _ic(items.get(p["id"], {}))
                sme = p.get("smeSpecPointIds")
                if sme is None:
                    sme = p.get("specPointIds") or []
                    stats["smeFallbacks"] += 1
                q2["parts"].append({**p, "specPointIds": codes, "specPointCodes": codes,
                                    "smeSpecPointIds": sme})
            s2["questions"].append(q2)
        qsets.append(s2)

    new_manifest = {**manifest,
                    "officialSpine": {**manifest["officialSpine"], "resourcesSha": PIN}}
    return {
        "curriculum.json": curriculum,
        "notes.json": notes,
        "flashcards.json": cards,
        "questions.json": qsets,
        "manifest.json": new_manifest,
    }, stats


def code_key(e):
    return e.get("spineCode") or e.get("officialCode")


def battery(slug, old_att, new_att, sd, committed, staged, sheet_rows, sidecar_only, recon, retract=None, mistag=None):
    """Stage D: per-course fail-closed assertions. Returns list of stat rows."""
    problems = []
    spine = load_json(os.path.join(HUB, "spines", f"{slug}.json"))
    spine_codes = {n["code"] for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"}

    # M1: no loss, no item drift — EXCEPT the operator V8-retraction surface
    # (T-RULE-T2-V8-RETRACT-1) and the operator mis-tag re-point surface
    # (T-RULE-T2-MISTAG-1): the rulings retracted/re-pointed exactly these
    # (item, code) pairs, so their disappearance is the ordered outcome, not
    # loss. Any other drop still fails closed.
    retract_keys = set(retract or ()) | set(mistag or ())
    # M1 (CONSUME-3 amendment): the additive item-creation law grows the item
    # set by exactly the created rows (sidecar items whose ids the hub bundle
    # serves); any other delta — above all any LOSS — still fails closed.
    created_ids = set(new_att["items"]) - set(old_att["items"])
    if set(old_att["items"]) - set(new_att["items"]):
        problems.append("M1 item-id set changed")
    if created_ids:
        # every created id must be a bundle-served sidecar item (the
        # item-creation law's membership guarantee), kinds must match
        for iid2 in created_ids:
            if new_att["items"][iid2].get("kind") not in ("note", "question_part"):
                problems.append(f"M1 created-kind drift {iid2}")
    for iid, old_rec in old_att["items"].items():
        old_keys = {code_key(c) for c in old_rec.get("codes") or []}
        new_keys = {code_key(c) for c in new_att["items"][iid].get("codes") or []}
        lost = old_keys - new_keys
        if lost:
            unexpected = {k for k in lost if (iid, k) not in retract_keys}
            dropped_expected = {k for k in lost if (iid, k) in retract_keys}
            for k in dropped_expected:
                src = [c for c in old_rec.get("codes") or [] if code_key(c) == k]
                if src and (src[0].get("lineage") != L_SIDECAR
                            or not str(src[0].get("tier", "")).startswith("V8")
                            or src[0].get("method") != "operator_verdict"):
                    unexpected.add(k)
            if unexpected:
                problems.append(f"M1 code loss {iid}: {sorted(unexpected)}")
        if new_att["items"][iid].get("kind") != old_rec.get("kind"):
            problems.append(f"M1 kind drift {iid}")

    # M2: T2 never authoritative
    for iid, rec in new_att["items"].items():
        for c in rec.get("codes") or []:
            if c.get("tier") == "T2_near":
                problems.append(f"M2 T2 in codes {iid}")

    # M3: sheet cross-foot (this lane's rows all resolve or disclose)
    lane_rows = [v for (lane, _sid), v in sheet_rows.items() if lane == slug]
    arj = (sd.get("anchors") or {}).get("rejoin") or {}
    if arj.get("state") and len(lane_rows) != arj.get("resolved_pairs"):
        problems.append(f"M3 sheet rows {len(lane_rows)} != sidecar resolved_pairs {arj.get('resolved_pairs')}")

    # R1: counts preserved through the rekey
    for name, kind_key, part_mode in (("notes.json", "noteId", False), ("flashcards.json", "id", False), ("questions.json", None, True)):
        src = load_json(os.path.join(HUB, "content", slug, name))
        out = staged[name]
        if part_mode:
            sp = sum(len(q.get("parts", [])) for s in src for q in s.get("questions", []))
            op = sum(len(q.get("parts", [])) for s in out for q in s.get("questions", []))
            if sp != op:
                problems.append(f"R1 parts drift {sp}->{op}")
        elif len(src) != len(out):
            problems.append(f"R1 {name} drift {len(src)}->{len(out)}")

    # R2: smeSpecPointIds byte-equal per item
    src_notes = {n["noteId"]: n for n in load_json(os.path.join(HUB, "content", slug, "notes.json"))}
    for n in staged["notes.json"]:
        if n["smeSpecPointIds"] != src_notes[n["noteId"]].get("smeSpecPointIds"):
            problems.append(f"R2 smeSpecPointIds drift note {n['noteId']}")
    fc_path = os.path.join(HUB, "content", slug, "flashcards.json")
    if os.path.exists(fc_path):
        src_cards = {f["id"]: f for f in load_json(fc_path)}
        for f in staged["flashcards.json"]:
            if f["smeSpecPointIds"] != src_cards[f["id"]].get("smeSpecPointIds"):
                problems.append(f"R2 smeSpecPointIds drift card {f['id']}")
    src_q = load_json(os.path.join(HUB, "content", slug, "questions.json"))
    src_parts = {p["id"]: p for s in src_q for q in s.get("questions", []) for p in q.get("parts", [])}
    for s in staged["questions.json"]:
        for q in s.get("questions", []):
            for p in q.get("parts", []):
                if p["smeSpecPointIds"] != src_parts[p["id"]].get("smeSpecPointIds"):
                    problems.append(f"R2 smeSpecPointIds drift part {p['id']}")

    # R3: bodyMd == old body with the UPDATED spcpt map applied (exact reconstruction)
    ctx = AOM.course_ctx(spine["meta"].get("scopeRule") or {}, spine_codes)
    new_disp = spcpt_display_map(new_att, ctx, spine_codes)

    def apply_map(body):
        def s(m):
            mapped = new_disp.get(m.group(0)) or {}
            return mapped.get("spineCode") or mapped.get("officialCode") or m.group(0)
        return BOC.SPCPT_RE.sub(s, body)

    for n in staged["notes.json"]:
        old_body = src_notes[n["noteId"]].get("bodyMd") or ""
        if apply_map(old_body) != (n.get("bodyMd") or ""):
            problems.append(f"R3 bodyMd not exact-substitution note {n['noteId']}")

    # R4: manifest diff == exactly officialSpine.resourcesSha; curriculum byte-equal
    sm = staged["manifest.json"]
    cm = load_json(os.path.join(HUB, "content", slug, "manifest.json"))
    diff_keys = {k for k in set(sm) | set(cm) if sm.get(k) != cm.get(k)}
    if diff_keys != {"officialSpine"}:
        # CIE-REFRESH-1 sessionSideAdaptation (re-applied run-006, band-D
        # disclosed): the re-run-at-moved-pin honest no-op — the adopted
        # flip manifest already carries the run pin, so the engine's
        # linkage-only refresh reproduces it byte-for-byte (diff == set()
        # AND the staged officialSpine.resourcesSha == PIN). The
        # serving-class manifest delta vs the GIT-committed state (counts/
        # generatedUtc/importSource/officialSpine) is verified exactly in
        # the lane apply evidence, not here.
        if diff_keys == set() and (sm.get("officialSpine") or {}).get("resourcesSha") == PIN:
            pass
        else:
            problems.append(f"R4 manifest diff {sorted(diff_keys)}")
    else:
        ospine = {k: v for k, v in sm["officialSpine"].items()}
        cspine = {k: v for k, v in cm["officialSpine"].items()}
        if {k for k in set(ospine) | set(cspine) if ospine.get(k) != cspine.get(k)} != {"resourcesSha"}:
            problems.append("R4 officialSpine diff beyond resourcesSha")
    if json.dumps(staged["curriculum.json"], sort_keys=True) != json.dumps(cm, sort_keys=True):
        # curriculum carried vs committed manifest? curriculum.json file vs committed curriculum.json
        pass
    cur_committed = load_json(os.path.join(HUB, "content", slug, "curriculum.json"))
    if json.dumps(staged["curriculum.json"], sort_keys=True) != json.dumps(cur_committed, sort_keys=True):
        problems.append("R4 curriculum drift")

    # R5+R6: G4 spine resolution + T2 absence in the STAGED linkage
    for n in staged["notes.json"]:
        for c in n["specPointIds"]:
            if c not in spine_codes:
                problems.append(f"R5 linkage outside spine note {n['noteId']}: {c}")
        if BOC.SPCPT_RE.search(json.dumps(n["specPointIds"])):
            problems.append(f"R6 spcpt survived note {n['noteId']}")
    for f in staged["flashcards.json"]:
        for c in f["specPointIds"] + ([f["specPointCode"]] if f.get("specPointCode") else []):
            if c and c not in spine_codes:
                problems.append(f"R5 linkage outside spine card {f['id']}: {c}")
    for s in staged["questions.json"]:
        for q in s.get("questions", []):
            for p in q.get("parts", []):
                for c in p["specPointIds"]:
                    if c not in spine_codes:
                        problems.append(f"R5 linkage outside spine part {p['id']}: {c}")

    # A1: operator sid-anchors law — plane exclusivity + census cross-foot
    oan = ((sd.get("anchors") or {}).get("operatorSidAnchors") or {}).get("anchors") or {}
    _verified = _kept = 0
    for sid, ar in oan.items():
        codes = list(ar.get("officialCodes") or [])
        if not codes:
            continue
        in_off = sid in new_att["spcptToOfficial"]
        in_um = sid in (new_att.get("spcptUnmapped") or [])
        if in_off and in_um:
            problems.append(f"A1 sid in both planes {sid}")
        row = new_att["spcptToOfficial"].get(sid)
        if row is None:
            problems.append(f"A1 anchor not merged {sid}")
            continue
        have = list(row.get("officialCodes") or
                    ([row.get("officialCode")] if row.get("officialCode") else []))
        if have != codes:
            _kept += 1  # conflict-kept: disclosed, not a defect
        else:
            _verified += 1
    sa = ((new_att.get("sources") or {}).get("specLinks") or {}).get("census", {}).get("sidAnchors") or {}
    if sa.get("added", 0) + sa.get("verified", 0) + sa.get("conflictsKept", 0) != _verified + _kept:
        problems.append(f"A1 census {dict(sa)} != battery added+verified={_verified} kept={_kept}")
    if sa.get("conflictsKept") != _kept:
        problems.append(f"A1 conflictsKept {sa.get('conflictsKept')} != battery {_kept}")

    ok = not problems
    row = OrderedDict(
        course=slug, ok=ok,
        spineHitCodes=recon[0], uncoveredSpineCodes=recon[1], codesOutsideSpine=recon[2],
        sidecarOnlyItems=len(sidecar_only), sheetRows=len(lane_rows),
        problems=problems[:12])
    return row, problems


def main() -> int:
    # ---- Stage A: input pins -----------------------------------------------
    import yaml  # noqa: F401  (asserted available)
    sheet_doc, sheet_resolves, sheet_other = load_sheet()
    print(f"sheet: resolves={len(sheet_resolves)} other={sheet_other}", flush=True)
    if len(sheet_resolves) != 759:
        die(f"sheet resolves {len(sheet_resolves)} != 759 (634 REJOIN-1 + "
            f"124 REJOIN-2 + 1 REJOIN-3 non-dispositioned; the 204 same-code "
            f"re-derivations trimmed of record)")
    if sheet_other.get("quarantine", 0) + sum(v for k, v in sheet_other.items() if k != "quarantine") != 288:
        die(f"sheet non-resolve {sheet_other} != 288 quarantines (166 + 34 + 88)")

    registry = load_json(os.path.join(HUB, "content", "courses.json"))
    reg_rows = {r["slug"]: r for r in (registry["courses"] if isinstance(registry, dict) else registry)}
    slugs = sorted(f[:-5] for f in os.listdir(SIDECAR_DIR) if f.startswith("cie-") and f.endswith(".json"))
    print(f"sidecars: {len(slugs)}", flush=True)

    report_rows, changed = [], []
    totals = defaultdict(int)
    for slug in slugs:
        sd = load_json(os.path.join(SIDECAR_DIR, f"{slug}.json"))
        rs = sd.get("review_state") or {}
        if rs.get("state") != "ACCEPTED":
            die(f"{slug}: sidecar state {rs.get('state')!r} != ACCEPTED")
        rj = rs.get("rejoin") or {}
        if rj and rj.get("state") != "ACCEPTED":
            die(f"{slug}: rejoin state {rj.get('state')!r} != ACCEPTED")

        map_path = os.path.join(HUB, "content-maps", f"{slug}.json")
        spine_path = os.path.join(HUB, "spines", f"{slug}.json")
        bundle_dir = os.path.join(HUB, "content", slug)
        if slug not in reg_rows:
            die(f"{slug}: no registry row")
        if not os.path.exists(map_path) or not os.path.exists(spine_path) or not os.path.isdir(bundle_dir):
            die(f"{slug}: missing map/spine/bundle")

        att = load_json(map_path)
        spine = load_json(spine_path)
        spine_codes = {n["code"] for n in spine["curriculum"]["nodes"] if n["family"] == "SPEC_POINT"}
        ctx = AOM.course_ctx(spine["meta"].get("scopeRule") or {}, spine_codes)
        sheet_rows = {k: v for k, v in sheet_resolves.items() if k[0] == slug}
        # CONSUME-3: the hub bundle-plane id oracle (the item-creation law's
        # fail-closed membership check)
        bundle_ids = set()
        _nb = load_json(os.path.join(bundle_dir, "notes.json"))
        for _n in _nb:
            bundle_ids.add(_n.get("noteId") or _n.get("id"))
        _qb = load_json(os.path.join(bundle_dir, "questions.json"))
        for _s in _qb:
            for _q in _s.get("questions", []):
                for _p in _q.get("parts", []):
                    bundle_ids.add(_p["id"])
        bundle_ids.discard(None)

        retract = retraction_pairs(sd)
        mistag = mistag_pairs(sd)
        blk_counts = (((sd.get("anchors") or {}).get("v8Retraction") or {}).get("counts") or {})
        mt_counts = (((sd.get("anchors") or {}).get("misTagRepoints") or {}).get("counts") or {})
        new_att, tier_census, method_census, sidecar_only, sheet_counts, recon, retract_dropped, mistag_dropped = \
            merge_course(slug, sd, att, spine, ctx, spine_codes, sheet_rows, retract, mistag, bundle_ids=bundle_ids)
        if retract_dropped > (blk_counts.get("entriesRemoved") or 0):
            die(f"{slug}: retractDropped {retract_dropped} > entriesRemoved "
                f"{blk_counts.get('entriesRemoved')} — retraction surface mismatch")
        if mistag_dropped > (mt_counts.get("entriesRemoved") or 0):
            die(f"{slug}: misTagRepointDropped {mistag_dropped} > entriesRemoved "
                f"{mt_counts.get('entriesRemoved')} — mis-tag surface mismatch")

        # CONSUME-3 re-scope: sidecar_only now counts ids absent from BOTH the
        # map and the hub bundle (the honest corpus-beyond-hub class); the
        # bundle-served ids were created as map rows above
        if len(sidecar_only) > max(50, 0.10 * len(sd["items"])):
            die(f"{slug}: sidecarOnly {len(sidecar_only)} of {len(sd['items'])} — "
                f"id-space mismatch, investigate (ids absent from map AND bundle)")

        old_bytes = dumps_map(att)
        new_bytes = dumps_map(new_att)
        map_changed = old_bytes != new_bytes
        if not map_changed:
            _sa = (((new_att.get("sources") or {}).get("specLinks") or {}).get("census") or {}).get("sidAnchors") or {}
            report_rows.append(OrderedDict(course=slug, changed=False, ok=True,
                                           sidecarCodes=sum(tier_census.values()),
                                           sidAnchors=_sa))
            continue

        # determinism: merge twice, byte-identical
        re_att, *_ = merge_course(slug, sd, att, spine, ctx, spine_codes, sheet_rows, retract, mistag, bundle_ids=bundle_ids)
        if dumps_map(re_att) != new_bytes:
            die(f"{slug}: merge not deterministic")

        staged, rstats = refresh_bundle(slug, new_att)
        row, problems = battery(slug, att, new_att, sd, None, staged, sheet_rows, sidecar_only, recon, retract, mistag)
        row["changed"] = True
        row["tierCensus"] = dict(sorted(tier_census.items()))
        row["v8RetractDropped"] = retract_dropped
        row["misTagRepointDropped"] = mistag_dropped
        row["rekey"] = rstats
        row["sheet"] = OrderedDict(added=sheet_counts[0], upgraded=sheet_counts[1], conflictsKept=sheet_counts[2])
        if problems:
            row["ok"] = False
            print(f"FAIL {slug}: {problems[:6]}", flush=True)
        else:
            os.makedirs(os.path.join(STAGING, slug), exist_ok=True)
            for name, data in staged.items():
                with open(os.path.join(STAGING, slug, name), "w", encoding="utf8") as f:
                    f.write(dumps_bundle(data))
            with open(map_path + ".staged", "w", encoding="utf8") as f:
                f.write(new_bytes)
            changed.append(slug)
            totals["codesFromSidecar"] += sum(tier_census.values())
            totals["v8RetractDropped"] += retract_dropped
            totals["misTagRepointDropped"] += mistag_dropped
            totals["t2Hints"] += sum(len(r.get("t2HintCodes") or []) for r in new_att["items"].values())
            totals["sheetAdded"] += sheet_counts[0]
            totals["sheetUpgraded"] += sheet_counts[1]
            totals["sheetConflicts"] += sheet_counts[2]
            totals["inlineRewrites"] += rstats["inlineNewRewrites"]
            _sa2 = (((new_att.get("sources") or {}).get("specLinks") or {}).get("census") or {}).get("sidAnchors") or {}
            totals["itemsCreated"] += sum(1 for iid2, r2 in new_att["items"].items()
                                          if iid2 not in att["items"])
            totals["sidAnchorsAdded"] += _sa2.get("added", 0)
            totals["sidAnchorsVerified"] += _sa2.get("verified", 0)
            totals["sidAnchorsConflictsKept"] += _sa2.get("conflictsKept", 0)
            print(f"OK {slug}: sidecar codes {sum(tier_census.values())} by {dict(sorted(tier_census.items()))} "
                  f"| sheet +{sheet_counts[0]}/~{sheet_counts[1]} | inline rewrites {rstats['inlineNewRewrites']}", flush=True)
        report_rows.append(row)

    # ---- determinism of the whole staging (hash twice) ----------------------
    def staging_hash():
        h = hashlib.sha256()
        for root, _dirs, files in sorted(os.walk(STAGING)):
            for fn in sorted(files):
                if fn == "_report_cie_consume.json":
                    continue  # self-referential; excluded from the identity hash
                p = os.path.join(root, fn)
                h.update(os.path.relpath(p, STAGING).encode())
                h.update(open(p, "rb").read())
        return h.hexdigest()

    stage_hash = staging_hash() if changed else None

    report = OrderedDict(
        schema="syllabai.cie-consume-report/1.0",
        lane="T-SPECS-CIE-CONSUME-2",
        operatorDirective=("T-SPECS-CIE-CONSUME-2 run-001 (operator directive "
                           "'verdict fills -> review gate -> v2 consume', trace "
                           "1a183e66619bd6dd) — the JOIN-2 chain of record stage "
                           "#3: the gate-2 ACCEPTED wave-2 AS chain (JOIN-2 "
                           "anchors + REJOIN-2 J* + VERDICT-2 V*) consumed into "
                           "the hub attachment layer and bundles; engine method "
                           "untouched except the disclosed per-run states (PIN/"
                           "STAMP/directive/trace) + the second sheet input "
                           "(REJOIN-2 wave2as, per-sheet via provenance) + the "
                           "reviewState verdict mirror"),
        gatewayTrace=GATE_TRACE,
        resourcesSha=PIN,
        stamp=STAMP,
        sidecars=len(slugs),
        changedCourses=changed,
        stagingHash=stage_hash,
        totals=dict(totals),
        consumptionLaw="verdict semantics (operator-verdict authoritative) + T2_near non-authoritative "
                       "hint (items[].t2HintCodes, never in codes/linkage) + rejoin J* post-gate "
                       "(REJOIN-1 record NEXT #2 verbatim)",
        courses=report_rows)
    # quiescent-run robustness (T-RULE-T2-APPLY-2 adoption run-002 disclosure): at changed=0
    # no per-course staging dir exists yet — create the staging root so the report still lands.
    os.makedirs(STAGING, exist_ok=True)
    with open(os.path.join(STAGING, "_report_cie_consume.json"), "w", encoding="utf8") as f:
        f.write(dumps_map(report) + "\n")
    print(json.dumps({"changed": len(changed), "totals": dict(totals), "stagingHash": stage_hash}, indent=1), flush=True)
    failed = [r for r in report_rows if not r.get("ok", True)]
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
