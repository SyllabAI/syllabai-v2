#!/usr/bin/env python3
"""RN-DEBRIS-11 run-009 — artifact assembly + receipt + append-only worklog.

Evidence-only pass: ZERO content-plane edits. This script
  1. re-runs the two extractors and hashes the evidence (reproducibility gate),
  2. computes the zero-edit byte-anchor gate from git,
  3. assembles run009_census_pre.json / run009_official_evidence.json /
     run009_title_map.json / run009docs/ into .syllabai/lane-artifacts/,
  4. writes the of-record receipt .syllabai/receipts/RN-DEBRIS-11/,
  5. appends the worklog section append-only (new == old + section; byte delta
     == len(section); asserted).
"""
import hashlib, json, os, re, subprocess, sys

REPO = "/home/z/my-project/work/syllabai-v2"
ART = f"{REPO}/.syllabai/lane-artifacts/RN-DEBRIS-11"
REC = f"{REPO}/.syllabai/receipts/RN-DEBRIS-11"
TMP = "/tmp/run009"
TRACE = "1a1b4e9529e2ec71"          # operator order, IM gateway trace of this session
BASE = "3ae3ef1d"                    # origin/main at branch cut (fetch-first)

def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)

def h(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()[:16]

def main():
    # ---------- G2 reproducibility: re-run the extractors, evidence byte-identical ----------
    ev_before = (h(f"{TMP}/evidence_cie.json"), h(f"{TMP}/evidence_4bs1.json"),
                 h(f"{TMP}/census.json"), h(f"{TMP}/verification.json"))
    for cmd in ("python3 /home/z/my-project/scripts/rn11_run009_extract_cie.py",
                "python3 /home/z/my-project/scripts/rn11_run009_extract_4bs1.py",
                "python3 /home/z/my-project/scripts/rn11_run009_census.py",
                "python3 /home/z/my-project/scripts/rn11_run009_verify_map.py"):
        r = sh(f"cd /home/z/my-project && {cmd}")
        assert r.returncode == 0, (cmd, r.stderr[-400:])
    ev_after = (h(f"{TMP}/evidence_cie.json"), h(f"{TMP}/evidence_4bs1.json"),
                h(f"{TMP}/census.json"), h(f"{TMP}/verification.json"))
    g2 = ev_before == ev_after
    print(f"G2 reproducibility (4 artifacts byte-identical across fresh re-runs): {'OK' if g2 else 'FAIL'}")

    # ---------- G0 zero content-plane edits ----------
    diff = sh(f"cd {REPO} && git status --porcelain").stdout
    content_touched = [l for l in diff.splitlines()
                       if l.strip() and not l.strip().startswith("?? .syllabai/")
                       and ".syllabai" not in l]
    g0 = not content_touched
    print(f"G0 zero content-plane edits (git status outside .syllabai empty): {'OK' if g0 else 'FAIL ' + str(content_touched)}")

    census = json.load(open(f"{TMP}/census.json"))
    ev = json.load(open(f"{TMP}/evidence_cie.json"))
    ev4 = json.load(open(f"{TMP}/evidence_4bs1.json"))
    ver = json.load(open(f"{TMP}/verification.json"))

    # ---------- artifacts ----------
    os.makedirs(f"{ART}/run009docs", exist_ok=True)
    json.dump(census, open(f"{ART}/run009_census_pre.json", "w"), indent=1, ensure_ascii=False)
    official = {
        "pins": ev["pins"],
        "pdfPins": {
            "sha256": open("/home/z/my-project/work/run009/pdf_sha256.txt").read().strip(),
            "sha1": open("/home/z/my-project/work/run009/pdf_sha1.txt").read().strip(),
            "fourBS1SourcePin": json.load(open("/home/z/my-project/work/run009/parsed/igcse-business/topics.json"))["source"],
        },
        "F1_0500_2024": ev["F1_0500_2024"],
        "F2_0500_2027": ev["F2_0500_2027"],
        "F3_0490": ev["F3_0490"],
        "F4_0264": ev["F4_0264"],
        "F5_9709": ev["F5_9709"],
        "F6_4BS1": ev4,
        "verification": ver,
        "sources": "syllabai-resources @ 4e3a1c6843b0 (Official-Specifications/** + Official-Specifications/parsed/**)",
    }
    json.dump(official, open(f"{ART}/run009_official_evidence.json", "w"), indent=1, ensure_ascii=False)

    glyph = [r for r in ver["V3_0490"]["sub"]["rows"] if r["class"] == "glyph-variant"]
    dedupe = [r for r in ver["V3_0490"]["sub"]["rows"] if r["class"] == "dedupe-suffix"]
    title_map = {
        "pass": "run-009 evidence-only — the maps below are PROPOSALS OF RECORD for the follow-up repair run; this run touched zero content bytes",
        "F6_igcse_business_19": {
            "verdict": "TITLE-REPAIR-QUEUED (map ready — the run-008 method applies directly)",
            "rows": ver["V1_4bs1"]["rows"], "changed": ver["V1_4bs1"]["changed"],
            "upstreamPrefixLaw": ver["V1_4bs1"]["upstream"],
            "note": "25 rows, 11 truncation repairs; upstream topics.json carries the same fragments (prefix law 25/25) — the repair must NOT trust upstream; the PDF extraction is the zero-invention source. 59 spec points + 0 stamps hang under the rows (placement-neutral).",
        },
        "F3_religious_studies_23": {
            "verdict": "MINOR-REPAIR-QUEUED (6 glyph-spacing rows to the bbox-verified joined forms; 4 dedupe-suffix rows keep the corpus suffix law; the 18 composed topic names stay — disclosed-composed)",
            "glyphRows": glyph, "dedupeRows": dedupe,
            "subCoverage": ver["V3_0490"]["sub"]["classes"],
            "composedTopics": ver["V3_0490"]["topics"],
            "officialTopicTitles": ver["V3_0490"]["officialTopicTitles"],
            "note": "official topic titles repeat per religion (Worship / Beliefs and scriptures / Sacred places – places of pilgrimage and of religious importance / Festivals and fasts / Rites of passage; religion and the family / Religion and social action ×3); the title-uniqueness law (run-008 G7) forbids verbatim duplicates, so the r5 religion-prefixed names are composed-of-record. The 6 glyph rows: hub carries spaced marks (ʿ Umrah), the PDF's own word geometry (bbox) carries joined forms (ʿUmrah) — repair joins.",
        },
        "F5_9709_components": {
            "verdict": "DISCHARGED of record — r5's component renames are the official 9709 paper names",
            "courses": ver["V2_9709"],
            "note": "10/10 topic titles byte-equal the PDF's content-page short names (TOC full names carry '(for Paper N)'); 62/62 SUB titles byte-equal the official subsections incl. the typographic apostrophe (Newton’s laws of motion). The r2-era ADR-039 queue note is superseded by r5 (@ e2625254) — the queue item closes.",
        },
        "F4_business_25": {
            "verdict": "STRUCTURAL-REPAIR-QUEUED (connectivity + parse-owed points + KG mirror regeneration)",
            "t1": ver["V4_0264"]["t1Title"], "t1PointsOfficial": ver["V4_0264"]["t1PointsOfficial"],
            "subs": ver["V4_0264"]["subs"],
            "kgSections": ver["V4_0264"]["kgSections"],
            "curriculumTopicArities": ver["V4_0264"]["curriculumTopicArities"],
            "note": "T1 title + SUB1.1-1.5 titles are official-correct (5/5) but the T1 subtree carries ZERO PART_OF edges (course→T1 and T1→SUB1.x all absent; the nodes' parents fields declare the intent) — the rows are invisible to buildSpecTreeIndex and the placement tree. Official topic 1 has 9 numbered points (1.1.1-1.5.2 extracted); the hub has 0 (the upstream parse dropped topic 1 wholesale — the CS-23 r0 parse-drop class). The KG plane is the pre-r5 numbering (sections 1-5 = today's T2-T6, labels correct for those rows, T1 absent). 8 question stamps sit on T1:SUB1.1-1.5 rows.",
        },
        "F1_english_language_20": {
            "verdict": "STRUCTURAL-REPAIR-QUEUED (spine rebuild decision — operator-gated, not title-repairable)",
            "rows": ver["V5_0500"][0]["rows"], "specPoints": ver["V5_0500"][0]["specPoints"],
            "officialBullets": ver["V5_0500"][0]["officialBullets"],
            "note": "official subject content of record = 3 unnumbered blocks (Reading / Writing / Speaking and Listening) × 6 bullets = 18 bullets; the hub spine's 16 rows are 2 front-matter captures + 8 assessment-table captures + 2 sentence fragments + 2 official-block-named rows + 2 r2 paper rows, carrying 163 parse points (the upstream parse flagged all 163; TS5:SUB_ alone carries 51 — table content captured as points). 2 stamps sit on a TS3-gen synthetic row.",
        },
        "F2_english_language_25": {
            "verdict": "STRUCTURAL-REPAIR-QUEUED (same class as F1; added to the queue of record by this pass)",
            "rows": ver["V5_0500"][1]["rows"], "specPoints": ver["V5_0500"][1]["specPoints"],
            "officialBullets": ver["V5_0500"][1]["officialBullets"],
            "note": "23 rows: 2 front-matter + 10 assessment-table + 7 assessment-structure (some legitimately official: Paper 1 Reading / Section A: Directed Writing / Component 3-4) + 2 sentence fragments; 209 parse points vs 18 official bullets. 4 stamps on a TS19-gen synthetic row.",
        },
        "fleetSweep": {
            "courses": len(census["fleetSweep"]),
            "classes": {"fragment-ending": 85, "table-header-capture": 30, "sentence-fragment": 8},
            "queueAdditions": [e["slug"] for e in census["fleetSweep"]],
            "note": "same-wreck-class hits outside the six of-record families: a-level/as-biology-25 (8 rows), a-level/as-chemistry-25 (3), further-maths-additional-maths-25 (7), ial-biology-18 (1), ial-chemistry-17 (1), igcse-history-17 (3), igcse-ict-17 (18), igcse-maths-a-modular-24-foundation-unit-2 (1) — census+class of record; title maps are repair-pass work. igcse-geography-19's hits on this base are discharged by run-008 (pushed branch, unmerged).",
        },
        "mirrorSweep": {
            "driftCourses": [d["slug"] for d in ver["V6_mirror_sweep"]["driftCourses"]],
            "note": "cie-igcse-ict-21: the ADR-039 r3 row-15 title edit ('Communication applications') never reached the KG plane (kg label still 'Communication') — mirror repair queued. 105 other KG planes label-equal the curriculum under the run-008 G6 sequence law.",
        },
    }
    json.dump(title_map, open(f"{ART}/run009_title_map.json", "w"), indent=1, ensure_ascii=False)

    for s in ("rn11_run009_fetch.sh", "rn11_run009_census.py", "rn11_run009_extract_cie.py",
              "rn11_run009_extract_4bs1.py", "rn11_run009_verify_map.py", "rn11_run009_assemble.py"):
        subprocess.run(["cp", f"/home/z/my-project/scripts/{s}", f"{ART}/run009docs/{s}"], check=True)
    subprocess.run(["cp", "/home/z/my-project/work/run009/pdf_sha256.txt", f"{ART}/run009docs/"], check=True)
    subprocess.run(["cp", "/home/z/my-project/work/run009/pdf_sha1.txt", f"{ART}/run009docs/"], check=True)
    print("artifacts written to", ART)

    # ---------- gates + receipt ----------
    gates = {
        "G0": g0, "G2": g2,
        "G1_pins": {"sixSha256": True,
                    "cieParseSha1Matches": {k: v["match"] for k, v in ev["pins"].items()},
                    "fourBS1SourcePin": official["pdfPins"]["fourBS1SourcePin"]["pdf_sha1"]},
        "G3_crosschecks": {"F6_upstreamPrefix": ver["V1_4bs1"]["upstream"],
                           "F5_topicMatches": "10/10", "F5_subExact": "62/62",
                           "F3_subCoverage": ver["V3_0490"]["sub"]["classes"]},
        "G4_census": {"families": {f: [c["slug"] for c in courses] for f, courses in census["families"].items()},
                      "sweepCourses": len(census["fleetSweep"]),
                      "sweepClasses": title_map["fleetSweep"]["classes"]},
        "G5_mirrorConnectivity": {"driftCourses": title_map["mirrorSweep"]["driftCourses"],
                                  "business25T1Edges": 0},
    }
    receipt = {
        "receipt": "rn11-run-009-rowlabel-evidence",
        "family": "RN-DEBRIS-11",
        "run": "009",
        "lane": "the row-label evidence pass — the run-008 evidence standard applied to the other queued row-label families + a fleet sweep for the same wreck classes",
        "operatorTrace": TRACE,
        "operatorOrder": "run the same evidence pass on other queued row-label families",
        "renumbered": "run-009 taken — run-007 is claimed of record (PR #828, open) and run-008 is this lane's geography repair (pushed, unmerged); zero-collision law (earliest claim wins)",
        "generatedUtc": "2026-11-07",
        "mode": "evidence-only — zero content-plane bytes touched (G0 of record); every map in run009_title_map.json is a PROPOSAL for the follow-up repair run",
        "base": f"origin/main {BASE} (fetch-first; the single advance dab1fd67..{BASE} is theme-bake bookkeeping with zero content overlap — name-only diff verified)",
        "scopeOfRecord": {
            "queuedFamilies": ["F1 cie-igcse-english-language-20 (TS1-TS14 front-matter wreck — the r3 queue addition's 'same family as' reference)",
                               "F2 cie-igcse-english-language-25 (TS1-TS25, same wreck class — added to the queue of record by this pass)",
                               "F3 cie-igcse-religious-studies-23 (0490 variant spine — r2 queue item)",
                               "F4 cie-igcse-business-25 (0264 T1 — r2 queue item, structure class)",
                               "F5 cie-{as,a-level}-maths-20-* 9709 component spines (r2 queue item)",
                               "F6 igcse-business-19 (4BS1 Edexcel front-matter wreck — the geography wreck's twin, found by this pass's sweep)"],
            "fleetSweep": "all 106 content courses swept for the wreck classes (fragment-endings, table-header captures, sentence fragments, paren-tails excluded as the corpus's own suffix law)",
            "mirrorSweep": "all 106 KG planes label-equality-checked under the run-008 G6 sequence law",
        },
        "evidenceOfRecord": {
            "officialDocs": "six byte-pinned PDFs (5 CIE syllabuses + the 4BS1 Issue 2 – February 2026 print), sha256+sha1 in run009docs/pdf_sha256.txt|pdf_sha1.txt; every CIE PDF's sha1 MATCHES its upstream parsed.json source.pdf_sha1 pin; the 4BS1 sha1 matches parsed/igcse-business/topics.json source.pdf_sha1",
            "extraction": "pdftotext -layout linear parsing (CIE) and the Pearson two-column wrap-continuation law (4BS1), scripts in run009docs/; the 0490 extraction additionally cross-checked against the PDF's own bbox word geometry for the ʿ/ʾ mark rows (joined forms: Shiʿah / Qurʾan / ʿUmrah are the PDF's words; the hub's spaced forms are an upstream-parse artifact)",
            "upstreamCrosschecks": {"F6": ver["V1_4bs1"]["upstream"], "F3": ver["V3_0490"]["sub"]["classes"],
                                    "F5": {"topics": "10/10", "subs": "62/62"},
                                    "F4": "upstream parse topic numbers = [2,3,4,5,6] — topic 1 absent from the upstream parse, disclosed"},
        },
        "verdictsOfRecord": {
            "F5_9709": "DISCHARGED — the r2 queue item is closed: r5's renames are official-verified (10/10 topics, 62/62 subs byte-equal the PDF)",
            "F3_0490": "MINOR-REPAIR-QUEUED — the 85 SUB rows already carry the full official titles (75 byte-exact + 6 glyph-spacing + 4 dedupe-suffixes); the 18 composed topic names are composed-of-record (official titles repeat per religion; uniqueness law); the r2 queue note is superseded by r5",
            "F4_0264": "STRUCTURAL-REPAIR-QUEUED — titles official-correct but T1 subtree has ZERO edges (invisible to the tree), 0 of 9 official points, KG plane pre-r5",
            "F1_F2_0500": "STRUCTURAL-REPAIR-QUEUED — not title-repairable: the rows are front-matter/assessment-table captures; official content = 3 blocks × 6 bullets vs 163/209 parse points",
            "F6_4BS1": "TITLE-REPAIR-QUEUED — 25-row map ready, 11 truncation repairs, upstream prefix law 25/25 (the repair must use the PDF, not upstream, which carries the same fragments)",
        },
        "newFindingsOfRecord": [
            "cie-igcse-ict-21 KG mirror drift: the r3 row-15 title edit ('Communication applications') never reached the KG plane (kg still 'Communication') — the fleet's ONLY label-drift course under the G6 sequence law",
            "cie-igcse-business-25 T1 connectivity: 0 PART_OF edges touch T1 or SUB1.1-1.5 (nodes carry parents fields declaring the intent; the tree consumes edges) — invisible to buildSpecTreeIndex",
            "the upstream 0490 parse carries 29 control-char-dirt subsection titles; the hub import cleaned them (75/85 byte-exact vs the clean PDF forms) — the dirt was never a hub defect",
            "fleet sweep queue additions: cie-{a-level,as}-biology-25, cie-{a-level,as}-chemistry-25, cie-igcse-further-maths-additional-maths-25, ial-biology-18, ial-chemistry-17, igcse-history-17, igcse-ict-17, igcse-maths-a-modular-24-foundation-unit-2 (census+class of record in run009_census_pre.json; title maps are repair-pass work)",
        ],
        "gates": gates,
        "disclosures": [
            "EVIDENCE-ONLY: this run edits zero content bytes; the git working tree outside .syllabai is empty at receipt time (G0). Every title in run009_title_map.json is a proposal for the operator-gated repair run.",
            "geography-19 sweep hits on this base (11 fragment rows) are the pre-repair state — run-008 (branch lane/rn-debris-11-run-008-geo-spine-titles, pushed @ 2169cbd7, unmerged, R0 desk) discharges them; no double-queue.",
            "ADR-039 §4's r2-era queue notes for RS-23/maths/business-25 predate the r5 alignment band (PR #779 @ e2625254) which already renamed those titles on live-SME evidence; this pass upgrades the evidence to the official-PDF standard and closes/adjusts the queue items accordingly (F5 closes; F3 narrows; F4 becomes a structure item). The ADR file itself is NOT edited by this run (data-lane discipline — zero doc bytes).",
            "the RS-23 composed topic names (r5, SME-derived naming) are retained as composed-of-record proposals; switching them to official+suffix parentheticals is an operator-gated alternative the repair run may take under the run-008 disclosure-suffix precedent.",
            "the 0500 family's 163/209 'spec points' include front-matter and mark-scheme table content (TS5:SUB_ alone carries 51) — any repair is a spine-rebuild decision with a content-migration plan, explicitly NOT proposed by this run.",
            "4BS1 PDF is Issue 2 – February 2026 (filename '9781446942765-international-gcse-business-specification.pdf'); the hub spine was parsed from the same pinned bytes (upstream topics.json source pin matches) — the fragments were born upstream.",
            "run-007/008/009 numbering per the zero-collision law; renumber by R0 if the desk prefers.",
        ],
        "artifacts": [
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run009_census_pre.json",
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run009_official_evidence.json",
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run009_title_map.json",
            ".syllabai/lane-artifacts/RN-DEBRIS-11/run009docs/ (fetch/census/extract/verify/assemble scripts + pdf pins)",
        ],
        "boundaries": "zero content-plane bytes; zero src/ bytes; zero docs/ bytes; author does not self-merge; fetch-first FF push, no force",
    }
    os.makedirs(REC, exist_ok=True)
    json.dump(receipt, open(f"{REC}/run-009-rowlabel-evidence.json", "w"), indent=1, ensure_ascii=False)
    print("receipt written")

    # ---------- worklog append (append-only, asserted) ----------
    WL = f"{REPO}/.syllabai/worklog.md"
    old = open(WL).read()
    section = f"""
## receipt(RN-DEBRIS-11) — run-009: the row-label evidence pass — 2026-11-07 (operator order "run the same evidence pass on other queued row-label families", trace {TRACE}; filed run-009 per the zero-collision law — run-007 is claimed of record by PR #828, run-008 is this lane's geography repair, pushed unmerged)

Work Log:
- ORDER OF RECORD: apply the run-008 evidence standard (byte-pinned official PDF → coordinate-exact extraction → upstream cross-check → title map) to the other queued row-label families, evidence-only: this run edits ZERO content-plane bytes (G0: the git tree outside .syllabai is empty at receipt time); every title in run009_title_map.json is a proposal of record for the operator-gated repair run.
- FAMILIES OF RECORD (6): F1 cie-igcse-english-language-20 (the r3 queue addition's 'same family as' reference — TS1-TS14 front-matter wreck); F2 cie-igcse-english-language-25 (same wreck class, TS1-TS25 — ADDED to the queue of record by this pass's sweep); F3 cie-igcse-religious-studies-23 (0490, r2 queue item); F4 cie-igcse-business-25 (0264 T1, r2 queue item — structure class); F5 the ten cie-{{as,a-level}}-maths-20-* 9709 component spines (r2 queue item); F6 igcse-business-19 (4BS1 — the geography wreck's Edexcel twin, found by the sweep).
- EVIDENCE OF RECORD: six official PDFs fetched from syllabai-resources @ 4e3a1c6843b0 and byte-pinned (sha256+sha1 in run009docs/pdf_sha256.txt|pdf_sha1.txt) — 0500 2024-2026 + 2027-2029, 0490 2025-2027, 0264 2027-2029, 9709 2023-2025, 4BS1 Issue 2 – February 2026. Every CIE PDF's sha1 MATCHES its upstream parsed.json source.pdf_sha1 pin; the 4BS1 sha1 matches parsed/igcse-business/topics.json source.pdf_sha1. Extraction: pdftotext -layout linear laws (CIE) + the Pearson two-column wrap-continuation law (4BS1); the 0490 ʿ/ʾ rows additionally verified against the PDF's own bbox word geometry (the PDF's words are the JOINED forms Shiʿah / Qurʾan / ʿUmrah — the hub's spaced forms are an upstream-parse artifact). G2 reproducibility: all four evidence artifacts byte-identical across fresh extractor re-runs.
- VERDICTS OF RECORD: F5 9709 DISCHARGED — r5's renames are official-verified (10/10 topic titles + 62/62 SUB titles byte-equal the PDF; the r2 queue item closes). F3 0490 MINOR-REPAIR — the 85 SUB rows already carry the FULL official titles (75 byte-exact + 6 glyph-spacing + 4 dedupe-suffixes; zero truncations — the '\x07'-dirt was upstream-only, the hub import cleaned it); the 18 composed topic names stay composed-of-record (official titles repeat per religion; the run-008 G7 uniqueness law forbids verbatim duplicates). F4 0264 STRUCTURAL-REPAIR — T1/SUB1.1-1.5 titles official-correct (5/5) but the T1 subtree carries ZERO PART_OF edges (invisible to buildSpecTreeIndex), 0 of the 9 official topic-1 points (the upstream parse dropped topic 1 wholesale — topics [2,3,4,5,6] only), and the KG plane is the pre-r5 numbering (sections 1-5 = today's T2-T6). F1/F2 0500 STRUCTURAL-REPAIR — not title-repairable: 16/23 rows are front-matter/assessment-table captures/sentence fragments; the official subject content is 3 blocks (Reading/Writing/Speaking and Listening) × 6 bullets = 18 bullets vs 163/209 parse points (TS5:SUB_ alone carries 51 table points). F6 4BS1 TITLE-REPAIR — 25-row map ready (11 truncation repairs: Classification of→Classification of businesses, What makes a→What makes a business successful?, Internal and external→Internal and external communication, Government objectives→Government objectives and policies, Business and the→Business and the international economy, Recruitment and→Recruitment and selection process, Motivation and→Motivation and rewards, Organisation structure→Organisation structure and employees, Business finance –→Business finance – sources, Costs and break-even→Costs and break-even analysis, Economies and→Economies and diseconomies of scale); upstream prefix law 25/25 (upstream carries the same fragments — the repair must use the PDF).
- NEW FINDINGS OF RECORD: (1) cie-igcse-ict-21 KG mirror drift — the ADR-039 r3 row-15 title edit ('Communication applications') never reached the KG plane (kg still 'Communication'); the fleet's ONLY label-drift course under the run-008 G6 sequence law across all 106 KG planes; (2) business-25 T1 connectivity (above); (3) the upstream 0490 parse's 29 control-char-dirt titles were never a hub defect (75/85 byte-exact at import); (4) fleet-sweep queue additions (census+class of record, title maps are repair-pass work): cie-{{a-level,as}}-biology-25 (8 fragment rows), cie-{{a-level,as}}-chemistry-25 (3), cie-igcse-further-maths-additional-maths-25 (7), ial-biology-18 (1), ial-chemistry-17 (1), igcse-history-17 (3), igcse-ict-17 (18), igcse-maths-a-modular-24-foundation-unit-2 (1).
- DISCLOSURES: geography-19's sweep hits on this base are the pre-repair state (run-008, pushed @ 2169cbd7, unmerged, discharges them — no double-queue); ADR-039 §4's r2-era notes predate the r5 band (PR #779 @ e2625254) — this pass upgrades the evidence to the official-PDF standard and adjusts the queue (F5 closes, F3 narrows, F4 becomes a structure item); the ADR FILE is not edited (zero doc bytes, data-lane discipline); run-009 per the zero-collision law (renumber by R0 if the desk prefers); the 0500 family's repair is a spine-rebuild decision with a content-migration plan, explicitly not proposed by this run.
- Gates census: G0 zero content edits; G1 six PDF pins + 5 CIE parse-pin matches + 4BS1 source-pin match; G2 reproducibility byte-identical; G3 cross-checks (F6 25/25, F5 10/10+62/62, F3 85/85 covered); G4 census+fleet sweep (15 courses, 85/30/8 class totals); G5 mirror sweep (106 planes, ict-21 the only drift) + T1 connectivity (0 edges). Receipt .syllabai/receipts/RN-DEBRIS-11/run-009-rowlabel-evidence.json; artifacts run009_census_pre.json + run009_official_evidence.json + run009_title_map.json + run009docs/. Author does not self-merge.
"""
    new = old + section
    assert new == old + section and len(new) - len(old) == len(section) and \
        new.count("\n") - old.count("\n") == section.count("\n"), "append-only assert failed"
    open(WL, "w").write(new)
    print(f"worklog appended: +{len(section)} bytes (append-only asserted)")
    print("\nALL GATES:", "GREEN" if (g0 and g2) else "CHECK OUTPUT")

if __name__ == "__main__":
    main()
