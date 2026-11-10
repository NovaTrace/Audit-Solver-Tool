// Tests for logic/parser.js: parseAudit() rejects broken data, merges with
// the previous audit, and repairs what's incomplete.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit, AuditError } from "../logic/parser.js";
import { NOV_2026, makeRegistered } from "./helpers.js";

const copy = () => structuredClone(sample); // fresh copy, so one test can't affect another
const keysOf = (audit) => audit.plan.terms.map((t) => t.key);
// The columns a new plan gets when "today" is Nov 5, 2026
const SIX_FROM_FA26 = ["FA26", "SP27", "SU27", "FA27", "SP28", "SU28"];

// parseAudit uses today's date to keep the semester columns current, so
// "today" is pinned to Nov 5, 2026: the tests give the same answer any day.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOV_2026);
});
afterAll(() => vi.useRealTimers());

describe("parseAudit: rejects", () => {
  it("throws AuditError, not a plain Error", () => {
    expect(() => parseAudit("not an object")).toThrow(AuditError);
  });

  // [what's wrong, how to break the sample, words the message must contain]
  it.each([
    ["an unknown schema", (d) => (d.schema = "audit-solver/v9"), /schema/],
    ["a missing student", (d) => delete d.student, /student/],
    ["missing requirements", (d) => delete d.requirements, /requirements/],
    ["missing courses", (d) => delete d.courses, /courses/],
    [
      "a requirementId that doesn't exist",
      (d) => (d.courses.cs4500.requirementIds = ["made-up"]),
      /made-up/,
    ],
    [
      "a course whose key and id differ",
      (d) => (d.courses.cs4500.id = "cs9999"),
      /key and id must match/,
    ],
    [
      "an id that doesn't match the code",
      (d) => (d.courses.cs4500.code = "CS 4501"),
      /should have id "cs4501"/,
    ],
    [
      "an applied course that doesn't list the requirement back",
      (d) => (d.courses.ece4480.requirementIds = ["cpe-arch"]),
      /ee-lecture-electives/,
    ],
    [
      "two requirements with the same id",
      (d) => d.requirements.push(structuredClone(d.requirements[0])),
      /share the id/,
    ],
    // Wrong types would otherwise get past the parser and stop the page
    // drawing
    ["applied: not a list", (d) => (d.requirements[0].applied = 5), /list/],
    ["options: not a list", (d) => (d.requirements[0].options = "CS"), /list/],
    [
      "an applied entry with no code",
      (d) => (d.requirements[6].applied = ["MATH 1350"]),
      /code/,
    ],
    [
      "needHours: not a number",
      (d) => (d.requirements[0].needHours = "3"),
      /number/,
    ],
    [
      "requirementIds: not a list",
      (d) => (d.courses.cs4500.requirementIds = "x"),
      /list/,
    ],
    ["attempts: not a list", (d) => (d.courses.cs4500.attempts = {}), /list/],
    [
      "an attempt that isn't an object",
      (d) => (d.courses.cs4500.attempts = ["A"]),
      /attempt/,
    ],
    [
      "credits: not a number",
      (d) => (d.courses.cs4500.credits = "3"),
      /number/,
    ],
    [
      "availability: not an object",
      (d) => (d.courses.cs4500.availability = null),
      /availability/,
    ],
    ["programs: not a list", (d) => (d.student.programs = "CPEN"), /list/],
  ])("rejects %s", (_name, breakIt, message) => {
    const data = copy();
    breakIt(data);
    expect(() => parseAudit(data)).toThrow(AuditError);
    expect(() => parseAudit(data)).toThrow(message);
  });
});

describe("parseAudit: repairs", () => {
  it("never changes the object it was given", () => {
    const data = copy();
    delete data.courses.cs4500.locked;
    parseAudit(data);
    expect(data.courses.cs4500.locked).toBeUndefined();
  });

  it("gives every course, requirement, student and source every field", () => {
    const data = copy();
    data.courses.ece4020 = {
      id: "ece4020",
      code: "ECE 4020",
      requirementIds: ["ee-lecture-electives"],
    };
    data.requirements.push({ id: "bare" }, { id: "bare-pool", options: [] });
    data.requirements.at(-1).options.push("CS 4500");
    data.courses.cs4500.requirementIds.push("bare-pool");
    data.student = { gpa: 3.5 };
    delete data.source;
    const result = parseAudit(data);

    expect(result.courses.ece4020).toMatchObject({
      title: null,
      prereqs: null,
      attempts: [],
      availability: {},
      detailsLoaded: false,
      plannedTerm: null,
      locked: false,
    });
    expect(result.requirements.at(-2)).toEqual({
      id: "bare",
      title: "bare",
      type: "rule",
      section: "Other requirements",
      status: "needs",
      needCourses: null,
      needHours: null,
      earnedHours: 0,
      inProgressHours: 0,
      options: [],
      applied: [],
      description: "",
    });
    expect(result.requirements.at(-1).type).toBe("pool"); // it has options
    expect(result.student).toMatchObject({
      name: "Unknown student",
      programs: [],
      degreeTitle: null,
      gpa: 3.5, // what was there is kept
    });
    expect(result.source).toEqual({
      type: "json",
      importedAt: null,
      collectorVersion: null,
      exportedAt: null,
    });
  });

  it.each([
    ["there is no plan", (d) => delete d.plan],
    ["none of the columns are usable", (d) => (d.plan.terms = [1, 2])],
  ])("makes six columns from the current term when %s", (_name, breakIt) => {
    const data = copy();
    breakIt(data);
    const { plan } = parseAudit(data);
    expect(keysOf({ plan })).toEqual(SIX_FROM_FA26);
    expect(plan.terms[0].label).toBe("Fall 2026");
    expect(plan.lastSaved).toBeNull();
  });

  it("starts the columns at the first registered term if it's earlier than today", () => {
    const data = makeRegistered(copy(), "cs3300", "FA26");
    delete data.plan;
    const result = parseAudit(data, null, new Date(2027, 2, 1)); // March 2027
    expect(keysOf(result)[0]).toBe("FA26");
  });

  it("drops semester columns it can't use, and fills in labels", () => {
    const data = copy();
    data.plan.terms = [
      { key: "SP27" },
      1,
      { key: "nope", label: "?" },
      { key: "FA26", label: "Fall 2026" },
      { key: "SP27", label: "again" },
    ];
    expect(parseAudit(data).plan.terms).toEqual([
      { key: "FA26", label: "Fall 2026" },
      { key: "SP27", label: "Spring 2027" },
    ]);
  });

  it("places and locks a registered course", () => {
    const result = parseAudit(makeRegistered(copy(), "ece2050", "SP27"));
    expect(result.courses.ece2050).toMatchObject({
      plannedTerm: "SP27",
      locked: true,
    });
  });

  it("cleans up picks: a term that isn't a column, and locks that aren't real", () => {
    const data = copy();
    Object.assign(data.courses.cs4500, { plannedTerm: "FA35", locked: true });
    data.courses.ece3020.locked = true; // locked, but with no term
    Object.assign(data.courses.ece3210, { plannedTerm: "FA27", locked: "yes" });
    const { cs4500, ece3020, ece3210 } = parseAudit(data).courses;
    expect(cs4500).toMatchObject({ plannedTerm: null, locked: false });
    expect(ece3020.locked).toBe(false);
    expect(ece3210).toMatchObject({ plannedTerm: "FA27", locked: false });
  });
});

describe("parseAudit: merging with previous", () => {
  // The student had planned CS 4500 for Fall '27...
  const plannedBefore = () => {
    const previous = parseAudit(copy());
    previous.courses.cs4500.plannedTerm = "FA27";
    return previous;
  };
  // ...and the new audit shows it with an attempt in Spring '27
  const withAttempt = (status, grade) => {
    const data = copy();
    Object.assign(data.courses.cs4500, {
      status,
      attempts: [
        { term: "SP27", grade, credits: 3, flags: [], transfer: false },
      ],
    });
    delete data.courses.cs4500.plannedTerm;
    delete data.courses.cs4500.locked;
    return data;
  };
  const registeredBefore = () =>
    parseAudit(makeRegistered(copy(), "ece2050", "SP27"));

  it("moves a newly registered course to its real term", () => {
    const result = parseAudit(
      withAttempt("registered", "***"),
      plannedBefore(),
    );
    expect(result.courses.cs4500).toMatchObject({
      plannedTerm: "SP27",
      locked: true,
    });
  });

  it("clears the pick of a newly completed course", () => {
    const result = parseAudit(withAttempt("completed", "A"), plannedBefore());
    expect(result.courses.cs4500).toMatchObject({
      plannedTerm: null,
      locked: false,
    });
  });

  it("moves a registered course whose term changed", () => {
    const result = parseAudit(
      makeRegistered(copy(), "ece2050", "FA27"),
      registeredBefore(),
    );
    expect(result.courses.ece2050).toMatchObject({
      plannedTerm: "FA27",
      locked: true,
    });
  });

  it("keeps a registered course where the student moved it, if its term is unchanged", () => {
    const previous = registeredBefore();
    Object.assign(previous.courses.ece2050, {
      plannedTerm: "SP28",
      locked: false,
    });
    const result = parseAudit(
      makeRegistered(copy(), "ece2050", "SP27"),
      previous,
    );
    expect(result.courses.ece2050.plannedTerm).toBe("SP28");
  });

  it("unplaces a course that was registered and isn't any more", () => {
    const result = parseAudit(copy(), registeredBefore()); // dropped
    expect(result.courses.ece2050).toMatchObject({
      plannedTerm: null,
      locked: false,
    });
  });

  it("keeps the student's semester columns on a fresh scrape", () => {
    const previous = parseAudit(copy());
    previous.plan.terms.push(
      { key: "SU28", label: "Summer 2028" },
      { key: "FA28", label: "Fall 2028" },
    );
    expect(keysOf(parseAudit(copy(), previous))).toEqual([
      ...SIX_FROM_FA26,
      "FA28",
    ]);
  });

  it("drops terms that are over and adds new ones on a fresh scrape", () => {
    const previous = parseAudit(copy()); // columns FA26 … SP28
    previous.courses.cs4500.plannedTerm = "SP27"; // will be in the past
    previous.courses.ece3020.plannedTerm = "SP28"; // still ahead
    const result = parseAudit(copy(), previous, new Date(2027, 9, 1)); // Oct 2027
    expect(keysOf(result)).toEqual([
      "FA27",
      "SP28",
      "SU28",
      "FA28",
      "SP29",
      "SU29",
    ]);
    expect(result.courses.cs4500.plannedTerm).toBeNull(); // its term is gone
    expect(result.courses.ece3020.plannedTerm).toBe("SP28"); // pick kept
  });

  it("leaves out a term the student removed, unless a course is registered in it", () => {
    const previous = parseAudit(copy());
    previous.plan.terms = previous.plan.terms.filter((t) => t.key !== "SU27");
    const keys = (data) => keysOf(parseAudit(data, previous));
    expect(keys(copy())).not.toContain("SU27");
    expect(keys(makeRegistered(copy(), "cs4500", "SU27"))).toContain("SU27");
  });

  it("lets an exported file's own picks and columns win, even old ones", () => {
    const previous = parseAudit(copy());
    previous.courses.cs4500.plannedTerm = "SP27";
    const exported = copy();
    exported.source.exportedAt = "2026-11-05T21:00:00";
    exported.courses.cs4500.plannedTerm = "FA27";
    const result = parseAudit(exported, previous, new Date(2030, 0, 1));
    expect(result.courses.cs4500.plannedTerm).toBe("FA27");
    expect(result.plan.terms).toEqual(sample.plan.terms);
  });

  it("keeps bookmarklet details when a PDF re-import doesn't have them", () => {
    const pdf = copy();
    pdf.source.type = "pdf";
    Object.assign(pdf.courses.cs4500, {
      title: null,
      prereqs: null,
      detailsLoaded: false,
    });
    const course = parseAudit(pdf, parseAudit(copy())).courses.cs4500;
    expect(course.title).toBe("Operating Systems I");
    expect(course.prereqs.groups).toHaveLength(3);
    expect(course.detailsLoaded).toBe(true);
  });

  it("ignores previous courses that are no longer on the audit", () => {
    const previous = parseAudit(copy());
    previous.courses.old1000 = {
      ...previous.courses.cs4500,
      id: "old1000",
      code: "OLD 1000",
    };
    expect(parseAudit(copy(), previous).courses.old1000).toBeUndefined();
  });
});
