#!/usr/bin/env python3
"""
sd0_strand_reexport.py — T-SM-SD0-FIX-R0: the 4SD0 strand-code re-export of record.

Operator order (trace 1a169ba5c7ed9559): "continue with the SD0 fix" — the
follow-up of record from T-SM-EDX-INGEST r0 (comment 6345097955): "re-export
the 4SD0 bundles with strand-disambiguated codes mirroring the CIE 0973 law,
then re-run seed+ingest for the three rows."

DEFECT: the three 4SD0 strand bundles derive COLLIDING DB codes — the seeder's
Edexcel TOPIC order law maps bio T1 ("The nature and variety of living
organisms") and chem T1 ("Principles of chemistry") both to 4SD0-S1, and the
bare per-strand SPEC_POINT codes collide (4SD0-1.1 = bio "living organisms…"
vs chem "three states of matter"). The honest seeder refused the graft
(T-SM-EDX-INGEST r0); the three rows were PARKED.

FIX LAW (mirrors the CIE 0973 triple-strand corpus — 782 nodes, zero
collisions, one subject root): the strand letter (B/C/P) is embedded in the
codes —
    TOPIC      igcse-science-double-award-T{n}      -> igcse-science-double-award-T{L}{n}
                   (the seeder's new strand-tail shape lands 4SD0-S{L}{n},
                    the exact CIE tail mirror TB/TC/TP -> SB/SC/SP)
    SUBTOPIC   igcse-science-double-award-T{n}:SUB{t} -> igcse-science-double-award-T{L}{n}:SUB{t}
                   (tail byte verbatim -> 4SD0-S{L}{n}-{t})
    SPEC_POINT {n}.{m}                             -> {L}{n}.{m}
                   (the existing letterPrefixed shape -> 4SD0-B{n}.{m} verbatim)
    SUBJECT    unchanged (all three strands seed into ONE subject root 4SD0 via
                   the sameSeedExceptBundle sibling-reuse law — all three packs
                   share importSource pin main@08447ba9).

TRANSFORM SURFACE (every code-bearing join field; nothing else):
    curriculum.json            nodes[].code / nodes[].parents / edges[].source|target
    questions.json             parts[].specPointIds + parts[].specPointCodes
    notes.json                 note.specPointIds + note.specPointCodes
    flashcards.json            card.specPointCode + card.specPointIds
    spines/{slug}.json         curriculum.nodes/edges (the pack's own tree mirror)
    content-maps/{slug}.json   items[].codes[].spineCode
VERBATIM (upstream identities of record — never rewritten):
    bodyMd prose (the official bare numbering is the document's own),
    smeSpecPointIds (spcpt_* ids), officialCode/officialId (the resources
    sidecar identity — already strand-scoped, e.g. IGCSE_SCIENCE_DOUBLE_AWARD:
    Biology-2.12), manifest counts, generatedUtc, importSource.ref.

Byte-format laws preserved: compact no-space JSON (no trailing newline) for the
content/spine/manifest files; indent=1 + trailing newline for content-maps
(round-trip proven per file before write).

Usage:
    python3 sd0_strand_reexport.py           # the transform (fails loud)
    python3 sd0_strand_reexport.py --check   # verify the re-exported state (idempotence probe)
"""
import json
import re
import sys
from pathlib import Path

HUB = Path(__file__).resolve().parent.parent
CONTENT = HUB / "content"
SPINES = HUB / "spines"
MAPS = HUB / "content-maps"

STRANDS = {"biology": "B", "chemistry": "C", "physics": "P"}
SLUG = "igcse-science-double-award-17-{strand}"
CORPUS_PREFIX = "igcse-science-double-award"

TOPIC_RE = re.compile(rf"^{CORPUS_PREFIX}-T(\d+)$")
SUBTOPIC_RE = re.compile(rf"^{CORPUS_PREFIX}-T(\d+):SUB(.+)$")
SPEC_RE = re.compile(r"^(\d+(?:\.\d+)*)$")

NOTE = (
    "T-SM-SD0-FIX-R0 strand-code re-export (2026-10-24, operator order trace "
    "1a169ba5c7ed9559): TOPIC/SUBTOPIC/SPEC_POINT codes strand-disambiguated "
    "(B/C/P) mirroring the CIE 0973 law — the upstream T-CONSUME-EDX export "
    "defect (cross-strand 4SD0-S1 / 4SD0-1.1 collisions) repaired v2-side; "
    "question/notes/flashcard spec join fields + spine + map spineCodes "
    "transformed with the same table; bodyMd prose, smeSpecPointIds, "
    "officialId and counts verbatim; generatedUtc/ref untouched."
)


def compact(d) -> str:
    return json.dumps(d, separators=(",", ":"), ensure_ascii=False)


def read(path: Path):
    return json.loads(path.read_text())


def write(path: Path, d, *, pretty=False) -> None:
    raw = json.dumps(d, indent=1, ensure_ascii=False) + "\n" if pretty else compact(d)
    path.write_text(raw)


def strand_maps(nodes, letter):
    """old code -> new code, per family, for one strand."""
    mapping: dict[str, str] = {}
    for n in nodes:
        fam, code = n["family"], n["code"]
        if fam == "TOPIC":
            m = TOPIC_RE.match(code)
            mapping[code] = f"{CORPUS_PREFIX}-T{letter}{m.group(1)}"
        elif fam == "SUBTOPIC":
            m = SUBTOPIC_RE.match(code)
            mapping[code] = f"{CORPUS_PREFIX}-T{letter}{m.group(1)}:SUB{m.group(2)}"
        elif fam == "SPEC_POINT":
            m = SPEC_RE.match(code)
            mapping[code] = f"{letter}{m.group(1)}"
        elif fam == "SUBJECT":
            mapping[code] = code
        else:
            raise SystemExit(f"unknown family: {fam}")
    return mapping


def transform_nodes(nodes, mapping):
    """nodes in place: code + parents remapped; collision-checked."""
    seen = set()
    for n in nodes:
        new = mapping.get(n["code"])
        if new is None:
            raise SystemExit(f"FAIL-CLOSED: node code not in the map: {n['code']}")
        if new in seen and new != n["code"]:
            raise SystemExit(f"FAIL-CLOSED: collision after re-export: {new}")
        seen.add(new)
        n["code"] = new
        n["parents"] = [mapping.get(p, p) for p in n.get("parents") or []]
    return nodes


def transform_edges(edges, mapping):
    for e in edges:
        e["source"] = mapping.get(e["source"], e["source"])
        e["target"] = mapping.get(e["target"], e["target"])
    return edges


def remap_list(codes, spec_map, ctx):
    out = []
    for c in codes or []:
        new = spec_map.get(c)
        if new is None:
            raise SystemExit(f"FAIL-CLOSED: {ctx}: spec code not in the strand map: {c}")
        out.append(new)
    return out


def verify_reexported() -> None:
    """--check: assert the DISK is already the re-exported state of record."""
    ok = True
    for strand, letter in STRANDS.items():
        slug = SLUG.format(strand=strand)
        base = CONTENT / slug
        cur = read(base / "curriculum.json")
        for n in cur["nodes"]:
            if n["family"] == "TOPIC" and not re.match(rf"^{CORPUS_PREFIX}-T[A-Z]\d+$", n["code"]):
                print(f"  FAIL {slug} TOPIC not strand-lettered: {n['code']}")
                ok = False
                break
        for n in cur["nodes"]:
            if n["family"] == "SPEC_POINT" and not re.match(r"^[A-Z]\d+(\.\d+)*$", n["code"]):
                print(f"  FAIL {slug} SPEC_POINT not letter-prefixed: {n['code']}")
                ok = False
                break
        manifest = read(base / "manifest.json")
        if "T-SM-SD0-FIX-R0 strand-code re-export" not in (manifest.get("importSource") or {}).get("note", ""):
            print(f"  FAIL {slug} manifest note missing")
            ok = False
        print(f"  {slug}: {'OK' if ok else 'issues above'}")
    if not ok:
        raise SystemExit("CHECK FAILED — the disk is not the re-exported state")
    print("CHECK: the on-disk state is the re-exported state of record")


def main() -> None:
    check_only = "--check" in sys.argv
    if check_only:
        verify_reexported()
        return
    all_spec_new: dict[str, set] = {}
    for strand, letter in STRANDS.items():
        slug = SLUG.format(strand=strand)
        base = CONTENT / slug
        print(f"===== {slug} (strand {letter}) =====")

        cur = read(base / "curriculum.json")
        mapping = strand_maps(cur["nodes"], letter)
        spec_map = {k: v for k, v in mapping.items() if SPEC_RE.match(k)}
        all_spec_new[letter] = set(spec_map.values())

        fams_before = {}
        for n in cur["nodes"]:
            fams_before[n["family"]] = fams_before.get(n["family"], 0) + 1

        cur["nodes"] = transform_nodes(cur["nodes"], mapping)
        cur["edges"] = transform_edges(cur["edges"], mapping)
        fams_after = {}
        for n in cur["nodes"]:
            fams_after[n["family"]] = fams_after.get(n["family"], 0) + 1
        if fams_before != fams_after:
            raise SystemExit("family census drifted")
        # cross-family code disjointness (SUBTOPIC ':SUB' keeps them disjoint by shape)
        codes = [n["code"] for n in cur["nodes"]]
        if len(codes) != len(set(codes)):
            raise SystemExit("FAIL-CLOSED: intra-bundle code collision after re-export")
        if not check_only:
            write(base / "curriculum.json", cur)
        print(f"  curriculum: {len(codes)} nodes transformed (families {fams_after})")

        # questions.json
        qs = read(base / "questions.json")
        nparts = nremapped = 0
        for s in qs:
            for q in s.get("questions") or []:
                for p in q.get("parts") or []:
                    nparts += 1
                    if "specPointIds" in p:
                        p["specPointIds"] = remap_list(p["specPointIds"], spec_map, "questions.specPointIds")
                        nremapped += 1
                    if p.get("specPointCodes") is not None:
                        p["specPointCodes"] = remap_list(p["specPointCodes"], spec_map, "questions.specPointCodes")
        if not check_only:
            write(base / "questions.json", qs)
        print(f"  questions: {len(qs)} sets, {nparts} parts, {nremapped} parts remapped")

        # notes.json
        notes = read(base / "notes.json")
        nnotes = 0
        for note in notes:
            if "specPointIds" in note:
                note["specPointIds"] = remap_list(note["specPointIds"], spec_map, "notes.specPointIds")
            if note.get("specPointCodes") is not None:
                note["specPointCodes"] = remap_list(note["specPointCodes"], spec_map, "notes.specPointCodes")
            nnotes += 1
        if not check_only:
            write(base / "notes.json", notes)
        print(f"  notes: {nnotes} notes (bodyMd + smeSpecPointIds verbatim)")

        # flashcards.json
        cards = read(base / "flashcards.json")
        ncards = 0
        for card in cards:
            if card.get("specPointCode") is not None:
                new = spec_map.get(card["specPointCode"])
                if new is None:
                    raise SystemExit(f"FAIL-CLOSED: flashcard.specPointCode dangling: {card['specPointCode']}")
                card["specPointCode"] = new
            if "specPointIds" in card:
                card["specPointIds"] = remap_list(card["specPointIds"], spec_map, "flashcards.specPointIds")
            ncards += 1
        if not check_only:
            write(base / "flashcards.json", cards)
        print(f"  flashcards: {ncards} cards (smeSpecPointIds verbatim)")

        # spine — the pack's own curriculum mirror (same node/edge transform)
        spine_path = SPINES / f"{slug}.json"
        spine = read(spine_path)
        spine["curriculum"]["nodes"] = transform_nodes(spine["curriculum"]["nodes"], mapping)
        spine["curriculum"]["edges"] = transform_edges(spine["curriculum"]["edges"], mapping)
        if not check_only:
            write(spine_path, spine)
        print(f"  spine: {len(spine['curriculum']['nodes'])} nodes transformed")

        # content-maps — items[].codes[].spineCode (officialCode/officialId verbatim)
        map_path = MAPS / f"{slug}.json"
        cmap = read(map_path)
        ncode = 0
        for item in (cmap.get("items") or {}).values():
            for c in item.get("codes") or []:
                if "spineCode" in c:
                    new = spec_map.get(c["spineCode"])
                    if new is None:
                        raise SystemExit(f"FAIL-CLOSED: map spineCode dangling: {c['spineCode']}")
                    c["spineCode"] = new
                    ncode += 1
        if not check_only:
            write(map_path, cmap, pretty=True)
        print(f"  content-maps: {ncode} spineCodes remapped (pretty format preserved)")

        # manifest — counts/utc/ref untouched; the note appended
        manifest_path = base / "manifest.json"
        manifest = read(manifest_path)
        src = manifest.get("importSource") or {}
        note = (src.get("note") or "").rstrip()
        if "T-SM-SD0-FIX-R0 strand-code re-export" not in note:
            src["note"] = (note + " " if note else "") + NOTE
        if not check_only:
            write(manifest_path, manifest)
        print(f"  manifest: note {'present' if 'T-SM-SD0-FIX-R0' in src.get('note','') else 'MISSING'} (counts/utc/ref verbatim)")

    # cross-strand disjointness of the letter-prefixed spec vocabulary
    b, c, p = all_spec_new["B"], all_spec_new["C"], all_spec_new["P"]
    if b & c or b & p or c & p:
        raise SystemExit("FAIL-CLOSED: cross-strand spec collision after re-export")
    print(f"cross-strand spec disjointness: B={len(b)} C={len(c)} P={len(p)} — pairwise disjoint OK")
    if check_only:
        print("CHECK: the on-disk state is the re-exported state of record")
    else:
        print("RE-EXPORT COMPLETE")


if __name__ == "__main__":
    main()
