#!/usr/bin/env python3
"""run-012 live player probe runner (read-only).

For every paper page carrying a run-012 fixed part:
  - GET the live page (HTTP 200 expected)
  - presence probes (post-fix windows) must appear in the RSC payload
  - absence probes (pre-fix windows) must NOT appear
  - page-wide absence (leak signatures) where pinned
  - crop asset rawUrls HEAD-200
Also fetches the live /corpus static plane copy of the plane JSON and
compares sha256-16 against the repo tip (deployment-currency proof).
"""
import json, re, hashlib, subprocess, urllib.request, urllib.error

BASE = "https://syllabai-hub-v2.vercel.app"
LOCAL = "/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json"
PROBES = json.load(open("/home/z/my-project/scripts/run012_probes.json"))
UA = {"User-Agent": "Mozilla/5.0 (run012-spotcheck)"}

def get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")

def head(url, timeout=40):
    req = urllib.request.Request(url, headers=UA, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

def unesc(s):
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)

def main():
    probes = PROBES["probes"]
    pages = {}
    for pid, e in probes.items():
        if "paperKey" in e:
            pages.setdefault(e["paperKey"], []).append(pid)

    results = {}
    for key, pids in sorted(pages.items()):
        url = f"{BASE}/courses/igcse-maths-b-16/past-papers/{key}"
        entry = {"url": url, "pids": pids}
        try:
            st, body = get(url)
        except Exception as ex:
            entry["http"] = f"FAIL {ex}"
            results[key] = entry
            continue
        entry["http"] = st
        hay = unesc(body) + "\n" + body
        # page-wide absence
        for sig in PROBES.get("pageAbsence", {}).get(key, []):
            entry[f"pageAbsent[{sig[:24]!r}]"] = "OK" if sig not in hay else f"LEAK x{hay.count(sig)}"
        # pmatrix render count where relevant
        if key in ("june-2018-4mb1-01r", "june-2019-4mb1-02"):
            entry["pmatrixCount"] = hay.count("pmatrix")
        for pid in pids:
            pe = probes[pid]
            checks = {}
            for c in pe.get("changed", []):
                for w in c.get("presence", []):
                    checks[f"P:{w[:38]}"] = "OK" if w in hay else "MISSING"
                for w in c.get("absence", []):
                    checks[f"A:{w[:38]}"] = "OK" if w not in hay else "STALE-PRESENT"
            # crop asset urls on the page (attach proof)
            crops = [a for a in (pe.get("crops") or [])] if "crops" in pe else []
            entry[pid] = checks or {"note": pe.get("note", "no text probes (crop-only)")}
        results[key] = entry

    # live corpus plane sha16 vs tip
    local_sha = hashlib.sha256(open(LOCAL, "rb").read()).hexdigest()[:16]
    corpus = {"localSha16": local_sha}
    try:
        st, cbody = get(f"{BASE}/corpus/igcse-maths-b-16/official-papers.json")
        corpus["liveHttp"] = st
        corpus["liveSha16"] = hashlib.sha256(cbody.encode("utf-8")).hexdigest()[:16]
        corpus["verdict"] = "MATCH" if corpus["liveSha16"] == local_sha else "DIFFER"
    except Exception as ex:
        corpus["liveHttp"] = f"FAIL {ex}"

    # crop rawUrl HEAD checks (sample set from targets)
    crop_urls = []
    try:
        t = json.load(open("/home/z/my-project/scripts/run012_targets_out.json"))
        for tg in t["targets"]:
            for a in tg.get("crops", []):
                if a.get("rawUrl"):
                    crop_urls.append(a["rawUrl"])
    except Exception:
        pass
    crop_urls = list(dict.fromkeys(crop_urls))[:5]
    crop_head = {u.rsplit("/", 1)[-1]: head(u) for u in crop_urls}

    bad = []
    for key, e in results.items():
        for pid, checks in e.items():
            if isinstance(checks, dict):
                for ck, cv in checks.items():
                    if cv not in ("OK",) and not ck.startswith(("P:", "A:", "pageAbsent")):
                        continue
                    if cv != "OK" and cv != "MISSING" and cv != "STALE-PRESENT" and not str(cv).startswith("LEAK"):
                        continue
        # collect failures
        for pid, checks in e.items():
            if isinstance(checks, dict):
                for ck, cv in checks.items():
                    if ck.startswith(("P:",)) and cv != "OK":
                        bad.append(f"{key} {pid} {ck} -> {cv}")
                    if ck.startswith(("A:", "pageAbsent")) and cv != "OK":
                        bad.append(f"{key} {pid} {ck} -> {cv}")

    print(json.dumps({"pages": results, "corpusPlane": corpus, "cropHead": crop_head,
                      "FAILURES": bad}, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
