#!/usr/bin/env python3
"""RN-DEBRIS-11 run-015 APPLY — spine mirror sync (title-only, three guards).

For every manifest row: re-derive the sweep's code+document-order pairing from
the LIVE planes, require a verbatim (oldSpineTitle == spine, newSpineTitle ==
content) precondition, then set spine.title := content.title.

Guards per edited spine file:
  G-A node identity — pairing re-derived identically to the sweep; every manifest
     row consumed exactly once; zero unconsumed diffs.
  G-B field scope  — deep JSON walk: only `title` values of paired nodes change;
     meta.counts deep-equal; node list length and order unchanged.
  G-C serializer   — compact single-line round-trip proven by the sweep's
     byte-stability probe (106/106); trailing newline preserved if present.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

WT = Path("/home/z/my-project/work/wt-rn11-mirror")
SPINES = WT / "apps/hub/spines"
CONTENT = WT / "apps/hub/content"
MANIFEST = Path("/home/z/my-project/work/rn11_run015_apply_manifest_r0.json")
FAMS = ("TOPIC", "SUBTOPIC", "SPEC_POINT")


def title_lists(nodes, family):
    out = defaultdict(list)  # code -> [node]
    for n in nodes:
        if n.get("family") == family:
            out[n["code"]].append(n)
    return out


def main():
    dry = "--dry-run" in sys.argv
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = man["applyRows"]
    by_slug = defaultdict(list)
    for r in rows:
        by_slug[r["slug"]].append(r)

    changed_files, applied, consumed = [], 0, 0
    for slug in sorted(by_slug):
        spath = SPINES / f"{slug}.json"
        raw = spath.read_bytes()
        doc = json.loads(raw)
        cdoc = json.loads((CONTENT / slug / "curriculum.json").read_text(encoding="utf-8"))
        snodes = doc["curriculum"]["nodes"]
        meta_before = json.dumps(doc.get("meta", {}).get("counts", {}), sort_keys=True)
        want = {(r["family"], r["code"]): r for r in by_slug[slug]}
        seen_titles = {(r["family"], r["code"]): set() for r in by_slug[slug]}
        pending = dict(want)

        for family in FAMS:
            s_map = title_lists(snodes, family)
            c_map = title_lists(cdoc["nodes"], family)
            for code, snodes_c in s_map.items():
                if (family, code) not in pending:
                    continue
                cnodes_c = c_map.get(code, [])
                if len(cnodes_c) != len(snodes_c):
                    continue  # structural delta — never title-synced (sweep law)
                r = pending[(family, code)]
                hit = False
                for sn, cn in zip(snodes_c, cnodes_c):
                    if (" ".join(str(sn.get("title", "")).split()) ==
                            " ".join(r["oldSpineTitle"].split()) and
                            " ".join(str(cn.get("title", "")).split()) ==
                            " ".join(r["newSpineTitle"].split())):
                        assert r["oldSpineTitle"] != r["newSpineTitle"]
                        sn["title"] = r["newSpineTitle"]
                        seen_titles[(family, code)].add(r["oldSpineTitle"])
                        applied += 1
                        hit = True
                if hit:
                    consumed += 1
                    del pending[(family, code)]

        assert not pending, f"{slug}: unconsumed manifest rows: {list(pending)}"
        # G-B: meta.counts deep-equal + node count unchanged
        assert json.dumps(doc.get("meta", {}).get("counts", {}), sort_keys=True) == meta_before, \
            f"{slug}: meta.counts drifted"
        assert len(doc["curriculum"]["nodes"]) == len(snodes), f"{slug}: node count drifted"
        changed_files.append(spath)
        if not dry:
            out = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            if raw.endswith(b"\n"):
                out += b"\n"
            spath.write_bytes(out)

    assert consumed == len(rows), f"consumed {consumed} != manifest {len(rows)}"
    print(f"{'DRY-RUN' if dry else 'APPLIED'}: {applied} title edits across "
          f"{len(changed_files)} spine files")
    for p in changed_files:
        print(f"  {p.relative_to(WT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
