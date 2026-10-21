/*Testing only, not a site element*/

import { describe, it, expect } from "vitest";
import { matchesQuery, visibleCourseGroups } from "./courses.js";

const courses = [
  { id: "a", cat: "core", code: "CS 1450", title: "Data Structures", sub: "" },
  { id: "b", cat: "math", code: "MATH 1350", title: "Calculus I", sub: "" },
  {
    id: "c",
    cat: "core",
    code: "CS 2060",
    title: "Programming with C",
    sub: "Systems",
  },
];
const catOrder = ["core", "math", "writing"];

const codes = (groups) =>
  groups.map((g) => [g.cat, g.items.map((c) => c.code)]);

describe("matchesQuery", () => {
  it("matches everything when the search is empty", () => {
    expect(matchesQuery(courses[0], "")).toBe(true);
  });

  it("matches code, title or subtitle, ignoring case", () => {
    expect(matchesQuery(courses[1], "calc")).toBe(true);
    expect(matchesQuery(courses[1], "1350")).toBe(true);
    expect(matchesQuery(courses[2], "systems")).toBe(true);
    expect(matchesQuery(courses[0], "calc")).toBe(false);
  });
});

describe("visibleCourseGroups", () => {
  it("groups by category in catOrder and skips empty categories", () => {
    const groups = visibleCourseGroups({
      courses,
      catOrder,
      filterCat: "all",
      query: "",
    });
    expect(codes(groups)).toEqual([
      ["core", ["CS 1450", "CS 2060"]],
      ["math", ["MATH 1350"]],
    ]);
  });

  it("shows only the chosen category", () => {
    const groups = visibleCourseGroups({
      courses,
      catOrder,
      filterCat: "math",
      query: "",
    });
    expect(codes(groups)).toEqual([["math", ["MATH 1350"]]]);
  });

  it("applies the search inside each category", () => {
    const groups = visibleCourseGroups({
      courses,
      catOrder,
      filterCat: "all",
      query: "prog",
    });
    expect(codes(groups)).toEqual([["core", ["CS 2060"]]]);
  });
});
