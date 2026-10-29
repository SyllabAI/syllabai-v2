#!/usr/bin/env python3
"""T-OEQ-MATHSB-SERVE-1 run-015: F5 fleet strip wave — SAMPLED PAGE-EVIDENCE VALIDATION.

Tier law (playbook §7 law 2 / §8 law 16): whole-line boilerplate signatures are
unambiguous, but run-012's overreach lesson requires a sampled page-evidence
validation PER PAPER before bulk apply.

Scope of this run: HEADER (1138) + TOTAL (1018) hits = 2156 whole-line furniture
lines over 615 parts. SPARE-GRID-INSTR (53 hits) is DEFERRED to run-016 eyes-on:
the instruction is fused inside flattened single-line problemMd blocks that also
carry genuine question text + printed formula boxes (whole-line strip unsafe).

Sampler: per paper, deterministically select sample parts (prefer a part holding
BOTH a HEADER and a TOTAL hit; +1 part carrying a 'cas Total' variant if present;
+1 mid-list part for papers with >= 30 hits). Page-find via the run-012 recipe
(distinctive-token + qnum scoring over the MS text layer, furniture-line presence
bonus), render top-1 page at 150dpi (top-2 when the furniture line is not found
in the top-1 text layer). The agent READs the PNGs and writes verdicts.
"""
import json, os, re, sys, ssl, urllib.request
import fitz

REPO = "/home/z/my-project/repos/syllabai-v2"
PLANE = f"{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json"
WL = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-014/f5-fleet-worklist.json"
OUT = "/home/z/my-project/download/t-oeq-mathsb/run015"
PDFS = f"{OUT}/pdfs"
EVID = f"{OUT}/evidence"
MANIFEST = f"{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-015/sample_manifest.json"
MIRROR = ("https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/"
          "past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers")

os.makedirs(PDFS, exist_ok=True)
os.makedirs(EVID, exist_ok=True)


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        return dest
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "syllabai-run015"})
    with urllib.request.urlopen(req, timeout=90, context=ctx) as r, open(dest, "wb") as fh:
        fh.write(r.read())
    return dest


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def qnum_of(pid):
    m = re.match(r"offp_[\d-]+_[\dr]+_(\d+)", pid)
    return int(m.group(1)) if m else None


def tokens_of(text):
    words = [w for w in re.findall(r"[a-zA-Z]{4,}", (text or "").lower())]
    stop = {"marks", "total", "question", "working", "answer", "notes", "award", "allow", "correct", "their", "value"}
    words = [w for w in words if w not in stop]
    nums = re.findall(r"\d+\.\d+|\d{3,}", text or "")
    toks = sorted(set(words), key=len, reverse=True)[:7] + list(dict.fromkeys(nums))[:4]
    return toks


def main():
    wl = json.load(open(WL))
    hits = [h for h in wl["worklist"] if h["kind"] in ("HEADER", "TOTAL")]
    plane = json.load(open(PLANE))
    byid = {p["id"]: p for paper in plane for q in paper["questions"] for p in q["parts"]}

    # paper -> hits ; paper slug from pid: offp_{series}_{paper}_{q}-{part}
    papers = {}
    for h in hits:
        parts = h["pid"].split("_")
        series, paper = parts[1], parts[2]
        papers.setdefault((series, paper), []).append(h)
    print(f"strip-scope hits: {len(hits)} over {len({h['pid'] for h in hits})} parts / {len(papers)} papers")

    manifest = {}
    for (series, paper), ph in sorted(papers.items()):
        tag = f"{series}_{paper}"
        pdf = f"{PDFS}/{tag}_ms.pdf"
        try:
            fetch(f"{MIRROR}/{series}/4MB1-{paper.upper()}/ms.pdf", pdf)
        except Exception as e:
            manifest[tag] = {"error": f"fetch: {e}"}
            print(f"{tag}: FETCH FAIL {e}")
            continue
        doc = fitz.open(pdf)
        ptext = [norm(doc[i].get_text()) for i in range(doc.page_count)]

        # ---- deterministic sample selection
        by_pid = {}
        for h in ph:
            by_pid.setdefault(h["pid"], []).append(h)
        pids = sorted(by_pid)
        head_pids = [p for p in pids if any(x["kind"] == "HEADER" for x in by_pid[p])]
        tot_pids = [p for p in pids if any(x["kind"] == "TOTAL" for x in by_pid[p])]
        cas_pids = [p for p in pids if any(x["kind"] == "TOTAL" and x["text"].lower().startswith("cas") for x in by_pid[p])]

        chosen = []
        both = [p for p in pids if p in set(head_pids) & set(tot_pids)]
        if both:
            chosen.append(both[0])
        else:
            if head_pids:
                chosen.append(head_pids[0])
            if tot_pids and (not chosen or chosen[0] not in tot_pids):
                chosen.append(tot_pids[0])
        if cas_pids and not any(any(x["text"].lower().startswith("cas") for x in by_pid[p]) for p in chosen):
            chosen.append(cas_pids[0])
        if len(ph) >= 30:
            mid = pids[len(pids) // 2]
            if mid not in chosen:
                chosen.append(mid)
        chosen = chosen[:4]

        samples = []
        for pid in chosen:
            part = byid[pid]
            sol = part.get("solutionMd") or ""
            hh = [x for x in by_pid[pid] if x["kind"] == "HEADER"]
            tt = [x for x in by_pid[pid] if x["kind"] == "TOTAL"]
            hit0 = (hh or tt)[0]
            toks = tokens_of(sol)
            qn = qnum_of(pid)
            scored = []
            for i, pt in enumerate(ptext):
                s = sum(2 for t in toks if t in pt)
                if qn and re.search(rf"\b0?{qn}\b", pt):
                    s += 1
                furn_bonus = sum(1 for x in {h2["text"] for h2 in by_pid[pid]} if norm(x) in pt)
                scored.append((s + furn_bonus, i))
            scored.sort(reverse=True)
            top = [i for s, i in scored[:2] if s > 0][:2]
            if not top:
                top = [i for s, i in scored[:1]]
            furn_in_top = [norm(x["text"]) in ptext[top[0]] for x in by_pid[pid] if x["pid"] == pid]
            pages_to_render = top[:1] if all(furn_in_top) and top else top
            pngs = []
            for pi in pages_to_render:
                png = f"{EVID}/pg_{tag}_{pid.split('_', 3)[-1]}-p{pi + 1:02}.png"
                if not os.path.exists(png):
                    os.system(f'pdftoppm -f {pi + 1} -l {pi + 1} -r 150 -png "{pdf}" "{png[:-4]}" >/dev/null 2>&1')
                    # pdftoppm appends -N; normalize name
                    cand = f"{png[:-4]}-{pi + 1:02}.png" if os.path.exists(f"{png[:-4]}-{pi + 1:02}.png") else f"{png[:-4]}-{pi + 1}.png"
                    if os.path.exists(cand):
                        os.replace(cand, png)
                    elif not os.path.exists(png):
                        png = None
                if png and os.path.exists(png):
                    pngs.append(os.path.basename(png))
            samples.append({
                "pid": pid, "qnum": qn,
                "hits": by_pid[pid],
                "pages": [p + 1 for p in pages_to_render],
                "furniture_in_page_text": {x["text"]: bool(norm(x["text"]) in ptext[pages_to_render[0]]) for x in by_pid[pid]} if pages_to_render else {},
                "pngs": pngs,
            })
        manifest[tag] = {"pdf": os.path.basename(pdf), "hits_paper": len(ph), "parts_paper": len(by_pid), "samples": samples}
        n_png = sum(len(s["pngs"]) for s in samples)
        print(f"{tag}: {len(ph)} hits / {len(by_pid)} parts -> {len(samples)} sample parts, {n_png} pngs")
        doc.close()

    json.dump(manifest, open(MANIFEST, "w"), indent=1)
    tot_png = sum(len(s["pngs"]) for m in manifest.values() for s in m.get("samples", []))
    err = [k for k, m in manifest.items() if "error" in m]
    print(f"\nMANIFEST: {len(manifest)} papers, {tot_png} pngs total, {len(err)} fetch errors {err}")
    print(f"-> READ the pngs under {EVID} and record verdicts in sample_verdicts.json")


if __name__ == "__main__":
    main()
