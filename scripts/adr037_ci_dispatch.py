#!/usr/bin/env python3
"""
ADR-037 CI dispatch driver — stages the run credential as a repo Actions
secret (libsodium sealed box), dispatches the adr037-db-plane workflow,
polls it, extracts the evidence log, and DELETES the secret (404-verified).

Inline-only credential law: GH_PAT and SEED_DATABASE_URL come from the
environment; never printed, never persisted, never embedded in URLs or
receipts. Fingerprints only.

Subcommands:
  stage <mode> <note>   — set secret + dispatch workflow (mode: dry-run|apply)
  poll                  — status; on completion: fetch logs, extract summary,
                          write scripts/adr037_ci_dryrun_result.json,
                          delete the secret, verify deletion
  status                — status only
"""

import base64
import json
import os
import sys
import time
import zipfile
from io import BytesIO

import requests
from nacl import encoding, public

REPO = "SyllabAI/syllabai-v2"
WORKFLOW = "adr037-db-plane.yml"
SECRET_NAME = "ADR037_SEED_DATABASE_URL"
API = f"https://api.github.com/repos/{REPO}"
RESULT = "scripts/adr037_ci_dryrun_result.json"


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
    import hashlib

    return hashlib.sha256(v.encode()).hexdigest()[:16]


def cmd_stage(mode: str, note: str) -> int:
    tok = pat()
    uri = os.environ.get("SEED_DATABASE_URL", "")
    if not uri:
        print("SEED_DATABASE_URL missing (inline env only)")
        return 2
    s = requests.Session()
    s.headers.update(hdr(tok))

    # 1. repo public key
    r = s.get(f"{API}/actions/secrets/public-key", timeout=30)
    if r.status_code != 200:
        print(f"public-key FAILED: {r.status_code} (need admin on the repo) — fail-closed")
        return 3
    pk = public.PublicKey(r.json()["key"].encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(uri.encode())
    body = {
        "encrypted_value": base64.b64encode(sealed).decode(),
        "key_id": r.json()["key_id"],
    }

    # 2. stage the secret
    r = s.put(f"{API}/actions/secrets/{SECRET_NAME}", json=body, timeout=30)
    if r.status_code not in (201, 204):
        print(f"secret PUT FAILED: {r.status_code} — fail-closed")
        return 3
    print(f"secret staged: {SECRET_NAME} (value fp16 {fp(uri)}, never printed)")

    # 3. dispatch
    r = s.post(
        f"{API}/actions/workflows/{WORKFLOW}/dispatches",
        json={"ref": "main", "inputs": {"mode": mode, "note": note}},
        timeout=30,
    )
    if r.status_code != 204:
        print(f"dispatch FAILED: {r.status_code} {r.text[:200]}")
        return 4
    print(f"dispatched: workflow {WORKFLOW} ref=main mode={mode}")
    print(f"dispatch URI fp16: {fp(uri)} | GH_PAT fp16: {fp(tok)}")
    return 0


def latest_run(s: requests.Session):
    r = s.get(f"{API}/actions/workflows/{WORKFLOW}/runs?per_page=3", timeout=30)
    if r.status_code != 200:
        print(f"runs list FAILED: {r.status_code}")
        return None
    runs = r.json().get("workflow_runs", [])
    return runs[0] if runs else None


def fetch_log(s: requests.Session, run_id: int) -> str:
    r = s.get(f"{API}/actions/runs/{run_id}/logs", timeout=120)
    if r.status_code != 200:
        print(f"logs download FAILED: {r.status_code}")
        return ""
    text = []
    with zipfile.ZipFile(BytesIO(r.content)) as z:
        for name in z.namelist():
            if name.endswith(".txt") or name.endswith(".log"):
                text.append(f"### {name}\n" + z.read(name).decode("utf-8", "replace"))
    return "\n".join(text)


def cmd_poll() -> int:
    tok = pat()
    s = requests.Session()
    s.headers.update(hdr(tok))
    run = latest_run(s)
    if not run:
        print("no runs found")
        return 1
    out = {
        "run_id": run["id"],
        "run_url": run["html_url"],
        "status": run["status"],
        "conclusion": run["conclusion"],
        "created_at": run["created_at"],
        "event": run["event"],
        "head_sha": run["head_sha"][:12],
    }
    print(json.dumps(out, indent=1))
    if run["status"] != "completed":
        print("RUN IN PROGRESS — poll again")
        return 1

    log = fetch_log(s, run["id"])
    summary_lines = [
        ln for ln in log.splitlines()
        if ln.startswith("[dry-run]") or ln.startswith("[apply]") or ln.startswith("[shim]")
    ]
    out["log_excerpt"] = summary_lines[-12:]
    out["dry_run_green"] = any("[dry-run] GREEN" in ln for ln in log.splitlines())
    out["apply_summary_present"] = any(ln.startswith("[apply] ingest summary:") for ln in log.splitlines())
    out["secret_material_in_log"] = any(
        tok in log for tok in ("npg_", "ghp_", "postgresql://")
    )
    with open(RESULT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)

    # cleanup: delete the secret, verify
    r = s.delete(f"{API}/actions/secrets/{SECRET_NAME}", timeout=30)
    del_status = r.status_code
    r2 = s.get(f"{API}/actions/secrets/{SECRET_NAME}", timeout=30)
    out["secret_delete_status"] = del_status
    out["secret_get_after_delete"] = r2.status_code
    with open(RESULT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    print("secret deleted:", del_status, "| get-after:", r2.status_code, "(expect 404)")
    print("log excerpt of record:")
    for ln in out["log_excerpt"]:
        print(" ", ln[:220])
    print("result filed:", RESULT)
    return 0


def cmd_status() -> int:
    tok = pat()
    s = requests.Session()
    s.headers.update(hdr(tok))
    run = latest_run(s)
    if not run:
        print("no runs found")
        return 1
    print(json.dumps({k: run[k] for k in ("id", "status", "conclusion", "created_at", "html_url")}, indent=1))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == "stage":
        sys.exit(cmd_stage(sys.argv[2] if len(sys.argv) > 2 else "dry-run",
                           sys.argv[3] if len(sys.argv) > 3 else ""))
    if cmd == "poll":
        sys.exit(cmd_poll())
    if cmd == "status":
        sys.exit(cmd_status())
    print("unknown subcommand")
    sys.exit(2)
