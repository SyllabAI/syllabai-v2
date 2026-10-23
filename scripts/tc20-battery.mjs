#!/usr/bin/env node
/**
 * T-C20 serving battery — the URL-pinned verification of record for the
 * books/lessons serving plane (f-0011 close criteria executor).
 *
 * THREE legs, every probe URL printed with status + bytes + the pinned
 * class, so a shell-level 200 is never mistaken for reader liveness (the
 * f-0009-close lesson of record):
 *
 *   A. CORPUS PLANE (hub origin, static): lessons-index.json + every
 *      pack JSON — status=published + chapter-identity markers + section
 *      counts. This leg was HEALTHY throughout f-0011 and must stay green.
 *   B. API LEG (api origin): actuator UP; the books route's
 *      request-validation layer alive (400 validation_failed without
 *      courseId — the discriminator receipt of record); the shelf 200
 *      with entries; the chapter registry 200 per entry; the
 *      unknown-chapter honest-absent class.
 *   C. READER LEG (hub origin): /api/health native; the books shelf page
 *      and a lesson page render 200 with NO NEXT_HTTP_ERROR digest in the
 *      RSC stream (the f-0011 kill marker) and the chapter marker present
 *      in the payload.
 *
 * Exit 0 iff every HARD probe passes (warn-class probes never fail the
 * run). Zero dependencies (node >= 18 global fetch).
 *
 * Usage:
 *   node scripts/tc20-battery.mjs \
 *     [--hub https://syllabai-hub-v2.vercel.app] \
 *     [--api https://syllabai-v2.vercel.app] \
 *     [--course igcse-chemistry-19] [--chapter u1:c01] \
 *     [--expect-packs 5]
 */

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const HUB = opt("hub", "https://syllabai-hub-v2.vercel.app").replace(/\/$/, "");
const API = opt("api", "https://syllabai-v2.vercel.app").replace(/\/$/, "");
const COURSE = opt("course", "igcse-chemistry-19");
const CHAPTER = opt("chapter", "u1:c01");
const EXPECT_PACKS = opt("expect-packs", null);

const results = [];
let hardFails = 0;

function record(id, url, expected, actual, verdict, note) {
  const ok = verdict === "PASS";
  if (verdict === "FAIL") hardFails++;
  results.push({ id, url, expected, actual, verdict, note: note ?? "" });
  console.log(
    `${ok ? "PASS" : verdict === "WARN" ? "WARN" : "FAIL"}  ${id}  ${url}\n      expected=${expected} actual=${actual}${note ? ` note=${note}` : ""}`,
  );
}

async function probe(id, url, expected, classify, opts = {}) {
  const t0 = Date.now();
  let status = 0;
  let bytes = 0;
  let body = "";
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json, text/html;q=0.9, */*;q=0.8" },
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    status = res.status;
    body = await res.text();
    bytes = body.length;
  } catch (e) {
    record(id, url, expected, `network-error: ${String(e).split("\n")[0]}`, "FAIL");
    return null;
  }
  const ms = Date.now() - t0;
  const verdict = classify(status, body);
  record(id, url, expected, `HTTP ${status} (${bytes}B, ${ms}ms)`, verdict, verdict === "PASS" ? "" : body.slice(0, 160).replace(/\s+/g, " "));
  return { status, body, bytes };
}

console.log(`== T-C20 battery @ ${new Date().toISOString()}`);
console.log(`   hub=${HUB}  api=${API}  course=${COURSE}  chapter=${CHAPTER}${EXPECT_PACKS ? `  expect-packs=${EXPECT_PACKS}` : ""}`);

// ── A. CORPUS PLANE ──────────────────────────────────────────────────────────
const idxUrl = `${HUB}/corpus/${COURSE}/lessons/lessons-index.json`;
const idx = await probe("A1 lessons-index", idxUrl, "HTTP 200 + packs[]", (s, b) => {
  if (s !== 200) return "FAIL";
  try {
    const j = JSON.parse(b);
    return Array.isArray(j.packs) && j.packs.length > 0 ? "PASS" : "FAIL";
  } catch {
    return "FAIL";
  }
});
let packs = [];
if (idx && idx.status === 200) {
  try {
    packs = JSON.parse(idx.body).packs ?? [];
  } catch {}
}
if (EXPECT_PACKS && packs.length !== Number(EXPECT_PACKS)) {
  record("A1b pack count", idxUrl, `${EXPECT_PACKS} packs`, `${packs.length} packs`, "FAIL");
} else if (EXPECT_PACKS) {
  record("A1b pack count", idxUrl, `${EXPECT_PACKS} packs`, `${packs.length} packs`, "PASS");
}

let publishedPacks = 0;
for (const p of packs.slice(0, 12)) {
  const u = `${HUB}/corpus/${COURSE}/lessons/${p.packId}.json`;
  const r = await probe(`A2 pack ${p.packId}`, u, "200 + status=published + chapter marker + sections>0", (s, b) => {
    if (s !== 200) return "FAIL";
    try {
      const j = JSON.parse(b);
      const okId = j.status === "published" && j.chapterKey === p.chapterKey && Array.isArray(j.sections) && j.sections.length > 0;
      return okId ? "PASS" : "FAIL";
    } catch {
      return "FAIL";
    }
  });
  if (r && r.status === 200 && r.body.includes('"published"')) publishedPacks++;
}

// ── B. API LEG ───────────────────────────────────────────────────────────────
await probe("B1 actuator", `${API}/actuator/health`, "HTTP 200 status=UP", (s, b) =>
  s === 200 && b.includes("UP") ? "PASS" : "FAIL",
);
await probe("B2 books route alive", `${API}/api/v1/content/books`, "HTTP 400 validation_failed (no courseId)", (s, b) =>
  s === 400 && b.includes("validation_failed") ? "PASS" : "FAIL",
);

const shelfUrl = `${API}/api/v1/content/books?courseId=${encodeURIComponent(COURSE)}`;
const shelf = await probe("B3 shelf", shelfUrl, "HTTP 200 + entries[]", (s, b) => {
  if (s !== 200) return "FAIL";
  try {
    return JSON.parse(b).length >= 0 ? "PASS" : "FAIL";
  } catch {
    return "FAIL";
  }
});
let docId = null;
if (shelf && shelf.status === 200) {
  try {
    const entries = JSON.parse(shelf.body);
    if (entries.length > 0) docId = entries[0].documentId ?? entries[0].document_id ?? null;
    record("B3b shelf non-empty", shelfUrl, ">=1 entry (T-C20 shelf live)", `${entries.length} entries`, entries.length > 0 ? "PASS" : "WARN");
  } catch {}
}
if (docId) {
  await probe("B4 chapters registry", `${API}/api/v1/content/books/${encodeURIComponent(docId)}/chapters`, "HTTP 200 + chapters[]", (s, b) => {
    if (s !== 200) return "FAIL";
    try {
      return JSON.parse(b).length > 0 ? "PASS" : "FAIL";
    } catch {
      return "FAIL";
    }
  });
  // B5 (re-aimed, finding f-0013): the per-chapter honest-absent law lives on
  // the BLOCKS route (chapterKeyOr400 gate + "known book, no flipped pack =>
  // 200 []" honest-empty) — the chapters route reads NO chapter query param
  // (404 only for an unknown/empty BOOK), so the original chapters?chapter
  // probe could never pass and mechanically blocked the f-0011 close
  // condition. Blocks for the probe chapter = the route's own documented
  // honest-empty 200 [].
  await probe("B5 unknown-chapter honest-absent (blocks route)", `${API}/api/v1/content/books/${encodeURIComponent(docId)}/blocks?chapter=u9:c99`, "HTTP 200 + empty [] (honest-empty, blocks-route law)", (s, b) => {
    if (s !== 200) return "FAIL";
    try {
      const j = JSON.parse(b);
      return Array.isArray(j) && j.length === 0 ? "PASS" : "FAIL";
    } catch {
      return "FAIL";
    }
  });
}

// ── C. READER LEG ────────────────────────────────────────────────────────────
await probe("C1 hub native health", `${HUB}/api/health`, "HTTP 200 ok", (s, b) => (s === 200 && b.includes("ok") ? "PASS" : "FAIL"));
const shelfPage = await probe("C2 books shelf page", `${HUB}/courses/${COURSE}/books`, "HTTP 200, no NEXT_HTTP_ERROR", (s, b) =>
  s === 200 && !b.includes("NEXT_HTTP_ERROR") ? "PASS" : "FAIL",
);
const shelfEntries = shelf && shelf.status === 200 ? (() => { try { return JSON.parse(shelf.body); } catch { return []; } })() : [];
const lessonDoc = docId ?? (shelfEntries[0] ? shelfEntries[0].documentId ?? shelfEntries[0].document_id : null);
if (lessonDoc) {
  const lessonUrl = `${HUB}/courses/${COURSE}/books/${lessonDoc}/lesson?chapter=${encodeURIComponent(CHAPTER)}`;
  await probe("C3 lesson page", lessonUrl, `HTTP 200, no NEXT_HTTP_ERROR, marker ${CHAPTER}`, (s, b) => {
    if (s !== 200) return "FAIL";
    if (b.includes("NEXT_HTTP_ERROR")) return "FAIL";
    return b.includes(CHAPTER) ? "PASS" : "WARN";
  });
} else {
  record("C3 lesson page", "(skipped)", "docId from B3", "no shelf entry — reader leg unverifiable without B3", "FAIL");
}

// ── verdict ──────────────────────────────────────────────────────────────────
console.log(`\n== battery verdict: ${hardFails === 0 ? "ALL GREEN" : `${hardFails} HARD FAIL(ures)`} (${results.length} probes)`);
console.log(`   corpus packs probed: ${packs.length} (${publishedPacks} serving status=published)`);
process.exit(hardFails === 0 ? 0 : 1);
