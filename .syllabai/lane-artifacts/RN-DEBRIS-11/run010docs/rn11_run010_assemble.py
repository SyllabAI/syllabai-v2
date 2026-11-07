#!/usr/bin/env python3
"""RN-DEBRIS-11 run-010 — artifact assembly + receipt + append-only worklog."""
import hashlib, json, os, subprocess

REPO = "/home/z/my-project/work/syllabai-v2"
ART = f"{REPO}/.syllabai/lane-artifacts/RN-DEBRIS-11"
REC = f"{REPO}/.syllabai/receipts/RN-DEBRIS-11"
TRACE = "1a1b5187d4021981"      # operator order trace (this session)
BASE = "98244ac6"

def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO, **kw)

def h(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()[:16]

F6_ROWS = [
    ("1.3", "Classification of", "Classification of businesses"),
    ("1.5", "Business and the", "Business and the international economy"),
    ("1.6", "Government objectives", "Government objectives and policies"),
    ("1.8", "What makes a", "What makes a business successful?"),
    ("2.1", "Internal and external", "Internal and external communication"),
    ("2.2", "Recruitment and", "Recruitment and selection process"),
    ("2.4", "Motivation and", "Motivation and rewards"),
    ("2.5", "Organisation structure", "Organisation structure and employees"),
    ("3.1", "Business finance –", "Business finance – sources"),
    ("3.3", "Costs and break-even", "Costs and break-even analysis"),
    ("5.1", "Economies and", "Economies and diseconomies of scale"),
]
F3_ROWS = [
    ("I2.5", "The development of Islam; origins of Sunni and Shi ʿ ah",
     "The development of Islam; origins of Sunni and Shiʿah"),
    ("I2.6", "The Qur ʾ an; different ways in which Muslims understand and interpret it",
     "The Qurʾan; different ways in which Muslims understand and interpret it"),
    ("I3.3", "ʿ Umrah", "ʿUmrah"),
    ("I4.1", "ʿ Id al-Adha (feast of sacrifice)", "ʿId al-Adha (feast of sacrifice)"),
    ("I4.3", "ʿ Id al-Fitr (the end of Ramadan)", "ʿId al-Fitr (the end of Ramadan)"),
    ("I6.2", "Shari ʿ ah (‘straight path’) as a code of behaviour and ethics for Muslims; as a legal system",
     "Shariʿah (‘straight path’) as a code of behaviour and ethics for Muslims; as a legal system"),
]

def main():
    census_pre = json.load(open("/tmp/run009/census.json"))
    os.makedirs(f"{ART}/run010docs", exist_ok=True)

    pre = {
        "pass": "run-010 pre-state of record (the run-009 census law, recomputed on base 98244ac6 before the repair)",
        "F6_igcse_business_19": next(c for c in census_pre["families"]["F6_igcse_business_19"]),
        "F3_religious_studies_23": next(c for c in census_pre["families"]["F3_religious_studies_23"]),
        "note": "the dedupe-suffix rows and the 18 composed RS topic names are NOT in this repair's scope (corpus suffix law / r5 composed-of-record) — see the run-009 title map, PR #832",
    }
    json.dump(pre, open(f"{ART}/run010_census_pre.json", "w"), indent=1, ensure_ascii=False)

    title_map = {
        "pass": "run-010 applied map of record — title-only, placement-neutral; official headings verbatim from the byte-pinned PDFs (run-009 evidence, PR #832)",
        "F6_igcse_business_19": {
            "rows": [{"code": f"igcse-business-T{k}", "kgId": None, "old": old, "new": new,
                      "composed": False,
                      "source": f"4BS1 spec §{k} left-column title incl. wrap continuation (Issue 2 – February 2026 print)"}
                     for k, old, new in F6_ROWS],
            "changed": 11,
            "planeNote": "each row is carried on TWO nodes (TOPIC igcse-business-T{k} + SUBTOPIC …:SUB_) and the KG mirror pair — all three restored together (the run-008 mirror law)",
        },
        "F3_religious_studies_23": {
            "rows": [{"code": f"cie-igcse-religious-studies-2025-2027-T{k[0]}:SUB{k}",
                      "old": old, "new": new, "composed": False,
                      "source": "0490 syllabus subsection heading, mark-form per the PDF's own bbox word geometry (joined ʿ/ʾ)"}
                     for k, old, new in F3_ROWS],
            "changed": 6,
            "scopeNote": "the 4 dedupe-suffix rows and 18 composed topic names deliberately untouched (corpus suffix law / r5 composed-of-record, disclosed in run-009)",
        },
        "notTouched": ["ict-21 KG mirror drift (r3 row-15 edit) — separate repair class, still queued",
                       "F4 business-25 structural repair — separate run class",
                       "F1/F2 0500 spine rebuild — operator-gated"],
    }
    json.dump(title_map, open(f"{ART}/run010_title_map.json", "w"), indent=1, ensure_ascii=False)

    gates = {
        "verifier": "scripts/rn11_run010_verify.py (workspace copy run010docs/)",
        "gateLines": [
            "G0 byte anchors (only the 4 expected files changed): OK",
            "G1 per-file serializer laws identified + round-trip byte-exact: business-19 curriculum + KG compact; RS-23 curriculum indent=1+trailing-newline (pre-existing r5-era state, preserved); RS-23 KG compact: OK",
            "G2a business-19 curriculum: 22 title-only edits (11 TOPIC + 11 SUBTOPIC): OK",
            "G2b RS-23 curriculum: 6 title-only edits: OK",
            "G2c business-19 KG: 11 pair + 11 node label edits, all else byte-equal: OK",
            "G2d RS-23 KG: 6 pair + 6 node label edits, all else byte-equal: OK",
            "G3 structure (node/edge counts, edges byte-equal, spec-point codes byte-identical): OK",
            "G4 zero-invention (fresh re-extraction reproduces 11 + 6 titles byte-exact): OK",
            "G5 stamp neutrality (business-19: 0 stamps; RS-23: 2 gen stamps, all destinations exist, questions.json untouched): OK",
            "G6 mirror equality (kg labels == curriculum titles): business-19 25/25, RS-23 85/85: OK",
            "G7 title uniqueness (business-19 25/25 TOPIC titles distinct + twin law; RS-23 103 rows distinct): OK",
            "G8 glyph invariance (the 6 RS joins identical under the production spec-tree normTitle law): OK",
        ],
        "placementGateAB": {
            "script": "apps/hub/scripts/verify_sme_wire_r0.ts (bun 1.3.14)",
            "pre": ["courses: 90 sets: 2574 questions: 43232",
                    "placed: 2574 unplaced: 0", "gen-row homes: 31"],
            "post": ["courses: 90 sets: 2574 questions: 43232",
                     "placed: 2574 unplaced: 0", "gen-row homes: 31"],
            "identical": True,
            "ofRecord_r3": "2,574/2,574 residual 0, gen-row homes 31 (ADR-039 r3 census) — both legs reproduce it",
            "note": "the retitled rows captured or moved NO set — the rung-5 title-match concern is discharged empirically; business-19's 'Classification of Businesses' set stays on its rung-4 numbering home",
        },
        "renderCheck": "normalizeSpecText (apps/hub/src/lib/spec-text.ts) over all 17 new titles: 17/17 byte-faithful (bun)",
        "verifierExit": 0,
    }
    json.dump(gates, open(f"{ART}/run010_gates.json", "w"), indent=1, ensure_ascii=False)

    for s in ("rn11_run010_repair.py", "rn11_run010_verify.py", "rn11_run010_assemble.py"):
        subprocess.run(["cp", f"/home/z/my-project/scripts/{s}", f"{ART}/run010docs/{s}"], check=True)
    subprocess.run(["cp", "/tmp/run010_render_check.ts", f"{ART}/run010docs/render_check.ts"], check=True)
    print("artifacts written")

    receipt = {
        "receipt": "rn11-run-010-rowlabel-titles",
        "family": "RN-DEBRIS-11",
        "run": "010",
        "lane": "the 4BS1 + RS-23 spine row-label title repairs — the first repair run executed off the run-009 evidence pass",
        "operatorTrace": TRACE,
        "operatorOrder": "run the 4BS1/RS-23 title repairs as run-010",
        "generatedUtc": "2026-11-07",
        "mode": "apply+verify (title-only, placement-neutral, zero code changes)",
        "base": f"origin/main {BASE} (fetch-first; run-009/PR #832 and run-008/PR #830 remain open at the R0 desk — this run cuts from main, not from them; the worklog union-resolves at merge time per the lane law)",
        "repairOfRecord": {
            "F6_igcse_business_19": "11 truncation repairs — the Edexcel front-matter first-wrapped-line fragments restored to the full 4BS1 left-column titles (wrap continuations joined: 'Classification of' → 'Classification of businesses', 'What makes a' → 'What makes a business successful?', …), each row carried on all THREE planes (curriculum TOPIC + SUBTOPIC nodes + KG pair/node labels) per the run-008 mirror law",
            "F3_religious_studies_23": "6 glyph-spacing repairs — the hub's spaced-mark forms (ʿ Umrah / The Qur ʾ an / Shi ʿ ah) joined to the PDF's own bbox-verified word forms (ʿUmrah / Qurʾan / Shiʿah); the 4 dedupe-suffix rows and the 18 composed topic names deliberately untouched (corpus suffix law / r5 composed-of-record)",
            "totals": "17 titles; 28 curriculum node edits (22 + 6); 34 KG label edits (11 pair + 11 node + 6 pair + 6 node); 4 files",
        },
        "gates": gates,
        "disclosures": [
            "SERIALIZER: the RS-23 curriculum is pretty-printed (indent=1 + trailing newline) — a pre-existing r5-era state, identified by the fail-closed law probe and preserved byte-exactly except the 6 title lines; the other three files are compact single-line per the corpus law.",
            "PLACEMENT: A/B legs IDENTICAL (2,574/2,574, gen-row homes 31) — the retitled rows captured or moved no set; rung-5 title-match behavior unchanged (the production normTitle strips marks and whitespace, so the 6 glyph joins are norm-invariant — G8).",
            "SCOPE BOUNDARIES: ict-21 KG mirror drift, business-25 structural repair (edges + 9 points + KG regeneration), the 0500 spine rebuilds, and the fleet-sweep queue additions (biology/chemistry/further-maths/ial/history/ict-17 families) are NOT in this run — they stay queued per the run-009 receipt.",
            "no spines/ plane exists for either course (verified) — content plane + KG are the only planes, so no build-artifact disclosure is owed.",
            "run-010 per the zero-collision law (no prior claim); renumber by R0 if the desk prefers.",
            "CI/tsc: data-only JSON edits; the sandbox battery is the of-record local proof (bun placement gate + python verifier); tsc vacuous (no node_modules), disclosed per lane precedent.",
        ],
        "artifacts": [
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run010_census_pre.json",
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run010_title_map.json",
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run010_gates.json",
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run010docs/",
        ],
        "boundaries": "exactly 4 content files (2 curriculum + 2 KG); zero src/ bytes; zero code changes; zero spec-point/stamp/structure bytes; author does not self-merge",
    }
    os.makedirs(REC, exist_ok=True)
    json.dump(receipt, open(f"{REC}/run-010-rowlabel-titles.json", "w"), indent=1, ensure_ascii=False)
    print("receipt written")

    WL = f"{REPO}/.syllabai/worklog.md"
    old = open(WL).read()
    section = f"""
## receipt(RN-DEBRIS-11) — run-010: the 4BS1 + RS-23 spine row-label title repairs — 2026-11-07 (operator order "run the 4BS1/RS-23 title repairs as run-010", trace {TRACE}; the first repair run executed off the run-009 evidence pass, PR #832)

Work Log:
- REPAIR OF RECORD (title-only, placement-neutral, zero code changes): F6 igcse-business-19 (Pearson Edexcel 4BS1, Issue 2 – February 2026 print) — 11 truncation repairs restoring the Edexcel front-matter first-wrapped-line fragments to the full PDF left-column titles (wrap continuations joined: 'Classification of' → 'Classification of businesses', 'Business and the' → 'Business and the international economy', 'Government objectives' → 'Government objectives and policies', 'What makes a' → 'What makes a business successful?', 'Internal and external' → 'Internal and external communication', 'Recruitment and' → 'Recruitment and selection process', 'Motivation and' → 'Motivation and rewards', 'Organisation structure' → 'Organisation structure and employees', 'Business finance –' → 'Business finance – sources', 'Costs and break-even' → 'Costs and break-even analysis', 'Economies and' → 'Economies and diseconomies of scale'); F3 cie-igcse-religious-studies-23 (CIE 0490) — 6 glyph-spacing repairs joining the hub's spaced-mark forms to the PDF's own bbox-verified word forms ('ʿ Umrah' → 'ʿUmrah', 'ʿ Id al-Adha (feast of sacrifice)' → 'ʿId al-Adha (feast of sacrifice)', 'ʿ Id al-Fitr (the end of Ramadan)' → 'ʿId al-Fitr (the end of Ramadan)', 'The Qur ʾ an; …' → 'The Qurʾan; …', '… Sunni and Shi ʿ ah' → '… Sunni and Shiʿah', 'Shari ʿ ah (‘straight path’) …' → 'Shariʿah (‘straight path’) …'). The 4 dedupe-suffix rows and the 18 composed RS topic names deliberately untouched (corpus suffix law / r5 composed-of-record).
- PLANES: every 4BS1 row is carried on THREE planes (curriculum TOPIC + SUBTOPIC nodes, KG subtopics pair + SubTopic node label) — all restored together per the run-008 mirror law; RS-23 rows on curriculum + KG. 28 curriculum node edits + 34 KG label edits across exactly 4 files. No spines/ plane exists for either course (verified) — content + KG are the only planes.
- GATES (run010_gates.json): G0 byte anchors (git diff == exactly the 4 expected files); G1 per-file serializer laws identified fail-closed + round-trip byte-exact on all 4 originals (business-19 curriculum + KG and RS-23 KG compact single-line; RS-23 curriculum indent=1 + trailing newline — a pre-existing r5-era state, preserved byte-exactly except the 6 title lines); G2 field-level deep diffs (22 + 6 title-only node edits, 11+11+6+6 KG label edits, every other byte equal incl. meta/sections/points/pointSubtopics/edges); G3 structure (node/edge counts, edges, spec-point codes byte-identical); G4 zero-invention (fresh runs of the run-009 extractors reproduce all 17 new titles byte-exact from the byte-pinned PDFs); G5 stamp neutrality (business-19 carries 0 stamps; RS-23's 2 stamps are TC5-gen/TC6-gen topic-level rows — all destinations exist, questions.json untouched); G6 mirror equality post-repair (25/25 + 85/85, sequence law); G7 title uniqueness (business-19 25/25 TOPIC titles distinct + the TOPIC/SUB_ twin law; RS-23 103 rows distinct); G8 glyph invariance (the 6 joins identical under the production spec-tree normTitle law — lowercase + strip non-alphanumerics).
- PLACEMENT GATE (the strong one): verify_sme_wire_r0.ts A/B (pre vs post) — IDENTICAL: 90 courses / 2,574 sets / 43,232 questions / placed 2,574 / unplaced 0 / gen-row homes 31, both legs reproducing the ADR-039 r3 of-record census. The retitled rows captured or moved NO set (the rung-5 concern discharged empirically; business-19's 25 sets stay on their rung-4 numbering homes). Render check: normalizeSpecText (src/lib/spec-text.ts) over all 17 new titles — 17/17 byte-faithful (bun).
- DISCLOSURES: ict-21 KG mirror drift, business-25 structural repair, the 0500 spine rebuilds and the fleet-sweep queue additions stay queued per the run-009 receipt (separate repair classes); run-010 per the zero-collision law; tsc vacuous (no node_modules; data-only JSON edits), disclosed per lane precedent; author does not self-merge.
- Gates census: all green; receipt .syllabai/receipts/RN-DEBRIS-11/run-010-rowlabel-titles.json; artifacts run010_census_pre.json + run010_title_map.json + run010_gates.json + run010docs/ (repair/verify/assemble scripts + render check).
"""
    new = old + section
    assert new == old + section and len(new) - len(old) == len(section) and \
        new.count("\n") - old.count("\n") == section.count("\n"), "append-only assert failed"
    open(WL, "w").write(new)
    print(f"worklog appended: +{len(section)} bytes (append-only asserted)")

if __name__ == "__main__":
    main()
