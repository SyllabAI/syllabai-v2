/**
 * T-MIG-126 — the review-schedules WRITE path (the NightlyDecayJob
 * review-scheduling arm, ported line-against-line). The run-002 spec of
 * record is the plan (the T-MIG-126 card band_spec + receipt
 * run-002-writer-band-spec-r0.json, merged via PR #193); this band was
 * BUILT on operator trace 1a1501aea6c2b049 "build it" (the T-MIG-131 flow).
 *
 * THE FROZEN WRITER OF RECORD (syllabai-core @ 6cad6ef,
 * learner/NightlyDecayJob.java :1-191 — Master Spec §11 / §31
 * APPLY_FORGETTING_DECAY, backlog F-159): the SOLE frozen writer of
 * review_schedules (repo-wide rg: reviewSchedules.save at :175 only). Its
 * C-4/ADR-031-narrowed law: the job's ONLY writes are the V38
 * decay_job_runs ledger row + review_schedules inserts — it NEVER writes
 * skill_states, so this band touches NOTHING the v2 read-time decay
 * architecture owns (T-MIG-042/066 stay untouched: decayedMastery is
 * recomputed from the stored anchors and never persisted).
 *
 * THE PASS (:133-190), phase for phase:
 *   - IDLE CANDIDATES (:146 + LearnerProperties DecayJob.idleGracePeriod
 *     default = Duration.ofDays(2), :164/:198): skill_states with
 *     last_practiced_at < now − 2d. The LearnerProperties config surface
 *     compresses to the paper-default constants of record (the v2 law:
 *     LEARNER_DECAY_PAPER_DEFAULTS + these constants — v2 has no
 *     LearnerProperties port; the paper values ARE the frozen defaults).
 *   - PAGING (:144-145, :186-188): page size 500, ORDER BY
 *     last_practiced_at ASC, id ASC — Spring Data's page.next() is
 *     LIMIT/OFFSET pagination, and the frozen loop ALWAYS issues the
 *     terminating empty-page query (while !candidates.isEmpty()); this
 *     port keeps that shape exactly. The stable sort is defensive since
 *     ADR-031 (the pass mutates nothing it pages over — LIMIT/OFFSET
 *     cannot revisit or skip tuples) and becomes load-bearing again the
 *     moment any future change writes inside this loop (the frozen
 *     comment verbatim). The WHERE rides ix_skill_states_last_practice.
 *   - PER STATE (:160-171): effective = decayedMastery(P0, lastPracticedAt,
 *     now, LEARNER_DECAY_PAPER_DEFAULTS) — recomputed from the STORED
 *     anchor and NEVER written back (ADR-031; the S1 compounding bug
 *     :149-159 is the anchor law's witness). decayed++ when
 *     effective < priorMastery (:164, "materially decayed"). The
 *     DecayAppliedEvent publish (:166-170) is NOT ported — its sole
 *     frozen consumer is the research §18 TelemetryService (the
 *     T-MIG-061 disclosed dormant posture; no telemetry rows in v2).
 *   - THE WRITE (:172-182): reviewThresholdCrossed = effective <
 *     reviewBelow (STRICT <, paper default 0.6) AND NOT
 *     existsByLearnerIdAndNodeIdAndStatus(learner, node, PENDING) ->
 *     INSERT ReviewSchedule(learnerId, nodeId, dueAt=now,
 *     reason=DECAY_CROSSED_THRESHOLD, masteryAtTrigger=effective) +
 *     ReviewScheduledEvent. The event is NOT ported (same T-MIG-061
 *     posture). No COMPLETED/CANCELLED transition writer exists in the
 *     frozen as-built — a PENDING row is terminal and this exists-dedup
 *     keeps ONE live schedule per (learner, node); the v2 readers read
 *     PENDING-only, byte-consistent.
 *
 * ROW SHAPE (ReviewSchedule.java :18-84): uuid id, learner_id, node_id,
 * due_at, reason, mastery_at_trigger (research traceability), status,
 * created_at. due_at AND created_at both take the PASS instant (`now`) —
 * the frozen @PrePersist created_at = Instant.now() at persist inside the
 * same transactional pass; v2 pins the single pass instant for
 * determinism (the T-MIG-131 event-instant convention).
 *
 * FAILURE LAW: fail-loud inside the caller's window transaction
 * (routes/cron.ts composes this pass + the ledger write into ONE
 * sql.transaction — the C-4 posture verbatim: the decay_job_runs PK fails
 * the loser of a window race and its idempotent writes roll back). Empty
 * tables degrade to the honest no-op: zero idle states = zero reads past
 * the first page, zero writes, byte-identical to the pre-band wire.
 *
 * DISCLOSURES (the run-002 spec, binding): JS Date millisecond precision
 * in the exponent (the frozen service used nanoseconds — relative drift
 * ~1e-11 at day scale, the T-MIG-131 convention); the frozen 15-min
 * run-if-missed checker/CATCH_UP is NOT ported (Vercel cron is one daily
 * 02:00 UTC shot; a missed window leaves that UTC day honestly empty and
 * reviews are NOT lost — the next window's pass re-evaluates EVERY idle
 * state from the anchors, the frozen "a late run is exact, not
 * approximate" self-healing verbatim); TEACHER_ASSIGNED stays a
 * write-ready lane with no writer (the T-029 teacher surface = a
 * separate band).
 */

import type { SqlFn } from "../identity/users";
import type { ModelUpdateClock as Clock } from "../learner-model/model-update";
import {
  decayedMastery,
  LEARNER_DECAY_PAPER_DEFAULTS,
} from "../learner-model/decay";

/** LearnerProperties.DecayJob.idleGracePeriod default (:164/:198) — Duration.ofDays(2). */
export const REVIEW_IDLE_GRACE_DAYS = 2;
/** PageRequest.of(0, 500, ...) (:144-145). */
export const REVIEW_PAGE_SIZE = 500;

const DAY_MS = 86_400_000;

/** The per-window batch-effect counts the decay_job_runs ledger row carries. */
export interface ReviewSchedulerPassOutcome {
  decayed: number;
  reviewsScheduled: number;
}

/**
 * runDecayPass (:133-190) — the review-scheduling arm of the nightly
 * decay pass: page the idle skill_states, recompute the effective mastery
 * from the stored anchor, schedule a review where the threshold crossed
 * and no PENDING schedule exists. Returns the honest batch-effect counts
 * the caller's ledger row carries.
 */
export async function runReviewSchedulerPass(
  sql: SqlFn,
  clock: Clock,
  opts: { now: Date },
): Promise<ReviewSchedulerPassOutcome> {
  const now = opts.now;
  const idleSince = new Date(now.getTime() - REVIEW_IDLE_GRACE_DAYS * DAY_MS);
  let decayed = 0;
  let reviewsScheduled = 0;
  let offset = 0;
  for (;;) {
    // :146 — findByLastPracticedAtBefore(idleSince, page 500, lastPracticedAt ASC, id ASC)
    const states = (await sql`
      select learner_id, node_id, mastery, last_practiced_at
      from skill_states
      where last_practiced_at < ${idleSince.toISOString()}::timestamptz
      order by last_practiced_at asc, id asc
      limit ${REVIEW_PAGE_SIZE} offset ${offset}
    `) as unknown as Array<{
      learner_id: string;
      node_id: string;
      mastery: number | string;
      last_practiced_at: string | Date;
    }>;
    if (states.length === 0) break;
    for (const s of states) {
      // :160 — the stored post-practice BKT posterior (the decay anchor P0)
      const priorMastery = Number(s.mastery);
      const lastPracticedAt = new Date(s.last_practiced_at);
      // :161-162 — recomputed, NEVER written back (ADR-031)
      const effective = decayedMastery(
        priorMastery,
        lastPracticedAt,
        now,
        LEARNER_DECAY_PAPER_DEFAULTS,
      );
      // :164 — materially decayed
      if (effective < priorMastery) decayed++;
      // :163 — reviewThresholdCrossed = effective < params.reviewBelow() (STRICT <)
      if (effective >= LEARNER_DECAY_PAPER_DEFAULTS.reviewBelow) continue;
      // :172-174 — !existsByLearnerIdAndNodeIdAndStatus(PENDING)
      const pending = (await sql`
        select 1 from review_schedules
        where learner_id = ${String(s.learner_id)}
          and node_id = ${String(s.node_id)}
          and status = ${"PENDING"}
        limit 1
      `) as unknown as unknown[];
      if (pending.length > 0) continue;
      // :175-177 — save(new ReviewSchedule(learner, node, now, DECAY_CROSSED_THRESHOLD, effective))
      await sql`
        insert into review_schedules
          (id, learner_id, node_id, due_at, reason, mastery_at_trigger, status, created_at)
        values
          (${clock.newId()}, ${String(s.learner_id)}, ${String(s.node_id)},
           ${now.toISOString()}::timestamptz, ${"DECAY_CROSSED_THRESHOLD"},
           ${effective}, ${"PENDING"}, ${now.toISOString()}::timestamptz)
      `;
      reviewsScheduled++;
    }
    // :186-188 — page.next(); the terminating empty-page query is ALWAYS
    // issued (the frozen while (!candidates.isEmpty()) shape)
    offset += REVIEW_PAGE_SIZE;
  }
  return { decayed, reviewsScheduled };
}
