// Tests for logic/pdfAudit.js: reading an audit PDF's text. Run against a
// made-up audit written out in both PDF layouts (fixtures/*.pdf.txt), with
// the real layouts' structure. Each fixture line is "[x]text": how far in
// the line starts, then its words. Testing only, not a site element.

import { describe, it, expect } from "vitest";
import { textLines, pdfToAudit } from "../logic/pdfAudit.js";
import { buildRequirements } from "../logic/auditBuild.js";
import { parseAudit, AuditError } from "../logic/parser.js";
import { NOV_2026 } from "./helpers.js";
import printedText from "./fixtures/audit-printed.pdf.txt?raw";
import siteText from "./fixtures/audit-site.pdf.txt?raw";

// "[132]MINIMUM HOURS" -> { x: 132, text: "MINIMUM HOURS" }
const linesOf = (fixture) =>
  fixture
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [, x, text] = line.match(/^\[(\d+)\](.*)$/);
      return { x: Number(x), text: text.replace(/\s+/g, " ").trim() };
    });

const printed = pdfToAudit(linesOf(printedText), NOV_2026);
const site = pdfToAudit(linesOf(siteText), NOV_2026);
const requirement = (audit, title) =>
  audit.requirements.find((r) => r.title.startsWith(title));

// Everything below must hold for both layouts
describe.each([
  ["the printed page", printed],
  ["the site's PDF", site],
])("pdfToAudit, from %s", (_name, audit) => {
  it("reads the student header and totals", () => {
    expect(audit.student).toEqual({
      name: "Curly, Brace",
      degreeTitle: "BS in Computer Engineering",
      programCode: "ESBS---CPEN",
      programs: ["CUSPG", "ENGRU", "CPEN-BS", "MATH-MIN"],
      catalogYear: "Fall 2023",
      preparedOn: "2026-11-05T13:32:00",
      graduationDate: null,
      allRequirementsMet: false,
      hoursRequired: 128,
      hoursEarned: 88,
      hoursInProgress: 6,
      gpa: 3.214,
      attemptedHours: 82,
    });
  });

  it("marks where the audit came from", () => {
    expect(audit.source).toEqual({
      type: "pdf",
      importedAt: NOV_2026.toISOString(),
      collectorVersion: null,
      exportedAt: null, // a fresh audit, so a re-import keeps the plan
    });
  });

  it("reads a single required course, met, in progress and not met", () => {
    expect(requirement(audit, "MATH 1350")).toMatchObject({
      section: "Mathematics Minor",
      type: "course",
      status: "complete",
      options: ["MATH 1350"],
      applied: [{ code: "MATH 1350", hours: 4 }],
    });
    expect(requirement(audit, "CS 3300").status).toBe("in-progress");
    expect(requirement(audit, "CS 4500")).toMatchObject({
      status: "needs",
      options: ["CS 4500"],
      applied: [],
    });
    expect(requirement(audit, "ECE 3020").description).toBe("NOTE: Fall Only");
  });

  it("reads an either/or requirement and its wrapped note", () => {
    expect(requirement(audit, "ECE 4480")).toMatchObject({
      title:
        "ECE 4480 Computer Architecture and Design OR CS 4200 Computer Architecture I",
      type: "course",
      status: "complete",
      options: ["ECE 4480", "CS 4200"],
      description:
        // The note wraps on to a line that starts with a course code,
        // which must not be taken for a third course in the title
        "NOTE: Beginning fall 2023, if you have not passed ECE 4480 already, take that course.",
    });
  });

  it("reads a pool: its totals, and a SELECT FROM list that runs on", () => {
    expect(
      requirement(audit, "ELECTRICAL ENGINEERING ELECTIVES"),
    ).toMatchObject({
      type: "pool",
      status: "needs",
      needHours: 3,
      needCourses: 1,
      earnedHours: 3,
      options: ["ECE 4020", "ECE 4910", "CS 4200"],
      applied: [{ code: "ECE 4480", hours: 3 }],
    });
  });

  it("reads a rule with no course list", () => {
    expect(requirement(audit, "MATHEMATICS ELECTIVES")).toMatchObject({
      type: "rule",
      status: "needs",
      needHours: 6,
      options: [],
      description:
        "Complete 9 credit hours of any MATH course numbered 3100 or higher.",
    });
  });

  it("keeps a rule with no course list when courses count toward it", () => {
    // NAVIGATE is in progress and shows no SELECT FROM list any more;
    // dropping it would leave CS 3300 looking like it counts for less
    const navigate = requirement(audit, "NAVIGATE");
    expect(navigate).toMatchObject({
      section: "Compass Curriculum",
      type: "rule",
      options: [],
      applied: [{ code: "CS 3300", hours: 3 }],
    });
    expect(audit.courses.cs3300.requirementIds).toContain(navigate.id);
  });

  it("skips information blocks, whole-degree rules, the legend and course history", () => {
    const titles = audit.requirements.map((r) => r.title).join(" | ");
    for (const skipped of [
      "MINIMUM HOURS",
      "GPA",
      "PROGRAM INFORMATION",
      "GENERAL INFORMATION",
      "Transfer credit",
      "Registered", // a legend line
    ]) {
      expect(titles).not.toContain(skipped);
    }
    // A description line that starts with a course code isn't a requirement
    expect(requirement(audit, "CS 1150")).toBeUndefined();
  });

  it("reads every attempt once, with flags and transfer details", () => {
    const { math3400, math1350, comm2240 } = audit.courses;
    expect(math3400.attempts.map((a) => `${a.term} ${a.grade}`)).toEqual([
      "SP23 W",
      "SU23 C-",
      "SU26 B",
    ]);
    expect(math3400.attempts[1].flags).toEqual([">E"]);
    expect(math3400.credits).toBe(3); // the latest attempt that carried any
    expect(math1350).toMatchObject({
      code: "MATH 1350",
      title: "Calculus I",
      transferNote: "CO-PPCC: MAT201",
    });
    expect(math1350.attempts[0].transfer).toBe(true);
    expect(comm2240.title).toBe("Intro Organiz Comm");
  });

  it("works out each course's status and links it to its requirements", () => {
    const status = (id) => audit.courses[id].status;
    expect(status("ece4480")).toBe("completed");
    expect(status("cs3300")).toBe("registered");
    expect(status("ece2050")).toBe("registered"); // history only
    expect(status("cs4500")).toBe("needed");
    expect(status("ece4020")).toBe("option");
    expect(audit.courses.ece2050.requirementIds).toEqual([]);
    expect(audit.courses.cs4200.requirementIds).toHaveLength(2);
  });

  it("builds an audit that passes parseAudit, with registered courses placed", () => {
    const parsed = parseAudit(audit, null, NOV_2026);
    expect(parsed.courses.cs3300).toMatchObject({
      plannedTerm: "FA26",
      locked: true,
    });
    expect(parsed.courses.cs4500.detailsLoaded).toBe(false); // a PDF has none
  });
});

describe("the two layouts", () => {
  it("give the same courses", () => {
    expect(printed.courses).toEqual(site.courses);
  });

  it("give the same requirements, apart from ones that are only words", () => {
    // The site's PDF marks "SUMMIT" as not met. Printed, it's only a
    // paragraph, with nothing to say whether it's met, so it's left out.
    const withoutWordsOnly = site.requirements.filter(
      (r) => r.title !== "SUMMIT",
    );
    expect(printed.requirements).toEqual(withoutWordsOnly);
    expect(requirement(site, "SUMMIT")).toMatchObject({
      type: "rule",
      status: "needs",
    });
  });
});

describe("pdfToAudit", () => {
  // A small printed-layout audit around the lines under test
  const printedAudit = (...subLines) =>
    pdfToAudit([
      { x: 106, text: "Some Program - Core" },
      ...subLines.map((text) => ({ x: 132, text })),
      { x: 106, text: "Course History" },
      { x: 133, text: "FA26 CS 3300 3.0 *** Intro to Software Engineering" },
    ]);

  it("keeps an either/or together even when its titles are in capitals", () => {
    const [req] = printedAudit(
      "MATH 1350 CALCULUS I",
      "OR",
      "MATH 1300 CALCULUS",
      "SELECT FROM: MATH 1350, 1300",
    ).requirements;
    expect(req.options).toEqual(["MATH 1350", "MATH 1300"]);
  });

  it("doesn't take a sentence that starts with a course code for a title", () => {
    const [req] = printedAudit(
      "TECHNICAL ELECTIVES",
      "Choose one course from the list.",
      "CS 4500 is the one most students take.",
      "NEEDS: 3.0 HOURS",
      "SELECT FROM: CS 4500, 4720",
    ).requirements;
    expect(req).toMatchObject({ title: "TECHNICAL ELECTIVES", type: "pool" });
  });

  it("doesn't take a wrapped line that starts with a course code for a title", () => {
    // The line above hasn't finished its sentence, so this carries it on
    const [req] = printedAudit(
      "TECHNICAL ELECTIVES",
      "Choose one course, for example",
      "CS 4500 or another systems course",
      "NEEDS: 3.0 HOURS",
      "SELECT FROM: CS 4500, 4720",
    ).requirements;
    expect(req).toMatchObject({ title: "TECHNICAL ELECTIVES", type: "pool" });
  });

  it("trusts the site PDF's own marks over what a line looks like", () => {
    // "CS 4500 Operating Systems I" reads like a title, but has no + or -
    const at = (x, text) => ({ x, text });
    const [req] = pdfToAudit([
      at(37, "PREPARED: 11/05/26 - 01:32 PM 100000001"),
      at(37, "NO Some Program - Core"),
      at(58, "- TECHNICAL ELECTIVES"),
      at(103, "Choose one course from the list."),
      at(103, "CS 4500 Operating Systems I"),
      at(103, "NEEDS: 3.0 HOURS"),
      at(103, "SELECT FROM: CS 4500,4720"),
      at(101, "Course History"),
      at(103, "FA26 CS 3300 3.0 *** Intro to Software Engineering"),
    ]).requirements;
    expect(req).toMatchObject({
      title: "TECHNICAL ELECTIVES",
      type: "pool",
      status: "needs",
    });
  });

  // A printed-layout block with its own totals printed under the heading
  const printedBlock = (totals, ...subLines) =>
    pdfToAudit([
      { x: 106, text: "Some Program - Core" },
      ...totals.map((text) => ({ x: 100, text })),
      ...subLines.map((text) => ({ x: 132, text })),
      { x: 106, text: "Course History" },
      { x: 133, text: "FA26 CS 3300 3.0 *** Intro to Software Engineering" },
    ]).requirements;

  it("printed: a block that needs nothing can't hold an unmet requirement", () => {
    const lines = ["CS 4500 Operating Systems I", "SELECT FROM: CS 4500"];
    // The block prints EARNED and no NEEDS: everything in it is met
    expect(printedBlock(["EARNED: 30.0 HOURS"], ...lines)[0].status).toBe(
      "complete",
    );
    // A NEEDS line, or no totals at all, leaves the reading as it was
    expect(
      printedBlock(["EARNED: 27.0 HOURS", "NEEDS: 3.0 HOURS"], ...lines)[0]
        .status,
    ).toBe("needs");
    expect(printedBlock([], ...lines)[0].status).toBe("needs");
    // "NEEDS: 2.000 GPA" is a reminder, not something missing
    expect(
      printedBlock(["EARNED: 30.0 HOURS", "NEEDS: 2.000 GPA"], ...lines)[0]
        .status,
    ).toBe("complete");
  });

  it("printed: a block that needs something, with one requirement in words only, means that one", () => {
    const totals = ["EARNED: 3 SUB-GROUPS", "NEEDS: 1 SUB-GROUP"];
    const [req] = printedBlock(
      totals,
      "EXIT INTERVIEW",
      "Complete an exit interview in your final semester.",
    );
    expect(req).toMatchObject({ title: "EXIT INTERVIEW", status: "needs" });

    // Two in words only: no telling which, so neither is guessed
    expect(
      printedBlock(
        totals,
        "EXIT INTERVIEW",
        "Complete an exit interview.",
        "SENIOR SURVEY",
        "Fill in the senior survey.",
      ),
    ).toEqual([]);
  });

  it("site PDF: marks are trusted, so the block's totals change nothing", () => {
    // The block needs something and holds one paragraph in words only.
    // Printed, that paragraph would be taken for the unmet requirement;
    // here it has no "-" mark, so it's information.
    const at = (x, text) => ({ x, text });
    const { requirements } = pdfToAudit([
      at(37, "PREPARED: 11/05/26 - 01:32 PM 100000001"),
      at(37, "NO Some Program - Core"),
      at(57, "EARNED: 27.0 HOURS"),
      at(57, "NEEDS: 3.0 HOURS"),
      at(103, "PROGRAM INFORMATION"),
      at(103, "Read this before choosing courses."),
      at(101, "Course History"),
      at(103, "FA26 CS 3300 3.0 *** Intro to Software Engineering"),
    ]);
    expect(requirements).toEqual([]);
  });

  it("rejects a PDF that isn't an audit", () => {
    const lines = [
      { x: 72, text: "Lab report" },
      { x: 72, text: "Results were as expected." },
    ];
    expect(() => pdfToAudit(lines)).toThrow(AuditError);
  });
});

describe("textLines", () => {
  // A text piece as pdf.js reports it: its words, where it starts, its width
  const piece = (str, x, y, width = str.length * 5) => ({ str, x, y, width });

  it("puts pieces back into lines, top to bottom and left to right", () => {
    const page = [
      piece("SECOND LINE", 132, 680), // lower on the page, though first
      piece("3.0", 313, 700),
      piece("FA26", 133, 700),
      piece("CS 3300", 167, 701), // a hair off the same height: same line
    ];
    expect(textLines([page])).toEqual([
      { x: 133, text: "FA26 CS 3300 3.0" },
      { x: 132, text: "SECOND LINE" },
    ]);
  });

  it("joins a word the PDF split in two, and keeps the pages in order", () => {
    const first = [
      piece("Introduction to Di", 193, 500, 86),
      piece("ff", 279, 500, 7), // starts right where the last piece ends
      piece("erential Equations", 286, 500, 90),
    ];
    const second = [piece(" ", 10, 900), piece("Page two", 132, 900)];
    expect(textLines([first, second]).map((l) => l.text)).toEqual([
      "Introduction to Differential Equations",
      "Page two",
    ]);
  });
});

// The shared rule both imports use, given hand-made sub-requirements
describe("buildRequirements: rules with no course list", () => {
  // An in-progress sub-requirement with one course counted toward it
  const sub = (titleLines) => ({
    status: "in-progress",
    titleLines,
    select: [],
    applied: [{ code: "CS 4420", credits: 3 }],
    needHours: null,
    needCourses: null,
  });
  const titles = (section, titleLines) =>
    buildRequirements([{ section, subs: [sub(titleLines)] }]).map(
      (r) => r.title,
    );

  it("keeps one that courses count toward", () => {
    expect(
      titles("Computer Engineering - Technical Electives", [
        "TECHNICAL ELECTIVES",
      ]),
    ).toEqual(["TECHNICAL ELECTIVES"]);
  });

  it("drops whole-degree rules, named in the title or the section", () => {
    expect(
      titles("Electrical Engineering - Core", ["ELECTRICAL ENGINEERING GPA"]),
    ).toEqual([]);
    expect(titles("Minor Residency", ["TOTAL HOURS"])).toEqual([]);
    expect(titles("College of Engineering - Residency", [])).toEqual([]);
  });
});
