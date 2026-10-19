#!/usr/bin/env python3
"""Phase 2 step 1: materialize 44 CIE sme-native content bundles (staging).

Mirror of the hub's import_corpus/build_bundles.py, CIE-adapted, pinned-sha:
  - board/level/subject/code/syllabusVersion read from the COMMITTED Phase-1
    spines (of record) — manifest.curriculum == spine.curriculum verbatim
  - notes from RN .md renders (frontmatter), bodyMd hotlinks pinned raw URLs
  - questions from EQ topic.json incl. contract-shaped choices (CIE captures
    MCQ options upstream — carried verbatim, never inferred)
  - flashcards from FC deck.json (front_md/back_md, spec_links)
  - sme-native tree = proven build_sme_native_tree logic over topics_raw +
    note paths + spec_point_index
Deterministic; writes work/cie-content/<slug>/*.json (NOT hub content/).
"""
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

CACHE = os.environ.get("CIE_CACHE", "/home/z/my-project/work/cie-corpus-cache")
PIN = json.load(open(os.path.join(CACHE, "_pin.json")))["pin"]
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
HUB = os.environ.get("CIE_HUB", os.path.join(REPO, "apps", "hub"))
STAGING = os.environ.get("CIE_STAGING", "/home/z/my-project/work/cie-content")
MANIFEST = os.environ.get("CIE_PHASE0_MANIFEST", os.path.join(REPO, ".syllabai", "receipts", "CIE-INTEGRATION", "cie-phase0-roster-manifest-r0.json"))

IMG_RE_MD = re.compile(r"(!\[[^\]]*\]\()((?:\.\./)+assets/[^)]+|assets/[^)]+)(\))")
IMG_RE_HTML = re.compile(r'(<img[^>]*\bsrc=")((?:\.\./)+assets/[^"]+|assets/[^"]+)(")')
UPSTREAM_SCHEMAS = [
    "syllabai.sme-revision-note/1.0",
    "syllabai.sme-revision-notes-course/1.0",
    "syllabai.sme-exam-questions/1.1",
    "syllabai.sme-spec-point-index/1.0",
    "syllabai.sme-flashcard-deck/1.0",
]
LICENSE = "Operator-authorized SME corpus — see LICENSE-DATA.md in syllabai-resources (Amendment 2026-09-17). Demo re-use only."


def cache_read(rel):
    with open(os.path.join(CACHE, rel), encoding="utf8") as f:
        return f.read()


def cache_json(rel):
    return json.loads(cache_read(rel))


def slug_num(slug):
    m = re.match(r"(\d+)", slug)
    return int(m.group(1)) if m else 9999


def hotlink(course, corpus, section, topic, text):
    if not text:
        return text
    base = f"https://raw.githubusercontent.com/SyllabAI/syllabai-resources/{PIN}/{corpus}/{course}"
    if section:
        base += f"/{section}"
    if topic:
        base += f"/{topic}"

    def repl(m):
        fname = m.group(2).split("/")[-1]
        return f"{m.group(1)}{base}/assets/{fname}{m.group(3)}"

    return IMG_RE_HTML.sub(repl, IMG_RE_MD.sub(repl, text))


def parse_note_md(text):
    if text.startswith("---"):
        try:
            end = text.index("\n---\n", 3)
        except ValueError:
            return {}, text
        fm_raw, body = text[3:end], text[end + 5:]
        fm = {}
        for line in fm_raw.splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                fm[k.strip()] = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
            else:
                fm[k.strip()] = v.strip('"')
        return fm, body
    return {}, text


def build_sme_native_tree(slug, topics_raw, note_files, sp_index, subject_title):
    nodes = [OrderedDict(code=slug, family="SUBJECT", title=subject_title or slug,
                         description=None, parents=[], provenanceTier="RULE_DERIVED", order=0)]
    section_names, topic_names, topic_section = OrderedDict(), OrderedDict(), OrderedDict()
    for t in topics_raw:
        sec, top = t.get("section", {}), t.get("topic", {})
        if sec.get("slug"):
            section_names.setdefault(sec["slug"], sec.get("name") or sec["slug"])
        if top.get("slug"):
            topic_names.setdefault(top["slug"], top.get("name") or top["slug"])
            topic_section[top["slug"]] = sec.get("slug")
    leaf_to_topic = {}
    for path in note_files:
        segs = path.split("/")  # notes/<section>/<topic>/<leaf>.md
        if len(segs) >= 5 and segs[1] == "notes":
            def human(sl):
                return " ".join(w[:1].upper() + w[1:] if w else w for w in sl.split("-"))
            section_names.setdefault(segs[2], human(segs[2]))
            topic_names.setdefault(segs[3], human(segs[3]))
            topic_section.setdefault(segs[3], segs[2])
            leaf_to_topic[segs[4][:-3]] = segs[3]
    for sp_id, entry in sp_index.items():
        for leaf in entry.get("subtopic_slugs", []):
            if leaf not in leaf_to_topic:
                leaf_to_topic.setdefault(leaf, leaf)
    for i, sec_slug in enumerate(sorted(section_names, key=slug_num)):
        num = slug_num(sec_slug)
        nodes.append(OrderedDict(code=sec_slug, family="TOPIC", title=section_names[sec_slug],
                                 description=None, parents=[slug], provenanceTier="RULE_DERIVED",
                                 order=num if num < 999 else 900 + i))
    for i, top_slug in enumerate(sorted(topic_names, key=slug_num)):
        parent = topic_section.get(top_slug)
        if parent not in section_names:
            parent = min(section_names, key=slug_num) if section_names else slug
        num = slug_num(top_slug)
        nodes.append(OrderedDict(code=top_slug, family="SUBTOPIC", title=topic_names[top_slug],
                                 description=None, parents=[parent], provenanceTier="RULE_DERIVED",
                                 order=num if num < 999 else 900 + i))
    for order, (sp_id, entry) in enumerate(sp_index.items()):
        target = None
        for leaf in entry.get("subtopic_slugs") or []:
            t = leaf_to_topic.get(leaf)
            if t in topic_names:
                target = t
                break
        if target is None and entry.get("notes"):
            for nid in entry["notes"]:
                for path in note_files:
                    segs = path.split("/")
                    if len(segs) >= 5 and segs[1] == "notes" and segs[3] in topic_names:
                        target = segs[3] if target is None else target
                break
        if target is None:
            target = next(iter(topic_names), slug)
        nodes.append(OrderedDict(code=sp_id, family="SPEC_POINT", title=entry.get("name") or sp_id,
                                 description=entry.get("definition") or None, parents=[target],
                                 provenanceTier="RULE_DERIVED", order=order))
    return OrderedDict(board="Cambridge CIE", level="", subject=subject_title or "", code=slug,
                       syllabusVersion="", nodes=nodes, edges=[])


def main():
    rows = {r["slug"]: r for r in json.load(open(MANIFEST))["deliverable1_bankSpecJoin"]["matrix"]}
    slugs = sorted(rows)
    os.makedirs(STAGING, exist_ok=True)
    report = []
    totals = defaultdict(int)

    for slug in slugs:
        spine = json.load(open(os.path.join(HUB, "spines", f"{slug}.json")))
        cur = spine["curriculum"]
        row = rows[slug]

        sp_index_path = f"SME-ExamQuestion/{slug}/spec_point_index.json"
        if os.path.exists(os.path.join(CACHE, sp_index_path)):
            idx = cache_json(sp_index_path)
            sp_index = dict(idx.get("spec_points", {}))
            resolved = (idx.get("cross_lane_join") or {}).get("resolved") or {}
            for sid, e in resolved.items():
                if sid not in sp_index or sp_index[sid].get("definition") in (None, "nan"):
                    sp_index[sid] = {k: v for k, v in e.items() if k not in ("grade", "via_lanes")}
        else:
            idx, sp_index = None, {}

        topics_raw, topic_files = [], []
        eq_dir = os.path.join(CACHE, "SME-ExamQuestion", slug)
        if os.path.isdir(eq_dir):
            for root, _d, files in os.walk(eq_dir):
                for fn in files:
                    if fn == "topic.json":
                        topic_files.append(os.path.join(root, fn))
            topic_files.sort()
            topics_raw = [cache_json(os.path.relpath(p, CACHE)) for p in topic_files]

        rn_dir = os.path.join(CACHE, "SME-RevisionNotes", slug)
        note_files = []
        if os.path.isdir(rn_dir):
            for root, _d, files in os.walk(rn_dir):
                for fn in files:
                    if fn.endswith(".md"):
                        note_files.append(os.path.relpath(os.path.join(root, fn), rn_dir).replace(os.sep, "/"))
            note_files.sort()

        decks = []
        fc_dir = os.path.join(CACHE, "SME-Flashcards", slug)
        if os.path.isdir(fc_dir):
            for root, _d, files in os.walk(fc_dir):
                for fn in files:
                    if fn == "deck.json":
                        decks.append(cache_json(os.path.relpath(os.path.join(root, fn), CACHE)))
            decks.sort(key=lambda d: (d.get("deck", {}).get("section_slug", ""), d.get("deck", {}).get("order", 0)))

        curriculum = build_sme_native_tree(slug, topics_raw, note_files, sp_index, cur["subject"])
        node_codes = {n["code"] for n in curriculum["nodes"]}

        # ---- notes ----------------------------------------------------------
        notes = []
        for rel in note_files:
            segs = rel.split("/")
            fm, body = parse_note_md(cache_read(f"SME-RevisionNotes/{slug}/{rel}"))
            body = hotlink(slug, "SME-RevisionNotes", None, None, body)
            notes.append(OrderedDict(
                noteId=fm.get("note_id") or rel,
                title=fm.get("title") or segs[-1][:-3],
                sourceUrl=fm.get("source") or None,
                specPointIds=list(fm.get("spec_point_ids") or []),
                specPointCodes=[],
                guidedStudy=str(fm.get("guided_study", "false")).lower() == "true",
                path="/".join(segs[1:]),
                sectionSlug=segs[1], topicSlug=segs[2],
                updatedAt=fm.get("updated_at") or None,
                bodyMd=body,
            ))
        notes.sort(key=lambda n: (slug_num(n["sectionSlug"]), slug_num(n["topicSlug"]), n["path"]))

        # ---- questions --------------------------------------------------------
        question_rows = []
        part_total = 0
        for t in topics_raw:
            sec, top = t.get("section", {}), t.get("topic", {})
            subtopics_meta = t.get("subtopics", []) or []
            related = [s.get("revision_note_id") for s in subtopics_meta if s.get("revision_note_id")]
            by_set = defaultdict(list)
            for q in t.get("questions", []):
                by_set[q.get("set_slug")].append(q)
            for set_meta in t.get("question_sets", []):
                ss = set_meta["slug"]
                qs = sorted(by_set.get(ss, []), key=lambda q: q.get("order", 0))
                set_kind = ("Multiple-Choice Questions" if "multiple-choice" in ss
                            else "Structured Questions" if "structured" in ss else None)
                out_q = []
                for q in qs:
                    parts = []
                    for p in q.get("parts", []):
                        part_total += 1
                        sp = p.get("source_paper") or {}
                        choices = None
                        if p.get("choices"):
                            choices = [OrderedDict(label=c.get("label"),
                                                   isCorrect=bool(c.get("is_correct")),
                                                   textMd=c.get("text_md") or "")
                                       for c in p["choices"]]
                        parts.append(OrderedDict(
                            id=p["id"], order=p.get("order", 0),
                            questionType=p.get("question_type"), marks=p.get("marks", 0),
                            commandWord=p.get("command_word"),
                            specPointIds=list(p.get("spec_point_ids") or []),
                            specPointCodes=[],
                            choices=choices,
                            sourcePaper=OrderedDict(date=sp.get("date"), number=sp.get("number"),
                                                    questionNumber=sp.get("question_number"),
                                                    questionPart=sp.get("question_part")) if sp else None,
                            problemMd=hotlink(slug, "SME-ExamQuestion", sec.get("slug"), top.get("slug"),
                                              p.get("problem_md") or ""),
                            solutionMd=hotlink(slug, "SME-ExamQuestion", sec.get("slug"), top.get("slug"),
                                               p.get("solution_md")) or None,
                        ))
                    if not parts:
                        continue
                    out_q.append(OrderedDict(id=q["id"], order=q.get("order", 0),
                                             difficulty=q.get("difficulty"), style=q.get("style"),
                                             totalMarks=q.get("total_marks", 0), parts=parts))
                if not out_q:
                    continue
                question_rows.append(OrderedDict(
                    topicId=f"{top.get('id')}--{set_meta['id']}",
                    slug=f"{top.get('slug')}--{ss}",
                    name=top.get("name") or top.get("slug"),
                    setName=set_kind, topicSlug=top.get("slug"),
                    section=sec.get("name") or "", sectionSlug=sec.get("slug") or "",
                    curriculum=OrderedDict(board=cur["board"], level=cur["level"],
                                           subject=cur["subject"], code=cur["code"],
                                           syllabusVersion=str((t.get("curriculum") or {}).get("syllabus_version", "") or cur["syllabusVersion"])),
                    source=OrderedDict(provider=(t.get("source") or {}).get("provider", "Save My Exams"),
                                       license=(t.get("source") or {}).get("license", ""),
                                       pageUrl=(t.get("source") or {}).get("page_url")),
                    schema=t.get("schema"), relatedNoteIds=related, questions=out_q))
        question_rows.sort(key=lambda r: (slug_num(r["sectionSlug"]), slug_num(r["topicSlug"] or ""),
                                          0 if "multiple-choice" in r["slug"] else 1))

        # ---- flashcards -------------------------------------------------------
        cards = []
        for deck in decks:
            dmeta = deck.get("deck", {})
            for c in deck.get("cards", []):
                cards.append(OrderedDict(
                    id=c["id"], cardType=c.get("card_type"),
                    front=hotlink(slug, "SME-Flashcards", dmeta.get("section_slug"), dmeta.get("topic_slug"),
                                  c.get("front_md") or ""),
                    back=hotlink(slug, "SME-Flashcards", dmeta.get("section_slug"), dmeta.get("topic_slug"),
                                 c.get("back_md") or ""),
                    specPointCode=None,
                    specPointIds=list(c.get("spec_links") or []),
                    sourceNoteId=None, sourceTitle=None,
                    deckSlug=dmeta.get("topic_slug"), sectionSlug=dmeta.get("section_slug"),
                    topicSlug=dmeta.get("topic_slug"),
                    subtopicCode=dmeta.get("topic_slug") if dmeta.get("topic_slug") in node_codes else None,
                    provenanceTier="RULE_DERIVED",
                ))
        cards.sort(key=lambda c: (slug_num(c["sectionSlug"] or ""), slug_num(c["topicSlug"] or "")))

        # ---- honest empty overlays -------------------------------------------
        concept_graph = OrderedDict(curriculumCode=slug, edgeVocabulary=None, counts=None,
                                    validationGate=None, nodes=[], edges=[])
        learner = OrderedDict(learnerId=f"sim-{slug}", displayName="Demo learner (simulated)",
                              disclaimer="No simulated learner overlay is seeded for this course yet.",
                              skillStates=[], misconceptionStates=[])

        spec_points = [n for n in curriculum["nodes"] if n["family"] == "SPEC_POINT"]
        manifest = OrderedDict(
            schema="syllabai-demo.content-bundle/2.0",
            generatedUtc=None,
            importSource=OrderedDict(repo="SyllabAI/syllabai-resources", ref=f"main@{PIN}",
                                     upstreamSchemas=UPSTREAM_SCHEMAS),
            curriculum=OrderedDict(board=cur["board"], level=cur["level"], subject=cur["subject"],
                                   code=cur["code"], syllabusVersion=cur["syllabusVersion"]),
            license=LICENSE,
            counts=OrderedDict(
                sections=len({n["code"] for n in curriculum["nodes"] if n["family"] == "TOPIC"}),
                topics=len({n["code"] for n in curriculum["nodes"] if n["family"] == "SUBTOPIC"}),
                specPoints=len(spec_points),
                notes=len(notes),
                questionSets=len(question_rows),
                questions=sum(len(r["questions"]) for r in question_rows),
                parts=part_total,
                marks=sum(p["marks"] for r in question_rows for q in r["questions"] for p in q["parts"]),
                flashcards=len(cards),
            ),
            treeKind="sme-native",
        )

        out = os.path.join(STAGING, slug)
        os.makedirs(out, exist_ok=True)

        def write(name, obj):
            with open(os.path.join(out, name), "w", encoding="utf8") as f:
                json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

        write("manifest.json", manifest)
        write("curriculum.json", curriculum)
        write("notes.json", notes)
        write("questions.json", question_rows)
        write("flashcards.json", cards)
        write("concept-graph.json", concept_graph)
        write("learner-sim.json", learner)

        # ---- audit row --------------------------------------------------------
        rn_meta = (cache_json(f"SME-RevisionNotes/{slug}/manifest.json").get("counts") or {}) if os.path.exists(os.path.join(CACHE, f"SME-RevisionNotes/{slug}/manifest.json")) else {}
        notes_with_specs = sum(1 for n in notes if n["specPointIds"])
        notes_placed = sum(1 for n in notes if n["topicSlug"] in node_codes or any(c in node_codes for c in n["specPointIds"]))
        parts_with = sum(1 for r in question_rows for q in r["questions"] for p in q["parts"] if p["specPointIds"])
        parts_resolved = sum(1 for r in question_rows for q in r["questions"] for p in q["parts"]
                             if p["specPointIds"] and any(i in node_codes for i in p["specPointIds"]))
        cards_linked = sum(1 for c in cards if c["specPointIds"])
        audit = OrderedDict(
            slug=slug, spineCode=cur["code"], level=cur["level"], subject=cur["subject"],
            treeSections=manifest["counts"]["sections"], treeTopics=manifest["counts"]["topics"],
            indexPoints=len(sp_index), crossLaneResolved=len((idx or {}).get("cross_lane_join", {}).get("resolved", {}) if idx else {}),
            rnPagesScraped=rn_meta.get("pages_scraped"), rnLinksDeclared=rn_meta.get("spec_point_links"),
            notes=len(notes), notesWithSpecAnchors=notes_with_specs, notesPlacedInTree=notes_placed,
            questionSets=len(question_rows), questions=manifest["counts"]["questions"], parts=part_total,
            partsWithSpecAnchors=parts_with, partsResolvedInTree=parts_resolved,
            flashcardDecks=len(decks), flashcards=len(cards), cardsWithSpecLinks=cards_linked,
            joinMatrixExpect=dict(questions=row["questions"], parts=row["parts"], notesPages=row["notesPages"],
                                  notesLinks=row["notesLinks"], deckDecks=row["deckDecks"], deckCards=row["deckCards"]),
        )
        report.append(audit)
        m = manifest["counts"]
        flag = ""
        if row["parts"] != m["parts"] or row["notesPages"] and row["notesPages"] != m["notes"] or row["deckCards"] != m["flashcards"]:
            flag = "  <-- JOIN-DIFF"
        print(f"{slug}: notes={m['notes']}/exp{row['notesPages']} q={m['questions']}/exp{row['questions']} "
              f"parts={m['parts']}/exp{row['parts']} cards={m['flashcards']}/exp{row['deckCards']} "
              f"idx={len(sp_index)} links={rn_meta.get('spec_point_links')}{flag}", flush=True)
        totals["notes"] += m["notes"]; totals["questions"] += m["questions"]; totals["parts"] += m["parts"]
        totals["cards"] += m["flashcards"]; totals["specPoints"] += m["specPoints"]

    json.dump(report, open(os.path.join(STAGING, "_build_report.json"), "w"), indent=1)
    print("TOTALS:", json.dumps(totals), flush=True)


if __name__ == "__main__":
    main()
