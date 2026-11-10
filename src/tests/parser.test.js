// src/tests/parser.test.js
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit, AuditError } from "../logic/parser.js";
import { NOV_2026, makeRegistered } from "./helpers.js";

const copy = () => structuredClone(sample); // fresh copy, so one test can't affect another

// parseAudit uses today's date to keep the semester columns current, so
// "today" is pinned to Nov 5, 2026: the tests give the same answer any day.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOV_2026);
});
afterAll(() => vi.useRealTimers());

describe("parseAudit", () => {
  it("accepts the sample", () => {
    expect(() => parseAudit(copy())).not.toThrow();
  });

  it("rejects an unknown schema", () => {
    const data = copy();
    data.schema = "audit-solver/v9";
    expect(() => parseAudit(data)).toThrow(/schema/);
  });

  it("rejects a requirementId that doesn't exist", () => {
    const data = copy();
    data.courses.cs4500.requirementIds = ["made-up"];
    expect(() => parseAudit(data)).toThrow(/made-up/);
  });

  it("fills in missing plan fields", () => {
    const data = copy();
    delete data.courses.cs4500.plannedTerm;
    delete data.courses.cs4500.locked;
    const result = parseAudit(data);
    expect(result.courses.cs4500.plannedTerm).toBeNull();
    expect(result.courses.cs4500.locked).toBe(false);
  });

  it("places and locks a registered course", () => {
    const data = makeRegistered(copy(), "ece2050", "SP27");
    const result = parseAudit(data);
    expect(result.courses.ece2050.plannedTerm).toBe("SP27");
    expect(result.courses.ece2050.locked).toBe(true);
  });

  it("keeps the student's picks when re-importing", () => {
    const previous = parseAudit(copy());
    previous.courses.cs4500.plannedTerm = "SP27";
    const result = parseAudit(copy(), previous);
    expect(result.courses.cs4500.plannedTerm).toBe("SP27");
  });
});

// ---------------------------------------------------------------------
// Everything below covers the rest of the guide's rules.
// ---------------------------------------------------------------------

describe("parseAudit: rejects", () => {
  it("throws AuditError, not a plain Error", () => {
    expect(() => parseAudit("not an object")).toThrow(AuditError);
  });

  it.each(["student", "requirements", "courses"])(
    "rejects a missing %s",
    (key) => {
      const data = copy();
      delete data[key];
      expect(() => parseAudit(data)).toThrow(new RegExp(key));
    },
  );

  it("rejects a course whose key and id differ", () => {
    const data = copy();
    data.courses.cs4500.id = "cs9999";
    expect(() => parseAudit(data)).toThrow(/key and id must match/);
  });

  it("rejects an id that doesn't match the code", () => {
    const data = copy();
    data.courses.cs4500.code = "CS 4501";
    expect(() => parseAudit(data)).toThrow(/should have id "cs4501"/);
  });

  it("rejects an applied course that doesn't list the requirement back", () => {
    const data = copy();
    data.courses.ece4480.requirementIds = ["cpe-arch"]; // dropped ee-lecture-electives
    expect(() => parseAudit(data)).toThrow(/ee-lecture-electives/);
  });

  it("rejects two requirements with the same id", () => {
    const data = copy();
    data.requirements.push(structuredClone(data.requirements[0]));
    expect(() => parseAudit(data)).toThrow(/share the id/);
  });

  // Wrong types would otherwise get past the parser and stop the page
  // drawing. Each must be an AuditError, which the student is shown.
  it.each([
    ["a requirement's applied", (d) => (d.requirements[0].applied = 5)],
    ["a requirement's options", (d) => (d.requirements[0].options = "CS 3300")],
    ["an applied entry", (d) => (d.requirements[6].applied = ["MATH 1350"])],
    ["a requirement's needHours", (d) => (d.requirements[0].needHours = "3")],
    [
      "a course's requirementIds",
      (d) => (d.courses.cs4500.requirementIds = "x"),
    ],
    ["a course's attempts", (d) => (d.courses.cs4500.attempts = {})],
    ["an attempt", (d) => (d.courses.cs4500.attempts = ["A"])],
    ["a course's credits", (d) => (d.courses.cs4500.credits = "3")],
    ["a course's availability", (d) => (d.courses.cs4500.availability = null)],
    ["the student's programs", (d) => (d.student.programs = "CPEN-BS")],
  ])("rejects the wrong type for %s", (_name, breakIt) => {
    const data = copy();
    breakIt(data);
    expect(() => parseAudit(data)).toThrow(AuditError);
  });
});

describe("parseAudit: repairs", () => {
  it("never changes the object it was given", () => {
    const data = copy();
    delete data.courses.cs4500.locked;
    parseAudit(data);
    expect(data.courses.cs4500.locked).toBeUndefined();
  });

  it("gives every course every field", () => {
    const data = copy();
    data.courses.ece4020 = {
      id: "ece4020",
      code: "ECE 4020",
      requirementIds: ["ee-lecture-electives"],
    };
    const course = parseAudit(data).courses.ece4020;
    expect(course.title).toBeNull();
    expect(course.prereqs).toBeNull();
    expect(course.attempts).toEqual([]);
    expect(course.availability).toEqual({});
    expect(course.detailsLoaded).toBe(false);
  });

  it("generates plan.terms when there is no plan", () => {
    const data = copy();
    delete data.plan;
    const { plan } = parseAudit(data, null, NOV_2026);
    expect(plan.terms.map((t) => t.key)).toEqual([
      "FA26",
      "SP27",
      "SU27",
      "FA27",
      "SP28",
      "SU28",
    ]);
    expect(plan.terms[0].label).toBe("Fall 2026");
    expect(plan.lastSaved).toBeNull();
  });

  it("starts the columns at the first registered term if it's earlier than today", () => {
    const data = makeRegistered(copy(), "cs3300", "FA26");
    delete data.plan;
    const { plan } = parseAudit(data, null, new Date(2027, 2, 1)); // March 2027
    expect(plan.terms[0].key).toBe("FA26"); // CS 3300 is registered in FA26
  });

  it("clears a plannedTerm that isn't one of the columns", () => {
    const data = copy();
    data.courses.cs4500.plannedTerm = "FA35";
    data.courses.cs4500.locked = true;
    const course = parseAudit(data).courses.cs4500;
    expect(course.plannedTerm).toBeNull();
    expect(course.locked).toBe(false);
  });

  it("unlocks a locked course with no term", () => {
    const data = copy();
    data.courses.cs4500.locked = true;
    expect(parseAudit(data).courses.cs4500.locked).toBe(false);
  });

  it("gives every requirement every field", () => {
    const data = copy();
    data.requirements.push({ id: "bare" }, { id: "bare-pool", options: [] });
    data.requirements.at(-1).options.push("CS 4500");
    data.courses.cs4500.requirementIds.push("bare-pool");
    const reqs = parseAudit(data).requirements;
    expect(reqs.at(-2)).toEqual({
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
    expect(reqs.at(-1).type).toBe("pool"); // it has options
  });

  it("gives the student every field", () => {
    const data = copy();
    data.student = { gpa: 3.5 };
    const { student } = parseAudit(data);
    expect(student.name).toBe("Unknown student");
    expect(student.programs).toEqual([]);
    expect(student.degreeTitle).toBeNull();
    expect(student.gpa).toBe(3.5); // what was there is kept
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

  it("makes new columns when none of the old ones are usable", () => {
    const data = copy();
    data.plan.terms = [1, 2];
    const { plan } = parseAudit(data, null, NOV_2026);
    expect(plan.terms.map((t) => t.key)).toEqual([
      "FA26",
      "SP27",
      "SU27",
      "FA27",
      "SP28",
      "SU28",
    ]);
  });

  it("only treats `locked: true` as a lock", () => {
    const data = copy();
    data.courses.cs4500.plannedTerm = "FA27";
    data.courses.cs4500.locked = "yes";
    expect(parseAudit(data).courses.cs4500.locked).toBe(false);
  });

  it("fills in missing source fields", () => {
    const data = copy();
    delete data.source;
    expect(parseAudit(data).source).toEqual({
      type: "json",
      importedAt: null,
      collectorVersion: null,
      exportedAt: null,
    });
  });
});

describe("parseAudit: merging with previous", () => {
  // The student had planned CS 4500 for Fall '27...
  const plannedBefore = () => {
    const previous = parseAudit(copy());
    previous.courses.cs4500.plannedTerm = "FA27";
    return previous;
  };
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

  it("moves a newly registered course to its real term", () => {
    const result = parseAudit(
      withAttempt("registered", "***"),
      plannedBefore(),
    );
    expect(result.courses.cs4500.plannedTerm).toBe("SP27");
    expect(result.courses.cs4500.locked).toBe(true);
  });

  it("clears the pick of a newly completed course", () => {
    const result = parseAudit(withAttempt("completed", "A"), plannedBefore());
    expect(result.courses.cs4500.plannedTerm).toBeNull();
    expect(result.courses.cs4500.locked).toBe(false);
  });

  it("moves a registered course whose term changed", () => {
    const previous = parseAudit(makeRegistered(copy(), "ece2050", "SP27"));
    const result = parseAudit(
      makeRegistered(copy(), "ece2050", "FA27"),
      previous,
    );
    expect(result.courses.ece2050.plannedTerm).toBe("FA27");
    expect(result.courses.ece2050.locked).toBe(true);
  });

  it("keeps a registered course where the student moved it, if its term is unchanged", () => {
    const previous = parseAudit(makeRegistered(copy(), "ece2050", "SP27"));
    previous.courses.ece2050.plannedTerm = "SP28";
    previous.courses.ece2050.locked = false;
    const result = parseAudit(
      makeRegistered(copy(), "ece2050", "SP27"),
      previous,
    );
    expect(result.courses.ece2050.plannedTerm).toBe("SP28");
  });

  it("unplaces a course that was registered and isn't any more", () => {
    const previous = parseAudit(makeRegistered(copy(), "ece2050", "SP27"));
    const result = parseAudit(copy(), previous); // dropped: "needed" again
    expect(result.courses.ece2050.plannedTerm).toBeNull();
    expect(result.courses.ece2050.locked).toBe(false);
  });

  it("keeps the student's semester columns on a fresh scrape", () => {
    const previous = parseAudit(copy());
    previous.plan.terms.push(
      { key: "SU28", label: "Summer 2028" },
      { key: "FA28", label: "Fall 2028" },
    );
    const result = parseAudit(copy(), previous);
    expect(result.plan.terms.at(-1).key).toBe("FA28");
    expect(result.plan.terms).toHaveLength(7);
  });

  it("drops terms that are over and adds new ones on a fresh scrape", () => {
    const previous = parseAudit(copy()); // columns FA26 … SP28
    previous.courses.cs4500.plannedTerm = "SP27"; // will be in the past
    previous.courses.ece3020.plannedTerm = "SP28"; // still ahead
    const result = parseAudit(copy(), previous, new Date(2027, 9, 1)); // Oct 2027
    expect(result.plan.terms.map((t) => t.key)).toEqual([
      "FA27",
      "SP28",
      "SU28",
      "FA28",
      "SP29",
      "SU29",
    ]);
    expect(result.courses.cs4500.plannedTerm).toBeNull(); // its term is gone
    expect(result.courses.ece3020.plannedTerm).toBe("SP28");
  });

  it("leaves out a term the student removed, unless a course is registered in it", () => {
    const previous = parseAudit(copy());
    previous.plan.terms = previous.plan.terms.filter((t) => t.key !== "SU27");
    const keys = (data) =>
      parseAudit(data, previous).plan.terms.map((t) => t.key);
    expect(keys(copy())).not.toContain("SU27");
    expect(keys(makeRegistered(copy(), "cs4500", "SU27"))).toContain("SU27");
  });

  it("leaves an exported file's columns alone, even old ones", () => {
    const exported = copy();
    exported.source.exportedAt = "2026-11-05T21:00:00";
    const result = parseAudit(
      exported,
      parseAudit(copy()),
      new Date(2030, 0, 1),
    );
    expect(result.plan.terms).toEqual(sample.plan.terms);
  });

  it("lets an exported file's own picks win", () => {
    const previous = parseAudit(copy());
    previous.courses.cs4500.plannedTerm = "SP27";
    const exported = copy();
    exported.source.exportedAt = "2026-11-05T21:00:00";
    exported.courses.cs4500.plannedTerm = "FA27";
    expect(parseAudit(exported, previous).courses.cs4500.plannedTerm).toBe(
      "FA27",
    );
  });

  it("keeps bookmarklet details when a PDF re-import doesn't have them", () => {
    const previous = parseAudit(copy());
    const pdf = copy();
    pdf.source.type = "pdf";
    Object.assign(pdf.courses.cs4500, {
      title: null,
      prereqs: null,
      detailsLoaded: false,
    });
    const course = parseAudit(pdf, previous).courses.cs4500;
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
