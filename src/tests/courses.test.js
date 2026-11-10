// Tests for logic/courses.js: which courses the list shows, and the words
// shown about each one. Testing only, not a site element.

import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit } from "../logic/parser.js";
import {
  matchesQuery,
  sectionNames,
  visibleSections,
  allSections,
  filterGroups,
  UNLINKED,
  creditText,
  countsTowardText,
  offeredText,
  prereqText,
  notOfferedIn,
} from "../logic/courses.js";

const audit = () => parseAudit(structuredClone(sample));

// [section, [codes]] pairs, easy to compare
const codes = (groups) =>
  groups.map((g) => [g.section, g.courses.map((c) => c.code)]);

describe("matchesQuery", () => {
  const course = { code: "CS 4500", title: "Operating Systems I" };

  it("matches everything when the search is empty", () => {
    expect(matchesQuery(course, "")).toBe(true);
  });

  it("matches code or title, ignoring case", () => {
    expect(matchesQuery(course, "4500")).toBe(true);
    expect(matchesQuery(course, "operating")).toBe(true);
    expect(matchesQuery(course, "calc")).toBe(false);
  });

  it("handles a course with no title yet", () => {
    expect(matchesQuery({ code: "ECE 4020", title: null }, "4020")).toBe(true);
  });
});

describe("sectionNames", () => {
  it("lists each section once, in audit order", () => {
    const names = sectionNames(audit());
    expect(names[0]).toBe("Compass Curriculum");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("visibleSections", () => {
  it("lists a course under every section it counts toward", () => {
    const groups = visibleSections({
      audit: audit(),
      filterSection: "all",
      query: "3300",
    });
    expect(codes(groups)).toEqual([
      ["Compass Curriculum", ["CS 3300"]],
      ["Computer Engineering - Core", ["CS 3300"]],
      ["Electrical Engineering - Technical Electives", ["CS 3300"]],
    ]);
  });

  it("leaves completed courses out", () => {
    const groups = visibleSections({
      audit: audit(),
      filterSection: "all",
      query: "",
    });
    const all = groups.flatMap((g) => g.courses.map((c) => c.code));
    expect(all).not.toContain("MATH 3400");
    expect(all).not.toContain("ECE 4480");
  });

  it("shows only the chosen section, sorted by code", () => {
    const groups = visibleSections({
      audit: audit(),
      filterSection: "Computer Engineering - Core",
      query: "",
    });
    expect(codes(groups)).toEqual([
      [
        "Computer Engineering - Core",
        ["CS 3300", "CS 4500", "ECE 4891", "ECE 4899"],
      ],
    ]);
  });

  it("lists plannable courses with no requirement under their own heading", () => {
    const a = audit();
    a.courses.ece4020.requirementIds = []; // as if the audit didn't link it
    const groups = visibleSections({
      audit: a,
      filterSection: "all",
      query: "",
    });
    expect(codes(groups).at(-1)).toEqual([UNLINKED, ["ECE 4020"]]);
  });

  it("hides options of a finished requirement until they're planned", () => {
    const a = audit(); // cpe-arch is complete (ECE 4480), CS 4200 was an option
    const core = (x) =>
      visibleSections({
        audit: x,
        filterSection: "Computer Engineering - Core",
        query: "",
      })[0].courses.map((c) => c.code);
    expect(core(a)).not.toContain("CS 4200");
    a.courses.cs4200.plannedTerm = "FA27";
    expect(core(a)).toContain("CS 4200");
  });

  it("skips sections with nothing left to show", () => {
    const groups = visibleSections({
      audit: audit(),
      filterSection: "Computer Engineering - Mathematics",
      query: "",
    });
    expect(groups).toEqual([]);
  });
});

describe("allSections and filterGroups", () => {
  // main.js works the full list out once (allSections), then narrows it
  // (filterGroups). Together they must match visibleSections exactly.
  it.each([
    ["all", ""],
    ["all", "ece"],
    ["Electrical Engineering - Core", ""],
    ["Electrical Engineering - Core", "semiconductor"],
    ["all", "no such course"],
  ])("match visibleSections for chip %j and search %j", (section, query) => {
    const a = audit();
    const options = { filterSection: section, query };
    expect(codes(filterGroups(allSections(a), options))).toEqual(
      codes(visibleSections({ audit: a, ...options })),
    );
  });

  it("narrows to the search text and drops sections left empty", () => {
    const groups = filterGroups(allSections(audit()), {
      filterSection: "all",
      query: "operating",
    });
    expect(codes(groups)).toEqual([
      ["Computer Engineering - Core", ["CS 4500"]],
    ]);
  });
});

describe("row text", () => {
  it("writes credits, including variable and unknown", () => {
    const a = audit();
    expect(creditText(a.courses.cs4500)).toBe("3 cr");
    expect(creditText(a.courses.ece4910)).toBe("1–3 cr");
    expect(creditText(a.courses.ece4020)).toBe("? cr");
  });

  it("names the requirements a course counts toward", () => {
    const a = audit();
    expect(countsTowardText(a, a.courses.cs3300)).toBe(
      "Counts toward: NAVIGATE · CS 3300 Software Engineering · TECHNICAL ELECTIVES",
    );
    expect(countsTowardText(a, a.courses.hsci1140)).toBe("");
  });

  it("tells 'not loaded' apart from 'none'", () => {
    const a = audit();
    expect(offeredText(a.courses.ece3020)).toBe("Fall");
    expect(offeredText(a.courses.ece4020)).toBe("Offerings unknown");
    expect(prereqText(a.courses.ece4020)).toBe("Prereqs unknown");
    expect(prereqText(a.courses.ece4891)).toBe("No prereqs");
    expect(prereqText(a.courses.ece3210)).toBe(
      "Prereqs: ECE 2205 with a grade of “C” or better · Coreq: ECE 3230",
    );
  });

  it("flags terms a course isn't scheduled in", () => {
    const a = audit();
    expect(notOfferedIn(a.courses.ece3020, "SP27")).toBe(true); // Fall only
    expect(notOfferedIn(a.courses.ece3020, "FA27")).toBe(false);
    expect(notOfferedIn(a.courses.ece4020, "SP27")).toBe(false); // no data
  });
});
