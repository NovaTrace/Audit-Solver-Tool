// Tests for logic/prereqs.js: warning when a course is planned before
// what it needs. Testing only, not a site element.

import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit } from "../logic/parser.js";
import { prereqProblems, prereqWarning, unlocks } from "../logic/prereqs.js";
import { makeRegistered } from "./helpers.js";

// The sample, with CS 4500 given simple needs for these tests:
//   prereqs: (CS 3300 or ECE 3020) AND MATH 3400      coreq: ECE 3210
// CS 3300, ECE 3020 and ECE 3210 are unplaced; MATH 3400 is completed.
function audit() {
  const a = parseAudit(structuredClone(sample));
  a.courses.cs4500.prereqs = {
    groups: [
      { anyOf: ["CS 3300", "ECE 3020"], minGrade: null },
      { anyOf: ["MATH 3400"], minGrade: "C" },
    ],
    notes: [],
  };
  a.courses.cs4500.coreqs = {
    groups: [{ anyOf: ["ECE 3210"], minGrade: null }],
    notes: [],
  };
  a.courses.cs4500.plannedTerm = "FA27";
  return a;
}
const problems = (a) => prereqProblems(a, a.courses.cs4500);

describe("prereqProblems", () => {
  it("lists each group nothing satisfies; a completed course satisfies one", () => {
    expect(problems(audit())).toEqual([
      { kind: "prereq", anyOf: ["CS 3300", "ECE 3020"] },
      { kind: "coreq", anyOf: ["ECE 3210"] },
    ]); // no MATH 3400: it's completed
  });

  it("needs a prerequisite in an EARLIER term; any one of the group will do", () => {
    const a = audit();
    a.courses.ece3020.plannedTerm = "FA27"; // the same term: too late
    expect(problems(a)[0]).toEqual({
      kind: "prereq",
      anyOf: ["CS 3300", "ECE 3020"],
    });
    a.courses.ece3020.plannedTerm = "SP27"; // the term before
    expect(problems(a).map((p) => p.kind)).toEqual(["coreq"]);
  });

  it("lets a corequisite share the term, but not come later", () => {
    const a = audit();
    a.courses.ece3210.plannedTerm = "FA27";
    expect(problems(a).map((p) => p.kind)).toEqual(["prereq"]);
    a.courses.ece3210.plannedTerm = "SP28";
    expect(problems(a).map((p) => p.kind)).toEqual(["prereq", "coreq"]);
  });

  it("counts a registered course by the term it's registered in", () => {
    const a = parseAudit(
      makeRegistered(structuredClone(sample), "cs3300", "FA26"),
    );
    Object.assign(a.courses.cs4500, audit().courses.cs4500);
    a.courses.cs3300.plannedTerm = null; // even if unplaced on the plan
    expect(problems(a).map((p) => p.kind)).toEqual(["coreq"]);
  });

  it("treats a course that isn't on the audit as not taken", () => {
    const a = audit();
    a.courses.cs4500.prereqs.groups = [{ anyOf: ["ZZ 1000"], minGrade: null }];
    expect(problems(a)[0].anyOf).toEqual(["ZZ 1000"]);
  });

  it("says nothing for a course that's unplanned, registered, or has no details", () => {
    const a = audit();
    a.courses.cs4500.plannedTerm = null;
    expect(problems(a)).toEqual([]);

    a.courses.cs4500.plannedTerm = "FA27";
    a.courses.cs4500.status = "registered"; // the university let them in
    expect(problems(a)).toEqual([]);

    a.courses.cs4500.status = "needed";
    a.courses.cs4500.prereqs = null; // details never loaded
    a.courses.cs4500.coreqs = null;
    expect(problems(a)).toEqual([]);
  });
});

describe("unlocks", () => {
  it("lists the courses that need this one, as a prerequisite or alongside", () => {
    const a = audit(); // CS 4500 needs CS 3300 or ECE 3020, and ECE 3210
    expect(unlocks(a, a.courses.cs3300)).toEqual(["CS 4500"]);
    expect(unlocks(a, a.courses.ece3210)).toEqual(["CS 4500"]); // a coreq
    // The sample's own details: ECE 3020 needs ECE 2050
    expect(unlocks(a, a.courses.ece2050)).toEqual(["ECE 3020"]);
    expect(unlocks(a, a.courses.cs4500)).toEqual([]);
  });

  it("leaves out courses that are already completed", () => {
    const a = audit();
    expect(unlocks(a, a.courses.ece3020)).toEqual(["CS 4500"]);
    a.courses.cs4500.status = "completed";
    expect(unlocks(a, a.courses.ece3020)).toEqual([]);
  });
});

describe("prereqWarning", () => {
  it("writes the problems as one line, or nothing", () => {
    const a = audit();
    expect(prereqWarning(a, a.courses.cs4500)).toBe(
      "Check prerequisites: needs CS 3300 or ECE 3020 first; needs ECE 3210 in the same term or earlier",
    );
    a.courses.cs3300.plannedTerm = "FA26";
    a.courses.ece3210.plannedTerm = "FA26";
    expect(prereqWarning(a, a.courses.cs4500)).toBe("");
  });
});
