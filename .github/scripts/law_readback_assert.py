#!/usr/bin/env python3
"""§8 read-back integrity assertions (T-LAW-ENFORCE-1, operator directive 2026-11-13, zai-web trace 1a1d545c404c9a2d).

Asserts the gate of record on every push to main and every PR (§8 of
docs/AGENT_COORDINATION.md: "every push to main re-parses the workflow YAMLs
and asserts the trigger literals and gate steps of record ... A fix that did
not stick must fail the same day").

If the gate changes DELIBERATELY, update these assertions of record in the
same risk-tier PR — the assertions are the machine-checkable mirror of §8.
"""
import os
import sys

fails = []


def check(cond, msg):
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        fails.append(msg)


try:
    import yaml
except ImportError:
    sys.exit("FATAL: PyYAML unavailable — run: python3 -m pip install pyyaml")


def load_wf(path):
    """Load a workflow, handling the YAML 1.1 quirk that a bare 'on:' key parses as True."""
    with open(path, "rb") as f:
        data = yaml.safe_load(f.read().decode("utf-8"))
    trig = data.get(True, None)
    if trig is None:
        trig = data.get("on", {}) or {}
    return data, trig


def section_wf(path, label):
    print(f"== {label} ==")
    if not os.path.exists(path):
        check(False, f"{path} exists")
        return None, None
    check(True, f"{path} exists")
    return load_wf(path)


# ---------------- ci.yml: the gate of record ----------------
ci, on = section_wf(".github/workflows/ci.yml", "ci.yml")
if ci is not None:
    push = on.get("push") or {}
    check(push.get("branches") == ["main"], f"push.branches == ['main'] (got {push.get('branches')!r})")
    check("pull_request" in on, "pull_request trigger present")
    check("merge_group" in on, "merge_group trigger present")
    check("workflow_dispatch" in on, "workflow_dispatch trigger present")
    jobs = ci.get("jobs") or {}
    check("verify" in jobs, "gate job 'verify' present")
    check("hub" in jobs, "gate job 'hub' present")
    perms = ci.get("permissions")
    check(isinstance(perms, dict) and perms.get("contents") == "read",
          f"permissions.contents == read (got {perms.get('contents')!r})" if isinstance(perms, dict) else f"permissions is a mapping (got {perms!r})")

# ---------------- census-guard.yml ----------------
cg, on2 = section_wf(".github/workflows/census-guard.yml", "census-guard.yml")
if cg is not None:
    push2 = on2.get("push") or {}
    check(push2.get("branches") == ["main"], f"push.branches == ['main'] (got {push2.get('branches')!r})")
    paths2 = push2.get("paths") or []
    check(any(str(p).startswith("apps/hub/content") for p in paths2), "push paths guard apps/hub/content/**")
    check("pull_request" in on2, "pull_request trigger present")
    check("census" in (cg.get("jobs") or {}), "gate job 'census' present")

# ---------------- law-readback.yml (this guard must guard itself) ----------------
rb, on3 = section_wf(".github/workflows/law-readback.yml", "law-readback.yml (self)")
if rb is not None:
    check((on3.get("push") or {}).get("branches") == ["main"], "self: push.branches == ['main']")
    check("law-readback" in (rb.get("jobs") or {}), "self: job 'law-readback' present")
    check("coordination" in (rb.get("jobs") or {}), "self: job 'coordination' present")

# ---------------- t-tutor-audit-p1-fold-probe.yml (P1-03 + P1-04, F5) ----------------
fp, onfp = section_wf(".github/workflows/t-tutor-audit-p1-fold-probe.yml", "t-tutor-audit-p1-fold-probe.yml (the F5 fold probe)")
if fp is not None:
    sched = onfp.get("schedule") or []
    crons = [str(s.get("cron", "")) for s in sched if isinstance(s, dict)]
    ok_daily = False
    if len(crons) == 1:
        parts = crons[0].split()
        ok_daily = (
            len(parts) == 5
            and parts[0].isdigit() and parts[1].isdigit()
            and parts[2] == "*" and parts[3] == "*" and parts[4] == "*"
        )
    check(ok_daily, f"exactly one DAILY cron of record (got {crons!r}) — P1-03: freshness lag is an alert, not an operator discovery")
    check("workflow_dispatch" in onfp, "workflow_dispatch trigger present (operator ad-hoc probe)")
    fp_perms = fp.get("permissions")
    check(isinstance(fp_perms, dict) and fp_perms.get("contents") == "read",
          f"permissions.contents == read (got {fp_perms.get('contents')!r})" if isinstance(fp_perms, dict) else f"permissions is a mapping (got {fp_perms!r})")
    check(isinstance(fp_perms, dict) and fp_perms.get("actions") == "write",
          "permissions.actions == write (the fold-budget AUTO-DISPATCH, P1-04)" if isinstance(fp_perms, dict) else f"permissions is a mapping (got {fp_perms!r})")
    fp_jobs = fp.get("jobs") or {}
    check("fold-probe" in fp_jobs, "gate job 'fold-probe' present")
    fp_steps = (fp_jobs.get("fold-probe") or {}).get("steps") or []

    def step_text(s):
        env = s.get("env")
        env_text = " ".join(f"{k}={v}" for k, v in env.items()) if isinstance(env, dict) else ""
        return str(s.get("run") or "") + " " + env_text

    fp_text = " ".join(step_text(s) for s in fp_steps)
    check("--selftest" in fp_text, "the instrument proves itself first (fold-census-probe --selftest leg)")
    check("fold-census-probe.ts --db" in fp_text, "the live fold census runs against the COW (serving funnel verbatim)")
    check("--verdict" in fp_text, "the fold-budget verdict leg re-derives from the receipt of record")
    check("t-sib-embed-backfill.yml/dispatches" in fp_text,
          "fold-budget AUTO-DISPATCH targets t-sib-embed-backfill.yml (P1-04)")
    check("SIB_GEMINI_KEY" in fp_text and "SIB_PROD_DATABASE_URL" in fp_text,
          "the dispatch is ARMED-GATED on the operator's staged per-run secrets")

# ---------------- t-sib-embed-backfill.yml stays the operator file of record ----------------
bf, onbf = section_wf(".github/workflows/t-sib-embed-backfill.yml", "t-sib-embed-backfill.yml (operator gate unchanged)")
if bf is not None:
    check("workflow_dispatch" in onbf, "backfill stays workflow_dispatch-dispatchable")
    check("schedule" not in onbf, "backfill carries NO schedule trigger (the fold probe dispatches it — P1-04)")
    check("prod-backfill" in (bf.get("jobs") or {}), "gate job 'prod-backfill' present")

# ---------------- the law of record is on main ----------------
print("== the law of record ==")
if os.path.exists("docs/AGENT_COORDINATION.md"):
    law = open("docs/AGENT_COORDINATION.md", encoding="utf-8").read()
    check("no unverified landings" in law, "§8 'no unverified landings' present in AGENT_COORDINATION.md")
    check("Read-back integrity job" in law, "§8 read-back integrity mandate present")
    check("Risk tier" in law, "§8 risk tier table present")
else:
    check(False, "docs/AGENT_COORDINATION.md exists")
check(os.path.isdir(".syllabai/receipts"), ".syllabai/receipts culture directory present")

print("")
if fails:
    print(f"RESULT: {len(fails)} assertion(s) FAILED — the gate of record drifted or a fix did not stick.")
    print("  If the drift is DELIBERATE, update the assertions of record in the same risk-tier PR (§8).")
    sys.exit(1)
print("RESULT: ALL ASSERTIONS PASS — the gate of record holds.")
