/**
 * T-BOOK-069 run-001 — the strength pack authoring vehicle.
 * Deterministic: emits strength-u1..u4 packs (pack.yaml + 15 mcq-embed blocks each)
 * from the PINNED selection of record (the --select outputs + the agent-confirmation
 * swaps, all bank truth — zero invented refs) + the DB join-set point→chapter map.
 * Zero L3 contact (reads nothing from the DB) — the selection artifacts are inputs.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BOOKS = join(import.meta.dir, "..", "..", "books", "4ch1");

// unit titles (the spec's own names — see PLAN-4CH1 / the subsection table)
const UNIT_TITLE = {
  u1: "Principles of chemistry",
  u2: "Inorganic chemistry",
  u3: "Physical chemistry",
  u4: "Organic chemistry",
};

// the pinned sets of record (post agent-confirmation; see select-*.txt + receipt).
// [ref, point] — point WITHOUT the 4CH1- prefix (the authored specPointRefs form).
const SETS: Record<string, Array<[string, string]>> = {
  u1: [
    ["sme-eq-1-6-ionic-bonding-q1-p1", "1.1"],
    ["sme-eq-1-1-states-of-matter-q16-p1", "1.2"],
    ["sme-eq-1-1-states-of-matter-q5-p1", "1.4"],
    ["sme-eq-1-1-states-of-matter-q17-p1", "1.5C"],
    ["sme-eq-1-2-elements-compounds-and-mixtures-q24-p1", "1.7C"],
    ["sme-eq-1-2-elements-compounds-and-mixtures-q1", "1.8"],
    ["sme-eq-official-4ch1-1c-2021-01-q1-p1", "1.9"],
    ["sme-eq-1-2-elements-compounds-and-mixtures-q10-p1", "1.10"],
    ["sme-eq-1-2-elements-compounds-and-mixtures-q14-p1", "1.11"],
    ["sme-eq-1-3-atomic-structure-q5-p1", "1.14"],
    ["sme-eq-1-3-atomic-structure-q1", "1.15"],
    ["sme-eq-1-3-atomic-structure-q3-p1", "1.16"],
    ["sme-eq-1-3-atomic-structure-q7-p1", "1.17"],
    ["sme-eq-official-4ch1-1c-2020-11-q0-p1", "1.18"],
    // agent pin: q1-p1 (1.19) dropped — duplicate stem of the 1.15 pick;
    // 1.24's official past-paper item takes the slot (1.19 uncovered, disclosed).
    ["sme-eq-official-4ch1-1c-2019-06-q4-p1", "1.24"],
  ],
  u2: [
    ["sme-eq-2-1-group-1-alkali-metals-q0-p1", "2.1"],
    ["sme-eq-2-1-group-1-alkali-metals-q1-p1", "2.2"],
    // agent pin: the 2.4C item was dropped — 2.4C is a cross-boundary code
    // (canonical S2-a) and the bound chapter c12 owns S2-b; the lint's own
    // "avoid the cross-boundary codes" law. 2.20's displacement item takes
    // the slot (2.4C uncovered, disclosed).
    ["sme-eq-2-4-reactivity-series-q6-p1", "2.20"],
    ["sme-eq-2-2-group-7-halogens-q0-p1", "2.5"],
    ["sme-eq-2-2-group-7-halogens-q1-p1", "2.6"],
    ["sme-eq-2-2-group-7-halogens-q7-p1", "2.7"],
    ["sme-eq-2-2-group-7-halogens-q10-p1", "2.8C"],
    ["sme-eq-2-3-gases-in-the-atmosphere-q1-p1", "2.9"],
    ["sme-eq-2-3-gases-in-the-atmosphere-q8-p1", "2.10"],
    ["sme-eq-2-3-gases-in-the-atmosphere-q11-p1", "2.11"],
    ["sme-eq-2-3-gases-in-the-atmosphere-q10-p1", "2.12"],
    ["sme-eq-2-3-gases-in-the-atmosphere-q2-p1", "2.13"],
    ["sme-eq-2-4-reactivity-series-q13-p1", "2.15"],
    ["sme-eq-2-4-reactivity-series-q4-p1", "2.16"],
    ["sme-eq-2-4-reactivity-series-q1-p1", "2.18"],
  ],
  u3: [
    ["sme-eq-3-1-energetics-q0-p1", "3.1"],
    ["sme-eq-3-1-energetics-q11-p1", "3.2"],
    ["sme-eq-3-1-energetics-q2-p1", "3.3"],
    ["sme-eq-3-1-energetics-q10-p1", "3.4"],
    ["sme-eq-3-1-energetics-q3-p1", "3.5C"],
    ["sme-eq-3-1-energetics-q15-p1", "3.7C"],
    ["sme-eq-3-2-rates-of-reaction-q3", "3.9"],
    ["sme-eq-3-2-rates-of-reaction-q1-p1", "3.10"],
    ["sme-eq-3-2-rates-of-reaction-q0-p1", "3.11"],
    ["sme-eq-3-2-rates-of-reaction-q2-p1", "3.12"],
    ["sme-eq-3-2-rates-of-reaction-q6-p1", "3.14C"],
    ["sme-eq-3-2-rates-of-reaction-q12-p1", "3.16"],
    ["sme-eq-3-3-reversible-reactions-and-equilibria-q1-p1", "3.18"],
    ["sme-eq-3-3-reversible-reactions-and-equilibria-q0-p1", "3.19C"],
    // agent pin: q0 (3.20C) dropped — duplicate stem of the 3.19C pick (Haber);
    // 3.22C's gasification item takes the slot (3.20C uncovered, disclosed).
    ["sme-eq-3-3-reversible-reactions-and-equilibria-q8-p1", "3.22C"],
  ],
  u4: [
    ["sme-eq-4-1-introduction-q0-p1", "4.2"],
    ["sme-eq-4-1-introduction-q2", "4.3"],
    ["sme-eq-4-3-alkanes-q2-p1", "4.4"],
    ["sme-eq-1-5-chemical-formulae-equations-calculations-q18-p1", "4.5"],
    ["sme-eq-4-1-introduction-q7-p1", "4.6"],
    // agent pin: q15-p1 (4.8) dropped — duplicate stem of the 4.21 pick ("alkane
    // formula"); the SAME point's q3-p1 (fractional distillation) takes the slot —
    // point coverage unchanged, one item swapped (bank truth, disclosed).
    ["sme-eq-4-2-crude-oil-q3-p1", "4.8"],
    ["sme-eq-4-2-crude-oil-q4", "4.9"],
    ["sme-eq-4-2-crude-oil-q0-p1", "4.12"],
    ["sme-eq-4-2-crude-oil-q1-p1", "4.14"],
    ["sme-eq-4-2-crude-oil-q7-p1", "4.17"],
    ["sme-eq-4-3-alkanes-q0-p1", "4.21"],
    ["sme-eq-4-3-alkanes-q7-p1", "4.22"],
    ["sme-eq-4-4-alkenes-q0-p1", "4.26"],
    ["sme-eq-4-4-alkenes-q7-p1", "4.27"],
    ["sme-eq-4-4-alkenes-q1-p1", "4.28"],
  ],
};

// point → chapter_key binding of record (book_chapters.spec_codes join sets,
// queried 2026-11-02; the ingest law's own truth). Only the pinned points need entries.
const BIND: Record<string, string> = {
  "1.1": "u1:c1", "1.2": "u1:c1", "1.4": "u1:c1", "1.5C": "u1:c1", "1.7C": "u1:c1",
  "1.8": "u1:c2", "1.9": "u1:c2", "1.10": "u1:c2", "1.11": "u1:c2",
  "1.14": "u1:c3", "1.15": "u1:c3", "1.16": "u1:c3", "1.17": "u1:c3",
  "1.18": "u1:c4", "1.24": "u1:c4",
  "2.1": "u2:c11", "2.2": "u2:c11", "2.20": "u2:c14", "2.5": "u2:c12", "2.6": "u2:c12",
  "2.7": "u2:c12", "2.8C": "u2:c12", "2.9": "u2:c13", "2.10": "u2:c13", "2.11": "u2:c13",
  "2.12": "u2:c13", "2.13": "u2:c13", "2.15": "u2:c14", "2.16": "u2:c14", "2.18": "u2:c14",
  "3.1": "u3:c19", "3.2": "u3:c19", "3.3": "u3:c19", "3.4": "u3:c19", "3.5C": "u3:c19",
  "3.7C": "u3:c19", "3.9": "u3:c20", "3.10": "u3:c20", "3.11": "u3:c20", "3.12": "u3:c20",
  "3.14C": "u3:c20", "3.16": "u3:c20", "3.18": "u3:c21", "3.19C": "u3:c21", "3.22C": "u3:c21",
  "4.2": "u4:c22", "4.3": "u4:c22", "4.4": "u4:c22", "4.5": "u4:c22", "4.6": "u4:c22",
  "4.8": "u4:c23", "4.9": "u4:c23", "4.12": "u4:c23", "4.14": "u4:c23", "4.17": "u4:c23",
  "4.21": "u4:c24", "4.22": "u4:c24", "4.26": "u4:c25", "4.27": "u4:c25", "4.28": "u4:c25",
};

let total = 0;
for (const [unit, set] of Object.entries(SETS)) {
  const packName = `strength-${unit}`;
  const dir = join(BOOKS, "packs", packName);
  if (existsSync(dir)) {
    console.error(`REFUSE: ${dir} already exists (idempotence guard — delete first)`);
    process.exit(1);
  }
  mkdirSync(join(dir, "blocks"), { recursive: true });

  // reserved ord band per bound chapter, ascending in pinned order
  const nextOrd = new Map<string, number>();
  const rows: string[] = [];
  set.forEach(([ref, point], i) => {
    const ck = BIND[point];
    if (ck == null) {
      console.error(`REFUSE: point ${point} has no chapter binding (map of record is complete — fix the set)`);
      process.exit(1);
    }
    const ord = (nextOrd.get(ck) ?? 100) + 1;
    nextOrd.set(ck, ord);
    const n = String(i + 1).padStart(2, "0");
    const block = {
      id: `${packName}/b${n}`,
      type: "mcq-embed",
      chapterKey: ck,
      ord,
      pdfPageAnchor: null,
      specPointRefs: [point],
      glossaryRefs: [],
      version: 1,
      content: {},
      checkRefs: [ref],
    };
    writeFileSync(join(dir, "blocks", `b${n}-mcq.json`), JSON.stringify(block, null, 2) + "\n");
    rows.push(`  - {ord: ${ord}, id: "${packName}/b${n}", type: mcq-embed, file: "blocks/b${n}-mcq.json", binds: "${ck}", spec: "${point}"}\n`);
    total += 1;
  });

  const packYaml =
    `# S0 output of record - ${packName} (T-BOOK-069 run-001; ADR-BOOK-0004 + the run-001 amendments)\n` +
    `# unit-level L2 grouping: blocks bind PER ITEM to the chapter owning the item's spec\n` +
    `# point (chapterKey per block); the unit identity rides the pack token + the block id\n` +
    `# prefix. ords occupy the reserved 100+ band of each bound chapter (uq identity law).\n` +
    `chapter: "${packName}"\n` +
    `title: "Unit ${unit.slice(1)} Strength Check — ${UNIT_TITLE[unit as keyof typeof UNIT_TITLE]}"\n` +
    `status: draft # S4 flip is the operator's lever — fires only after the rail-exclusion core lands AND deploys (ADR run-001 amendment 4)\n` +
    `block_schema: "book.block/1"\n` +
    `planned_blocks: ${set.length}\n` +
    `check_density: "one bank item per block; checkRefs = the KG PRIMARY-keyed selection of record (density-audit v2 --select ${unit}; agent-confirmed, duplicate stems pinned out)"\n` +
    `note: "selection artifacts: .syllabai/lane-artifacts/T-BOOK-069/select-${unit}-r1.txt; pdfPageAnchor null (unit-level, no page of record); blocks serve only via the unit-scoped endpoint after the core exclusion + flip"\n` +
    `blocks:\n` +
    rows.join("");
  writeFileSync(join(dir, "pack.yaml"), packYaml);
  console.log(`${packName}: ${set.length} blocks authored`);
}
console.log(`TOTAL: ${total} blocks across 4 strength packs`);
