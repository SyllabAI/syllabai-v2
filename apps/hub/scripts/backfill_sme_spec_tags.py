#!/usr/bin/env python3
"""D0 tag backfill — resolve SME spec anchors to official specPointCodes.

The SME selector audit (2026-11-03, blast-radius of record) found 450 SME
question sets / 6,565 questions whose parts carry NO resolvable
specPointCodes — they anchor to nothing and land in the bank's "Other sets"
bucket, invisible in the topic tree (defect class D0).

The resolution data was already in the corpus: every part carries
`smeSpecPointIds` (upstream spcpt_* ids), and the source repo maps those to
SME spec-point names and subtopic slugs:

    part.smeSpecPointIds
      → SME-ExamQuestion/<course>/spec_point_index.json  (spcpt_* → name)
      → official SPEC_POINT with the same normalized title  (exact, per part)
      → fallback: the set's SME topic page (topicSlug + sectionSlug →
        SME manifest topic_name) title-joined to a unique curriculum
        SUBTOPIC → that subtopic's spec points (disclosed approximation)

Parts that already carry specPointCodes are never touched. Sets whose home
cannot be resolved to a unique curriculum subtopic stay untagged (honest
"Other sets", pending map-side fixes) — nothing is guessed.

Provenance (ADR-039: pipeline improves; provenance discloses):
  - patched sets gain source.tagBackfill {via, home, counts, date}
  - patched course manifests gain a tagBackfill block (method + counts +
    source ref of the SME metadata used)

Idempotent: already-anchored sets and already-coded parts are skipped.
"""
import argparse
import collections
import datetime
import json
import os
import re
import subprocess
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CONTENT = os.path.join(REPO_ROOT, "apps", "hub", "content")
DEFAULT_SME = os.path.abspath(
    os.path.join(REPO_ROOT, "..", "syllabai-resources", "SME-ExamQuestion")
)
TODAY = "2026-11-03"

STOP = {"and", "of", "the", "in", "for", "to", "a", "an", "on", "with"}


def toks(s):
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"^\s*\d+\s*\.\s*", "", s)
    return frozenset(w for w in re.split(r"[^a-z0-9]+", s) if w and w not in STOP)


def norm(s):
    return " ".join(sorted(toks(s)))


def node_key(n):
    return (n.get("order") if n.get("order") is not None else float("inf"), n["code"])


def smetok(s):
    s = (s or "").lower()
    return frozenset(w for w in re.split(r"[^a-z0-9]+", s) if w)


def build_curriculum(curriculum):
    """subtopicOfSpecPoint / subtopic tables — mirrors lib/spec-tree.ts."""
    nodes = curriculum["nodes"]
    families = {n["code"]: n["family"] for n in nodes}
    sub_of_sp = {}
    sub_by_code = {}
    topic_title = {}
    for t in (n for n in nodes if n["family"] == "TOPIC"):
        topic_title[t["code"]] = t["title"] or ""
    for sub in (n for n in nodes if n["family"] == "SUBTOPIC"):
        pts = sorted(
            (n["code"] for n in nodes
             if n["family"] == "SPEC_POINT" and sub["code"] in n["parents"]),
            key=lambda c: next(
                (n.get("order") if isinstance(n.get("order"), (int, float)) else 0)
                for n in nodes if n["code"] == c))
        for c in pts:
            sub_of_sp[c] = sub["code"]
        topic = next((p for p in sub["parents"] if families.get(p) == "TOPIC"), None)
        sub_by_code[sub["code"]] = {"title": sub["title"], "topicCode": topic,
                                    "specPointCodes": pts}
    return sub_of_sp, sub_by_code, topic_title


LEVEL_RE = re.compile(r"\b(A-?S|A)\s+Level\b", re.I)


def level_of(s):
    """'(AS Level)' → 'as', '(A Level)' → 'a', else None (SME's own suffix)."""
    m = LEVEL_RE.search(s or "")
    if not m:
        return None
    return "as" if m.group(1).upper().startswith("AS") or m.group(1).upper() == "A-S" else "a"


def set_anchor(st, sub_of_sp):
    """Mirror subtopicOfQuestionSet: per-question subtopic tally, strict max."""
    tally = {}
    for q in st.get("questions") or []:
        codes = set()
        for p in q.get("parts") or []:
            for c in list(p.get("specPointCodes") or []) + list(p.get("specPointIds") or []):
                s = sub_of_sp.get(c)
                if s:
                    codes.add(s)
        for s in codes:
            tally[s] = tally.get(s, 0) + 1
    best, best_n = None, 0
    for s, n in tally.items():
        if n > best_n:
            best, best_n = s, n
    return best


def dump_like(raw_text, obj):
    """Serialize obj in the file's ORIGINAL format — minified bundles stay
    minified, indented bundles keep indent=1 (diff honesty: a backfill commit
    must show what changed, never reformat 30k lines around 2 tagged sets)."""
    if "\n" in raw_text.rstrip("\n"):
        return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def backfill_course(slug, content_dir, sme_dir, pin, dry=False):
    qp = os.path.join(content_dir, slug, "questions.json")
    cp = os.path.join(content_dir, slug, "curriculum.json")
    if not (os.path.exists(qp) and os.path.exists(cp)):
        return None
    with open(qp) as f:
        sets = json.load(f)
    if not isinstance(sets, list):
        sets = sets.get("sets") or []
    with open(qp) as f:
        sets_raw = f.read()
    with open(cp) as f:
        curriculum = json.load(f)

    sme_manifest_p = os.path.join(sme_dir, slug, "manifest.json")
    sme_index_p = os.path.join(sme_dir, slug, "spec_point_index.json")
    if not os.path.exists(sme_manifest_p):
        return None
    with open(sme_manifest_p) as f:
        sme_manifest = json.load(f)
    spcpt_name = {}
    spcpt_subs = {}
    if os.path.exists(sme_index_p):
        with open(sme_index_p) as f:
            sp_index = json.load(f)
        for sid, row in (sp_index.get("spec_points") or {}).items():
            spcpt_name[sid] = row.get("name") or ""
            spcpt_subs[sid] = list(row.get("subtopic_slugs") or [])

    sub_of_sp, sub_by_code, topic_title = build_curriculum(curriculum)
    sub_by_title = collections.defaultdict(list)
    for code, sub in sub_by_code.items():
        sub_by_title[norm(sub["title"])].append(code)
    spec_title = collections.defaultdict(list)
    for n in curriculum["nodes"]:
        if n["family"] == "SPEC_POINT":
            spec_title[norm(n["title"])].append(n["code"])
    spec_code_sub = sub_of_sp  # code → subtopic

    def resolve_home(name, set_name, section_name):
        """unique curriculum SUBTOPIC for an SME subtopic title, or None.
        Exact unique → level-suffix disambiguation → section-topic filter →
        conservative token-subset (map titles truncated by D8)."""
        if not name:
            return None, None
        def refine(cands):
            lvl = level_of(set_name)
            if lvl and len(cands) > 1:
                f = [c for c in cands if level_of(topic_title.get(sub_by_code[c]["topicCode"], "")) == lvl]
                if len(f) == 1:
                    return f
            if section_name and len(cands) > 1:
                stt = toks(section_name)
                if stt:
                    f = [c for c in cands
                         if stt <= toks(topic_title.get(sub_by_code[c]["topicCode"], ""))]
                    if len(f) == 1:
                        return f
            return None
        hits = sub_by_title.get(norm(name), [])
        if len(hits) == 1:
            return hits[0], "sme-topic-name"
        if len(hits) > 1:
            f = refine(hits)
            if f:
                return f[0], "sme-topic-name+disambiguated"
            return None, None
        nt = toks(name)
        # conservative token-subset both ways; uniqueness (or refine) decides:
        #   map ⊆ sme (both ≥2 tokens)  — map titles truncated mid-phrase (D8)
        #   sme ⊆ map (strict)          — map titles carry a glued section
        #                                 suffix ("Substitution Notes and
        #                                 examples"); 1-token SME names allowed,
        #                                 the unique-candidate check guards
        subs = []
        for code, sub in sub_by_code.items():
            mt = toks(sub["title"])
            if len(mt) >= 2 and len(nt) >= 2 and mt <= nt:
                subs.append(code)
            elif mt and nt and nt <= mt and len(mt) > len(nt):
                subs.append(code)
        if len(subs) > 1:
            f = refine(subs)
            if f:
                return f[0], "sme-topic-name-subset+disambiguated"
        elif len(subs) == 1:
            return subs[0], "sme-topic-name-subset"
        return None, None
    spcpt_codes = {}
    for sid, name in spcpt_name.items():
        cs = spec_title.get(norm(name), [])
        subs = {spec_code_sub.get(c) for c in cs}
        if len(cs) == 1:
            spcpt_codes[sid] = sorted(cs)
        elif len(subs) == 1 and None not in subs and len(cs) > 1:
            spcpt_codes[sid] = sorted(cs)  # ambiguous code, unambiguous subtopic
    # SME subtopic slug → curriculum SUBTOPIC (cache over the manifest topic table)
    sme_slug_to_sub = {}
    for t in sme_manifest.get("topics") or []:
        tslug = t.get("topic_slug")
        if not tslug or tslug in sme_slug_to_sub:
            continue
        hit, _ = resolve_home(t.get("topic_name"), "", None)
        if hit:
            sme_slug_to_sub[tslug] = hit
    # topic rows: (topic_slug, section_slug) → topic_name; topic_slug alone as fallback
    topic_rows = {}
    topic_rows_slug_only = collections.defaultdict(list)
    for t in sme_manifest.get("topics") or []:
        key = (t.get("topic_slug"), t.get("section_slug"))
        topic_rows[key] = t.get("topic_name") or ""
        topic_rows_slug_only[t.get("topic_slug")].append(t.get("topic_name") or "")

    stats = {"sets": 0, "setsTagged": 0, "partsExact": 0, "partsSubtopic": 0,
             "partsPerPart": 0, "partsUntouched": 0, "residualSets": 0,
             "questions": 0, "questionsTagged": 0}
    changed = False
    for st in sets:
        prov = ((st.get("source") or {}).get("provider") or "")
        if "save my exams" not in prov.lower():
            continue
        stats["sets"] += 1
        nq = len(st.get("questions") or [])
        stats["questions"] += nq
        if set_anchor(st, sub_of_sp) is not None:
            continue  # anchored already — D0 does not apply
        # home resolution: SME topic page title, then set-name title
        home = via = None
        tname = topic_rows.get((st.get("topicSlug"), st.get("sectionSlug")))
        if tname is None and st.get("topicSlug"):
            names = topic_rows_slug_only.get(st.get("topicSlug")) or []
            if len(set(names)) == 1:
                tname = names[0]
        for candidate, source_name in ((tname, "sme-topic-name"), (st.get("name"), "set-name-title")):
            hit, hvia = resolve_home(candidate, st.get("name") or "", st.get("section"))
            if hit:
                home, via = hit, hvia if candidate is tname else f"{hvia} ({source_name})"
                break
        if home is None and not (st.get("topicSlug") or st.get("name")):
            stats["residualSets"] += 1
            continue
        exact = perpart = subtopic = 0
        touched = False
        written_parts = []
        for q in st.get("questions") or []:
            for p in q.get("parts") or []:
                if p.get("specPointCodes"):
                    stats["partsUntouched"] += 1
                    continue
                codes = set()
                for sid in p.get("smeSpecPointIds") or []:
                    codes.update(spcpt_codes.get(sid) or [])
                if codes:
                    p["specPointCodes"] = sorted(codes)
                    exact += 1
                else:
                    # per-part path: the part's SME spec points name their own
                    # SME subtopics — usable ONLY when they all resolve to ONE
                    # curriculum subtopic. A part spanning several subtopics
                    # gets no union (unions made unrelated subtopics compete
                    # in the plurality tally and mis-homed sets); it falls
                    # through to the set-level home instead.
                    part_subs = set()
                    for sid in p.get("smeSpecPointIds") or []:
                        for sslug in spcpt_subs.get(sid) or []:
                            sub = sme_slug_to_sub.get(sslug)
                            if sub:
                                part_subs.add(sub)
                    if len(part_subs) == 1:
                        codes.update(sub_by_code[next(iter(part_subs))]["specPointCodes"])
                    if codes:
                        p["specPointCodes"] = sorted(codes)
                        perpart += 1
                    elif home:
                        sub_pts = sub_by_code[home]["specPointCodes"]
                        if sub_pts:
                            p["specPointCodes"] = sorted(sub_pts)
                            subtopic += 1
                if p.get("specPointCodes"):
                    touched = True
                    written_parts.append(p)
        if touched:
            final_home = home or set_anchor(st, sub_of_sp)
            if final_home is None:
                # every written code list came from curriculum subtopics, so
                # the plurality anchor must resolve — if it does not, the
                # join tables are corrupt and we fail loudly instead of
                # writing unresolvable tags
                raise RuntimeError(f"{slug}: {st.get('slug')} touched but unresolvable")
            # section-consistency guard: when SME's own section resolves to a
            # unique curriculum topic, the set's plurality anchor must live in
            # that topic — otherwise the join guessed wrong and the set is
            # better off staying in "Other sets" than sitting in the wrong topic
            sec_toks = toks(st.get("section"))
            if sec_toks:
                sec_topic = None
                for tcode, ttitle in topic_title.items():
                    tt = toks(ttitle)
                    if tt and (tt == sec_toks or tt <= sec_toks):
                        if sec_topic is not None:
                            sec_topic = None
                            break
                        sec_topic = tcode
                if sec_topic is not None:
                    anchor_topic = sub_by_code[final_home]["topicCode"]
                    if anchor_topic != sec_topic:
                        # revert this set's writes (only parts written this run)
                        # — nothing is shipped
                        for p in written_parts:
                            p["specPointCodes"] = []
                        stats["residualSets"] += 1
                        continue
            src = st.setdefault("source", {})
            src["tagBackfill"] = {
                "via": via or "per-part-sme-subtopic-slugs",
                "home": final_home,
                "partsExact": exact,
                "partsPerPartSme": perpart,
                "partsSubtopicLevel": subtopic,
                "date": TODAY,
            }
            stats["setsTagged"] += 1
            stats["questionsTagged"] += nq
            stats["partsExact"] += exact
            stats["partsSubtopic"] += subtopic
            stats["partsPerPart"] += perpart
            changed = True
        else:
            stats["residualSets"] += 1

    if not changed or dry:
        return {"course": slug, "changed": changed, **stats}

    with open(qp, "w") as f:
        f.write(dump_like(sets_raw, sets))
    mp = os.path.join(content_dir, slug, "manifest.json")
    if os.path.exists(mp):
        with open(mp) as f:
            manifest_raw = f.read()
        manifest = json.loads(manifest_raw)
        manifest["tagBackfill"] = {
            "schema": "syllabai.hub.tag-backfill/1.0",
            "date": TODAY,
            "source": {
                "repo": "SyllabAI/syllabai-resources",
                "path": f"SME-ExamQuestion/{slug}",
                "ref": pin,
            },
            "method": (
                "part smeSpecPointIds → SME spec-point-index name → official "
                "SPEC_POINT title (exact, per part); else the part's SME "
                "subtopic slugs resolved to curriculum subtopics (per part); "
                "else set-level fallback via SME topic-name title join to a "
                "unique curriculum SUBTOPIC"
            ),
            "sets": stats["setsTagged"],
            "questions": stats["questionsTagged"],
            "partsExact": stats["partsExact"],
            "partsPerPartSme": stats["partsPerPart"],
            "partsSubtopicLevel": stats["partsSubtopic"],
            "residualSets": stats["residualSets"],
        }
        with open(mp, "w") as f:
            f.write(dump_like(manifest_raw, manifest))
    return {"course": slug, "changed": True, **stats}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sme", default=DEFAULT_SME, help="SME-ExamQuestion checkout")
    ap.add_argument("--course", action="append", help="limit to course slug(s)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pin = "unpinned"
    try:
        sha = subprocess.run(
            ["git", "-C", args.sme, "rev-parse", "--short=12", "HEAD"],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
        if sha:
            pin = f"main@{sha}"
    except Exception:
        pass

    slugs = args.course
    if not slugs:
        slugs = sorted(
            d for d in os.listdir(CONTENT)
            if os.path.isdir(os.path.join(CONTENT, d))
            and os.path.exists(os.path.join(CONTENT, d, "questions.json"))
        )
    rows = []
    for slug in slugs:
        try:
            r = backfill_course(slug, CONTENT, args.sme, pin, dry=args.dry_run)
        except Exception as e:  # noqa: BLE001 — report and continue
            r = {"course": slug, "error": str(e)}
        if r:
            rows.append(r)

    tot = collections.Counter()
    print(f"{'course':<58}{'sets':>5}{'tagged':>7}{'exact':>7}{'perprt':>7}{'subtop':>7}{'resid':>6}{'q-tag':>7}  pin={pin}")
    for r in rows:
        if "error" in r:
            print(f"{r['course']:<58} ERROR {r['error'][:60]}")
            continue
        for k in ("sets", "setsTagged", "partsExact", "partsPerPart", "partsSubtopic", "residualSets", "questionsTagged"):
            tot[k] += r.get(k, 0)
        print(f"{r['course']:<58}{r['sets']:>5}{r['setsTagged']:>7}{r['partsExact']:>7}"
              f"{r['partsPerPart']:>7}{r['partsSubtopic']:>7}{r['residualSets']:>6}{r['questionsTagged']:>7}")
    print("-" * 110)
    print(f"{'TOTAL':<58}{tot['sets']:>5}{tot['setsTagged']:>7}{tot['partsExact']:>7}"
          f"{tot['partsPerPart']:>7}{tot['partsSubtopic']:>7}{tot['residualSets']:>6}{tot['questionsTagged']:>7}")
    if args.dry_run:
        print("(dry run — nothing written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
