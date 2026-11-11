// Node-runtime shims for the API lambda bundle (esbuild --inject module).
//
// The API source is written against Bun's runtime (Bun.CryptoHasher,
// Bun.YAML.parse) per the frozen-core port discipline. The prebuilt Vercel
// lambda runs on Node (the serving lane has always been type LAMBDAS,
// nodejs runtime), so the bundle carries this compat shim. On a real Bun
// runtime the global wins; on Node the equivalent implementations are used:
//   - Bun.CryptoHasher -> node:crypto createHash (same update/digest shape)
//   - Bun.YAML.parse   -> js-yaml load (plain-data parity; the loaders are
//                         fail-closed SHA-256-pinned, so parser drift cannot
//                         pass silently)
// Recovered from the serving-lane archaeology of 2026-11-11 — see
// docs/T-VERCEL-API-SERVING-RECOVERY.md.
// js-yaml types come from the @types/js-yaml devDependency (the package
// itself ships none in this graph); the loaders are fail-closed
// SHA-256-pinned, so parser drift cannot pass silently either way.
import { createHash } from "node:crypto";
import { load as yamlLoad } from "js-yaml";

const NodeCryptoHasher = class CryptoHasher {
  constructor(algorithm: string) {
    this._h = createHash(algorithm);
  }
  _h: ReturnType<typeof createHash>;
  update(data: string | Uint8Array): CryptoHasher {
    this._h.update(data);
    return this;
  }
  digest(encoding?: string): string | Buffer {
    return this._h.digest(encoding as "hex");
  }
};

const NodeYAML = {
  parse: (text: string) => yamlLoad(text),
};

let Bun = globalThis.Bun ?? { CryptoHasher: NodeCryptoHasher, YAML: NodeYAML };

export { Bun };
