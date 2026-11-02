#!/usr/bin/env python3
"""T-TEACHME-001 — provider key census from the runner's vantage.

Answers the geo-block question of record (receipt
key-probe-vantage-correction-2026-11-03.json): the sandbox egress (Alibaba
Cloud, Hong Kong) is edge-blocked by Groq pre-auth and location-refused by
Gemini, so key validity was INDETERMINATE from there. GitHub Actions runners
egress from Azure US — a region both providers serve.

Keys arrive via env vars only (Actions secrets of record), never argv, never
files. Output is MASKED (first 8 + last 4); full key values never printed,
never written. Results JSON -> probe-results.json (artifact of record).

Env:
  PROBE_GROQ_KEYS       "label:key,label:key,..." or bare comma-separated keys
  PROBE_GEMINI_KEYS     same format
  PROBE_OPENROUTER_KEY  a single key
"""
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1"
OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"
IPINFO_URL = "https://ipinfo.io/json"

UA = {"User-Agent": "syllabai-keyprobe/1 (t-teachme-001 vantage probe)"}


def mask(key: str) -> str:
    return key[:8] + "…" + key[-4:] if len(key) > 12 else key[:4] + "…" + key[-2:]


def fetch_json(url: str, headers: dict, timeout: int = 20):
    req = urllib.request.Request(url, headers={**UA, **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", "replace")
        except Exception:
            return e.code, ""
    except Exception as e:
        return -1, str(e)


def short_reason(status: int, body: str) -> str:
    if status == 200:
        return "OK"
    try:
        j = json.loads(body)
        err = j.get("error", j)
        return f"{status}: {str(err.get('message') or err.get('status') or '')[:160]}"
    except Exception:
        return f"{status}: {body[:120]}"


def probe_groq(key: str):
    status, body = fetch_json(GROQ_MODELS_URL, {"Authorization": f"Bearer {key}"})
    n = 0
    if status == 200:
        try:
            n = len(json.loads(body).get("data", []))
        except Exception:
            pass
    return {"provider": "groq", "key_mask": mask(key), "status": status,
            "valid": status == 200,
            "detail": f"{n} models" if status == 200 else short_reason(status, body)}


def probe_gemini(key: str):
    status, body = fetch_json(GEMINI_MODELS_URL, {"x-goog-api-key": key})
    n = 0
    if status == 200:
        try:
            n = len(json.loads(body).get("models", []))
        except Exception:
            pass
    return {"provider": "gemini", "key_mask": mask(key), "status": status,
            "valid": status == 200,
            "detail": f"{n} models" if status == 200 else short_reason(status, body)}


def probe_openrouter(key: str):
    status, body = fetch_json(OPENROUTER_KEY_URL, {"Authorization": f"Bearer {key}"})
    if status == 200:
        try:
            d = json.loads(body).get("data", {})
            detail = (f"label={d.get('label')!r} limit={d.get('limit')} "
                      f"usage=${d.get('usage')} free_tier={d.get('is_free_tier')}")
        except Exception:
            detail = "OK (unparsed)"
        return {"provider": "openrouter", "key_mask": mask(key), "status": status,
                "valid": True, "detail": detail}
    return {"provider": "openrouter", "key_mask": mask(key), "status": status,
            "valid": False, "detail": short_reason(status, body)}


def parse_pairs(raw: str):
    out = []
    for tok in (raw or "").split(","):
        tok = tok.strip()
        if not tok:
            continue
        if ":" in tok and not tok.startswith(("gsk_", "sk-or-", "AQ.")):
            label, _, key = tok.partition(":")
            out.append((label.strip(), key.strip()))
        else:
            out.append(("", tok))
    return out


def main():
    results = {"generated_at": datetime.now(timezone.utc).isoformat()}

    status, body = fetch_json(IPINFO_URL, {})
    vantage = {"status": status}
    try:
        j = json.loads(body)
        vantage.update({k: j.get(k) for k in ("ip", "city", "region", "country", "org")})
    except Exception:
        vantage["raw"] = body[:120]
    results["vantage"] = vantage
    print(f"vantage: {vantage.get('city')}, {vantage.get('country')}  org={vantage.get('org')}  ip={vantage.get('ip')}")

    results["groq"], results["gemini"], results["openrouter"] = [], [], []

    for label, key in parse_pairs(os.environ.get("PROBE_GROQ_KEYS", "")):
        r = probe_groq(key)
        r["label"] = label or "?"
        results["groq"].append(r)
        print(f"groq       {r['label']:>8}  {r['key_mask']}  ->  {'VALID' if r['valid'] else 'DEAD '}  {r['detail']}")

    for label, key in parse_pairs(os.environ.get("PROBE_GEMINI_KEYS", "")):
        r = probe_gemini(key)
        r["label"] = label or "?"
        results["gemini"].append(r)
        print(f"gemini     {r['label']:>8}  {r['key_mask']}  ->  {'VALID' if r['valid'] else 'DEAD '}  {r['detail']}")

    or_key = (os.environ.get("PROBE_OPENROUTER_KEY") or "").strip()
    if or_key:
        r = probe_openrouter(or_key)
        r["label"] = "or1"
        results["openrouter"].append(r)
        print(f"openrouter {'or1':>8}  {r['key_mask']}  ->  {'VALID' if r['valid'] else 'DEAD '}  {r['detail']}")

    with open("probe-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("\nresults (masked) -> probe-results.json (workflow artifact)")


if __name__ == "__main__":
    main()
