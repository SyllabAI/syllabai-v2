/**
 * subject-identity.test.ts — unit semantics for the subject identity lib.
 *
 * T-HUB-COURSES-UI-1 run-001. The REGISTRY-coverage law (every course row
 * resolves, no stale mappings) lives in scripts/verify_subject_identity.ts
 * (build gate, runs on real content/courses.json). THIS file owns the pure
 * semantics of the lib itself: resolution order, alias folding, family
 * order, glyph/colour structural integrity, and the glyph component loop
 * closure. Runs under `bun test` from apps/hub.
 */
import { describe, expect, test } from "bun:test";

import {
  CANONICAL_SUBJECTS,
  FAMILY_LABELS,
  SUBJECT_FAMILIES,
  SUBJECT_GLYPH_IDS,
  SUBJECT_IDENTITY,
  familyRank,
  getSubjectIdentity,
  resolveSubjectKey,
  subjectFamily,
} from "./subject-identity";
import { SubjectGlyph, SUBJECT_GLYPH_COMPONENT_COUNT as GLYPH_COMPONENTS } from "@/components/icons/subject-glyph";

const HEX = /^#[0-9a-f]{6}$/;

describe("subject-identity resolution", () => {
  test("exact canonical key resolves", () => {
    expect(getSubjectIdentity("Chemistry")?.glyph).toBe("chemistry");
    expect(resolveSubjectKey("Chemistry")).toBe("Chemistry");
  });

  test("case variants fold onto the canonical key (registry has ICT and Ict)", () => {
    expect(resolveSubjectKey("Ict")).toBe("ICT");
    expect(resolveSubjectKey("ict")).toBe("ICT");
    expect(getSubjectIdentity("Ict")?.glyph).toBe("ict");
  });

  test("registry alias Mathematics folds onto Maths", () => {
    expect(resolveSubjectKey("Mathematics")).toBe("Maths");
    expect(getSubjectIdentity("Mathematics")?.family).toBe("maths-cs");
    expect(getSubjectIdentity("Mathematics")?.glyph).toBe("maths");
  });

  test("unknown subject resolves to null (never throws, never invents)", () => {
    expect(getSubjectIdentity("Astronomy")).toBeNull();
    expect(resolveSubjectKey("")).toBeNull();
    expect(subjectFamily("Astronomy")).toBeNull();
  });

  test("English shares the language glyph; Literature keeps its own", () => {
    expect(getSubjectIdentity("English")?.glyph).toBe("english-language");
    expect(getSubjectIdentity("English Language")?.glyph).toBe("english-language");
    expect(getSubjectIdentity("English Literature")?.glyph).toBe("english-literature");
  });
});

describe("subject-identity structure", () => {
  test("18 canonical subjects, all resolving consistently", () => {
    expect(CANONICAL_SUBJECTS.length).toBe(18);
    for (const key of CANONICAL_SUBJECTS) {
      expect(resolveSubjectKey(key)).toBe(key);
      expect(getSubjectIdentity(key)?.subject).toBe(key);
    }
  });

  test("family order is the approved mockup's group order", () => {
    expect([...SUBJECT_FAMILIES]).toEqual([
      "sciences",
      "maths-cs",
      "english",
      "business-econ",
      "humanities",
    ]);
    expect(FAMILY_LABELS["maths-cs"]).toBe("Maths & Computer Science");
    expect(familyRank("sciences")).toBeLessThan(familyRank("maths-cs"));
    expect(familyRank("humanities")).toBe(SUBJECT_FAMILIES.length - 1);
  });

  test("Environmental Management sits in Humanities (approved mockup placement)", () => {
    expect(subjectFamily("Environmental Management")).toBe("humanities");
    expect(subjectFamily("Science")).toBe("sciences");
    expect(subjectFamily("Accounting")).toBe("business-econ");
  });

  test("every identity carries a valid colour pair", () => {
    for (const id of Object.values(SUBJECT_IDENTITY)) {
      expect(HEX.test(id.tile.bg)).toBe(true);
      expect(HEX.test(id.tile.fg)).toBe(true);
    }
  });

  test("17 glyph ids, unique, all with a component (loop closed both ways)", () => {
    expect(SUBJECT_GLYPH_IDS.length).toBe(17);
    expect(new Set(SUBJECT_GLYPH_IDS).size).toBe(17);
    expect(GLYPH_COMPONENTS).toBe(SUBJECT_GLYPH_IDS.length);
    // every identity's glyph id is a known id
    for (const id of Object.values(SUBJECT_IDENTITY)) {
      expect(SUBJECT_GLYPH_IDS as readonly string[]).toContain(id.glyph);
    }
  });

  test("SubjectGlyph renders without throwing for every glyph id", () => {
    // smoke: the resolver never crashes across the full set
    for (const g of SUBJECT_GLYPH_IDS) expect(() => SubjectGlyph({ glyph: g })).not.toThrow();
  });
});
