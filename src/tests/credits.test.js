// Tests for src/logic/credits.js: credit totals and requirement progress.

import { describe, it, expect } from "vitest";
import sample from "./fixtures/test-audit.json";
import { parseAudit } from "../logic/parser.js";
import {
  creditsOf,
  sumCredits,
  coursesInTerm,
  requirementProgress,
  unplacedRequired,
  creditSummary,
  isInProgress,
  categoryProgress,
  requirementTotals,
  otherRequirements,
} from "../logic/credits.js";
import { NOV_2026, makeRegistered } from "./helpers.js";

const audit = () => parseAudit(structuredClone(sample));
// The test audit with one course registered in a term ("today" is Nov 5, 2026).
const registeredIn = (id, term) =>
  parseAudit(makeRegistered(structuredClone(sample), id, term), null, NOV_2026);
const progressFor = (a, id) => requirementProgress(a).find((r) => r.id === id);

describe("credit totals", () => {
  it("counts unknown credits as 0", () => {
    expect(creditsOf({ credits: null })).toBe(0);
    expect(
      sumCredits([{ credits: 3 }, { credits: null }, { credits: 1 }]),
    ).toBe(4);
  });

  it("lists the courses planned in a term", () => {
    const a = audit();
    a.courses.cs4500.plannedTerm = "FA26";
    a.courses.ece3020.plannedTerm = "FA26";
    const codes = coursesInTerm(a, "FA26").map((c) => c.code);
    expect(codes).toEqual(["CS 4500", "ECE 3020"]);
  });
});

describe("requirementProgress", () => {
  it("skips complete, in-progress and fixed-course requirements", () => {
    const a = audit();
    a.requirements.find((r) => r.id === "cc-navigate").status = "in-progress";
    const ids = requirementProgress(a).map((r) => r.id);
    expect(ids).not.toContain("cpe-arch"); // complete
    expect(ids).not.toContain("cc-navigate"); // in progress
    expect(ids).not.toContain("cpe-cs4500"); // a single course, not a choice
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

  it("includes an unfinished either/or course requirement", () => {
    // "ECE 4480 OR CS 4200", as if neither had been taken yet
    const data = structuredClone(sample);
    const arch = data.requirements.find((r) => r.id === "cpe-arch");
    Object.assign(arch, { status: "needs", applied: [], needCourses: null });
    data.requirements.find((r) => r.id === "ee-lecture-electives").applied = [];
    Object.assign(data.courses.ece4480, { status: "option", attempts: [] });
    const a = parseAudit(data);

    expect(progressFor(a, "cpe-arch")).toMatchObject({
      needCourses: 1, // one of the two, even with no count on the audit
      plannedCourses: 0,
      done: false,
    });
    a.courses.cs4200.plannedTerm = "FA27";
    expect(progressFor(a, "cpe-arch")).toMatchObject({
      plannedCourses: 1,
      done: true,
    });
  });

  it("counts planned courses listed as a rule's options (added by hand)", () => {
    const data = structuredClone(sample);
    data.courses.math3110 = {
      id: "math3110",
      code: "MATH 3110",
      credits: 3,
      status: "option",
      requirementIds: ["math-minor-electives"],
      custom: true,
    };
    data.requirements
      .find((r) => r.id === "math-minor-electives")
      .options.push("MATH 3110");
    const a = parseAudit(data);
    expect(progressFor(a, "math-minor-electives").plannedHours).toBe(0);
    a.courses.math3110.plannedTerm = "FA27";
    expect(progressFor(a, "math-minor-electives")).toMatchObject({
      plannedHours: 3,
      needHours: 6,
      done: false,
    });
  });

  it("keeps a switched-off requirement in the list, marked", () => {
    const a = audit();
    expect(progressFor(a, "ee-lecture-electives").ignored).toBe(false);
    a.requirements.find((r) => r.id === "ee-lecture-electives").ignored = true;
    expect(progressFor(a, "ee-lecture-electives").ignored).toBe(true);
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
    // The test audit has no registered courses; register ECE 2050.
    const data = makeRegistered(structuredClone(sample), "ece2050", "SP27");
    const codes = unplacedRequired(parseAudit(data)).map((c) => c.code);
    expect(codes).toEqual([
      "CS 3300",
      "CS 4500",
      "ECE 3020",
      "ECE 3210",
      "ECE 4891",
      "ECE 4899",
    ]);
  });

  it("drops a course whose requirement the student switched off", () => {
    const a = audit();
    a.requirements.find((r) => r.id === "cpe-cs4500").ignored = true;
    const codes = unplacedRequired(a).map((c) => c.code);
    expect(codes).not.toContain("CS 4500");
    expect(codes).toContain("ECE 3020"); // the others still count
  });

  it("drops a course once it has a term", () => {
    const a = audit();
    a.courses.cs4500.plannedTerm = "FA27";
    expect(unplacedRequired(a).map((c) => c.code)).not.toContain("CS 4500");
  });
});

describe("credit summary (plan panel headline)", () => {
  it("starts from the audit's hours with nothing planned", () => {
    const s = creditSummary(audit());
    expect(s).toEqual({
      earned: 88,
      inProgress: 0,
      planned: 0,
      required: 128,
    });
  });

  it("counts courses placed in a semester as planned", () => {
    const a = audit();
    a.courses.cs4500.plannedTerm = "FA27";
    a.courses.ece3020.plannedTerm = "FA26";
    const s = creditSummary(a);
    expect(s.planned).toBe(6);
  });

  it("counts this term's registered course as in progress, a later one as planned", () => {
    const a = registeredIn("cs4500", "FA26"); // "today" is in Fall 2026
    expect(creditSummary(a, NOV_2026)).toMatchObject({
      inProgress: 3,
      planned: 0,
    });
    const b = registeredIn("cs4500", "SP27"); // registered, not started
    expect(creditSummary(b, NOV_2026)).toMatchObject({
      inProgress: 0,
      planned: 3,
    });
  });

  it("still counts hours the audit calls in progress that no course in the plan explains", () => {
    const a = registeredIn("cs4500", "FA26");
    a.student.hoursInProgress = 5; // the audit knows of 2 more
    expect(creditSummary(a, NOV_2026).inProgress).toBe(5);
  });

  it("has no required total when the audit doesn't give one", () => {
    const a = audit();
    a.student.hoursRequired = null;
    expect(creditSummary(a).required).toBeNull();
  });
});

describe("isInProgress", () => {
  it("is true only for a course registered in the current term (or an earlier one)", () => {
    const now = (id, term) =>
      isInProgress(registeredIn(id, term).courses[id], NOV_2026);
    expect(now("cs4500", "FA26")).toBe(true); // this term
    expect(now("cs4500", "SP27")).toBe(false); // next term

    // Old audit: still registered in a term that has ended.
    const old = makeRegistered(structuredClone(sample), "cs4500", "SU26");
    expect(isInProgress(old.courses.cs4500, NOV_2026)).toBe(true);
    // Goes by the registered term, not the plan.
    const moved = registeredIn("cs4500", "SP27").courses.cs4500;
    moved.plannedTerm = "FA26";
    expect(isInProgress(moved, NOV_2026)).toBe(false);

    const a = audit();
    a.courses.cs4500.plannedTerm = "FA26"; // planned there, not registered
    expect(isInProgress(a.courses.cs4500, NOV_2026)).toBe(false);
    expect(isInProgress(a.courses.math3400, NOV_2026)).toBe(false); // completed
  });
});

describe("category progress (requirement category bars)", () => {
  const section = (a, name) =>
    categoryProgress(a, NOV_2026).find((g) => g.section === name);

  it("calls a requirement in progress only when its course is being taken now", () => {
    const core = "Computer Engineering - Core";
    expect(section(registeredIn("cs4500", "FA26"), core)).toMatchObject({
      inProgress: 1,
      planned: 0,
    });
    expect(section(registeredIn("cs4500", "SP27"), core)).toMatchObject({
      inProgress: 0,
      planned: 1,
    });
  });

  it("does the same when the audit itself says in progress", () => {
    // The audit marks a requirement in progress once any registered course
    // covers it, whatever its term.
    const covered = (term) => {
      const a = registeredIn("cs4500", term);
      const req = a.requirements.find((r) => r.id === "cpe-cs4500");
      req.status = "in-progress";
      req.applied = [{ code: "CS 4500", hours: 3 }];
      return section(a, "Computer Engineering - Core");
    };
    expect(covered("FA26")).toMatchObject({ inProgress: 1, planned: 0 });
    expect(covered("SP27")).toMatchObject({ inProgress: 0, planned: 1 });
  });

  it("counts complete and needed requirements per section", () => {
    const g = section(audit(), "Computer Engineering - Core");
    expect(g).toMatchObject({ total: 5, done: 1, planned: 0, needed: 4 });
  });

  it("moves a requirement to planned once its course has a term", () => {
    const a = audit();
    a.courses.cs4500.plannedTerm = "FA27";
    const g = section(a, "Computer Engineering - Core");
    expect(g).toMatchObject({ done: 1, planned: 1, needed: 3 });
  });

  it("leaves a switched-off requirement out of the total", () => {
    const a = audit();
    a.requirements.find((r) => r.id === "cpe-cs4500").ignored = true;
    const g = section(a, "Computer Engineering - Core");
    expect(g).toMatchObject({ total: 4, off: 1, needed: 3 });
  });
});

describe("requirement totals (plan panel headline)", () => {
  it("adds up every section's requirements", () => {
    const t = requirementTotals(audit());
    expect(t.done + t.inProgress + t.planned + t.needed).toBe(t.total);
    expect(t.done).toBe(2); // CPE arch and CPE math are complete in the test audit
  });

  it("drops a requirement from 'needed' once it's planned", () => {
    const a = audit();
    const before = requirementTotals(a).needed;
    a.courses.cs4500.plannedTerm = "FA27";
    expect(requirementTotals(a).needed).toBe(before - 1);
    expect(requirementTotals(a).planned).toBe(1);
  });

  it("keeps requirements no course can meet out of the count", () => {
    const a = audit();
    a.requirements.push({
      id: "apply-grad",
      section: "Apply for Graduation",
      title: "Apply for graduation",
      type: "rule",
      status: "needs",
      needCourses: null,
      needHours: null,
      options: [],
      applied: [],
    });
    const t = requirementTotals(a);
    expect(t.other).toBe(1);
    expect(otherRequirements(a).map((r) => r.id)).toEqual(["apply-grad"]);
    const g = categoryProgress(a).find(
      (x) => x.section === "Apply for Graduation",
    );
    expect(g).toMatchObject({ total: 0, other: 1 });
  });
});
