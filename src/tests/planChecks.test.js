// Tests for logic/planChecks.js: warnings about the plan (a course in a
// term it isn't offered, a semester's credit load) and the one-line
// summary. Testing only, not a site element.

import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit } from "../logic/parser.js";
import {
  offeredWarning,
  courseWarnings,
  termWarning,
  planProblems,
  planCheckText,
} from "../logic/planChecks.js";
import { makeRegistered } from "./helpers.js";

const audit = () => parseAudit(structuredClone(sample));

// In the sample, ECE 3020 runs in Fall only: its schedule says
// "available" for FA26 and FA27 and "unknown" for the other terms.
// Give a course exactly `credits` so a term's total is easy to set.
function place(a, id, term, credits) {
  a.courses[id].plannedTerm = term;
  if (credits !== undefined) a.courses[id].credits = credits;
}

describe("offeredWarning", () => {
  it("is quiet for a term the schedule lists, and for an unplanned course", () => {
    const a = audit();
    expect(offeredWarning(a.courses.ece3020)).toBe("");
    place(a, "ece3020", "FA27");
    expect(offeredWarning(a.courses.ece3020)).toBe("");
  });

  it("warns when the schedule has no section that term", () => {
    const a = audit();
    place(a, "ece3020", "SP27");
    expect(offeredWarning(a.courses.ece3020)).toBe(
      "Not scheduled for Spring 2027 (usually offered Fall)",
    );
  });

  it("falls back on the usual seasons when the schedule doesn't cover the term", () => {
    const a = audit();
    a.courses.ece3020.availability = {}; // nothing published
    place(a, "ece3020", "SP27");
    expect(offeredWarning(a.courses.ece3020)).toBe(
      "Usually offered Fall, not Spring",
    );
    place(a, "ece3020", "FA27");
    expect(offeredWarning(a.courses.ece3020)).toBe("");

    a.courses.ece3020.termsOffered = []; // nothing known at all
    place(a, "ece3020", "SP27");
    expect(offeredWarning(a.courses.ece3020)).toBe("");
  });

  it("is quiet for a registered course: it has a section", () => {
    const a = parseAudit(
      makeRegistered(structuredClone(sample), "ece3020", "SP27"),
    );
    expect(a.courses.ece3020.plannedTerm).toBe("SP27");
    expect(offeredWarning(a.courses.ece3020)).toBe("");
  });
});

describe("courseWarnings", () => {
  it("lists the prerequisite warning and the offered warning together", () => {
    const a = audit();
    place(a, "ece3020", "SP27"); // needs ECE 2050 first; not offered in spring
    expect(courseWarnings(a, a.courses.ece3020)).toEqual([
      "Check prerequisites: needs ECE 2050 first; needs ECE 2205 or ECE 2210 first",
      "Not scheduled for Spring 2027 (usually offered Fall)",
    ]);
    expect(courseWarnings(a, a.courses.cs4500)).toEqual([]); // not planned
  });
});

describe("termWarning", () => {
  it("warns over 18 credits, and not for a light or empty term", () => {
    const a = audit();
    expect(termWarning(a, "FA27")).toBe(""); // nothing planned
    place(a, "cs4500", "FA27", 3);
    expect(termWarning(a, "FA27")).toBe(""); // light is fine
    place(a, "cs4500", "FA27", 18);
    expect(termWarning(a, "FA27")).toBe("");
    place(a, "cs4500", "FA27", 19);
    expect(termWarning(a, "FA27")).toBe("Over 18 credits");
  });
});

describe("planProblems and planCheckText", () => {
  it("says nothing while nothing is planned", () => {
    expect(planProblems(audit()).planned).toBe(0);
    expect(planCheckText(audit())).toBe("");
  });

  it("counts each kind of problem and writes them as one line", () => {
    const a = audit();
    place(a, "ece3020", "SP27", 3); // before prereqs, and not offered
    place(a, "cs4500", "FA27", 19); // before prereqs; an overloaded term
    expect(planProblems(a)).toEqual({
      planned: 2,
      prereqs: 2,
      notOffered: 1,
      heavy: 1, // FA27
    });
    expect(planCheckText(a)).toBe(
      "Plan check: 2 courses before prerequisites · 1 course in a term not offered · 1 semester over 18 credits",
    );
  });

  it("says so when the plan has no problems", () => {
    const a = audit();
    a.courses.ece4891.prereqs = { groups: [], notes: [] };
    place(a, "ece4891", "FA27", 12);
    expect(planCheckText(a)).toBe("Plan check: no problems found");
  });
});
