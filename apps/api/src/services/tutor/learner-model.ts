/**
 * The sql-backed LearnerModelPort — the SERVING WIRING of the ported
 * learner-model reads (T-MIG-124 Phase 1, operator order trace
 * 1a13422c277c0171 "Proceed, both phases"; the plan of record lives in the
 * append-only worklog @ 937df0b). Until this file existed the composition
 * root ran the tutor module with NO learner model at all — the disclosed
 * posture in buildClaRouters' header ("the tutor module itself runs with NO
 * learner model at all") — so T-026 diagnosis-aware policy, the s140
 * episodic digest and the learner brief read [] on every ask.
 *
 * FROZEN SOURCES @ 6cad6ef, read laws line-against-line:
 *  - LearnerModelService.skillStates :214-216 (the recency-ordered full
 *    list) → REUSED from services/learner/state.ts skillStatesByRecency (the
 *    SAME SQL law — REUSE-not-redeclare; the shape is the context.ts
 *    SkillState exactly).
 *  - LearnerModelService.misconceptionReadings :225-246: the anchored rows
 *    come back with their staleness-RELAXED probability (MED-2, ADR-032:
 *    effective = prior + (P_e − prior)·e^(−age/τ_s), never persisted) AND
 *    are RE-SORTED by effective desc — a fresh 0.6 diagnosis must outrank a
 *    stale 0.9 one, which the repository's raw-probability ordering cannot
 *    express. The relaxation math is this module's OWN copy (relaxedToPrior
 *    + TUTOR_BDT_PAPER_DEFAULTS in context.ts) per the per-module
 *    structural-seam doctrine documented in context.ts's header (the
 *    consolidation request remains the queued R0 intake ruling).
 *  - TutorPolicyService.select :70-75 → the struggle-inference read the v2
 *    port re-shaped as the port's activeStruggleInferences param:
 *    StruggleInferenceRepository's learner-wide active read — un-expired
 *    (expires_at > now, the read contract enforced on EVERY read),
 *    un-superseded (superseded_at IS NULL), ordered probability DESC then
 *    generatedAt DESC (fully ordered — ties break by recency). The teacher
 *    override maps verbatim (StruggleInference.java :131-137): CONFIRMED →
 *    teacherConfirmed (meets the intervention threshold outright, Master
 *    Spec §17), REJECTED → teacherRejected. REJECTED rows are NOT dropped
 *    here — the POLICY filters them (selectIntervention), frozen parity:
 *    the read returns all active rows with their override state.
 *  - TutorMemoryService.digest :74-80 → the s140 episodic reads:
 *    engagements findByLearnerIdAndNodeIdIn — matched-topic scoped, NO time
 *    window (the 30d TUTOR_WINDOW_DAYS window is the learner-me V21
 *    state-view law, a DIFFERENT surface); reviews
 *    findByLearnerIdAndNodeIdInAndStatus(PENDING). A null signal_type reads
 *    TOPIC_ENGAGEMENT (the tutor-signals.ts row convention — the digest
 *    treats non-confusion types identically either way).
 *  - M3 (audit 2026-10-02): the model is read ONCE per ask — karag's
 *    assembleContext owns the five call sites and propagates the reads to
 *    every consumer (brief + digest + policy). The port adds NO caching and
 *    NO re-reads.
 *
 * FAILURE LAW: these reads are the same-DB infra class as every other
 * pipeline read (scopes, KG, vector arm) — a failure propagates and fails
 * the ask exactly like those (no swallowing, frozen posture). EMPTY tables
 * degrade to the honest empty lists = the pre-wiring serving behavior
 * byte-for-byte ("Learner state: no prior evidence…", the EXPLANATION plan,
 * a null memory digest).
 *
 * SUBSTRATE HONESTY (T-MIG-124 run-001 census; re-derived live by the
 * T-TUTOR-AIM-P5 run-001 loop-closure verification at HEAD — every table
 * below has a v2 writer of record, see
 * .syllabai/receipts/T-TUTOR-AIM-P5/run-001-loop-verify.json):
 * skill_states and misconception_states (services/learner-model/
 * model-update.ts via the assessment-evidence path AND the T-MIG-137
 * graded-evidence seam — every marked attempt writes learner state);
 * struggle_inferences (services/learner-model/struggle-inference.ts,
 * T-MIG-131 — the @Order(100) phase after the model write);
 * tutor_topic_engagements (services/learner/engagement-recorder.ts,
 * T-MIG-124 Phase 2 — wired as the telemetry sink on routes/tutor.ts and
 * routes/cla.ts); review_schedules (services/cron/review-scheduler.ts,
 * T-MIG-126 — the nightly-decay window law, routes/cron.ts). The
 * honest-empty degradation law is unchanged: EMPTY tables still read as
 * the empty lists ("Learner state: no prior evidence…", the EXPLANATION
 * plan, a null memory digest) — the writers feed the reads, never the
 * reverse.
 */

import { skillStatesByRecency, misconceptionStatesByProbability } from "../learner/state";
import { examTargetsFor } from "../learner-model/exam-target-reader";
import { relaxedToPrior, TUTOR_BDT_PAPER_DEFAULTS } from "./context";
import type {
  SkillState,
  MisconceptionReading,
  StruggleInferenceRow,
  TutorTopicEngagementRow,
  ReviewSchedulePendingRow,
} from "./context";
import type { LearnerModelPort } from "./karag";
import type { Clock } from "./session-store";
import type { SqlFn } from "./sql";
import type { CourseExamTargetView } from "@syllabai/contracts";

export function buildSqlLearnerModel(sql: SqlFn, clock: Clock): LearnerModelPort {
  return {
    async skillStates(learnerId: string): Promise<SkillState[]> {
      return skillStatesByRecency(sql, learnerId);
    },

    async misconceptionReadings(learnerId: string): Promise<MisconceptionReading[]> {
      const rows = await misconceptionStatesByProbability(sql, learnerId);
      // LearnerModelService.misconceptionReadings :225-246 — relax per row
      // against the ask's now, then re-sort by effective desc (stable for
      // ties, preserving the raw-probability order the read arrives in).
      const now = clock.now();
      return rows
        .map((m) => ({
          misconceptionNodeId: m.misconceptionNodeId,
          effective: relaxedToPrior(
            m.probability,
            TUTOR_BDT_PAPER_DEFAULTS.prior,
            m.lastEvidenceAt,
            now,
            TUTOR_BDT_PAPER_DEFAULTS.stalenessTauDays,
          ),
        }))
        .sort((a, b) => b.effective - a.effective);
    },

    async activeStruggleInferences(learnerId: string): Promise<StruggleInferenceRow[]> {
      const now = clock.now();
      const rows = await sql`
        select topic_node_id, probability, teacher_override, type, subtype
        from struggle_inferences
        where learner_id = ${learnerId} and expires_at > ${now} and superseded_at is null
        order by probability desc, generated_at desc
      `;
      return rows.map((r) => ({
        topicNodeId: String(r.topic_node_id),
        probability: Number(r.probability),
        teacherConfirmed: r.teacher_override === "CONFIRMED",
        teacherRejected: r.teacher_override === "REJECTED",
        type: String(r.type),
        subtype: r.subtype == null ? null : String(r.subtype),
      }));
    },

    async topicEngagements(
      learnerId: string,
      nodeIds: string[],
    ): Promise<TutorTopicEngagementRow[]> {
      // matched-topic scoped (findByLearnerIdAndNodeIdIn) — never a full
      // account dump; an empty topic match queries nothing
      const ids = [...new Set(nodeIds)];
      if (ids.length === 0) return [];
      const rows = await sql`
        select node_id, signal_type, occurred_at
        from tutor_topic_engagements
        where learner_id = ${learnerId} and node_id = any(${ids})
      `;
      return rows.map((r) => ({
        nodeId: String(r.node_id),
        signalType: r.signal_type == null ? "TOPIC_ENGAGEMENT" : String(r.signal_type),
        occurredAt: r.occurred_at instanceof Date ? r.occurred_at : new Date(String(r.occurred_at)),
      }));
    },

    async pendingReviews(
      learnerId: string,
      nodeIds: string[],
    ): Promise<ReviewSchedulePendingRow[]> {
      // findByLearnerIdAndNodeIdInAndStatus(PENDING) — the forgetting-curve's
      // "due for review" signal, matched-topic scoped for the digest
      const ids = [...new Set(nodeIds)];
      if (ids.length === 0) return [];
      const rows = await sql`
        select node_id
        from review_schedules
        where learner_id = ${learnerId} and status = ${"PENDING"} and node_id = any(${ids})
      `;
      return rows.map((r) => ({ nodeId: String(r.node_id) }));
    },

    async examTargets(learnerId: string): Promise<CourseExamTargetView[]> {
      // T-TUTOR-AIM-P3 run-003 (DC10 §7.9) — the M3 EXTENSION of record (the
      // P2 precedent, documented): the exam-target read joins the ask path —
      // ONE indexed enrolments read + ONE batched series read per ask, ONLY
      // for account askers (the caller guards learnerId == null — anonymous
      // previews read NOTHING). Composes the CANONICAL ExamTargetReader seam
      // (the 043 consolidation law — no SQL copy): the countdown derives on
      // that read against this port's clock (ADR-031). The adapter wraps the
      // session-store Clock into the seam's SubmitClock shape (examTargetsFor
      // calls now() only — the newId leg is never exercised here).
      return examTargetsFor(
        {
          sql,
          clock: { newId: () => crypto.randomUUID(), now: () => clock.now() },
        },
        learnerId,
      );
    },
  };
}
