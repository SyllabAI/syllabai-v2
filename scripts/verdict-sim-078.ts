import { deepEqualTolerant } from "../golden/runner.ts";
// T-MIG-078 pre-merge verdict simulations: capture vs a synthetic live body
// shaped exactly as the post-fix instrument would produce it.
async function sim(name: string, mutate: (live: any, cap: any) => void, capFile: string) {
  const kase = JSON.parse(await Bun.file(capFile).text());
  const cap = JSON.parse(JSON.stringify(kase.expect.body));
  const live = JSON.parse(JSON.stringify(cap));
  mutate(live, cap);
  const r = deepEqualTolerant(cap, live, kase.tolerate ?? [], kase.unordered ?? []);
  console.log(`${r ? "PASS(predicted)" : "RED(predicted) "}: ${name}`);
  return r;
}
// 1. course-stats as the w4 learner: attempts 1, flashcardsRated 3 — no volatile fields
await sim("w4-course-stats-practiced (w4-learner routing)", (l) => {
  l.learnerId = "fresh-minted-uuid"; l.attempts = 1; l.distinctQuestions = 1; l.notesViewed = 0; l.flashcardsRated = 3;
}, "golden/cases/w4-course-stats-practiced-200.json");
// 2. history-after-submit as the w4 learner: total 1, fresh ids, REPLAY-TIME attemptedAt
let ok = await sim("w3-history-after-submit (w4-learner routing, attemptedAt as v2 renders it)", (l, c) => {
  l.learnerId = "fresh-minted-uuid"; l.total = 1; l.returned = 1; l.attempts = [JSON.parse(JSON.stringify(c.attempts[0]))];
  l.attempts[0].attemptId = "fresh-attempt-uuid";
  l.attempts[0].attemptedAt = "2026-10-06T12:05:00.123Z"; // new Date(created_at).toISOString() — ms precision
}, "golden/cases/w3-history-after-submit-200.json");
console.log("   -> the ONLY blocker is attemptedAt:", !ok);
ok = await sim("   control: same body with capture attemptedAt", (l, c) => {
  l.learnerId = "fresh-minted-uuid"; l.total = 1; l.returned = 1; l.attempts = [JSON.parse(JSON.stringify(c.attempts[0]))];
  l.attempts[0].attemptId = "fresh-attempt-uuid";
}, "golden/cases/w3-history-after-submit-200.json");
// 3. state-practiced as the w4 learner: flashcardRatings faithful, BKT legs empty (the dormant pipeline)
await sim("w4-state-practiced (w4-learner routing, skill_states/misconception_states as v2 writes them: none)", (l) => {
  l.learnerId = "fresh-minted-uuid"; l.skillStates = []; l.misconceptionStates = [];
  for (const r of l.flashcardRatings) r.occurredAt = "2026-10-06T12:05:00.123Z";
}, "golden/cases/w4-state-practiced-200.json");
