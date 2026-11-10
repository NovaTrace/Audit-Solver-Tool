// @vitest-environment happy-dom
// (happy-dom gives these tests a browser-like `document` to read pages with)

// Tests for the bookmarklet's scrapers, run against a made-up audit page
// with the real page's structure (fixtures/audit-page.html) and saved
// course-details responses (fixtures/course-details.json).

import { describe, it, expect, vi } from "vitest";
import { scrapeStudent } from "../../bookmarklet/scrape/student.js";
import { scrapeRequirements } from "../../bookmarklet/scrape/requirements.js";
import {
  scrapeCourses,
  linkCourses,
} from "../../bookmarklet/scrape/courses.js";
import {
  toCourseDetails,
  fetchCourseDetails,
  addCourseDetails,
  applyDetails,
  needsDetails,
  SessionExpiredError,
  SlowDownError,
  AT_ONCE,
} from "../../bookmarklet/scrape/courseDetails.js";
import { parseAudit, SCHEMA } from "../logic/parser.js";
import responses from "./fixtures/course-details.json";
import pageHtml from "./fixtures/audit-page.html?raw";

const page = new DOMParser().parseFromString(pageHtml, "text/html");
const BASE = "https://datc.prod.cu.edu/selfservice-cuspg/audit/read.html";

// Everything the collector builds from the page, before course details
function collect() {
  const requirements = scrapeRequirements(page);
  const courses = linkCourses(scrapeCourses(page), requirements);
  return { requirements, courses };
}

// A stand-in for fetch() that answers from the saved responses
function fakeFetch() {
  return vi.fn(async (url, { body }) => {
    const dept = body.get("courseDept");
    const key = `${dept.trim()} ${body.get("courseNum")}`;
    // Like the real site might: only the padded department finds a course
    const found = dept.length === 4 ? responses[key] : null;
    return {
      ok: true,
      type: "basic",
      json: async () => found ?? { title: "" },
    };
  });
}

describe("scrapeStudent", () => {
  it("reads the header and totals", () => {
    expect(scrapeStudent(page)).toEqual({
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

  it("finds the totals by their wording, not CU's headings", () => {
    const renamed = new DOMParser().parseFromString(
      pageHtml
        .replace("MINIMUM HOURS", "TOTAL CREDITS")
        .replace("UNIVERSITY OF COLORADO GPA", "CUMULATIVE GPA"),
      "text/html",
    );
    expect(scrapeStudent(renamed)).toMatchObject({
      hoursRequired: 128,
      hoursEarned: 88,
      gpa: 3.214,
    });
  });
});

describe("scrapeRequirements", () => {
  const { requirements } = collect();
  const titled = (t) => requirements.find((r) => r.title === t);

  it("reads only the desktop copy of the audit", () => {
    expect(requirements.some((r) => r.title.includes("CS 9999"))).toBe(false);
  });

  it("skips information blocks, finished rules and course history", () => {
    const titles = requirements.map((r) => r.title);
    expect(titles).not.toContain("COMPUTER ENGINEERING PROGRAM INFORMATION");
    expect(titles).not.toContain("TOTAL HOUR RESIDENCY");
    expect(titles).not.toContain("MINIMUM HOURS"); // in progress, no list
    expect(titles).not.toContain("SP2023");
  });

  it("reads a single required course", () => {
    expect(titled("CS 4500 Operating Systems I")).toMatchObject({
      section: "Computer Engineering - Core",
      type: "course",
      status: "needs",
      options: ["CS 4500"],
      applied: [],
    });
  });

  it("reads an either/or requirement and its note", () => {
    const req = titled(
      "ECE 4480 Computer Architecture and Design OR CS 4200 Computer Architecture I",
    );
    expect(req).toMatchObject({
      type: "course",
      status: "complete",
      options: ["ECE 4480", "CS 4200"],
      applied: [{ code: "ECE 4480", hours: 3 }],
    });
    expect(req.description).toMatch(/^NOTE: Beginning fall 2023/);
  });

  it("reads a pool with its NEEDS row and options", () => {
    expect(titled("ELECTRICAL ENGINEERING ELECTIVES - LECTURE")).toMatchObject({
      type: "pool",
      status: "needs",
      needHours: 3,
      needCourses: 1,
      earnedHours: 3,
      options: ["ECE 4020", "ECE 4910"],
    });
  });

  it("reads a rule with no course list", () => {
    expect(titled("MATHEMATICS ELECTIVES")).toMatchObject({
      type: "rule",
      needHours: 6,
      options: [],
      applied: [{ code: "MATH 3400", hours: 3 }],
    });
  });

  it("gives every requirement its own id", () => {
    const ids = requirements.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(
      "computer-engineering-core-cs-4500-operating-systems-i",
    );
  });
});

describe("scrapeCourses and linkCourses", () => {
  const { courses } = collect();

  it("reads every attempt once, from Course History", () => {
    expect(courses.math3400.attempts.map((a) => a.grade)).toEqual([
      "W",
      "C-",
      "B",
    ]);
    expect(courses.math3400.attempts[1].flags).toEqual([">E"]);
    expect(courses.ece4480.attempts).toHaveLength(1); // also listed in 3 requirements
  });

  it("takes credits from the latest attempt that carried any", () => {
    expect(courses.math3400.credits).toBe(3); // not the W's 0
    expect(courses.cs3300.credits).toBe(3); // registered
    expect(courses.cs4500.credits).toBeNull(); // never taken: details fill it in
  });

  it("keeps transfer details", () => {
    expect(courses.math1350.code).toBe("MATH 1350"); // printed as MATH1350
    expect(courses.math1350.attempts[0].transfer).toBe(true);
    expect(courses.math1350.transferNote).toBe("CO-PPCC: MAT201");
    expect(courses.math1350.title).toBe("Calculus I");
  });

  it("works out each course's status", () => {
    expect(courses.math3400.status).toBe("completed"); // B after a W and a forgiven C-
    expect(courses.cs3300.status).toBe("registered");
    expect(courses.ece2050.status).toBe("registered");
    expect(courses.cs4500.status).toBe("needed"); // required on its own
    expect(courses.ece4020.status).toBe("option"); // one of a list
    expect(courses.cs4200.status).toBe("option"); // the other half of an either/or
  });

  it("counts a pass only if the audit accepted it", () => {
    // A D in a course whose requirement wants a C- or better
    const withD = (reqStatus) => {
      const courses = {
        cs1450: {
          id: "cs1450",
          code: "CS 1450",
          attempts: [{ term: "FA25", grade: "D", flags: [], credits: 3 }],
          requirementIds: [],
        },
      };
      const requirements = [
        {
          id: "core-cs-1450",
          status: reqStatus,
          options: ["CS 1450"],
          applied: [],
        },
      ];
      return linkCourses(courses, requirements).cs1450.status;
    };
    expect(withD("needs")).toBe("needed"); // not accepted: plan it again
    expect(withD("complete")).toBe("completed"); // accepted
  });

  it("links courses and requirements both ways", () => {
    expect(courses.ece4480.requirementIds).toHaveLength(2); // either/or + electives pool
    expect(courses.cs4500.requirementIds).toEqual([
      "computer-engineering-core-cs-4500-operating-systems-i",
    ]);
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

  it("keeps the audit's credits when the catalog has none, or the course is registered", () => {
    const details = toCourseDetails(responses["ECE 3020"]); // 3 credits

    // Variable credit: the catalog gives no single number
    const variable = { code: "ECE 4910", credits: 2, attempts: [] };
    applyDetails(variable, { ...details, credits: null });
    expect(variable.credits).toBe(2);
    expect(variable.detailsLoaded).toBe(true); // the rest is still copied

    // Registered: the hours the student signed up for win
    const registered = {
      code: "ECE 4910",
      credits: 2,
      attempts: [{ term: "SP27", grade: "***", credits: 2 }],
    };
    applyDetails(registered, details);
    expect(registered.credits).toBe(2);

    // Otherwise the catalog's number is used
    const plain = { code: "ECE 3020", credits: null, attempts: [] };
    applyDetails(plain, details);
    expect(plain.credits).toBe(3);
    const retake = { code: "ECE 3020", credits: 4, attempts: [{ grade: "F" }] };
    applyDetails(retake, details);
    expect(retake.credits).toBe(3);
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

describe("an expired login", () => {
  it("stops after the first redirect to the login page", async () => {
    // fetch with redirect: "manual" reports a redirect as "opaqueredirect"
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      type: "opaqueredirect",
    }));
    // Twice as many courses as are fetched at once
    const list = Array.from({ length: AT_ONCE * 2 }, (_, i) => ({
      code: `CS ${1000 + i}`,
    }));
    await expect(
      addCourseDetails(list, { fetchImpl, baseUrl: BASE }),
    ).rejects.toThrow(SessionExpiredError);
    // Only the first round went out, not the rest of the list
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(AT_ONCE);
  });

  it("stops the other workers taking new courses when one request expires", async () => {
    // The first answer is the login redirect; the rest succeed, a bit later
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      if (++calls === 1) return { ok: false, type: "opaqueredirect" };
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, type: "basic", json: async () => ({ title: "X" }) };
    });
    const list = Array.from({ length: AT_ONCE * 2 }, (_, i) => ({
      code: `CS ${1000 + i}`,
    }));
    await expect(
      addCourseDetails(list, { fetchImpl, baseUrl: BASE }),
    ).rejects.toThrow(SessionExpiredError);
    expect(fetchImpl.mock.calls.length).toBe(AT_ONCE); // nothing new started
  });
});

describe("being told to slow down", () => {
  // A 429 (Too Many Requests) answer; Retry-After: 0 keeps the test fast
  const tooMany = {
    ok: false,
    status: 429,
    type: "basic",
    headers: { get: () => "0" },
  };

  it("pauses, then retries the course", async () => {
    const answer = fakeFetch();
    let calls = 0;
    const fetchImpl = vi.fn(async (url, init) =>
      ++calls === 1 ? tooMany : answer(url, init),
    );
    const list = [{ code: "ECE 3020" }, { code: "PES 2130" }];
    const failed = await addCourseDetails(list, { fetchImpl, baseUrl: BASE });
    expect(failed).toEqual([]);
    expect(list.every((c) => c.detailsLoaded)).toBe(true);
  });

  it("stops if it's told again after the pause", async () => {
    const fetchImpl = vi.fn(async () => tooMany);
    const list = Array.from({ length: AT_ONCE * 2 }, (_, i) => ({
      code: `CS ${1000 + i}`,
    }));
    await expect(
      addCourseDetails(list, { fetchImpl, baseUrl: BASE }),
    ).rejects.toThrow(SlowDownError);
    // One try and one retry for each worker's first course, no more
    expect(fetchImpl.mock.calls.length).toBe(AT_ONCE * 2);
  });
});

describe("the whole collection", () => {
  it("builds an audit that passes parseAudit", async () => {
    const { requirements, courses } = collect();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = fakeFetch();
    // Like collector.js: details only for courses still to plan
    await addCourseDetails(Object.values(courses).filter(needsDetails), {
      fetchImpl,
      baseUrl: BASE,
    });
    const asked = fetchImpl.mock.calls.map(([, { body }]) =>
      body.get("courseNum"),
    );
    expect(asked).not.toContain("3400"); // MATH 3400 is completed: skipped
    expect(courses.math3400.detailsLoaded).toBeUndefined();
    expect(courses.math3400.credits).toBe(3); // still known, from history
    const audit = {
      schema: SCHEMA,
      source: { type: "bookmarklet" },
      student: scrapeStudent(page),
      requirements,
      courses,
    };
    const parsed = parseAudit(audit, null, new Date(2026, 10, 6));
    expect(parsed.courses.cs3300.plannedTerm).toBe("FA26"); // registered: placed
    expect(parsed.courses.cs4500.title).toBe("Operating Systems I");
  });
});
