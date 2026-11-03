/**
 * Vercel Node-runtime shim — deploy-bundle ONLY (never imported by app code,
 * tests or the composition root). The app's two static-resource modules
 * (learner-me/nba-concept-graph.ts boot-time concept graph + teacher
 * snapshot.ts) use Bun.CryptoHasher / Bun.YAML because they were written
 * for the bun runtime; on the Vercel Node lambda those globals are absent.
 * This shim installs minimal, faithful equivalents BEFORE the app module
 * evaluates (ESM import order does the sequencing — this file must stay
 * the FIRST import in vercel-entry.ts).
 *   - CryptoHasher: createHash parity for ("sha256", update, digest("hex")/digest())
 *   - YAML.parse:   the `yaml` package's core parse (static packaged
 *                   resources only — never user input)
 */
import { createHash } from "node:crypto";
import { parse as yamlParse } from "yaml";

const g = globalThis as Record<string, unknown>;
if (!g.Bun) {
  class CryptoHasher {
    private h: ReturnType<typeof createHash>;
    constructor(algorithm: string) {
      this.h = createHash(algorithm);
    }
    update(data: string | Uint8Array): this {
      this.h.update(data);
      return this;
    }
    digest(encoding?: string): string | Buffer {
      return encoding ? this.h.digest(encoding as BufferEncoding) : this.h.digest();
    }
  }
  g.Bun = {
    version: "0.0.0-vercel-node-shim",
    CryptoHasher,
    YAML: { parse: (text: string): unknown => yamlParse(text) },
  };
}
