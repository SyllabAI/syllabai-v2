#!/usr/bin/env python3
"""Zero-core-routing census — the §6.2 Render-disable pre-gate instrument.

Walks the CORE_ONLY stay-core pins of record (apps/hub/src/lib/api.v2-surface.test.ts)
plus the manual pin additions and the hub hardwires, and for each entry classifies
the hub's remaining-core dependency from EVIDENCE:

  LIVE                          direct call-sites on the core wire (uncovered by flip rows)
  RIDES-V2                      every direct call-site's resolved wire is covered by a
                                flip row of record (the T-MIG-119 per-call-site law)
  RIDES-V2-ROLLBACK-FALLBACK    no direct call-sites; the wire is served through a
                                table-governed v2-first upstream (route/proxy source
                                evidence) with the pinned one-env-var core rollback
                                arm (MIGRATION_PLAN §7) — disclosed, NOT counted LIVE
  LIVE-CORE-PROXY               a proxy upstream serves the pin from CORE with no v2
                                consult — counted LIVE (gate-blocking)
  DORMANT                       hints alive, zero call-sites (rulings annotated)
  UNMAPPED                      no hints — the inventory is incomplete (gate-blocking)
  STALE-HINT                    a hint matches nothing and resolves to nothing on an
                                unruled pin — the inventory chain is broken
                                (gate-blocking; the B4 over-capture lesson)
  UNKNOWN-ROUTE-LAW             a hardwire/proxy source matches the path but shows
                                neither the v2 consult nor the core arm — the route
                                drifted from the instrument's model (gate-blocking)

GATE LAW (docs/DECOMMISSION-BANDS-PLAN.md §Z): --gate exits 0 iff live=0 AND
unmapped=0 AND stale_hints=0 AND unknown_route_law=0 — the report→gate conversion
the plan requires "the moment the LIVE list hits zero". Wiring --gate into CI is a
later one-line act, taken then.

Read-only by default: ZERO files are written unless --out is passed; --out refuses
to overwrite a git-tracked file unless --overwrite-tracked is passed (retires the
desk-disclosed baseline-overwrite caveat). Exit 0 in report mode (exit nonzero on
instrument failures — a broken instrument must never report green).

Run from the repo root:
    python3 scripts/preflight_zero_core_census.py [--out PATH] [--gate] [--json] [--selftest]

Hardened bands of record: T-MIG-119 (per-call-site wire-path resolution), the
T-MIG-122 in-band mid-path matcher fix, T-MIG-123 (this Z band: evidence-driven
upstream classification, rulings fold-in, drift tripwire, zero-write default,
the --gate conversion).
"""

import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
HUB_SRC = REPO / "apps" / "hub" / "src"
TEST_FILE = HUB_SRC / "lib" / "api.v2-surface.test.ts"

# path pin -> candidate emitter identifiers (function/property names or route fragments)
# T-MIG-123 hint maintenance (the drift tripwire forcing honest inventory):
#   families: the hub emitter is gone — the wire is served through the
#     /api/core/questions proxy (fragment form; the proxy evidence classifies it)
#   tree: the emitter is knowledgeTree (renamed at the B4 repoint band); the old
#     "tree(" string matches nothing and the bare pin is ruled DORMANT-CORE
#   assignments: INERT key — the pin left CORE_ONLY_PATHS at T-MIG-117 (B2);
#     kept only as inventory history, classify() iterates pins, not hints
EMITTER_HINTS = {
    "/api/v1/teacher/curriculum/versions": ["curriculum/versions", "curriculumVersions"],
    "/api/v1/teacher/marking/answers": ["markingAnswer", "marking/answers", "smartMark", "smart-mark"],
    "/api/v1/teacher/assignments": ["teacherAssignments", "teacherCreateAssignment", "teacherSetAssignmentStatus", "teacherAssignmentRoster"],  # inert (pin left the set, T-MIG-117)
    "/api/v1/questions?q=photosynthesis": ["questions("],
    "/api/v1/questions/families": ["questions/families"],
    "/api/v1/exam-papers?subjectId=sub-1": ["examPapers"],
    "/api/v1/exam-papers/ep-1": ["examPapers"],
    "/api/v1/learners/me/answer-input/transcribe": ["transcribe"],
    "/api/v1/learners/me/intervention-runs": ["intervention-runs", "interventionRuns"],
    "/api/v1/subjects": ["subjects("],
    "/api/v1/tree?includeMisconceptions=true": ["knowledgeTree("],
}

# hub hardwires — classified by READING THE ROUTE SOURCE (the T-MIG-123 stale-rule
# fix: the old hardcoded "SSE -> coreStreamAuthorized" rule predated the B3
# table-governed re-point d38e453 and reported the chat route LIVE after it
# had stopped being a core dependency of the serving path).
HARDWIRES = {
    "hub route /api/ai/chat (the tutor SSE route)": {
        "route_source": "apps/hub/src/app/api/ai/chat/route.ts",
        "route_path": "/api/ai/chat",
        "v2_wire": "/api/v1/tutor/ask/stream",
        "rollback_arm": "coreStreamAuthorized",
    },
}

# T-MIG-119 hardening (the plan §Z law): pins of record that live OUTSIDE the
# CORE_ONLY_PATHS array (pinned by other test loops — the 096/110 laws) fold in
# here so the census inventory is complete.
MANUAL_PIN_ADDITIONS = [
    "/api/v1/learners/me/intervention-runs",  # the 096/110 STAYS-CORE law (no positive wire)
]

# T-MIG-123 rulings fold-in: operator/adjudication rulings OF RECORD, carried as
# EVIDENCE POINTERS (never decisions). A ruled pin with live call-sites re-opens:
# LIVE WINS over any ruling (a ruling never masks a live dependency).
RULINGS = {
    "/api/v1/tree?includeMisconceptions=true": {
        "class": "DORMANT-CORE",
        "evidence": "T-MIG-119 run-001 (r7a) disposition ruling: legacy wire has zero hub emitters; the knowledgeTree emitter rides the flipped T-MIG-084 /api/v1/knowledge row",
    },
    "/api/v1/teacher/curriculum/versions": {
        "class": "STAYS-CORE",
        "evidence": "T-MIG-111 EXCLUSION LAW of record: subtree contains the honest-501 write stubs; the stub law forbids a flip row whose capture includes a stub — the family flip awaits its own port band",
    },
    "/api/v1/learners/me/intervention-runs": {
        "class": "STAYS-CORE",
        "evidence": "the T-MIG-096/T-MIG-110 test-loop law: LLM-bearing, no positive wire — STAYS-CORE by test-loop pin",
    },
}

# ---------------------------------------------------------------- resolvers (laws of record)

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


def grep_call_sites(pattern: str, exclude: tuple[str, ...] = ()) -> list[str]:
    """LIVE call-sites = matches outside lib/api.ts + lib/core-proxy.ts + *.test.ts
    (+ any explicit excludes, e.g. a hardwire's own route file)."""
    out = subprocess.run(
        ["grep", "-rn", "-F", "--include=*.ts", "--include=*.tsx", pattern, str(HUB_SRC)],
        capture_output=True, text=True,
    ).stdout
    hits = []
    for line in out.splitlines():
        p = line.split(":", 1)[0]
        if "/lib/api.ts" in p or "/lib/core-proxy" in p or ".test." in p:
            continue
        if any(ex in p for ex in exclude):
            continue
        hits.append(line.replace(str(REPO) + "/", ""))
    return hits


# ---------------------------------------------------------------- T-MIG-123 evidence layer

def code_lines(relpath: str) -> list[str] | None:
    """Non-comment lines of a repo file (None if missing). Comment-only lines
    are dropped with the is_comment_line law (per line, not per grep hit)."""
    f = REPO / relpath
    if not f.is_file():
        return None
    out = []
    for i, ln in enumerate(f.read_text(errors="replace").splitlines(), 1):
        stripped = ln.lstrip()
        if stripped.startswith("*") or stripped.startswith("//") or stripped.startswith("/*"):
            continue
        out.append(f"{relpath}:{i}:{ln}")
    return out


def classify_hardwire(spec: dict) -> dict:
    """The T-MIG-123 stale-rule fix: classify a hub hardwire by reading its
    route source for the upstream decision law of record.
      v2 consult (v2SurfaceBase + the v2 wire literal) + core arm
          -> RIDES-V2-ROLLBACK-FALLBACK (the B3/B5 posture; not LIVE)
      core arm only -> HARDWIRE-LIVE (the pre-B3 posture)
      neither -> UNKNOWN-ROUTE-LAW (route drifted from the model; gate-blocking)"""
    lines = code_lines(spec["route_source"])
    if lines is None:
        return {"classification": "UNKNOWN-ROUTE-LAW",
                "evidence": {"route_source": spec["route_source"], "error": "route source missing"}}
    code = "\n".join(lines)
    v2_consult = "v2SurfaceBase(" in code and spec["v2_wire"] in code
    rollback = spec["rollback_arm"] in code
    rp = spec.get("route_path")
    clients = ([h for h in grep_call_sites(rp, exclude=(spec["route_source"],))
                if not is_comment_line(h)] if rp else [])
    if v2_consult and rollback:
        cls = "RIDES-V2-ROLLBACK-FALLBACK"
    elif rollback and not v2_consult:
        cls = "HARDWIRE-LIVE"
    elif v2_consult and not rollback:
        cls = "RIDES-V2"
    else:
        cls = "UNKNOWN-ROUTE-LAW"
    return {
        "core_only_path": None,  # stamped by the caller
        "classification": cls,
        "route_call_sites": clients,
        "evidence": {
            "route_source": spec["route_source"],
            "v2_wire": spec["v2_wire"],
            "v2_consult": v2_consult,
            "rollback_arm": spec["rollback_arm"],
            "rollback_arm_present": rollback,
            "law": "table-governed v2-first (MIGRATION_PLAN §7 one-env-var rollback fallback)",
        },
    }


_CORE_ARM_RE = re.compile(r"coreFetchAuthorized|coreFetchJson|coreStreamAuthorized")
_PATH_LIT_RE = re.compile(r'/api/[A-Za-z0-9_\-./:%]*')


def _line_pin_path(line: str, pin_path: str) -> str | None:
    """The /api/ literal this source line carries, if it EQUALS the pin path
    before query (the B4 over-capture guard: '/api/v1/y/legacy-pin' must NOT
    capture pin '/api/v1/y')."""
    src = line.split(":", 2)[-1]
    for m in _PATH_LIT_RE.finditer(src):
        if m.group(0).rstrip(".").split("?", 1)[0] == pin_path:
            return m.group(0)
    return None


def proxy_upstream_evidence(pin: str) -> dict | None:
    """The T-MIG-123 generalized proxy evidence: does some hub route/lib file
    fetch THIS pin's wire through a table-governed v2-first upstream?
    Over-capture guards (the B4 class): the found literal's path must EQUAL
    the pin path before query; lib/api.ts (the table module itself) and tests
    are excluded; comment lines are dropped. ALL matching files are evaluated
    and the STRONGEST evidence wins (v2-first consult > core-only proxy >
    unknown), so a second core-only file can never mask a table-governed one."""
    pin_path = pin.split("?", 1)[0]
    files = subprocess.run(
        ["grep", "-rl", "-F", "--include=*.ts", "--include=*.tsx", pin_path, str(HUB_SRC)],
        capture_output=True, text=True,
    ).stdout.splitlines()
    found = []
    for fp in sorted(files):
        rel = fp.replace(str(REPO) + "/", "")
        if ".test." in rel or rel == "apps/hub/src/lib/api.ts" or "/lib/core-proxy" in rel:
            continue
        lines = code_lines(rel)
        if not lines:
            continue
        path_lines = [ln for ln in lines if _line_pin_path(ln, pin_path)]
        if not path_lines:
            continue  # only comment-line matches, or path not exactly carried
        code = "\n".join(lines)
        v2_consult = "v2SurfaceBase(" in code
        arm_m = _CORE_ARM_RE.search(code)
        if not v2_consult and not arm_m:
            found.append({"classification": "UNKNOWN-ROUTE-LAW", "proxy_file": rel,
                          "path_line": path_lines[0],
                          "evidence": {"v2_consult": False, "fallback_arm": None}})
        elif v2_consult:
            found.append({"classification": "RIDES-V2-ROLLBACK-FALLBACK", "proxy_file": rel,
                          "path_line": path_lines[0],
                          "flip_row": row_covers(pin_path),
                          "evidence": {"v2_consult": True,
                                       "fallback_arm": arm_m.group(0) if arm_m else None,
                                       "law": "table-governed v2-first proxy (the T-MIG-120 re-point class)"}})
        else:
            found.append({"classification": "LIVE-CORE-PROXY", "proxy_file": rel,
                          "path_line": path_lines[0],
                          "evidence": {"v2_consult": False,
                                       "fallback_arm": arm_m.group(0) if arm_m else None,
                                       "law": "proxy serves the pin from CORE with no v2 consult"}})
    if not found:
        return None
    rank = {"RIDES-V2-ROLLBACK-FALLBACK": 0, "LIVE-CORE-PROXY": 1, "UNKNOWN-ROUTE-LAW": 2}
    best = min(found, key=lambda f: rank[f["classification"]])
    others = [f["proxy_file"] for f in found if f is not best]
    if others:
        best = dict(best)
        best["other_path_carrying_files"] = others
    return best


def hint_alive(hint: str) -> dict:
    """The T-MIG-123 drift tripwire: a hint is ALIVE iff the raw string hits
    anywhere in hub src (tests included — the string still exists in the code
    of record) OR the identifier resolves to an emitter definition in
    lib/api.ts. Dead-on-both = the inventory chain is broken for that pin."""
    raw = subprocess.run(
        ["grep", "-rF", "--include=*.ts", "--include=*.tsx", hint, str(HUB_SRC)],
        capture_output=True, text=True,
    ).stdout
    if raw.strip():
        return {"alive": True, "how": "raw-string hit"}
    ident = ident_from_hint(hint)
    if ident and resolve_wire_path(ident):
        return {"alive": True, "how": f"identifier '{ident}' resolves in lib/api.ts"}
    return {"alive": False, "how": "no raw hit, no emitter resolution"}


# ---------------------------------------------------------------- classification

def classify(paths: list[str]) -> list[dict]:
    """HARDENED (T-MIG-119 per-call-site law + T-MIG-123 evidence law): for each
    hint hit, drop comment lines, resolve the emitter's WIRE path, re-attribute
    covered sites to RIDES-V2; then fall through to the proxy-upstream evidence,
    the rulings fold-in, and the drift tripwire. Precedence:
    LIVE > RIDES-V2 > proxy class > DORMANT(+ruled) > UNMAPPED."""
    rows = []
    for p in paths:
        hints = EMITTER_HINTS.get(p, [])
        ruling = RULINGS.get(p)
        proxy: dict | None = None
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
            proxy = proxy_upstream_evidence(p) if p.startswith("/api/") else None
            if proxy is not None:
                cls = proxy["classification"]
            elif hints:
                cls = "DORMANT"
            else:
                cls = "UNMAPPED"

        if proxy is not None:
            proxy_disclosure = {k: v for k, v in proxy.items() if k != "classification"}
        else:
            proxy_disclosure = None

        # drift tripwire: dead hints block the gate on unruled pins; on ruled
        # pins a dead hint CORROBORATES the ruling (the ruling already
        # adjudicated the inventory: "zero emitters")
        stale = []
        corroborated = []
        for h in hints:
            al = hint_alive(h)
            if not al["alive"]:
                if ruling:
                    corroborated.append({"hint": h, "note": al["how"]})
                else:
                    stale.append({"hint": h, "note": al["how"]})

        row = {
            "core_only_path": p,
            "emitter_hints": hints,
            "live_call_sites": sites,
            "classification": cls,
            **({"rides_v2_wire_truth": rides} if rides else {}),
            **({"proxy_upstream": proxy_disclosure} if proxy_disclosure else {}),
            **({"ruled": ruling} if ruling else {}),
            **({"stale_hints": stale} if stale else {}),
            **({"dead_hints_corroborate_ruling": corroborated} if corroborated else {}),
            **({"dropped_comment_lines": dropped_comments} if dropped_comments else {}),
        }
        rows.append(row)
    return rows


LIVE_CLASSES = ("LIVE", "HARDWIRE-LIVE", "LIVE-CORE-PROXY")
GATE_INTEGRITY_CLASSES = ("UNKNOWN-ROUTE-LAW",)


def build_report() -> dict:
    pins = core_only_paths()
    for p in MANUAL_PIN_ADDITIONS:
        if p not in pins:
            pins.append(p)
    rows = classify(pins)

    hardwire_rows = []
    for key, spec in HARDWIRES.items():
        hw = classify_hardwire(spec)
        hw["core_only_path"] = key
        hw["emitter_hints"] = [spec["route_path"]]
        hardwire_rows.append(hw)

    all_rows = rows + hardwire_rows
    live = [r for r in all_rows if r["classification"] in LIVE_CLASSES]
    rides_v2 = [r for r in all_rows if r["classification"] == "RIDES-V2"]
    fallback = [r for r in all_rows if r["classification"] == "RIDES-V2-ROLLBACK-FALLBACK"]
    dormant = [r for r in all_rows if r["classification"] == "DORMANT"]
    unmapped = [r for r in all_rows if r["classification"] == "UNMAPPED"]
    unknown = [r for r in all_rows if r["classification"] in GATE_INTEGRITY_CLASSES]
    stale_hints = [r for r in all_rows if r.get("stale_hints")]

    blocking = [
        {"core_only_path": r["core_only_path"], "reason": r["classification"]}
        for r in live + unmapped + unknown
    ] + [
        {"core_only_path": r["core_only_path"], "reason": "STALE-HINT",
         "detail": r["stale_hints"]}
        for r in stale_hints
    ]

    return {
        "instrument": "preflight_zero_core_census.py (hardened: evidence-driven upstream "
                      "classification — the T-MIG-123 Z band; per-call-site wire-path "
                      "resolution — the T-MIG-119 band; the 122 mid-path matcher fix)",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_of_record": "apps/hub/src/lib/api.v2-surface.test.ts CORE_ONLY_PATHS "
                            "(+ manual additions + hardwires, classified by route/proxy "
                            "source evidence and the rulings of record)",
        "core_only_pins_total": len(pins),
        "manual_pin_additions": MANUAL_PIN_ADDITIONS,
        "rulings_of_record": {p: r["evidence"] for p, r in RULINGS.items()},
        "live": live,
        "rides_v2_wire_truth": rides_v2,
        "rides_v2_rollback_fallback": fallback,
        "dormant": dormant,
        "unmapped_needs_manual_review": unmapped,
        "unknown_route_law": unknown,
        "stale_hints": stale_hints,
        "gate": {
            "law": "the plan §Z conversion: exit 0 iff live=0 AND unmapped=0 AND "
                   "stale_hints=0 AND unknown_route_law=0; the rollback-fallback and "
                   "dormant buckets are disclosed, not blocking",
            "blocking_count": len(blocking),
            "blocking": blocking,
            "wired_into_ci": False,
            "wiring_note": "wiring happens the moment the LIVE list hits zero (post the "
                           "B6 operator ruling (b) + the B7 rulings), per the plan's "
                           "own conversion law",
        },
        "gate_law": "the SS 6.2 Render-disable pre-gate: the LIVE list must reach ZERO, "
                    "then hold green for the census-soak (2 consecutive scheduled "
                    "replays + 48h), before the operator disable",
    }


# ---------------------------------------------------------------- selftest

def selftest() -> int:
    """The B4-class regression pin for the instrument itself: structural laws on
    synthetic fixtures + live-repo structural asserts. Exits nonzero on failure."""
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            failures.append(f"{name}: {detail}")
        print(f"  {'ok ' if cond else 'FAIL'} {name}" + (f" — {detail}" if detail and not cond else ""))

    tmp = Path(tempfile.mkdtemp(prefix="census-selftest-"))
    (tmp / "lib").mkdir(parents=True)
    (tmp / "app" / "api" / "proxy").mkdir(parents=True)
    (tmp / "app" / "api" / "coreonly").mkdir(parents=True)

    (tmp / "lib" / "api.ts").write_text(
        "// tables of record (synthetic)\n"
        'export const V2_SURFACE_PREFIXES = [\n'
        '  "/api/v1/x", // a comment inside the array\n'
        '  "/api/v1/curriculum",\n'
        '];\n'
        'export const V2_SURFACE_MIDPATH_PREFIXES = [\n'
        '  "/api/v1/y/:uuid",\n'
        '];\n'
        'fooThing: () =>\n'
        '  request(`/api/v1/x/thing`),\n'
        'smartMarkAttempt: (id: string) =>\n'
        '  request(`/api/v1/y/${id}/smart-mark`),\n'
        'questions: (topicNodeId?: string) => {\n'
        '  const path = `/api/v1/a?q=${topicNodeId}`;\n'
        '  return request(path);\n'
        '},\n'
    )
    (tmp / "lib" / "api.v2-surface.test.ts").write_text(
        'const CORE_ONLY_PATHS: readonly string[] = [\n'
        '  // a comment\n'
        '  "/api/v1/a",\n'
        '  "/api/v1/y/legacy-pin",\n'
        '];\n'
    )
    (tmp / "app" / "api" / "proxy" / "route.ts").write_text(
        'import { v2SurfaceBase } from "@/lib/api";\n'
        'import { coreFetchAuthorized } from "@/lib/core-proxy";\n'
        'const famPath = `/api/v1/y/legacy-pin?rootId=${encodeURIComponent(rootId)}`;\n'
        'const v2Base = v2SurfaceBase(famPath, process.env.NEXT_PUBLIC_API_V2_BASE_URL);\n'
        'return v2Base ? await v2FetchAuthorized(v2Base, famPath, init)\n'
        '              : await coreFetchAuthorized(famPath, init);\n'
    )
    (tmp / "app" / "api" / "coreonly" / "route.ts").write_text(
        'import { coreFetchAuthorized } from "@/lib/core-proxy";\n'
        'const famPath = `/api/v1/y/legacy-pin`;\n'
        'return await coreFetchAuthorized(famPath, init);\n'
    )

    global REPO, HUB_SRC, TEST_FILE, _FLIP_CACHE
    old = (REPO, HUB_SRC, TEST_FILE, _FLIP_CACHE)
    REPO, HUB_SRC, TEST_FILE, _FLIP_CACHE = tmp, tmp, tmp / "lib" / "api.v2-surface.test.ts", None
    try:
        # 1. table extraction strips comments
        exact, midpath = extract_flip_rows()
        check("extract_flip_rows exact", exact == ["/api/v1/x", "/api/v1/curriculum"], str(exact))
        check("extract_flip_rows midpath", midpath == ["/api/v1/y/:uuid"], str(midpath))

        # 2. the T-MIG-122 regression: mid-path matcher preserves separators
        check("midpath covers :uuid", midpath_covers("/api/v1/y/abc", midpath) == "/api/v1/y/:uuid")
        check("midpath deeper tail", midpath_covers("/api/v1/y/abc/smart-mark", midpath) == "/api/v1/y/:uuid")
        check("midpath bare prefix NOT covered", midpath_covers("/api/v1/y", midpath) is None)
        check("midpath sibling NOT covered", midpath_covers("/api/v1/yy/abc", midpath) is None)
        check("row_covers exact", row_covers("/api/v1/x/thing") == "/api/v1/x")
        check("row_covers none", row_covers("/api/v1/a") is None)

        # 3. comment-line law (the GNU-BRE quirk classes)
        check("comment *", is_comment_line("f.ts:12: * doc line"))
        check("comment //", is_comment_line("f.ts:12: // note"))
        check("comment /*", is_comment_line("f.ts:12: /* block"))
        check("code not comment", not is_comment_line("f.ts:12: const x = 1;"))

        # 4. wire resolution: backtick + ${} normalization + prefix ident match
        w = resolve_wire_path("fooThing")
        check("resolve backtick+interp", w == "/api/v1/x/thing", str(w))
        w2 = resolve_wire_path("smartMark")  # prefix branch -> smartMarkAttempt
        check("resolve prefix ident", w2 == "/api/v1/y/*/smart-mark", str(w2))
        check("prefix ident rides midpath", row_covers(w2) == "/api/v1/y/:uuid")
        w3 = resolve_wire_path("questions")
        check("resolve questions ident", w3 == "/api/v1/a?q=*", str(w3))

        # 5. hardwire classification: evidence-driven
        hw_v2 = classify_hardwire({"route_source": "app/api/proxy/route.ts",
                                   "v2_wire": "/api/v1/y/legacy-pin",
                                   "rollback_arm": "coreFetchAuthorized"})
        check("hardwire v2+arm -> fallback", hw_v2["classification"] == "RIDES-V2-ROLLBACK-FALLBACK",
              hw_v2["classification"])
        hw_core = classify_hardwire({"route_source": "app/api/coreonly/route.ts",
                                     "v2_wire": "/api/v1/y/legacy-pin",
                                     "rollback_arm": "coreFetchAuthorized"})
        check("hardwire arm-only -> LIVE", hw_core["classification"] == "HARDWIRE-LIVE",
              hw_core["classification"])
        hw_none = classify_hardwire({"route_source": "app/api/missing/route.ts",
                                     "v2_wire": "/w", "rollback_arm": "x"})
        check("hardwire missing -> UNKNOWN", hw_none["classification"] == "UNKNOWN-ROUTE-LAW")

        # 6. proxy evidence + the B4 over-capture guards
        pe = proxy_upstream_evidence("/api/v1/y/legacy-pin")
        check("proxy evidence found", pe is not None and pe["classification"] == "RIDES-V2-ROLLBACK-FALLBACK",
              str(pe and pe.get("classification")))
        check("proxy evidence flip_row", pe is not None and pe.get("flip_row") == "/api/v1/y/:uuid",
              str(pe and pe.get("flip_row")))
        check("proxy path-exact guard (prefix literal does NOT capture)",
              proxy_upstream_evidence("/api/v1/y") is None)

        # 7. drift tripwire: dead hint on synthetic root
        al = hint_alive("totallyDeadHint(")
        check("dead hint detected", al["alive"] is False, str(al))
        al2 = hint_alive("questions(")
        check("resolution-alive hint", al2["alive"] is True, str(al2))

        # 8. core_only_paths extraction
        pins = core_only_paths()
        check("core_only_paths", pins == ["/api/v1/a", "/api/v1/y/legacy-pin"], str(pins))
    finally:
        REPO, HUB_SRC, TEST_FILE, _FLIP_CACHE = old
        _FLIP_CACHE = None

    # 9. live-repo structural asserts (no coupling to table CONTENT)
    pins = core_only_paths()
    check("live: CORE_ONLY_PATHS non-empty", len(pins) > 0)
    exact, midpath = extract_flip_rows()
    check("live: flip tables non-empty both", len(exact) > 0 and len(midpath) > 0)
    unmapped = [p for p in pins if p not in EMITTER_HINTS]
    check("live: every pin hinted (no UNMAPPED)", unmapped == [], str(unmapped))

    print(f"\nselftest: {'ALL PASS' if not failures else f'{len(failures)} FAILURE(S)'}")
    return 0 if not failures else 1


# ---------------------------------------------------------------- main

def is_tracked(relpath: str) -> bool:
    out = subprocess.run(["git", "-C", str(REPO), "ls-files", "--", relpath],
                         capture_output=True, text=True).stdout
    return bool(out.strip())


def main() -> int:
    argv = sys.argv[1:]
    if "--selftest" in argv:
        return selftest()

    report = build_report()
    out_path = None
    if "--out" in argv:
        i = argv.index("--out")
        out_path = argv[i + 1]
    tracked_guard = False
    if out_path:
        rel = out_path if out_path.startswith("/") else str(REPO / out_path)
        target = Path(rel)
        rel_in_repo = str(target.resolve().relative_to(REPO)) if str(target.resolve()).startswith(str(REPO)) else str(target)
        if is_tracked(rel_in_repo) and "--overwrite-tracked" not in argv:
            print(f"REFUSING to overwrite git-tracked file: {rel_in_repo}\n"
                  f"(the T-MIG-123 zero-write law — pass --overwrite-tracked to override, "
                  f"or --out a dated path)")
            return 2
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, indent=1) + "\n")
        tracked_guard = True

    counts = (f"pins={report['core_only_pins_total']}"
              f"  LIVE={len(report['live'])}"
              f"  rides-v2={len(report['rides_v2_wire_truth'])}"
              f"  rollback-fallback={len(report['rides_v2_rollback_fallback'])}"
              f"  dormant={len(report['dormant'])}"
              f"  unmapped={len(report['unmapped_needs_manual_review'])}"
              f"  stale-hints={len(report['stale_hints'])}"
              f"  unknown-route={len(report['unknown_route_law'])}")
    print(counts)
    if tracked_guard:
        print(f"written: {target}")
    else:
        print("(zero-write default: pass --out PATH to file the report)")

    for r in report["live"]:
        print(f"  LIVE     {r['core_only_path']}")
        for s in r["live_call_sites"][:4]:
            print(f"             {s}")
    for r in report["rides_v2_rollback_fallback"]:
        ev = r.get("evidence", {})
        print(f"  FALLBACK {r['core_only_path']}  ({r.get('proxy_file', ev.get('route_source'))}; "
              f"v2-consult={ev.get('v2_consult')}, rollback-arm={ev.get('fallback_arm') or ev.get('rollback_arm')})")
    for r in report["rides_v2_wire_truth"]:
        print(f"  RIDES-V2 {r['core_only_path']}")
    for r in report["dormant"]:
        ruled = " [ruled]" if r.get("ruled") else ""
        print(f"  DORMANT  {r['core_only_path']}{ruled}")
    for r in report["unmapped_needs_manual_review"]:
        print(f"  UNMAPPED {r['core_only_path']}")
    for r in report["stale_hints"]:
        print(f"  STALE-HINT {r['core_only_path']} {[h['hint'] for h in r['stale_hints']]}")
    for r in report["unknown_route_law"]:
        print(f"  UNKNOWN-ROUTE-LAW {r['core_only_path']}")

    if "--json" in argv:
        print(json.dumps(report, indent=1))

    if "--gate" in argv:
        b = report["gate"]["blocking"]
        if b:
            print(f"GATE: RED — {len(b)} blocking row(s):")
            for row in b:
                print(f"  {row['reason']}: {row['core_only_path']}")
            return 1
        print("GATE: GREEN — zero live entries, inventory complete (the census-soak "
              "window starts here; the operator §6.2 disable remains the human act)")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
