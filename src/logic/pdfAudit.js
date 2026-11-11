// =====================================================================
// logic/pdfAudit.js — an audit PDF's text -> our audit JSON.
//
// The PDF counterpart of the bookmarklet's scrapers. Those read the audit
// PAGE (its elements); this reads the audit as TEXT, one line at a time.
// Both hand the same plain values to logic/auditBuild.js, which makes the
// requirements and courses, so the two imports can't disagree.
//
// Two kinds of audit PDF are understood. Their lines say the same things;
// they differ in how a line shows what it is:
//   "printed"  the audit web page printed to PDF. Nothing marks a
//              sub-requirement's status, so it's worked out from what the
//              sub-requirement holds (see printedStatus).
//   "site"     the audit site's own PDF. A block starts "NO", "OK" or
//              "IP"; a sub-requirement starts "+" (done) or "-" (not).
//
//   textLines(pages)    pdf.js text pieces -> lines of text
//   pdfToAudit(lines)   lines -> audit JSON (throws AuditError if the PDF
//                       isn't an audit)
//
// Pure logic: no `document`, no pdf.js (ui/pdfReader.js does the reading).
// Tested in pdfAudit.test.js against made-up audits in both layouts.
// =====================================================================

import { SCHEMA, AuditError } from "./parser.js";
import {
  buildRequirements,
  coursesFromRows,
  linkCourses,
  studentTotals,
} from "./auditBuild.js";

// ---------------------------------------------------------------------
// 1. Text pieces -> lines
// ---------------------------------------------------------------------

/**
 * pdf.js gives a page's text as loose pieces, each with a position. This
 * puts them back into lines, top to bottom, left to right.
 *
 * `pages` is one list per page of { str, x, y, width }. Returns
 * [{ x, text }]: each line's text, and where it starts from the left
 * (the printed layout shows headings by how far in they start).
 */
export function textLines(pages) {
  const lines = [];
  for (const pieces of pages) {
    // Pieces at (nearly) the same height are one line
    const rows = [];
    for (const piece of pieces) {
      if (!piece.str.trim()) continue;
      const row = rows.find((r) => Math.abs(r.y - piece.y) < 2.5);
      if (row) row.pieces.push(piece);
      else rows.push({ y: piece.y, pieces: [piece] });
    }
    rows.sort((a, b) => b.y - a.y); // PDF heights count up from the bottom

    for (const row of rows) {
      row.pieces.sort((a, b) => a.x - b.x);
      let text = "";
      let end = null; // where the previous piece stopped
      for (const piece of row.pieces) {
        // Pieces that touch are one word split in two ("Di" + "ff" +
        // "erential"); a gap between them is a space
        if (end !== null && piece.x - end > 1) text += " ";
        text += piece.str;
        end = piece.x + piece.width;
      }
      lines.push({ x: row.pieces[0].x, text: clean(text) });
    }
  }
  return lines;
}

// Text with runs of spaces collapsed
function clean(text) {
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------
// 2. What each line is
// ---------------------------------------------------------------------

// A course row: "FA26 CS 3300 3.0 *** Intro to Software Engineering".
// Groups: season, year, code, credits, grade, flags (">E >S"), title.
const ROW =
  /^(FA|SP|SU)(\d{2}) ([A-Z]{2,4} ?\d{4}[A-Z]*) (\d+(?:\.\d+)?) (\S+)((?: >\S+)*) (.+)$/;

// Lines that are furniture, not part of the audit: the browser's print
// header and footer, the site PDF's page numbers and table headings
const NOISE = [
  /^\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2} ?[AP]M\b/, // "11/10/26, 11:20 PM My Audit…"
  /^https?:\/\//,
  /^Page \d+ of \d+$/,
  /^Term Course Credits Grade Title$/,
  /^Open All Sections\b/,
];

// Blocks that aren't requirements to plan for (as in the bookmarklet)
const HISTORY = /^Course History$/;
const NOT_REQUIREMENTS =
  /^(WORK NOT APPLIED TO THIS PROGRAM|\*\*\*LEGEND\*\*\*)$/;

/**
 * Sort every line into a kind, with the values read from it. `layout` is
 * { site, rowX }: which kind of PDF this is, and how far in its course
 * rows start (headings are judged against that).
 */
function classify(line, previous, layout) {
  const { text, x } = line;
  const { site, rowX } = layout;
  let m;

  if ((m = text.match(ROW))) {
    return {
      kind: "row",
      row: {
        term: m[1] + m[2],
        code: m[3],
        credits: Number(m[4]),
        grade: m[5],
        flags: m[6].trim().split(" ").filter(Boolean),
        lines: [m[7]],
      },
    };
  }
  // Extra lines under a course row ("CO-PPCC: MAT201") sit far to the
  // right, under the row's title
  if (x > rowX + 60 && ["row", "more"].includes(previous?.kind)) {
    return { kind: "more" };
  }
  if (HISTORY.test(text) || NOT_REQUIREMENTS.test(text)) {
    return { kind: "block", title: text, status: null };
  }
  if (/^EARNED:/.test(text)) return { kind: "summary", says: "earned" };
  if (/^IN PROGRESS\b/.test(text)) {
    return { kind: "summary", says: "in-progress" };
  }
  if ((m = text.match(/^NEEDS: ?(.*)$/))) {
    return {
      kind: "needs",
      hours: numberBefore(m[1], /HOURS?\b/),
      courses: numberBefore(m[1], /COURSES?\b/),
      subGroups: numberBefore(m[1], /SUB-GROUPS?\b/),
    };
  }
  if ((m = text.match(/^SELECT FROM: ?(.*)$/))) {
    return { kind: "select", codes: codeList(m[1]) };
  }
  // A long SELECT FROM list runs on to the next line
  if (
    previous?.kind === "select" &&
    /^[,\s]*([A-Z]{2,4} ?)?\d{4}[A-Z]*(\s*,|$)/.test(text)
  ) {
    return { kind: "select", codes: codeList(text, previous.codes.at(-1)) };
  }
  if ((m = text.match(/^\(? ?([\d.]+) HOURS? (ADDED|TAKEN)\b/))) {
    return { kind: "earned", hours: Number(m[1]) };
  }
  if ((m = text.match(/^IN-P ---> ?([\d.]+) HOURS?\b/))) {
    return { kind: "in-progress", hours: Number(m[1]) };
  }
  if (
    (m = text.match(/^([\d.]+) ATTEMPTED HOURS [\d.]+ POINTS ([\d.]+) GPA$/))
  ) {
    return { kind: "gpa", attemptedHours: Number(m[1]), gpa: Number(m[2]) };
  }

  // Block headings. Site PDF: "NO Computer Engineering - Core", at the
  // far left. Printed: any other line that starts left of the rest.
  if (site) {
    if (x < rowX - 30 && (m = text.match(/^(NO|OK|IP) (\S.*)$/))) {
      return { kind: "block", title: m[2], status: m[1] };
    }
    // A sub-requirement's mark, then its title: "- CS 4500 Operating…"
    if (x < rowX - 30 && (m = text.match(/^([+\-*]) (\S.*)$/))) {
      return { kind: "text", words: m[2], marker: m[1] };
    }
  } else if (x < rowX - 10) {
    return { kind: "block", title: text, status: null };
  }
  return { kind: "text", words: text, marker: null };
}

// The number just before a word: numberBefore("6.0 HOURS 2 COURSES",
// /COURSES?/) -> 2. null if the word isn't there.
function numberBefore(text, word) {
  const m = text.match(new RegExp(`([\\d.]+) ${word.source}`));
  return m ? Number(m[1]) : null;
}

/**
 * "ECE 4020,4910, CS 4200" -> ["ECE 4020", "ECE 4910", "CS 4200"]. A
 * number with no department takes the one before it; `after` is the last
 * code of the line above, for a list that ran on to a second line.
 */
function codeList(text, after = "") {
  const codes = [];
  let department = after.split(" ")[0];
  for (const m of text.matchAll(/([A-Z]{2,4})? ?(\d{4}[A-Z]*)/g)) {
    if (m[1]) department = m[1];
    if (department) codes.push(`${department} ${m[2]}`);
  }
  return codes;
}

// ---------------------------------------------------------------------
// 3. Lines -> blocks of sub-requirements
// ---------------------------------------------------------------------

/**
 * Walk the lines once, collecting blocks ("Computer Engineering - Core")
 * and the sub-requirements inside each:
 * [{ title, subs: [{ marker, titleLines, select, applied, … }] }]
 */
function readBlocks(lines, layout) {
  const blocks = [];
  let block = null; // the block being filled
  let sub = null; // the sub-requirement being filled
  let lastRow = null;
  let previous = null; // the line before, with its kind

  const startSub = (marker = null) => {
    sub = {
      marker,
      titleLines: [],
      select: [],
      applied: [],
      needHours: null,
      needCourses: null,
      earnedHours: null,
      inProgressHours: null,
      hasGpa: false,
      gpa: null,
      attemptedHours: null,
    };
    block.subs.push(sub);
  };

  for (const line of lines) {
    const info = { ...classify(line, previous, layout), text: line.text };
    const before = previous;
    previous = info;

    if (info.kind === "block") {
      block = { title: info.title, subs: [], totals: new Set() };
      blocks.push(block);
      sub = null;
      continue;
    }
    if (!block) continue; // before the first block
    // The block's own totals, printed under its heading: EARNED, IN
    // PROGRESS and, if it still lacks something, NEEDS
    if (info.kind === "summary") {
      block.totals.add(info.says);
      continue;
    }

    if (info.kind === "text") {
      if (info.marker || !sub || startsSub(info.words, before, layout)) {
        startSub(info.marker);
      }
      sub.titleLines.push(info.words);
      continue;
    }

    // Everything else is data, which belongs to a sub-requirement. A block
    // can open straight into rows (Course History's "Transfer credit")
    if (!sub) {
      if (info.kind === "needs") {
        // The block's own NEEDS line. One about GPA alone is a reminder.
        const lacks = [info.hours, info.courses, info.subGroups];
        if (lacks.some((n) => n !== null)) block.totals.add("needs");
        continue;
      }
      startSub();
    }
    if (info.kind === "row") {
      lastRow = info.row;
      sub.applied.push(lastRow);
    } else if (info.kind === "more") {
      lastRow?.lines.push(line.text);
    } else if (info.kind === "needs") {
      sub.needHours = info.hours;
      sub.needCourses = info.courses;
    } else if (info.kind === "select") {
      sub.select.push(...info.codes);
    } else if (info.kind === "earned") {
      sub.earnedHours = info.hours;
    } else if (info.kind === "in-progress") {
      sub.inProgressHours = info.hours;
    } else if (info.kind === "gpa") {
      Object.assign(sub, {
        hasGpa: true,
        gpa: info.gpa,
        attemptedHours: info.attemptedHours,
      });
    }
  }
  return blocks;
}

/**
 * Does this line of plain text start a new sub-requirement, or carry on
 * the one before (its description, a NOTE, the second half of an
 * either/or)? `before` is the line above.
 */
function startsSub(text, before, layout) {
  // Text straight after a sub-requirement's data (its rows, NEEDS, SELECT
  // FROM…) can't belong to it: that one is finished
  if (before?.kind !== "text") return true;
  if (layout.site) return false; // the site PDF marks its own with + or -
  if (text === "OR" || before.text === "OR" || /^NOTE\b/.test(text)) {
    return false;
  }
  // Printed titles are either in capitals ("TECHNICAL ELECTIVES")…
  if (!/[a-z]/.test(text) && /[A-Z]{3}/.test(text)) return true;
  // …or a course ("MATH 1350 Calculus I"). A description can wrap on to a
  // line that starts with a course code too, so a course only counts as a
  // title when the line above finished its sentence.
  return (
    /^[A-Z]{2,4} \d{4}[A-Z]* \S/.test(text) &&
    !/[.,;:]$/.test(text) &&
    /[.:)]$/.test(before.text)
  );
}

// ---------------------------------------------------------------------
// 4. Blocks -> the plain values auditBuild.js works from
// ---------------------------------------------------------------------

// One sub-requirement as collected -> the shape auditBuild.js takes
function finishSub(sub, layout) {
  return {
    ...sub,
    status: layout.site ? siteStatus(sub) : printedStatus(sub),
    titleLines: paragraphs(sub.titleLines),
  };
}

// True when the audit counts on a course still being taken
const isInProgress = (sub) =>
  sub.inProgressHours !== null || sub.applied.some((r) => r.grade === "***");

// Site PDF: "-" isn't met; "+" is met, or will be once the courses in
// progress are passed; no mark is information only
function siteStatus(sub) {
  if (sub.marker === "-") return "needs";
  if (sub.marker === "+") return isInProgress(sub) ? "in-progress" : "complete";
  return null;
}

// Printed page: the status icons don't print, so read it from what's
// there. Still needing hours or courses, or offering courses to SELECT
// FROM, means not met. (A "NEEDS: 2.000 GPA" line is only a reminder.)
function printedStatus(sub) {
  if (sub.needHours !== null || sub.needCourses !== null || sub.select.length) {
    return "needs";
  }
  if (isInProgress(sub)) return "in-progress";
  if (sub.applied.length || sub.earnedHours !== null || sub.hasGpa) {
    return "complete";
  }
  return null; // only words: information
}

/**
 * Printed page only: check the guessed statuses against the block's own
 * totals, which are stated outright, and fix the two cases where they
 * disagree. (A block that prints no totals is left as guessed.)
 * - The block has totals but no NEEDS line, so it lacks nothing: a
 *   sub-requirement in it can't be unmet, whatever it looked like.
 * - The block says it NEEDS something, yet nothing in it reads as unmet:
 *   the unmet one must be written in words only. If exactly one is, that's
 *   it. With several, there's no telling which, so they're left alone.
 */
function checkAgainstBlock(subs, totals) {
  if (totals.size === 0) return;
  if (!totals.has("needs")) {
    for (const sub of subs) {
      if (sub.status !== "needs") continue;
      sub.status = isInProgress(sub) ? "in-progress" : "complete";
    }
    return;
  }
  if (subs.some((sub) => sub.status === "needs")) return;
  const wordsOnly = subs.filter((sub) => sub.status === null);
  if (wordsOnly.length === 1) wordsOnly[0].status = "needs";
}

/**
 * A PDF wraps long text, so a description arrives as several lines. Join
 * them back up: the title stays first, the choices of an either/or
 * ("OR" and the line after it) stay on their own, and everything else
 * runs together. Otherwise a wrapped line that happens to start with a
 * course code would be taken for another course title.
 */
function paragraphs(lines) {
  const out = [];
  let joining = false; // true while the last entry is running description
  lines.forEach((line, i) => {
    const alone = i === 0 || line === "OR" || lines[i - 1] === "OR";
    if (alone || !joining) out.push(line);
    else out[out.length - 1] += " " + line;
    joining = !alone;
  });
  return out;
}

// ---------------------------------------------------------------------
// 5. The student header
// ---------------------------------------------------------------------

const SEASON_OF_TERM_CODE = { 1: "Spring", 4: "Summer", 7: "Fall" };

/** The audit's header lines -> the `student` object, without the totals. */
function readStudent(lines, layout) {
  const texts = lines.map((l) => l.text);
  const find = (pattern) => texts.findIndex((t) => pattern.test(t));
  const programs = texts.find((t) => /^Program:/.test(t));
  const student = {
    name: "Unknown student",
    degreeTitle: null,
    programCode: null,
    programs: programs
      ? programs
          .replace(/^Program:/, "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    catalogYear: null,
    preparedOn: null,
    graduationDate: null,
    allRequirementsMet: !texts.some((t) =>
      /AT LEAST ONE REQUIREMENT HAS NOT BEEN SATISFIED/.test(t),
    ),
  };

  if (layout.site) {
    // PREPARED: 11/05/26 - 01:35 PM …     then the name on the next line
    // REQUESTED: ESBS---CPEN CATALOG YEAR: 20237   then the degree
    const prepared = find(/^PREPARED:/);
    const requested = find(/^REQUESTED:/);
    const when = texts[prepared]?.match(
      /(\d{2})\/(\d{2})\/(\d{2}) ?- ?(\d{1,2}):(\d{2}) ?([AP]M)/,
    );
    const catalog = texts[requested]?.match(/CATALOG YEAR: ?(\d{4})(\d)/);
    student.name = texts[prepared + 1] ?? student.name;
    student.degreeTitle = texts[requested + 1] ?? null;
    student.programCode =
      texts[requested]?.match(/^REQUESTED: ?(\S+)/)?.[1] ?? null;
    student.preparedOn = when ? isoLocal(when, "20" + when[3]) : null;
    if (catalog && SEASON_OF_TERM_CODE[catalog[2]]) {
      student.catalogYear = `${SEASON_OF_TERM_CODE[catalog[2]]} ${catalog[1]}`;
    }
  } else {
    // Name, then degree, then a small table: its headings on one line
    // ("Prepared On  Program Code  Catalog Year …"), its values on the next
    const headings = find(/^Prepared On\b/);
    if (headings >= 2) {
      const values = texts[headings + 1] ?? "";
      const when = values.match(
        /(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2}) ?([AP]M)/,
      );
      student.name = texts[headings - 2];
      student.degreeTitle = texts[headings - 1];
      student.programCode = values.match(/[AP]M (\S+)/)?.[1] ?? null;
      student.catalogYear =
        values.match(/(Spring|Summer|Fall) \d{4}/)?.[0] ?? null;
      student.preparedOn = when ? isoLocal(when, when[3]) : null;
    }
  }
  return student;
}

// Date pieces [, month, day, , hour, minute, AM/PM] -> "2026-11-05T13:32:00"
function isoLocal([, month, day, , hour, minute, ampm], year) {
  let h = Number(hour) % 12;
  if (ampm === "PM") h += 12;
  return `${year}-${month}-${day}T${String(h).padStart(2, "0")}:${minute}:00`;
}

// ---------------------------------------------------------------------
// 6. Putting it together
// ---------------------------------------------------------------------

/**
 * An audit PDF's lines (from textLines) -> audit JSON, ready for
 * parseAudit(). `now` stamps when it was imported.
 * Throws AuditError if the lines aren't a degree audit.
 */
export function pdfToAudit(allLines, now = new Date()) {
  const lines = allLines.filter(
    (line) => !NOISE.some((pattern) => pattern.test(line.text)),
  );
  const rowStarts = lines
    .filter((line) => ROW.test(line.text))
    .map((line) => line.x)
    .sort((a, b) => a - b);
  if (rowStarts.length === 0) {
    throw new AuditError(
      "That PDF doesn't look like a degree audit: no course rows were found in it.",
    );
  }
  const layout = {
    site: lines.some((line) => /^PREPARED:/.test(line.text)),
    rowX: rowStarts[Math.floor(rowStarts.length / 2)], // the usual start
  };

  const blocks = readBlocks(lines, layout).map((block) => {
    const subs = block.subs.map((sub) => finishSub(sub, layout));
    if (!layout.site) checkAgainstBlock(subs, block.totals);
    return { section: block.title, subs };
  });
  const history = blocks.find((b) => HISTORY.test(b.section));
  const required = blocks.filter(
    (b) => b !== history && !NOT_REQUIREMENTS.test(b.section),
  );
  const allSubs = required.flatMap((b) => b.subs);

  // Course History lists each attempt once. Without it, fall back to
  // every course row in the requirements.
  const rows = (history?.subs ?? allSubs).flatMap((sub) => sub.applied);
  const requirements = buildRequirements(required);

  return {
    schema: SCHEMA,
    source: {
      type: "pdf",
      importedAt: now.toISOString(),
      collectorVersion: null,
      exportedAt: null,
    },
    student: { ...readStudent(lines, layout), ...studentTotals(allSubs) },
    requirements,
    courses: linkCourses(coursesFromRows(rows), requirements),
  };
}
