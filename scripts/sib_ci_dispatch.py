#!/usr/bin/env python3
"""
T-SIB-INGEST-001 GitHub-Actions dispatch driver (run-005).

Puts Gates A (corpus apply, t-sib-ingest-001-apply) and B (embeddings
backfill, t-sib-embed-backfill) behind the house dispatch protocol — the
ADR-037 pattern: stage per-run secrets as repo Actions secrets (libsodium
sealed box), workflow_dispatch on the branch of record, poll, pull the
receipt artifacts, then hygiene-DELETE the secrets (404-verified).

Inline-only credential law:
  GH_PAT                 — env only (Actions: admin on SyllabAI/syllabai-v2)
  SIB_PROD_DATABASE_URL  — env only (the production Neon DSN, per-run staged)
  SIB_GEMINI_KEY         — env only, OR resolved from the operator keyring
                           (workspace/sib-keys/gemini.env, LABEL -> KEY_nn)
Values are never printed, never persisted, never embedded in URLs or
receipts. Fingerprints (sha256[:16]) only.

Subcommands:
  probe                          — auth sanity: secret/vars NAMES, workflow list
  var VALUE <NAME>               — print a repo Actions VARIABLE value
                                   (variables are unencrypted by design)
  stage-apply [--probe-word W] [--mode M] [--note N]
                                 — stage SIB_PROD_DATABASE_URL + dispatch Gate A
  stage-backfill [--mode M] [--note N]
                                 — stage SIB_PROD_DATABASE_URL + SIB_GEMINI_KEY
                                   + dispatch Gate B (mode: cow+prod|prod-only)
  status --gate a|b              — latest run of that gate
  poll --gate a|b [--hygiene]    — on completion: pull logs + receipt artifacts
                                   into .syllabai/receipts/T-SIB-INGEST-001/
                                   run-005-github/<gate>/, scrub-check the log,
                                   optional secret hygiene (404-verified)
  hygiene --gate a|b|both        — delete per-run secrets only
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import zipfile
from io import BytesIO

import requests
from nacl import encoding, public

REPO = "SyllabAI/syllabai-v2"
REF = "sib/ingest-4ch1-r0"
API = f"https://api.github.com/repos/{REPO}"
GATES = {
    "a": {"wf": "t-sib-ingest-001-apply.yml",
          "secrets": ["SIB_PROD_DATABASE_URL"],
          "dir": "apply"},
    "b": {"wf": "t-sib-embed-backfill.yml",
          "secrets": ["SIB_GEMINI_KEY", "SIB_PROD_DATABASE_URL"],
          "dir": "backfill"},
}
KEYRING = "/home/z/my-project/workspace/sib-keys/gemini.env"
STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", ".syllabai", "receipts", "T-SIB-INGEST-001",
                     "run-005-github", "dispatch-state.json")
SCRUB_TOKENS = ("npg_", "ghp_", "github_pat_", "postgresql://", "napi_")


def pat() -> str:
    v = os.environ.get("GH_PAT", "")
    if not v:
        print("GH_PAT missing (inline env only)")
        sys.exit(2)
    return v


def hdr(tok: str) -> dict:
    return {
        "Authorization": f"Bearer {tok}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def fp(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()[:16]


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(hdr(pat()))
    return s


def stage_secret(s: requests.Session, name: str, value: str) -> bool:
    r = s.get(f"{API}/actions/secrets/public-key", timeout=30)
    if r.status_code != 200:
        print(f"public-key FAILED: {r.status_code} (need admin on the repo) — fail-closed")
        return False
    j = r.json()
    pk = public.PublicKey(j["key"].encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(value.encode())
    r = s.put(f"{API}/actions/secrets/{name}", json={
        "encrypted_value": base64.b64encode(sealed).decode(),
        "key_id": j["key_id"],
    }, timeout=30)
    if r.status_code not in (201, 204):
        print(f"secret PUT FAILED ({name}): {r.status_code} — fail-closed")
        return False
    print(f"secret staged: {name} (fp16 {fp(value)}, never printed)")
    return True


def gemini_key():
    v = os.environ.get("SIB_GEMINI_KEY", "")
    if v:
        return v, "env"
    if not os.path.exists(KEYRING):
        print("SIB_GEMINI_KEY: no env value and keyring file absent (sandbox recycled) — abort")
        sys.exit(2)
    label, keys = None, {}
    with open(KEYRING, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, val = line.partition("=")
            if k == "SYLLABAI_EMBEDDING_GEMINI_API_KEY_LABEL":
                label = val.strip().strip('"')
            elif k.startswith("KEY_"):
                keys[k[4:]] = val.strip()
    if label and label in keys:
        return keys[label], f"keyring:KEY_{label}"
    print("SIB_GEMINI_KEY: no env value and keyring LABEL unresolved — abort")
    sys.exit(2)


def note_state(gate: str, payload: dict) -> None:
    path = os.path.abspath(STATE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    state = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            state = json.load(fh)
    state.setdefault(gate, {}).update(payload)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=1)


def cmd_probe() -> int:
    s = session()
    r = s.get(f"{API}/actions/secrets?per_page=100", timeout=30)
    if r.status_code != 200:
        print(f"secrets list FAILED: {r.status_code} — PAT lacks repo admin? fail-closed")
        return 3
    names = sorted(x["name"] for x in r.json().get("secrets", []))
    print("repo secrets (names only):", ", ".join(names))
    r = s.get(f"{API}/actions/variables?per_page=100", timeout=30)
    vnames = sorted(x["name"] for x in r.json().get("variables", [])) if r.status_code == 200 else []
    print("repo vars (names only):", ", ".join(vnames))
    for g, cfg in GATES.items():
        r = s.get(f"{API}/actions/workflows/{cfg['wf']}", timeout=30)
        staged = [n for n in cfg["secrets"] if n in names]
        print(f"gate {g}: {cfg['wf']} state={r.json().get('state') if r.status_code==200 else r.status_code}"
              f" | per-run secrets currently staged: {staged or '(none)'}")
    return 0


def cmd_var(name: str) -> int:
    r = session().get(f"{API}/actions/variables/{name}", timeout=30)
    if r.status_code != 200:
        print(f"variable GET FAILED: {r.status_code}")
        return 3
    print(r.json().get("value", ""))
    return 0


def dispatch(gate: str, inputs: dict) -> int:
    s = session()
    if "SIB_PROD_DATABASE_URL" in GATES[gate]["secrets"]:
        uri = os.environ.get("SIB_PROD_DATABASE_URL", "")
        if not uri:
            print("SIB_PROD_DATABASE_URL missing (inline env only) — abort")
            return 2
        if not stage_secret(s, "SIB_PROD_DATABASE_URL", uri):
            return 3
        note_state(gate, {"dsn_fp16": fp(uri), "dsn_staged_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    if gate == "b":
        key, src = gemini_key()
        if not stage_secret(s, "SIB_GEMINI_KEY", key):
            return 3
        note_state(gate, {"gemini_fp16": fp(key), "gemini_src": src,
                          "gemini_staged_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        print(f"gemini key source: {src} (fp16 {fp(key)})")
    wf = GATES[gate]["wf"]
    r = s.post(f"{API}/actions/workflows/{wf}/dispatches",
               json={"ref": REF, "inputs": inputs}, timeout=30)
    if r.status_code != 204:
        print(f"dispatch FAILED: {r.status_code} {r.text[:200]}")
        return 4
    print(f"dispatched: gate {gate} ref={REF} inputs={ {k: v for k, v in inputs.items()} }")
    note_state(gate, {"dispatched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "dispatch_inputs": inputs})
    return 0


def cmd_stage_apply(args) -> int:
    inputs = {"probe-word": args.probe_word, "mode": args.mode, "note": args.note}
    return dispatch("a", inputs)


def cmd_stage_backfill(args) -> int:
    inputs = {"probe-word": args.probe_word, "mode": args.mode, "note": args.note}
    return dispatch("b", inputs)


def latest_run(s: requests.Session, gate: str, since: str = ""):
    r = s.get(f"{API}/actions/workflows/{GATES[gate]['wf']}/runs?per_page=10", timeout=30)
    if r.status_code != 200:
        print(f"runs list FAILED: {r.status_code}")
        return None
    for run in r.json().get("workflow_runs", []):
        if run["created_at"] >= (since or ""):
            return run
    return None


def fetch_artifacts(s: requests.Session, run_id: int, dest: str) -> list:
    r = s.get(f"{API}/actions/runs/{run_id}/artifacts?per_page=50", timeout=30)
    if r.status_code != 200:
        print(f"artifacts list FAILED: {r.status_code}")
        return []
    pulled = []
    os.makedirs(dest, exist_ok=True)
    for art in r.json().get("artifacts", []):
        if art["expired"]:
            continue
        rd = s.get(f"{API}/actions/artifacts/{art['id']}/zip", timeout=180)
        if rd.status_code != 200:
            print(f"artifact {art['name']} download FAILED: {rd.status_code}")
            continue
        adir = os.path.join(dest, art["name"])
        os.makedirs(adir, exist_ok=True)
        with zipfile.ZipFile(BytesIO(rd.content)) as z:
            z.extractall(adir)
        pulled.append(art["name"])
        print(f"artifact pulled: {art['name']} -> {adir}")
    return pulled


def cmd_status(args) -> int:
    run = latest_run(session(), args.gate)
    if not run:
        print("no runs found")
        return 1
    print(json.dumps({k: run[k] for k in ("id", "status", "conclusion", "created_at", "html_url",
                                          "head_sha", "run_attempt")}, indent=1))
    return 0


def cmd_poll(args) -> int:
    s = session()
    gate = args.gate
    st = {}
    if os.path.exists(os.path.abspath(STATE)):
        with open(os.path.abspath(STATE), "r", encoding="utf-8") as fh:
            st = json.load(fh).get(gate, {})
    run = latest_run(s, gate, since=st.get("dispatched_at", "") or "")
    if not run:
        print("no matching run found — retrying without filter")
        run = latest_run(s, gate)
    if not run:
        print("no runs found")
        return 1
    out = {"gate": gate, "run_id": run["id"], "run_url": run["html_url"],
           "status": run["status"], "conclusion": run["conclusion"],
           "created_at": run["created_at"], "head_sha": run["head_sha"][:12],
           "attempt": run["run_attempt"]}
    print(json.dumps(out, indent=1))
    if run["status"] != "completed":
        print("RUN IN PROGRESS — poll again")
        note_state(gate, {"last_poll": out})
        return 1

    dest = os.path.join(os.path.dirname(os.path.abspath(STATE)), GATES[gate]["dir"])
    os.makedirs(dest, exist_ok=True)
    r = s.get(f"{API}/actions/runs/{run['id']}/logs", timeout=180)
    log = ""
    if r.status_code == 200:
        with zipfile.ZipFile(BytesIO(r.content)) as z:
            log = "\n".join(f"### {n}\n" + z.read(n).decode("utf-8", "replace")
                            for n in z.namelist() if n.endswith((".txt", ".log")))
        with open(os.path.join(dest, "run-logs.txt"), "w", encoding="utf-8") as fh:
            fh.write(log)
        print(f"logs saved: {dest}/run-logs.txt ({len(log)} bytes)")
    else:
        print(f"logs download FAILED: {r.status_code}")
    out["secret_material_in_log"] = any(t in log for t in SCRUB_TOKENS)
    out["artifacts_pulled"] = fetch_artifacts(s, run["id"], dest)
    out["polled_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    note_state(gate, {"last_poll": out})

    if args.hygiene:
        return cmd_hygiene(argparse.Namespace(gate=gate, quiet=False))
    if out["secret_material_in_log"]:
        print("WARNING: secret-material pattern found in log — review before filing receipt")
    print("run completed; artifacts in", dest)
    return 0 if run["conclusion"] == "success" else 1


def cmd_hygiene(args) -> int:
    s = session()
    gates = ["a", "b"] if args.gate == "both" else [args.gate]
    ok = True
    for g in gates:
        for name in GATES[g]["secrets"]:
            # Gate A only owns the DSN secret; never delete SIB_GEMINI_KEY via gate a.
            if g == "a" and name != "SIB_PROD_DATABASE_URL":
                continue
            r = s.delete(f"{API}/actions/secrets/{name}", timeout=30)
            r2 = s.get(f"{API}/actions/secrets/{name}", timeout=30)
            print(f"hygiene {g}: {name} delete={r.status_code} get-after={r2.status_code} (expect 404)")
            ok = ok and r2.status_code == 404
    note_state("hygiene", {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                           "gates": gates, "verified_404": ok})
    return 0 if ok else 5


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("probe")
    p = sub.add_parser("var")
    p.add_argument("name")
    p = sub.add_parser("stage-apply")
    p.add_argument("--probe-word", default="sib-cow-proof")
    p.add_argument("--mode", default="cow+prod", choices=["cow+prod", "cow-only"])
    p.add_argument("--note", default="")
    p = sub.add_parser("stage-backfill")
    p.add_argument("--mode", default="cow+prod", choices=["cow+prod", "prod-only"])
    p.add_argument("--probe-word", default="sib-cow-proof")
    p.add_argument("--note", default="")
    p = sub.add_parser("status")
    p.add_argument("--gate", required=True, choices=["a", "b"])
    p = sub.add_parser("poll")
    p.add_argument("--gate", required=True, choices=["a", "b"])
    p.add_argument("--hygiene", action="store_true")
    p = sub.add_parser("hygiene")
    p.add_argument("--gate", required=True, choices=["a", "b", "both"])
    args = ap.parse_args()
    if args.cmd == "probe":
        return cmd_probe()
    if args.cmd == "var":
        return cmd_var(args.name)
    if args.cmd == "stage-apply":
        return cmd_stage_apply(args)
    if args.cmd == "stage-backfill":
        return cmd_stage_backfill(args)
    if args.cmd == "status":
        return cmd_status(args)
    if args.cmd == "poll":
        return cmd_poll(args)
    if args.cmd == "hygiene":
        return cmd_hygiene(args)
    return 2


if __name__ == "__main__":
    sys.exit(main())
