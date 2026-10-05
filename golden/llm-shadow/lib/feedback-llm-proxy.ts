// ShadowFeedbackLlm — the ADR-MIG-0001 Option A capture/replay proxy.
// Implements the FeedbackLlm CONTRACT SHAPE (duck-typed; no apps/api import):
//   available(): boolean
//   generate(systemPrompt, userPrompt, temperature): Promise<string>
// Real seam: apps/api/src/services/smartmark/index.ts :414-419; injection point:
// buildSmartMarkRouters(env, seams) :136-166. Refusal semantics mirror the dormant
// pair (honest refusal, never fabricated prose) — GOLDEN_MASTER §3 dimension 1.
import { createHash } from "node:crypto";
import { REFUSAL_CONTRACT } from "./seam-config.ts";

/** Minimal structural mirror of the real seam (duck-typed on purpose). */
export interface FeedbackLlmContract {
  available(): boolean;
  generate(systemPrompt: string, userPrompt: string, temperature: number): Promise<string>;
}

/** One captured shadow: provenance + output, keyed by prompt hash. */
export interface ShadowRecord {
  promptHash: string;
  temperature: number;
  output: string;
  recordedAt: string;
}

/** Honest replay refusal — the proxy's stand-in for SmartFeedbackGenerationError (same semantics). */
export class ShadowRefusal extends Error {}

export const sha256 = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

/** Replay key: prompt pair + temperature (faithful to the seam's argument surface). */
export const promptKey = (systemPrompt: string, userPrompt: string, temperature: number): string =>
  sha256(`${systemPrompt}\u0000${userPrompt}\u0000${temperature}`);

export interface CaptureSink {
  delegate: FeedbackLlmContract;
  onRecord: (record: ShadowRecord) => void;
}

/**
 * REPLAY mode (default): serves recorded shadows byte-stably; no shadow for a
 * prompt key -> honest refusal; empty recorded output -> refusal (the :889-891
 * empty-response law). Never fabricates.
 * CAPTURE mode (rig/LIVE only — NEVER in CI, doctrine §6 rule 1): forwards to a
 * delegate provider and records the exchange via onRecord.
 */
export class ShadowFeedbackLlm implements FeedbackLlmContract {
  constructor(
    private readonly records: Map<string, ShadowRecord>,
    private readonly capture?: CaptureSink,
  ) {}

  available(): boolean {
    if (this.capture) return this.capture.delegate.available();
    return this.records.size > 0;
  }

  async generate(systemPrompt: string, userPrompt: string, temperature: number): Promise<string> {
    if (this.capture) {
      const output = await this.capture.delegate.generate(systemPrompt, userPrompt, temperature);
      this.capture.onRecord({
        promptHash: promptKey(systemPrompt, userPrompt, temperature),
        temperature,
        output,
        recordedAt: new Date().toISOString(),
      });
      return output;
    }
    const record = this.records.get(promptKey(systemPrompt, userPrompt, temperature));
    if (!record) {
      throw new ShadowRefusal(
        `${REFUSAL_CONTRACT.serviceErrorKind}: no recorded shadow for prompt key ${promptKey(systemPrompt, userPrompt, temperature).slice(0, 12)} — honest refusal (dormant seam law)`,
      );
    }
    if (record.output === null || record.output.trim() === "") {
      throw new ShadowRefusal(`${REFUSAL_CONTRACT.serviceErrorKind}: ${REFUSAL_CONTRACT.serviceEmptyResponseMessage}`);
    }
    return record.output; // byte-stable replay — the determinism law
  }
}
