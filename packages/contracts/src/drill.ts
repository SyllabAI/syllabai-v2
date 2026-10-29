/**
 * F-182 drill-surface wire contracts — the per-spec-point drill (the first
 * Kognity-line build item; tracker F-182, repo syllabai-v2).
 *
 * SPEC-NATIVE (not a frozen-port parity band — the DC-7 posture): the drill
 * surface has no Java DTO to port; the source of record is the build-lane
 * prereg docs/F182-DRILL-BUILD-PLAN.md (committed WITH the implementation it
 * gates) under the product spec Kognity dossier v1.1 Deep Dive D §8.5 row 1
 * ("5-part randomized draw keyed to the spec-point address … zero stakes,
 * always available, retakable (fresh draw); ships only where spec-tagging
 * exists"). The contracts-first law (MIGRATION_PLAN §4.1) still applies:
 * every drill endpoint validates through these schemas and nothing else.
 *
 * Wire law of the shapes:
 *   - The draw response NEVER carries answer facts. `choices` ships
 *     {label, textMd} only — the bundle's isCorrect flag and solutionMd are
 *     bank-side facts the client cannot see before the attempt (the instant
 *     reveal rides the EVIDENCE response, post-attempt; the F-183 reveal law
 *     formalizes the gating later).
 *   - Attempt evidence is the F-055 SHAPE (ADR-016: score, time, confidence,
 *     flag — immutable attempt evidence across all question sources), keyed
 *     to the drill's own bundle address space (string part ids), NOT the
 *     uuid-keyed DB attempts plane. Zero-stakes law: drill evidence rows are
 *     never read by the gradebook/progress projections (DC-7) and no
 *     attempts/ai_mark_events row is ever written by the drill surface.
 *   - Structured parts are recorded UNGRADED (correct/marksAwarded null) —
 *     the server refuses to invent marks; the learner self-checks against
 *     the revealed solution. MCQ parts are server-graded from the bank.
 */
import { z } from "zod";

/** The serving plane a drill part rides (the census plane law, verbatim). */
export const drillPlaneSchema = z.enum(["official", "topic"]);
export type DrillPlane = z.infer<typeof drillPlaneSchema>;

/** A choice as the CLIENT sees it — never carries the isCorrect flag. */
export const drillChoiceViewSchema = z.object({
  label: z.string().min(1),
  textMd: z.string(),
});
export type DrillChoiceView = z.infer<typeof drillChoiceViewSchema>;

/** One drawn part as the client renders it (content view; no answer facts). */
export const drillPartViewSchema = z.object({
  partId: z.string().min(1),
  questionId: z.string().min(1),
  setId: z.string().min(1),
  plane: drillPlaneSchema,
  order: z.number().int().min(0),
  marks: z.number().int().min(0),
  questionType: z.string().nullable(),
  commandWord: z.string().nullable(),
  problemMd: z.string(),
  choices: z.array(drillChoiceViewSchema).nullable(),
  specPointCodes: z.array(z.string().min(1)).min(1),
});
export type DrillPartView = z.infer<typeof drillPartViewSchema>;

// ── GET /addresses ──────────────────────────────────────────────────────────

export const drillAddressesQuerySchema = z.object({
  course: z.string().min(1),
});
export type DrillAddressesQuery = z.infer<typeof drillAddressesQuerySchema>;

/** One address row of the census of record (the fail-closed floor included). */
export const drillAddressRowSchema = z.object({
  code: z.string().min(1),
  official: z.number().int().min(0),
  topic: z.number().int().min(0),
  combined: z.number().int().min(0),
  drillable: z.boolean(),
});
export type DrillAddressRow = z.infer<typeof drillAddressRowSchema>;

export const drillAddressesResponseSchema = z.object({
  course: z.string().min(1),
  summary: z.object({
    specPointAddresses: z.number().int().min(0),
    covered: z.number().int().min(0),
    drillable: z.number().int().min(0),
    thin: z.number().int().min(0),
    uncovered: z.number().int().min(0),
  }),
  /** Only the DRILLABLE rows — the surface offers exactly these (policy P3). */
  addresses: z.array(drillAddressRowSchema),
});
export type DrillAddressesResponse = z.infer<typeof drillAddressesResponseSchema>;

// ── POST /draw ──────────────────────────────────────────────────────────────

export const drillDrawRequestSchema = z.object({
  course: z.string().min(1),
  /** One spine spec-point address, e.g. "4CH1-1.25" (policy P2). */
  code: z.string().min(1),
  /**
   * Determinism law (P5): (bank, address, recency, seed) -> one draw. A
   * retake is a NEW seed — the fresh-draw guarantee. Absent = the server
   * draws one; the response always carries the seed actually used.
   */
  seed: z.number().int().min(0).max(0xffffffff).optional(),
});
export type DrillDrawRequest = z.infer<typeof drillDrawRequestSchema>;

/**
 * F-185 — the draw's selection disclosure: WHICH policy served this draw —
 * never a learner-state number (the anti-gaming law M6: the picks cannot be
 * replayed or farmed from the response, and the model's weights never ride
 * the wire). `sparseFallback` is true exactly when the sparse-state law (M4)
 * served the random policy; `explorationSlots` is the model policy's
 * uniform-random slot count (0 under the random policy — the whole draw is
 * exploration there). Required key, stable shape (the F-183 additive-field
 * pattern): every draw response carries it.
 */
export const drillDrawSelectionSchema = z.object({
  policy: z.enum(["model", "random"]),
  sparseFallback: z.boolean(),
  explorationSlots: z.number().int().min(0).max(5),
});
export type DrillDrawSelection = z.infer<typeof drillDrawSelectionSchema>;

export const drillDrawResponseSchema = z.object({
  drawId: z.string().uuid(),
  course: z.string().min(1),
  code: z.string().min(1),
  seed: z.number().int().min(0).max(0xffffffff),
  /** The full pool size at the address (before recency filtering). */
  poolSize: z.number().int().min(0),
  /** The pool size after excluding recently-seen parts. */
  freshPoolSize: z.number().int().min(0),
  /** True when the thin-pool fallback (P4) drew from the full pool. */
  usedFallback: z.boolean(),
  /** F-185 — the policy disclosure (policies P1..P6 remain the random law). */
  selection: drillDrawSelectionSchema,
  parts: z.array(drillPartViewSchema),
});
export type DrillDrawResponse = z.infer<typeof drillDrawResponseSchema>;

// ── POST /evidence (the F-055-shaped seam) ─────────────────────────────────

/**
 * The learner's response to one drawn part. `choice` = an MCQ option label
 * (server-graded against the bank's isCorrect); `text` = a structured free
 * response (recorded, never server-graded — correct/marksAwarded stay null).
 */
export const drillResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), label: z.string().min(1) }),
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
]);
export type DrillResponse = z.infer<typeof drillResponseSchema>;

/**
 * The F-055 SHAPE (ADR-016 — score, time, confidence, flag) over the drill
 * address space: one immutable evidence row per (drawId, partId).
 */
export const drillEvidenceRequestSchema = z.object({
  drawId: z.string().uuid(),
  partId: z.string().min(1),
  response: drillResponseSchema,
  responseTimeMs: z.number().int().min(0),
  confidenceLevel: z.number().int().min(1).max(5).optional(),
  selfDoubtFlag: z.boolean().optional(),
});
export type DrillEvidenceRequest = z.infer<typeof drillEvidenceRequestSchema>;

// ── F-183 — the MS-reveal law (drill mode) ─────────────────────────────────

/**
 * One mark-scheme point OF RECORD, verbatim from the corpus of record (the
 * served bundle's per-part `markPoints` — the examiner's own M1..Mn points).
 * `ref` is the corpus point id of record (never re-derived), `textMd` the
 * examiner's text byte-for-byte, `marks` the point's mark value.
 */
export const drillMarkPointSchema = z.object({
  ref: z.string().min(1),
  textMd: z.string().min(1),
  marks: z.number().int().min(0),
});
export type DrillMarkPoint = z.infer<typeof drillMarkPointSchema>;

/**
 * The drill mark scheme view — the corpus of record's MS for one part. There
 * is deliberately NO validationState field: the drill never reads the
 * AI-extracted mark_schemes plane, so no teacher-gating policy applies
 * (F-183 law L2 — instant in drill, never teacher-gated; everywhere else the
 * MarkSchemeReveal gating stays as-is).
 */
export const drillMarkSchemeViewSchema = z.object({
  source: z.literal("corpus-of-record"),
  /** The bundle's answerStatus of record ("linked" today), verbatim. */
  answerStatus: z.string().min(1),
  /** The M1..Mn points in corpus order (never reordered). */
  points: z.array(drillMarkPointSchema).min(1),
  /** Derived: sum of point marks — the bank fail-closes unless it equals the part's marks. */
  marksTotal: z.number().int().min(0),
});
export type DrillMarkSchemeView = z.infer<typeof drillMarkSchemeViewSchema>;

/** One Smart Mark method-credit allocation (the ADR-025 Decision vocabulary,
 * per point: was the method credited — boolean, never invented marks). */
export const drillMethodCreditAllocationSchema = z.object({
  ref: z.string().min(1),
  methodCredited: z.boolean(),
  rationale: z.string().min(1),
});
export type DrillMethodCreditAllocation = z.infer<typeof drillMethodCreditAllocationSchema>;

/**
 * The Smart Mark method-credit verdict on a STRUCTURED drill part — computed
 * against the MS of record at reveal time, Ephemeral (rides the ack; nothing
 * is persisted — the zero-stakes law: no attempts/ai_mark_events, ever).
 */
export const drillMethodCreditViewSchema = z.object({
  engine: z.literal("smart-mark"),
  pipelineVersion: z.string().min(1),
  allocations: z.array(drillMethodCreditAllocationSchema),
  /** Derived: how many points earned method credit. */
  creditsTotal: z.number().int().min(0),
});
export type DrillMethodCreditView = z.infer<typeof drillMethodCreditViewSchema>;

/**
 * The evidence ack + the INSTANT reveal (F-183 law L1): the reveal rides the
 * response to the recorded attempt (never before it — the draw response has
 * no answer facts and no MS). `correct`/`marksAwarded` are null for ungraded
 * structured parts — never zero, never invented.
 *
 * F-183 upgrades the reveal to the REAL mark scheme: `markScheme` carries the
 * corpus-of-record M1..Mn points verbatim (law L3); `methodCredit` carries the
 * Smart Mark verdict on structured parts (law L4). Both are honest nulls when
 * the corpus carries no linked MS for the part / the generator seam is dormant
 * (law L6 — visible to the metric, never paraphrased into a fake MS).
 */
export const drillEvidenceResponseSchema = z.object({
  evidenceId: z.string().uuid(),
  drawId: z.string().uuid(),
  partId: z.string().min(1),
  correct: z.boolean().nullable(),
  marksAwarded: z.number().int().nullable(),
  marksPossible: z.number().int().min(0),
  solutionMd: z.string().nullable(),
  markScheme: drillMarkSchemeViewSchema.nullable(),
  methodCredit: drillMethodCreditViewSchema.nullable(),
});
export type DrillEvidenceResponse = z.infer<typeof drillEvidenceResponseSchema>;

// ── F-186 — the Strength Battle mode (same bank, second mode) ───────────────

/**
 * The battle opponent disclosure. `law` is the honest opponent law of record
 * ("seeded-coin-v1" — a seeded coin, not a model; the model bot is the
 * residual behind the same seam). The opponent shape is a discriminated
 * union ready to grow a "classmate" kind when the matchmaking lane lands —
 * no matchmaking ships in this lane. STRICT: the battle wire refuses
 * undeclared keys — the no-answer-key law is structural (law B7).
 */
export const battleOpponentSchema = z
  .object({
    kind: z.literal("bot"),
    law: z.string().min(1),
  })
  .strict();
export type BattleOpponent = z.infer<typeof battleOpponentSchema>;

export const battleStartRequestSchema = z.object({
  course: z.string().min(1),
  /** One spine spec-point address (policy P2 verbatim — the battle is at an address). */
  code: z.string().min(1),
  /**
   * Determinism law (P5, battle-flavored): (eligible pool, recency, reading,
   * seed) -> one battle card. Absent = the server draws one; the response
   * carries the seed actually used (the bot card is reconstructible from it —
   * the M6 posture).
   */
  seed: z.number().int().min(0).max(0xffffffff).optional(),
});
export type BattleStartRequest = z.infer<typeof battleStartRequestSchema>;

/**
 * The battle start outcome (201). The parts carry NO answer facts (the draw
 * law verbatim — choices ship without isCorrect; the reveal rides the
 * evidence ack only). `clockMs` is the server's battle clock of record;
 * `startedAt` is the draw row's own createdAt stamp — the client countdown
 * is the affordance, the server clock is the law (B5). STRICT: undeclared
 * keys cannot ride the battle start.
 */
export const battleStartResponseSchema = z
  .object({
    drawId: z.string().uuid(),
    course: z.string().min(1),
    code: z.string().min(1),
    seed: z.number().int().min(0).max(0xffffffff),
    /** The BATTLE-ELIGIBLE pool size (choice-gradable parts at the address). */
    poolSize: z.number().int().min(0),
    freshPoolSize: z.number().int().min(0),
    usedFallback: z.boolean(),
    /** The F-185 policy disclosure — battles inherit model-drawn sets verbatim (B1). */
    selection: drillDrawSelectionSchema,
    opponent: battleOpponentSchema,
    clockMs: z.number().int().positive(),
    startedAt: z.string().min(1),
    parts: z.array(drillPartViewSchema),
  })
  .strict();
export type BattleStartResponse = z.infer<typeof battleStartResponseSchema>;

/**
 * One settled part. No answer key: the only reveal facts are the learner's
 * own ack facts (B7) — the shape refuses a label structurally.
 */
export const battleSettlementPartSchema = z
  .object({
    partId: z.string().min(1),
    marks: z.number().int().min(0),
    learner: z
      .object({
        answered: z.boolean(),
        /** False = the answer landed after the server clock (disclosed, scores zero — B5). */
        inClock: z.boolean(),
        correct: z.boolean().nullable(),
        marksAwarded: z.number().int().nullable(),
      })
      .strict(),
    bot: z
      .object({
        correct: z.boolean(),
        latencyMs: z.number().int().min(0),
      })
      .strict(),
    /** "split" = both correct (the no-race law B6 — both sides score the part). */
    wonBy: z.enum(["learner", "bot", "split", "neither"]),
  })
  .strict();
export type BattleSettlementPart = z.infer<typeof battleSettlementPartSchema>;

/**
 * The battle settlement — computed AT READ over the immutable draw + evidence
 * rows + the bot card (ADR-031 posture, law B7): no battle table exists,
 * none is added, and the response writes nothing back. STRICT end to end.
 */
export const battleSettlementResponseSchema = z
  .object({
    drawId: z.string().uuid(),
    course: z.string().min(1),
    code: z.string().min(1),
    generatedAt: z.string().min(1),
    opponent: battleOpponentSchema,
    clock: z
      .object({
        ms: z.number().int().positive(),
        startedAt: z.string().min(1),
        deadline: z.string().min(1),
        /** "all-answered" = every part carried evidence; "clock" = the clock expired (B5). */
        closedBy: z.enum(["all-answered", "clock"]),
      })
      .strict(),
    parts: z.array(battleSettlementPartSchema),
    /** Marks are the currency (law B6 — the seam's own grading currency). */
    score: z
      .object({
        learner: z.number().int().min(0),
        bot: z.number().int().min(0),
        possible: z.number().int().min(0),
      })
      .strict(),
    verdict: z.enum(["win", "loss", "draw"]),
  })
  .strict();
export type BattleSettlementResponse = z.infer<typeof battleSettlementResponseSchema>;
