#!/usr/bin/env python3
"""
ADR-037 path-1 fix — the official-set ref-namespace wiring (trace
1a15fc4a3676c085, operator order "path 1 — fix").

THE DEFECT (run-003 of record): the official past-paper sets ALL carried
topicSlug "official-past-papers" with per-set restarting question orders, so
the shared ref law sme-eq-<courseSlug>-<topicSlug>-q<order> derived colliding
external refs across sets (12 collision bases at the 44-set era; the frozen
package-global seenRefs gate, bundle-questions.ts:316-319, refused the v0.7
bundle at BUILD — fail-closed, zero DB statements).

THE FIX (content-lane wiring, zero code): each official set's topicSlug
becomes the set's OWN canonical slug (official-4ch1-1c-2019-06, ...) — an
identity that already exists in the bundle, unique by construction. The
frozen smeQuestionRef law is untouched; refs recompute deterministically
per paper. Topic-plane sets (the live 602 refs' ground) are not touched.

Surgical edit law:
  - locate the 32 `"slug": "official-4ch1-..."` occurrences;
  - pair each with the FIRST following `"topicSlug": "official-past-papers"`
    (structural guard: strictly interleaved 1:1, topicSlug between this
    slug and the next);
  - substitute topicSlug := set slug at exactly those 32 spots;
  - verify the JSON round-trip is identical EXCEPT those 32 topicSlug
    fields, then write back.

Read-modify-write over apps/hub/content/igcse-chemistry-19/questions.json.
"""

import json
import sys

BUNDLE = "apps/hub/content/igcse-chemistry-19/questions.json"
OLD_SLUG = '"topicSlug": "official-past-papers"'
SLUG_KEY = '"slug": "official-4ch1-'


def fail(msg: str) -> None:
    print("FIX REFUSED: " + msg)
    sys.exit(1)


def main() -> int:
    raw = open(BUNDLE, "r", encoding="utf-8").read()
    before = json.loads(raw)

    official_slugs = [s["slug"] for s in before if s.get("topicSlug") == "official-past-papers"]
    if len(official_slugs) != 32:
        fail(f"expected 32 official sets, found {len(official_slugs)}")

    # positions of the set slugs and of the old topicSlug values
    slug_pos = []
    at = 0
    while True:
        i = raw.find(SLUG_KEY, at)
        if i == -1:
            break
        slug_pos.append(i)
        at = i + 1
    topic_pos = []
    at = 0
    while True:
        i = raw.find(OLD_SLUG, at)
        if i == -1:
            break
        topic_pos.append(i)
        at = i + 1
    if len(slug_pos) != 32 or len(topic_pos) != 32:
        fail(f"position census mismatch: slugs={len(slug_pos)} topicSlugs={len(topic_pos)}")

    # structural pairing guard: strictly interleaved (slug_i < topic_i < slug_{i+1})
    bounds = slug_pos + [len(raw)]
    pairs = []
    for i, tp in enumerate(topic_pos):
        if not (slug_pos[i] < tp < bounds[i + 1]):
            fail(f"pairing guard failed at index {i}")
        end = raw.index('"', tp + len('"topicSlug": "'))
        pairs.append((tp, end, official_slugs[i]))
    for i in range(31):
        if not (pairs[i][0] < pairs[i + 1][0]):
            fail("pairing not monotonic")

    # substitute back-to-front so positions stay valid; end = the closing
    # quote of the old value — the replacement spans THROUGH it (inclusive)
    out = raw
    for tp, end, slug in reversed(pairs):
        out = out[:tp] + f'"topicSlug": "{slug}"' + out[end + 1 :]

    after = json.loads(out)
    if len(after) != len(before):
        fail("set count changed")

    # verify: identical except exactly the 32 topicSlug fields
    changed = 0
    for b, a in zip(before, after):
        if b == a:
            continue
        if set(b.keys()) != set(a.keys()):
            fail("key sets diverged on a set")
        diffs = [k for k in b if b[k] != a[k]]
        if diffs != ["topicSlug"]:
            fail(f"unexpected field diffs: {diffs} on set {b.get('slug')}")
        if a["topicSlug"] != a["slug"]:
            fail(f"topicSlug != slug on {a['slug']}")
        changed += 1
    if changed != 32:
        fail(f"expected 32 changed sets, got {changed}")

    # uniqueness + sectionSlug untouched
    new_slugs = [s["topicSlug"] for s in after if s["slug"].startswith("official-4ch1-")]
    if len(set(new_slugs)) != 32:
        fail("official topicSlugs not unique after fix")
    for b, a in zip(before, after):
        if b.get("sectionSlug") != a.get("sectionSlug") or b.get("section") != a.get("section"):
            fail(f"section fields drifted on {a['slug']}")
    for s in after:
        if s["topicSlug"] != "official-past-papers":
            continue
        if not s["slug"].startswith("official-4ch1-"):
            fail(f"topic set unexpectedly rewired: {s['slug']}")

    open(BUNDLE, "w", encoding="utf-8").write(out)
    print(f"OK: 32 official sets rewired topicSlug := set.slug; {changed} set objects changed; JSON else-identical")
    return 0


if __name__ == "__main__":
    sys.exit(main())
