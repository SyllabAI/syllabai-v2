/**
 * T-RULE-T2-V8-RETRACT-1 census probe (the t2consume_census_probe.ts form of
 * record): recompute the servable census of the live adopted tree over
 * loadRoster + mapLawCensus + the buildSmePackage admission law.
 */
import { loadRoster, mapLawCensus } from "../apps/api/scripts/cie-phase4-apply";

const roster = loadRoster();
const real = roster.entries.filter((e) => e.cls === "real");
const questions = real.reduce((s, e) => s + e.expectedQuestions, 0);
const parts = real.reduce((s, e) => s + e.expectedParts, 0);
const pkgParts = real.reduce((s, e) => s + e.expectedPackageParts, 0);
const rawQ = real.reduce((s, e) => s + (e as any).rawQuestions, 0);
const rawP = real.reduce((s, e) => s + (e as any).rawParts, 0);
console.log(JSON.stringify({
  questions, parts, pkgParts, rawQ, rawP,
  perBankDrift: real
    .map((e: any) => ({ slug: e.slug, q: e.expectedQuestions, p: e.expectedParts, pkg: e.expectedPackageParts }))
    .filter((x) => ["cie-a-level-chemistry-25", "cie-igcse-science-combined-science-23-physics",
      "cie-igcse-science-combined-science-23-chemistry", "cie-igcse-chemistry-23"].includes(x.slug)),
}, null, 1));
const ml = mapLawCensus(roster);
console.log("mapLaw:", JSON.stringify(ml).slice(0, 400));
