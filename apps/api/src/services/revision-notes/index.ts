/**
 * T-MIG-053 tranche-3 (r3a) — the revision-notes barrel: the learner read
 * model (RevisionNoteService :21-148) + the operator ingest/status pair
 * (RevisionNoteIngestService :30-245, RevisionNoteAdminController :25-52,
 * RevisionNoteLearnerController :25-69). Frozen scope map (the card):
 * learner 5 (index/body/asset/progress/mark-viewed) + admin 2 (multipart
 * ingest/status) = 7 endpoints.
 *
 * FENCE (tranche-3 doctrine per 041/043/052/053-t1/t2): contracts+services
 * + fakeSql pins — NO routes/mounts. The 051 multipart runner ext stays the
 * golden vehicle at the route layer; hands-off bands unchanged (052-t2
 * routes r9-hubx, 043-t2 NBA w0a).
 *
 * REUSE-not-redeclare: the bounded ZIP walker is the SHARED sme/zip.ts port
 * of ZipSafety (T-MIG-033 tranche-3) — the revision-notes service-level
 * `..` rejection stays ON TOP of the structural guard (plain `a..b.png`
 * names pass the guard, the substring check is load-bearing); the TxSqlFn
 * transaction seam is the sme/index.ts register-repository precedent.
 */
export * from "./learner";
export * from "./ingest";
