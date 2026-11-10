// Tests for logic/courseText.js: codes, prereqs and terms.

import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  idFromCode,
  codesIn,
  parsePrereqs,
  termIndex,
  termFromIndex,
  termAfter,
  termLabel,
  shortTermLabel,
  isTermKey,
  termKeyFromName,
  termForDate,
  availabilityByTerm,
} from "../logic/courseText.js";

describe("course codes", () => {
  it("normalizes spacing and case", () => {
    expect(normalizeCode("MATH1350")).toBe("MATH 1350");
    expect(normalizeCode(" ece  3210 ")).toBe("ECE 3210");
    expect(normalizeCode("GPS 1010")).toBe("GPS 1010");
  });

  it("keeps the audit's transfer-credit suffix", () => {
    expect(normalizeCode("PSY 2999TC")).toBe("PSY 2999TC");
    expect(normalizeCode("XFCR1999TC")).toBe("XFCR 1999TC");
  });

  it("leaves shapes it doesn't recognize alone, apart from case", () => {
    expect(normalizeCode("port 30")).toBe("PORT 30");
  });

  it("turns codes into ids", () => {
    expect(idFromCode("MATH1350")).toBe("math1350");
    expect(idFromCode("ECE 3210")).toBe("ece3210");
  });

  it("finds every code in a piece of text, once each", () => {
    expect(codesIn("ECE 2050, and either ECE 2205 or ECE2210")).toEqual([
      "ECE 2050",
      "ECE 2205",
      "ECE 2210",
    ]);
    expect(codesIn("MATH 2350 or MATH 2350")).toEqual(["MATH 2350"]);
    expect(codesIn("Instructor consent")).toEqual([]);
  });

  it("keeps a letter suffix and skips a term that looks like a code", () => {
    expect(codesIn("CS 1150L or PSY 2999TC")).toEqual([
      "CS 1150L",
      "PSY 2999TC",
    ]);
    expect(codesIn("Offered FALL 2026 only")).toEqual([]);
  });
});

describe("parsePrereqs", () => {
  it("reads a single course", () => {
    expect(parsePrereqs("PES 1120")).toEqual({
      groups: [{ anyOf: ["PES 1120"], minGrade: null }],
      notes: [],
    });
  });

  it("splits ', and either ... or' into an AND of ORs", () => {
    expect(
      parsePrereqs("ECE 2050, and either ECE 2205 or ECE 2210").groups,
    ).toEqual([
      { anyOf: ["ECE 2050"], minGrade: null },
      { anyOf: ["ECE 2205", "ECE 2210"], minGrade: null },
    ]);
  });

  it("treats a plain 'and' as two required groups", () => {
    expect(parsePrereqs("MATH 1350 and PES 1110").groups).toEqual([
      { anyOf: ["MATH 1350"], minGrade: null },
      { anyOf: ["PES 1110"], minGrade: null },
    ]);
    expect(parsePrereqs("CS 2060 or ECE 1021 and CS 2080").groups).toEqual([
      { anyOf: ["CS 2060", "ECE 1021"], minGrade: null },
      { anyOf: ["CS 2080"], minGrade: null },
    ]);
  });

  it("shares a grade written once after 'and', but not across ';'", () => {
    const text =
      "CS 2060 and CS 2080 with a grade of C or better; MATH 1350; PES 1110 with a grade of B";
    expect(parsePrereqs(text).groups).toEqual([
      { anyOf: ["CS 2060"], minGrade: "C" },
      { anyOf: ["CS 2080"], minGrade: "C" },
      { anyOf: ["MATH 1350"], minGrade: null },
      { anyOf: ["PES 1110"], minGrade: "B" },
    ]);
  });

  it("reads grades with curly quotes and keeps non-course sentences as notes", () => {
    const text =
      "CS 2060 or ECE 1021 with a grade of “C” or better; CS 2080 with a grade of “C” or better; " +
      "CS 4200 or CS 5200 or ECE 4480 with a grade of “C” or better. College of Engineering students only";
    expect(parsePrereqs(text)).toEqual({
      groups: [
        { anyOf: ["CS 2060", "ECE 1021"], minGrade: "C" },
        { anyOf: ["CS 2080"], minGrade: "C" },
        { anyOf: ["CS 4200", "CS 5200", "ECE 4480"], minGrade: "C" },
      ],
      notes: ["College of Engineering students only"],
    });
  });

  it("reads straight quotes and plus/minus grades", () => {
    expect(
      parsePrereqs('MATH 1360 with a grade of "C-" or better').groups,
    ).toEqual([{ anyOf: ["MATH 1360"], minGrade: "C-" }]);
  });

  it("tells 'not loaded' (null) apart from 'none' (empty)", () => {
    expect(parsePrereqs(null)).toBeNull();
    expect(parsePrereqs("")).toEqual({ groups: [], notes: [] });
    expect(parsePrereqs("Instructor consent")).toEqual({
      groups: [],
      notes: ["Instructor consent"],
    });
  });
});

describe("terms", () => {
  it("orders terms in time", () => {
    expect(termIndex("FA26") < termIndex("SP27")).toBe(true);
    expect(termIndex("SP27") < termIndex("SU27")).toBe(true);
    expect(termFromIndex(termIndex("SU27"))).toBe("SU27");
    expect(termFromIndex(termIndex("FA26") + 1)).toBe("SP27");
  });

  it("finds the term after another, across the new year", () => {
    expect(termAfter("SP27")).toBe("SU27");
    expect(termAfter("SU27")).toBe("FA27");
    expect(termAfter("FA27")).toBe("SP28");
  });

  it("tells real term keys from anything else", () => {
    expect(["FA26", "SP27", "SU27"].every(isTermKey)).toBe(true);
    expect(["FA2026", "WI26", "fa26", "", null, 26].some(isTermKey)).toBe(
      false,
    );
  });

  it("writes the short label used on term pills", () => {
    expect(shortTermLabel("FA26")).toBe("Fall ’26");
    expect(shortTermLabel("SU27")).toBe("Summer ’27");
  });

  it("labels terms", () => {
    expect(termLabel("SU27")).toBe("Summer 2027");
  });

  it("reads the site's term names", () => {
    expect(termKeyFromName("Fall 2026")).toBe("FA26");
    expect(termKeyFromName("spring 2030")).toBe("SP30");
    expect(termKeyFromName("Winter 2026")).toBeNull();
  });

  it("finds the term for a date", () => {
    expect(termForDate(new Date(2026, 0, 15))).toBe("SP26"); // January
    expect(termForDate(new Date(2026, 5, 15))).toBe("SU26"); // June
    expect(termForDate(new Date(2026, 7, 15))).toBe("FA26"); // August
  });

  it("converts the site's availability to term keys, in order", () => {
    const site = {
      "Summer 2027": "unknown",
      "Fall 2026": "available",
      "Spring 2027": "available",
      Nonsense: "available",
    };
    const result = availabilityByTerm(site);
    expect(result).toEqual({
      FA26: "available",
      SP27: "available",
      SU27: "unknown",
    });
    expect(Object.keys(result)).toEqual(["FA26", "SP27", "SU27"]);
  });
});
