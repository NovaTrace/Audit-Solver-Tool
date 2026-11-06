// Tests for the bookmarklet's scrapers, run against a made-up audit page's
// text (fixtures/audit-page.txt, same layout as the real audit) and saved
// course-details responses (fixtures/course-details.json).

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { scrapeStudent } from "../../bookmarklet/scrape/student.js";
import { scrapeCourses } from "../../bookmarklet/scrape/courses.js";
import {
  toCourseDetails,
  fetchCourseDetails,
  addCourseDetails,
} from "../../bookmarklet/scrape/courseDetails.js";
import { parseAudit, SCHEMA } from "../logic/parser.js";
import responses from "./fixtures/course-details.json";

const pageText = readFileSync(
  new URL("./fixtures/audit-page.txt", import.meta.url),
  "utf8",
);
const BASE = "https://datc.prod.cu.edu/selfservice-cuspg/audit/read.html";

// A stand-in for fetch() that answers from the saved responses
function fakeFetch() {
  return vi.fn(async (url, { body }) => {
    const dept = body.get("courseDept");
    const key = `${dept.trim()} ${body.get("courseNum")}`;
    // Like the real site might: only the padded department finds a course
    const found = dept.length === 4 || dept === "ECE " ? responses[key] : null;
    return { ok: true, json: async () => found ?? { title: "" } };
  });
}

describe("scrapeStudent", () => {
  it("reads the header and totals", () => {
    expect(scrapeStudent(pageText)).toEqual({
      name: "Curly, Brace",
      degreeTitle: "BS in Computer Engineering",
      programCode: "ESBS---CPEN",
      programs: ["CUSPG", "ENGRU", "CPEN-BS", "ELEN-ADL", "MATH-MIN"],
      catalogYear: "Fall 2023",
      preparedOn: "2026-11-05T13:32:00",
      graduationDate: null,
      allRequirementsMet: false,
      hoursRequired: 128,
      hoursEarned: 88,
      hoursInProgress: 9,
      gpa: 3.214,
      attemptedHours: 82,
    });
  });
});

describe("scrapeCourses", () => {
  const courses = scrapeCourses(pageText);

  it("reads every attempt once, from the Course History section", () => {
    expect(courses.math3400.attempts.map((a) => a.grade)).toEqual([
      "W",
      "C-",
      "B",
    ]);
    expect(courses.math3400.attempts[1].flags).toEqual([">E"]);
    expect(courses.ece4480.attempts).toHaveLength(1); // listed 3 times on the page
  });

  it("keeps transfer details", () => {
    expect(courses.math1350.code).toBe("MATH 1350"); // printed as MATH1350
    expect(courses.math1350.attempts[0].transfer).toBe(true);
    expect(courses.math1350.transferNote).toBe("CO-PPCC: MAT201");
  });

  it("works out each course's status", () => {
    expect(courses.math3400.status).toBe("completed"); // B after a W and a forgiven C-
    expect(courses.cs3300.status).toBe("registered");
    expect(courses.ece2050.status).toBe("registered");
    expect(courses.cs4500.status).toBe("needed"); // SELECT FROM: CS 4500 alone
    expect(courses.ece4020.status).toBe("option"); // one of a list
  });

  it("expands SELECT FROM lists that share a department", () => {
    expect(courses.ece4910.code).toBe("ECE 4910");
    expect(courses.cs4200.code).toBe("CS 4200");
  });
});

describe("course details", () => {
  it("turns a response into our fields", () => {
    const details = toCourseDetails(responses["ECE 3020"]);
    expect(details.title).toBe("Semiconductor Devices I");
    expect(details.description).toMatch(/students only\.$/); // credits sentence removed
    expect(details.prereqs.groups).toHaveLength(2);
    expect(details.termsOffered).toEqual(["Fall"]);
    expect(details.availability.FA26).toBe("available");
    expect(details.availability.SP27).toBe("unknown");
    expect(details.detailsLoaded).toBe(true);
  });

  it("reads coreqs", () => {
    const details = toCourseDetails(responses["PES 2130"]);
    expect(details.coreqText).toBe("MATH 2350");
    expect(details.coreqs.groups[0].anyOf).toEqual(["MATH 2350"]);
  });

  it("posts to the endpoint next to the audit page, padding the department if needed", async () => {
    const fetchImpl = fakeFetch();
    const details = await fetchCourseDetails("CS 4500", {
      fetchImpl,
      baseUrl: BASE,
    });
    expect(details.title).toBe("Operating Systems I");
    const [url, first] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "https://datc.prod.cu.edu/selfservice-cuspg/audit/populate-course-cat-details.ajax",
    );
    expect(first.body.get("courseDept")).toBe("CS"); // short first...
    expect(fetchImpl.mock.calls[1][1].body.get("courseDept")).toBe("CS  "); // ...then padded
  });

  it("fills in what it can and reports the rest", async () => {
    const list = [
      { code: "ECE 3020", detailsLoaded: false },
      { code: "ZZZ 9999", detailsLoaded: false },
    ];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const progress = [];
    const failed = await addCourseDetails(list, {
      fetchImpl: fakeFetch(),
      baseUrl: BASE,
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    });
    expect(list[0].detailsLoaded).toBe(true);
    expect(list[1].detailsLoaded).toBe(false);
    expect(failed).toEqual(["ZZZ 9999"]);
    expect(progress).toEqual(["1/2", "2/2"]);
  });
});

describe("the whole collection", () => {
  it("builds an audit that passes parseAudit", async () => {
    const courses = scrapeCourses(pageText);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await addCourseDetails(Object.values(courses), {
      fetchImpl: fakeFetch(),
      baseUrl: BASE,
    });
    const audit = {
      schema: SCHEMA,
      source: { type: "bookmarklet" },
      student: scrapeStudent(pageText),
      requirements: [],
      courses,
    };
    const parsed = parseAudit(audit, null, new Date(2026, 10, 6));
    expect(parsed.courses.cs3300.plannedTerm).toBe("FA26"); // registered: placed
    expect(parsed.courses.cs4500.title).toBe("Operating Systems I");
  });
});
