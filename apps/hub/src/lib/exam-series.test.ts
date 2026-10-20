/**
 * Exam-series calendar qualification mapping (trace 1a1589078364b76d "CIE
 * lanes to also carry an exam-series calendar") — the hub side of the
 * widened vocabulary: a lane's (level, board) resolves the core calendar's
 * qualification, and the picker's provenance wording follows the board.
 * Board values are the registry's own (lib/board boardOf: absent = Edexcel,
 * "Cambridge International" on the CIE wave rows).
 */
import { describe, expect, it } from "bun:test";
import { calendarProvenanceNote, qualForLevel } from "./exam-series";

describe("qualForLevel — the (level, board) → qualification resolution", () => {
  it("keeps the founding Edexcel mapping byte-identical (board absent)", () => {
    expect(qualForLevel("IAL")).toBe("IAL");
    expect(qualForLevel("IGCSE")).toBe("INTERNATIONAL_GCSE");
  });

  it("keeps the founding Edexcel mapping for an explicit Edexcel board", () => {
    expect(qualForLevel("IAL", "Edexcel")).toBe("IAL");
    expect(qualForLevel("IGCSE", "Edexcel")).toBe("INTERNATIONAL_GCSE");
  });

  it("maps the Cambridge IGCSE lanes to CAMBRIDGE_IGCSE", () => {
    expect(qualForLevel("IGCSE", "Cambridge International")).toBe("CAMBRIDGE_IGCSE");
  });

  it("maps BOTH Cambridge advanced levels to the ONE AS & A Level family", () => {
    expect(qualForLevel("A-Level", "Cambridge International")).toBe("CAMBRIDGE_INTL_AS_A_LEVEL");
    expect(qualForLevel("AS", "Cambridge International")).toBe("CAMBRIDGE_INTL_AS_A_LEVEL");
  });

  it("falls back to Cambridge IGCSE for an unknown Cambridge level (total mapping)", () => {
    expect(qualForLevel("O-Level", "Cambridge International")).toBe("CAMBRIDGE_IGCSE");
  });
});

describe("calendarProvenanceNote — the board-aware citation wording", () => {
  it("names the Pearson key-dates documents for the founding lanes", () => {
    expect(calendarProvenanceNote()).toBe("the official Pearson key-dates documents");
    expect(calendarProvenanceNote("Edexcel")).toBe("the official Pearson key-dates documents");
  });

  it("names the Cambridge key times documents for the CIE lanes", () => {
    expect(calendarProvenanceNote("Cambridge International")).toBe(
      "the official Cambridge International key times documents",
    );
  });
});
