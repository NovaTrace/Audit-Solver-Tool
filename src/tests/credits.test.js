// Tests for logic/credits.js: totals and requirement progress.

import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit } from "../logic/parser.js";
import {
  creditsOf,
  sumCredits,
  coursesInTerm,
  totalPlannedCredits,
  requirementProgress,
  unplacedRequired,
} from "../logic/credits.js";

const audit = () => parseAudit(structuredClone(sample));
const progressFor = (a, id) => requirementProgress(a).find((r) => r.id === id);

describe("credit totals", () => {
  it("counts unknown credits as 0", () => {
    expect(creditsOf({ credits: null })).toBe(0);
    expect(
      sumCredits([{ credits: 3 }, { credits: null }, { credits: 1 }]),
    ).toBe(4);
  });

  it("lists the courses planned in a term", () => {
    const codes = coursesInTerm(audit(), "FA26").map((c) => c.code);
    expect(codes).toEqual(["CS 3300", "ECE 3210"]); // both registered
  });

  it("adds up every planned course", () => {
    const a = audit();
    expect(totalPlannedCredits(a)).toBe(9); // CS 3300 + ECE 3210 + ECE 2050
    a.courses.cs4500.plannedTerm = "FA27";
    expect(totalPlannedCredits(a)).toBe(12);
  });
});

describe("requirementProgress", () => {
  it("skips complete, in-progress and fixed-course requirements", () => {
    const ids = requirementProgress(audit()).map((r) => r.id);
    expect(ids).not.toContain("cpe-arch"); // complete
    expect(ids).not.toContain("cc-navigate"); // in progress (CS 3300)
    expect(ids).not.toContain("cpe-cs4500"); // a fixed course, not a choice
    expect(ids).toContain("ee-lecture-electives");
  });

  it("counts planned options toward a pool", () => {
    const a = audit();
    expect(progressFor(a, "ee-lecture-electives")).toMatchObject({
      plannedHours: 0,
      plannedCourses: 0,
      done: false,
    });
    a.courses.ece4910.plannedTerm = "FA27"; // a 1–3 credit option, credits 1
    a.courses.ece4020.plannedTerm = "FA27"; // credits unknown
    expect(progressFor(a, "ee-lecture-electives")).toMatchObject({
      plannedHours: 1,
      plannedCourses: 2,
    });
  });

  it("is done once both the hours and course counts are met", () => {
    const a = audit();
    a.courses.ece4910.plannedTerm = "FA27";
    a.courses.ece4910.credits = 3;
    expect(progressFor(a, "ee-lecture-electives").done).toBe(true);
  });

  it("includes rule requirements with nothing planned", () => {
    expect(progressFor(audit(), "math-minor-electives")).toMatchObject({
      type: "rule",
      needHours: 6,
      plannedHours: 0,
    });
  });
});

describe("unplacedRequired", () => {
  it("lists needed courses with no term, not options or registered ones", () => {
    const codes = unplacedRequired(audit()).map((c) => c.code);
    expect(codes).toEqual(["CS 4500", "ECE 3020", "ECE 4891", "ECE 4899"]);
  });

  it("drops a course once it has a term", () => {
    const a = audit();
    a.courses.cs4500.plannedTerm = "FA27";
    expect(unplacedRequired(a).map((c) => c.code)).not.toContain("CS 4500");
  });
});
