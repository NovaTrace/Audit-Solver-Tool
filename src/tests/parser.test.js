// src/tests/parser.test.js
import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit, AuditError } from "../logic/parser.js";

const copy = () => structuredClone(sample); // fresh copy, so one test can't affect another
const NOV_2026 = new Date(2026, 10, 5); // a fixed "today" so tests don't change with the calendar

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
    const data = copy();
    data.courses.ece2050.plannedTerm = null;
    data.courses.ece2050.locked = false;
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
    data.courses.cs3300.requirementIds = ["cc-navigate", "cpe-cs3300"]; // dropped ee-tech-electives
    expect(() => parseAudit(data)).toThrow(/ee-tech-electives/);
  });

  it("rejects two requirements with the same id", () => {
    const data = copy();
    data.requirements.push(structuredClone(data.requirements[0]));
    expect(() => parseAudit(data)).toThrow(/share the id/);
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
    const data = copy();
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
  it("keeps the student's semester columns on a fresh scrape", () => {
    const previous = parseAudit(copy());
    previous.plan.terms.push({ key: "SU28", label: "Summer 2028" });
    const result = parseAudit(copy(), previous);
    expect(result.plan.terms.at(-1).key).toBe("SU28");
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
