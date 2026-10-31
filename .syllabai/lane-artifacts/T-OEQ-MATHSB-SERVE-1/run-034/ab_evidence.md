# run-034 A/B evidence — the two CI reds are PRE-EXISTING at main tip bfcb09ad

Method: the exact CI step commands run locally on (a) a pristine full worktree at
bfcb09ad and (b) the discharged branch tree (71b268f3 / 1843afe2), same commands,
same fetched v2 bundles (2026-10-31T08:xxZ).

1. corpus-gates / "graph integrity (c09/c11 graph-as-code validator)" (scripts/graph_check.py):
   pristine main bfcb09ad:  "graph_check: 1694 failure(s) across 3 check group(s)."
   discharged branch:       IDENTICAL 1,694 failures (same anchor classes:
                            c11.4/c11.6 edges whose anchor files lived in
                            "Chemistry IGCSE Revision Notes/..." — deleted from main by
                            commit 7343e125 AFTER main's last scripts-tests run at
                            b57b77f6, so the red sat unwitnessed on main tip).
   -> pre-existing, notes-lane repair scope; NOT this wave's diff.

2. official-export-gates / "F-187 G-E1..G-E4 verify" (chemistry):
   pristine main bfcb09ad:  "EXPORT GATE FAILED — G-E1: harness delta census (0 parts)
                            != disclosure of record (1 parts,
                            scripts/exporter-disclosures/2026-10-31-f125-part-soup-4ch1.json)"
   -> the F124 race re-occurred on F125: the v2 companion consumed the part-soup
      sync while the disclosure still filed 1 part. FIXED in this wave by filing
      the r2-consumed twin (byte-identical to the F124 twin form); after the twin:
      exporter + F-187 verify GREEN at the discharged cut (G-E1 0 deltas, census
      matches the twin exactly, G-E2/G-E3/G-E4 green).
