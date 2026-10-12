#!/usr/bin/env python3
"""Zero-core-routing pre-census (the decommission baseline).

Walks the CORE_ONLY stay-core pins of record (apps/hub/src/lib/api.v2-surface.test.ts)
plus the known hub hardwires, and for each entry greps the hub source for
LIVE call-sites (outside lib definitions and tests). Output: the remaining-core
inventory with LIVE / dormant / UNMAPPED classification - the baseline the
docs/DECOMMISSION-BANDS-PLAN.md bands retire until the list is empty, at which
point the census flips from report to CI gate (the SS 6.2 Render-disable pre-gate).

Read-only. Exit 0 always (report, not gate). Run from the repo root:
    python3 scripts/preflight_zero_core_census.py
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HUB_SRC = REPO / "apps" / "hub" / "src"
TEST_FILE = HUB_SRC / "lib" / "api.v2-surface.test.ts"

# path pin -> candidate emitter identifiers (function/property names or route fragments)
EMITTER_HINTS = {
    "/api/v1/teacher/curriculum/versions": ["curriculum/versions", "curriculumVersions"],
    "/api/v1/teacher/marking/answers": ["markingAnswer", "marking/answers", "smartMark", "smart-mark"],
    "/api/v1/teacher/assignments": ["teacherAssignments", "teacherCreateAssignment", "teacherSetAssignmentStatus", "teacherAssignmentRoster"],
    "/api/v1/questions?q=photosynthesis": ["questions("],
    "/api/v1/questions/families": ["families("],
    "/api/v1/exam-papers?subjectId=sub-1": ["examPapers"],
    "/api/v1/exam-papers/ep-1": ["examPapers"],
    "/api/v1/learners/me/answer-input/transcribe": ["transcribe"],
    "/api/v1/learners/me/intervention-runs": ["intervention-runs", "interventionRuns"],
    "/api/v1/subjects": ["subjects("],
    "/api/v1/tree?includeMisconceptions=true": ["tree("],
}
HARDWIRES = {
    # the key string is CONTINUITY-OF-RECORD (the baseline receipts cite it);
    # the classification truth since B3 (T-MIG-118) rides hardwire_v2_truth below.
    "hub route /api/ai/chat (SSE -> coreStreamAuthorized)": ["api/ai/chat"],
}

# T-MIG-119 hardening (the plan §Z law): pins of record that live OUTSIDE the
# CORE_ONLY_PATHS array (pinned by other test loops — the 096/110 laws) fold in
# here so the census inventory is complete.
MANUAL_PIN_ADDITIONS = [
    "/api/v1/learners/me/intervention-runs",  # the 096/110 STAYS-CORE law (no positive wire)
]


# ---------------------------------------------------------------- hardening
def extract_flip_rows() -> tuple[list[str], list[str]]:
    """Pull V2_SURFACE_PREFIXES + V2_SURFACE_MIDPATH_PREFIXES out of lib/api.ts
    (the routing tables of record) for the wire-truth coverage check."""
    src = (HUB_SRC / "lib" / "api.ts").read_text()

    def arr(name: str) -> list[str]:
        m = re.search(name + r"[^=]*=\s*\[(.*?)\n\s*\]", src, re.S)
        if not m:
            return []
        body = "\n".join(ln.split("//", 1)[0] for ln in m.group(1).splitlines())
        return re.findall(r'"([^"]+)"', body)

    return arr("V2_SURFACE_PREFIXES"), arr("V2_SURFACE_MIDPATH_PREFIXES")


_FLIP_CACHE: tuple[list[str], list[str]] | None = None


def row_covers(path: str) -> str | None:
    """Return the flip row that routes `path` to v2, or None if it stays core.
    Exact rows are startsWith; mid-path rows carry :uuid segments."""
    global _FLIP_CACHE
    if _FLIP_CACHE is None:
        _FLIP_CACHE = extract_flip_rows()
    exact, midpath = _FLIP_CACHE
    for r in exact:
        if path.startswith(r):
            return r
    return midpath_covers(path, midpath)


def midpath_covers(path: str, midpath: list[str]) -> str | None:
    # T-MIG-122 disclosure: the segment join previously used "".join — the
    # split delimiters were swallowed and EVERY mid-path row compiled to a
    # slash-free pattern that matched nothing (latent since the 119
    # hardening: the subjects wire-truth rode an EXACT row, so the mid-path
    # branch was never exercised until the 116 answers/:uuid flip needed it).
    # "/".join restores the literal separators; ":uuid" still compiles to
    # [^/]+ and the trailing (/|$) keeps the deeper-tail semantics.
    for r in midpath:
        pat = "^" + "/".join("[^/]+" if seg == ":uuid" else re.escape(seg)
                             for seg in r.split("/")) + "(/|$)"
        if re.match(pat, path):
            return r
    return None


def hardwire_v2_truth(key: str) -> dict | None:
    """T-MIG-123 hardening (the 122-class matcher law carried to the hardwire
    class, the plan §Z per-call-site law): a hardwire row is classified by its
    ROUTE FILE'S SERVING DECISION, not by residual literal hits.

    Motivating correction of record: the chat rule predates the B3 re-point and
    kept the row HARDWIRE-LIVE after T-MIG-118 moved the always-on upstream to
    v2 — the only live-looking hit was the chat.tsx browser fetch of the hub's
    OWN route (the browser contract, unchanged by B3 by design), not a
    hub->core dependency (T-MIG-122 run-003 adjudication: STALE-RULE).

    Resolution: find the route file for the key's /api/ai/<name> path; resolve
    EVERY v2SurfaceBase(<arg>, ...) call in it (an identifier arg is chased to
    its string-literal assignment in the same file); if EVERY resolved v2 wire
    is covered by a flip row of record AND the key's fallback helper (the
    '-> <helper>)' suffix) survives only as the same decision's rollback arm,
    the hardwire RIDES-V2 with the one-env-var rollback disclosed (the
    claAskFetch class). Any uncovered wire or missing decision -> None (the
    row stays HARDWIRE-LIVE — FAIL-NO-FLIP posture for the classifier itself)."""
    km = re.search(r"(/api/ai/[a-z0-9-]+)", key)
    if not km:
        return None
    route = HUB_SRC / "app" / km.group(1).strip("/") / "route.ts"
    if not route.exists():
        return None
    src = route.read_text()
    fb = re.search(r"->\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)", key)
    fallback_helper = fb.group(1) if fb else None
    decisions = []
    for m in re.finditer(r"v2SurfaceBase\(\s*([A-Za-z_][A-Za-z0-9_]*|\"[^\"]+\"|`[^`]+`)\s*,", src):
        arg = m.group(1)
        if arg[0] in "\"`":
            wire = arg[1:-1]
            ident = None
        else:
            ident = arg
            dm = re.search(r"\b" + re.escape(arg) + r"\s*=\s*[\"`]([^\"`]+)[\"`]", src)
            if not dm:
                return None  # unresolvable serving decision -> stays LIVE
            wire = dm.group(1)
        covering = row_covers(wire)
        if not covering:
            return None  # a serving wire NOT flip-row-covered -> stays LIVE
        decisions.append({"identifier": ident, "wire": wire, "rides_row": covering})
    if not decisions:
        return None  # no table-governed v2 decision of record -> stays LIVE
    if fallback_helper and fallback_helper not in src:
        return None  # the key's fallback helper vanished -> key stale, not v2-first
    return {
        "route_file": str(route.relative_to(REPO)),
        "serving_decisions": decisions,
        "core_rollback_fallback": fallback_helper,
        "fallback_law": ("the one-env-var rollback (NEXT_PUBLIC_API_V2_BASE_URL unset "
                         "-> core), the claAskFetch table-governed class "
                         "(T-MIG-097/118); the core helper is NOT the serving path"),
        "residual_sites": ("browser-side fetches of the hub's OWN route (e.g. "
                           "chat.tsx) are the unchanged browser contract, not "
                           "hub->core dependencies"),
    }


def is_comment_line(hit: str) -> bool:
    """A grep hit whose code line is actually a comment (the GNU-BRE quirk of
    record: the baseline counted 'smart-mark failures render...' doc lines)."""
    code = hit.split(":", 2)[-1].lstrip()
    return code.startswith("*") or code.startswith("//") or code.startswith("/*")


def resolve_wire_path(identifier: str) -> str | None:
    """Resolve an emitter identifier to its wire path by reading its definition
    window in lib/api.ts and taking the first /api/ literal (quote or backtick;
    ${...} interpolations are normalized to *). Bare-word hints also try the
    PREFIX match (smartMark -> smartMarkAttempt) so learner/teacher sibling
    emitters resolve to their TRUE wires."""
    src = (HUB_SRC / "lib" / "api.ts").read_text()
    m = re.search(re.escape(identifier) + r"\s*[:=][^;]{0,600}", src, re.S)
    if not m:
        m = re.search(re.escape(identifier) + r"[A-Za-z0-9_]*\s*[:=][^;]{0,600}", src, re.S)
        if not m:
            return None
    win = m.group(0)
    lit = re.search(r'["\`](/api/[^"\`]+)["\`]', win)
    if not lit:
        return None
    return re.sub(r"\$\{[^}]*\}", "*", lit.group(1))


def ident_from_hint(hint: str) -> str | None:
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\(?$", hint)
    return m.group(1) if m else None


def core_only_paths() -> list[str]:
    """Extract the CORE_ONLY_PATHS string literals from the surface test."""
    src = TEST_FILE.read_text()
    m = re.search(r"const CORE_ONLY_PATHS[^=]*=\s*\[(.*?)\n\];", src, re.S)
    if not m:
        raise SystemExit("FATAL: CORE_ONLY_PATHS block not found in the surface test")
    body = "\n".join(ln.split("//", 1)[0] for ln in m.group(1).splitlines())
    return re.findall(r'"([^"]+)"', body)


def grep_call_sites(pattern: str) -> list[str]:
    """LIVE call-sites = matches outside lib/api.ts + lib/core-proxy.ts + *.test.ts."""
    out = subprocess.run(
        ["grep", "-rn", "-F", "--include=*.ts", "--include=*.tsx", pattern, str(HUB_SRC)],
        capture_output=True, text=True,
    ).stdout
    hits = []
    for line in out.splitlines():
        p = line.split(":", 1)[0]
        if "/lib/api.ts" in p or "/lib/core-proxy" in p or ".test." in p or "/api/ai/chat/route.ts" in p and pattern != "api/ai/chat":
            continue
        hits.append(line.replace(str(REPO) + "/", ""))
    return hits


def classify(paths: list[str]) -> list[dict]:
    """HARDENED (T-MIG-119, the plan §Z per-call-site path-resolution law):
    for each hint hit, drop comment lines, resolve the emitter's WIRE path from
    lib/api.ts, and re-attribute the site: if the wire path is covered by a
    flip row of record, the site rides v2 and does NOT count live for the pin.
    The bare /subjects pin is the motivating correction of record: subjects()
    emits /api/v1/curriculum/subjects, which the Wave-1-era /api/v1/curriculum
    row already routes to v2."""
    rows = []
    for p in paths:
        hints = EMITTER_HINTS.get(p, [])
        sites: list[str] = []
        rides: list[dict] = []
        dropped_comments = 0
        for h in hints:
            ident = ident_from_hint(h)
            wire = resolve_wire_path(ident) if ident else None
            for hit in grep_call_sites(h):
                if is_comment_line(hit):
                    dropped_comments += 1
                    continue
                # per-site resolution FIRST (the plan note-b law): a line that
                # calls api.<emitter>(...) is classified by THAT emitter's wire
                site_ident = re.search(r"api\.([A-Za-z0-9_]+)\(", hit)
                site_wire = resolve_wire_path(site_ident.group(1)) if site_ident else None
                if site_wire is not None and row_covers(site_wire):
                    entry = {"site": hit, "emitter": site_ident.group(1),
                             "wire_path": site_wire, "rides_row": row_covers(site_wire)}
                    if entry not in rides:
                        rides.append(entry)
                    continue
                if wire is not None and row_covers(wire):
                    row = row_covers(wire)
                    entry = {"site": hit, "emitter": ident, "wire_path": wire, "rides_row": row}
                    if entry not in rides:
                        rides.append(entry)
                    continue
                if hit not in sites:
                    sites.append(hit)
        if sites:
            cls = "LIVE"
        elif rides:
            cls = "RIDES-V2"
        else:
            cls = "DORMANT" if hints else "UNMAPPED"
        rows.append({
            "core_only_path": p,
            "emitter_hints": hints,
            "live_call_sites": sites,
            "classification": cls,
            **({"rides_v2_wire_truth": rides} if rides else {}),
            **({"dropped_comment_lines": dropped_comments} if dropped_comments else {}),
        })
    return rows


def main() -> None:
    pins = core_only_paths()
    for p in MANUAL_PIN_ADDITIONS:
        if p not in pins:
            pins.append(p)
    rows = classify(pins)
    hardwire_rows = []
    for k, hints in HARDWIRES.items():
        sites = [h for h in grep_call_sites(hints[0]) if not is_comment_line(h)]
        row = {"core_only_path": k, "emitter_hints": hints, "live_call_sites": sites}
        truth = hardwire_v2_truth(k)
        if truth is not None:
            row["classification"] = "RIDES-V2"
            row["rides_v2_wire_truth"] = truth
            # the residual literal hits stay on the row, disclosed — honesty
            # over tidiness (the baseline diff readers see BOTH sides)
            row["residual_sites_disclosed"] = sites
        else:
            row["classification"] = "HARDWIRE-LIVE" if sites else "dormant"
        hardwire_rows.append(row)
    live = [r for r in rows + hardwire_rows if r["classification"] in ("LIVE", "HARDWIRE-LIVE")]
    rides_v2 = [r for r in rows + hardwire_rows if r["classification"] == "RIDES-V2"]
    dormant = [r for r in rows + hardwire_rows if r["classification"] in ("DORMANT", "dormant")]
    unmapped = [r for r in rows if r["classification"] == "UNMAPPED"]
    report = {
        "instrument": ("preflight_zero_core_census.py (hardened: per-call-site wire-path "
                       "resolution — the T-MIG-119 band; the midpath segment-join — the "
                       "T-MIG-122 band; the hardwire serving-decision law — the T-MIG-123 "
                       "band, the plan §Z law)"),
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_of_record": "apps/hub/src/lib/api.v2-surface.test.ts CORE_ONLY_PATHS (+ manual additions + hardwires)",
        "core_only_pins_total": len(pins),
        "manual_pin_additions": MANUAL_PIN_ADDITIONS,
        "live": live,
        "rides_v2_wire_truth": rides_v2,
        "dormant": dormant,
        "unmapped_needs_manual_review": unmapped,
        "gate_law": "the SS 6.2 Render-disable pre-gate: this list must reach ZERO live entries, "
                    "then hold green for the census-soak, before the operator disable",
    }
    out = (REPO / ".syllabai" / "receipts" / "W7-CUTOVER" /
           (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv
            else "zero-core-census-baseline.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"pins={len(pins)}  LIVE={len(live)}  dormant={len(dormant)}  unmapped={len(unmapped)}")
    print(f"written: {out.relative_to(REPO)}")
    for r in live:
        print(f"  LIVE     {r['core_only_path']}")
        for s in r["live_call_sites"][:4]:
            print(f"             {s}")
    for r in dormant:
        print(f"  DORMANT  {r['core_only_path']}")
    for r in unmapped:
        print(f"  UNMAPPED {r['core_only_path']}")
    return None if sys.argv[-1] != "--json" else print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
