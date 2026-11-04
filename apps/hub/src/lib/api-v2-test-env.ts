/**
 * Test-infra seam (T-AUDIT-TIER1 run-003) — the api module freezes
 * API_V2_BASE at import time, and the v2-surface pins bind it correctly by
 * importing ./api first (their own top-level env + dynamic-import trick).
 * The account-docs tests import ./api TRANSITIVELY (the engine's boundary),
 * so any run order that loads them first froze the base EMPTY and broke the
 * surface pins downstream. This side-effect module sets the SAME value the
 * surface test uses; it is imported FIRST in both account-docs test files,
 * so the binding is order-stable no matter which test file loads first.
 * Nothing else in the hub suite imports ./api, so no other test observes it.
 */
process.env.NEXT_PUBLIC_API_V2_BASE_URL = "https://v2.example";
