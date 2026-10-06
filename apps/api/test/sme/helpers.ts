/**
 * Shared test helper for the SME module tests (T-MIG-033 tranche 3). NOT a
 * test file (bun test only picks up *.test.ts). Mirrors
 * apps/api/test/assessment/helpers.ts.
 *
 * Carries: an in-memory classic-ZIP builder (stored + deflated entries,
 * controllable flags/CRC/local-header honesty), a tx-forwarding fakeSql shim
 * (the replace flow's transaction law), package-question factories, and a
 * deterministic clock.
 */
import { deflateRawSync } from "node:zlib";
import type { Route } from "../assessment/helpers";
import { fakeSql } from "../assessment/helpers";
import type { SqlFn } from "../../src/services/assessment/sql";
import type { TxSqlFn } from "../../src/services/sme";
import type { SmeQuestion } from "../../src/services/sme/package";

export const NODE_4CH1 = "20000000-0000-4000-8000-000000000001";
export const NODE_EXTRA = "20000000-0000-4000-8000-000000000002";

export const clock = {
  newId: (() => {
    let n = 100;
    return () => `7e571d00-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  })(),
  now: () => new Date("2026-10-06T10:00:00Z"),
};

/** fakeSql + a transaction() that forwards to the base fn (adapter shim). */
export function txSql(routes: Route[]): TxSqlFn {
  const inner = fakeSql(routes);
  return Object.assign(inner as unknown as TxSqlFn, {
    transaction: async <T,>(body: (tx: SqlFn) => Promise<T>): Promise<T> => body(inner),
  });
}

/** minimal valid package question (MCQ) */
export function mcq(overrides: Partial<Record<string, unknown>> = {}): SmeQuestion {
  return {
    externalRef: "4CH1-Q1",
    questionType: "MCQ_SINGLE",
    stem: "What is X?",
    marks: 1,
    difficulty: 3,
    difficultySource: "SME",
    expectedTimeSeconds: 60,
    commandWord: "State",
    primaryTopicCode: "4CH1-S1-c",
    secondaryTopicCodes: null,
    specPoints: null,
    sourcePaper: null,
    smeSet: null,
    smeDifficulty: null,
    options: [
      { label: "A", text: "wrong", isCorrect: false },
      { label: "B", text: "right", isCorrect: true },
    ],
    solutionMd: "because X",
    parts: null,
    ...overrides,
  } as unknown as SmeQuestion;
}

/** minimal valid package question (structured, two 2-mark parts) */
export function structured(overrides: Partial<Record<string, unknown>> = {}): SmeQuestion {
  return {
    externalRef: "4CH1-Q2",
    questionType: "STRUCTURED",
    stem: "Explain Y.",
    marks: 4,
    difficulty: 4,
    difficultySource: "SME",
    expectedTimeSeconds: 180,
    commandWord: "Explain",
    primaryTopicCode: "4CH1-S1-c",
    secondaryTopicCodes: ["4CH1-S2-a"],
    specPoints: [{ code: "4CH1-1.15", role: "PRIMARY", provenance: null }],
    sourcePaper: null,
    smeSet: null,
    smeDifficulty: null,
    options: null,
    solutionMd: null,
    parts: [
      { label: "(a)", prompt: "part a", marks: 2, commandWord: null, solutionMd: "sol a", options: null },
      { label: "(b)", prompt: "part b", marks: 2, commandWord: null, solutionMd: null, options: null },
    ],
    ...overrides,
  } as unknown as SmeQuestion;
}

// ── ZIP builder (classic layout: local headers + central dir + EOCD) ───────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipInput {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  flags?: number;
  crcOverride?: number;
  lieLocalSizes?: boolean; // data-descriptor shape: zeros in the local header
}

export function buildZip(inputs: ZipInput[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const cat = (parts: Uint8Array[]) => {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };

  let offset = 0;
  for (const input of inputs) {
    const method = input.method ?? 8;
    const raw = input.data;
    const stored = method === 0;
    const comp = stored ? raw : deflateRawSync(raw);
    const crc = input.crcOverride ?? crc32(raw);
    const nameBytes = enc.encode(input.name);
    const lfhExtraLen = 0;
    const localSize = 30 + nameBytes.length + lfhExtraLen + comp.length;

    const flags = input.flags ?? 0;
    const local = cat([
      u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0),
      u32(crc),
      u32(input.lieLocalSizes ? 0 : comp.length),
      u32(input.lieLocalSizes ? 0 : raw.length),
      u16(nameBytes.length), u16(lfhExtraLen),
      nameBytes, comp,
    ]);
    chunks.push(local);

    central.push(cat([
      u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      nameBytes,
    ]));
    offset += localSize;
  }
  const localBlob = cat(chunks);
  const centralBlob = cat(central);
  const eocd = cat([
    u32(0x06054b50), u16(0), u16(0),
    u16(inputs.length), u16(inputs.length),
    u32(centralBlob.length), u32(localBlob.length), u16(0),
  ]);
  return cat([localBlob, centralBlob, eocd]);
}

export function pkgJson(questions: unknown, extra: Record<string, unknown> = {}): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ packageVersion: "1.0", corpusVersion: "cor-9", source: "sme-eq-test-1", questions, ...extra }),
  );
}
