// src/logic/pdfAudit.js — converts an audit PDF's text to audit JSON.
//
// The PDF counterpart of the bookmarklet scrapers. Both pass the same plain
// values to logic/auditBuild.js.
//
// Two PDF layouts are supported:
//   "printed"  the audit page printed to PDF. Status marks don't print, so
//              status is inferred from content (printedStatus).
//   "site"     the audit site's own PDF. Blocks start "NO", "OK" or "IP";
//              sub-requirements start "+" (met) or "-" (not met).
//
//   textLines(pages)    pdf.js text pieces -> lines
//   pdfToAudit(lines)   lines -> audit JSON; throws AuditError if not an audit
//
// Used by: ui/importer.js (text comes from ui/pdfReader.js).
// Pure logic, no DOM or pdf.js. Tests: pdfAudit.test.js.

import { SCHEMA, AuditError } from "./parser.js";
import {
  buildRequirements,
  coursesFromRows,
  linkCourses,
  studentTotals,
} from "./auditBuild.js";

// ---------- 1. Text pieces -> lines ----------

/**
 * Rebuilds lines from pdf.js text pieces, top to bottom, left to right.
 * `pages`: one list per page of { str, x, y, width }.
 * Returns [{ x, text }]; x is where the line starts from the left.
 */
export function textLines(pages) {
  const lines = [];
  for (const pieces of pages) {
    // Pieces at nearly the same height form one line.
    const rows = [];
    for (const piece of pieces) {
      if (!piece.str.trim()) continue;
      const row = rows.find((r) => Math.abs(r.y - piece.y) < 2.5);
      if (row) row.pieces.push(piece);
      else rows.push({ y: piece.y, pieces: [piece] });
    }
    rows.sort((a, b) => b.y - a.y); // PDF y counts up from the bottom

    for (const row of rows) {
      row.pieces.sort((a, b) => a.x - b.x);
      let text = "";
      let end = null; // where the previous piece ended
      for (const piece of row.pieces) {
        // Touching pieces are one word ("Di" + "ff" + "erential"); a gap is a
        // space.
        if (end !== null && piece.x - end > 1) text += " ";
        text += piece.str;
        end = piece.x + piece.width;
      }
      lines.push({ x: row.pieces[0].x, text: clean(text) });
    }
  }
  return lines;
}

// Collapses runs of spaces.
function clean(text) {
  return text.replace(/\s+/g, " ").trim();
}

// ---------- 2. Classifying lines ----------

// Course row: "FA26 CS 3300 3.0 *** Intro to Software Engineering".
// Groups: season, year, code, credits, grade, flags (">E >S"), title.
const ROW =
  /^(FA|SP|SU)(\d{2}) ([A-Z]{2,4} ?\d{4}[A-Z]*) (\d+(?:\.\d+)?) (\S+)((?: >\S+)*) (.+)$/;

// Lines that are not audit content: print headers and footers, page numbers,
// table headings.
const NOISE = [
  /^\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2} ?[AP]M\b/, // "11/10/26, 11:20 PM My Audit…"
  /^https?:\/\//,
  /^Page \d+ of \d+$/,
  /^Term Course Credits Grade Title$/,
  /^Open All Sections\b/,
];

// Blocks that are not requirements (same as the bookmarklet).
const HISTORY = /^Course History$/;
const NOT_REQUIREMENTS =
  /^(WORK NOT APPLIED TO THIS PROGRAM|\*\*\*LEGEND\*\*\*)$/;

/**
 * Classifies a line and reads its values.
 * `layout` is { site, rowX }: the PDF kind, and the x where course rows start.
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
  // Extra lines under a course row ("CO-PPCC: MAT201") sit far right, under its
  // title.
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
  // A long SELECT FROM list continues on the next line.
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

  // Block headings. Site: "NO Computer Engineering - Core" at the far left.
  // Printed: any other line starting left of the rest.
  if (site) {
    if (x < rowX - 30 && (m = text.match(/^(NO|OK|IP) (\S.*)$/))) {
      return { kind: "block", title: m[2], status: m[1] };
    }
    // Sub-requirement mark, then title: "- CS 4500 Operating…".
    if (x < rowX - 30 && (m = text.match(/^([+\-*]) (\S.*)$/))) {
      return { kind: "text", words: m[2], marker: m[1] };
    }
  } else if (x < rowX - 10) {
    return { kind: "block", title: text, status: null };
  }
  return { kind: "text", words: text, marker: null };
}

// The number just before a word, or null:
// numberBefore("6.0 HOURS 2 COURSES", /COURSES?/) -> 2.
function numberBefore(text, word) {
  const m = text.match(new RegExp(`([\\d.]+) ${word.source}`));
  return m ? Number(m[1]) : null;
}

/**
 * "ECE 4020,4910, CS 4200" -> ["ECE 4020", "ECE 4910", "CS 4200"].
 * A number with no department takes the previous one. `after` is the last
 * code of the line above, for a list continued from it.
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

// ---------- 3. Lines -> blocks of sub-requirements ----------

/**
 * Collects blocks and their sub-requirements in one pass:
 * [{ title, subs: [{ marker, titleLines, select, applied, … }] }].
 */
function readBlocks(lines, layout) {
  const blocks = [];
  let block = null; // block being filled
  let sub = null; // sub-requirement being filled
  let lastRow = null;
  let previous = null; // previous line, classified

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
    // The block's own totals under its heading: EARNED, IN PROGRESS, NEEDS.
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

    // Everything else is data for a sub-requirement. A block can open straight
    // into rows (Course History's "Transfer credit").
    if (!sub) {
      if (info.kind === "needs") {
        // The block's own NEEDS line. GPA alone is a reminder, not a need.
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
 * True if a plain-text line starts a new sub-requirement; false if it
 * continues the previous one. `before` is the line above.
 */
function startsSub(text, before, layout) {
  // Text after a sub-requirement's data (rows, NEEDS, SELECT FROM) starts a new
  // one.
  if (before?.kind !== "text") return true;
  if (layout.site) return false; // the site PDF marks its own with + or -
  if (text === "OR" || before.text === "OR" || /^NOTE\b/.test(text)) {
    return false;
  }
  // Printed titles are in capitals ("TECHNICAL ELECTIVES")…
  if (!/[a-z]/.test(text) && /[A-Z]{3}/.test(text)) return true;
  // …or a course ("MATH 1350 Calculus I"). A wrapped description can also
  // start with a course code, so this counts only when the line above ended
  // its sentence.
  return (
    /^[A-Z]{2,4} \d{4}[A-Z]* \S/.test(text) &&
    !/[.,;:]$/.test(text) &&
    /[.:)]$/.test(before.text)
  );
}

// ---------- 4. Blocks -> values for auditBuild.js ----------

// A collected sub-requirement -> the shape auditBuild.js takes.
function finishSub(sub, layout) {
  return {
    ...sub,
    status: layout.site ? siteStatus(sub) : printedStatus(sub),
    titleLines: paragraphs(sub.titleLines),
  };
}

// True when the audit counts a course still being taken.
const isInProgress = (sub) =>
  sub.inProgressHours !== null || sub.applied.some((r) => r.grade === "***");

// Site PDF: "-" not met; "+" met, or met once in-progress courses pass;
// no mark is information only.
function siteStatus(sub) {
  if (sub.marker === "-") return "needs";
  if (sub.marker === "+") return isInProgress(sub) ? "in-progress" : "complete";
  return null;
}

// Printed page: status inferred from content. Needing hours or courses, or
// listing courses to SELECT FROM, means not met. "NEEDS: 2.000 GPA" alone
// is a reminder.
function printedStatus(sub) {
  if (sub.needHours !== null || sub.needCourses !== null || sub.select.length) {
    return "needs";
  }
  if (isInProgress(sub)) return "in-progress";
  if (sub.applied.length || sub.earnedHours !== null || sub.hasGpa) {
    return "complete";
  }
  return null; // text only: information
}

/**
 * Printed page only: corrects inferred statuses against the block's stated
 * totals.
 * - Totals but no NEEDS line: no sub-requirement in the block is unmet.
 * - NEEDS something but nothing reads as unmet: if exactly one sub-requirement
 *   is text only, that one is unmet. With several, none is changed.
 * Blocks with no totals are left as inferred.
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
 * Rejoins wrapped description lines. The title stays first; either/or
 * choices ("OR" and the line after) stay separate; the rest is joined, so a
 * wrapped line starting with a course code isn't read as a title.
 */
function paragraphs(lines) {
  const out = [];
  let joining = false; // the last entry is running description
  lines.forEach((line, i) => {
    const alone = i === 0 || line === "OR" || lines[i - 1] === "OR";
    if (alone || !joining) out.push(line);
    else out[out.length - 1] += " " + line;
    joining = !alone;
  });
  return out;
}

// ---------- 5. Student header ----------

const SEASON_OF_TERM_CODE = { 1: "Spring", 4: "Summer", 7: "Fall" };

/** Header lines -> the `student` object, without totals. */
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
    // PREPARED: 11/05/26 - 01:35 PM …               name on the next line
    // REQUESTED: ESBS---CPEN CATALOG YEAR: 20237    then the degree
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
    // Name, degree, then a table: headings on one line ("Prepared On  Program
    // Code  Catalog Year …"), values on the next.
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

// ---------- 6. Assembly ----------

/**
 * Lines from textLines() -> audit JSON for parseAudit(). `now` is the
 * import time. Throws AuditError if the lines are not a degree audit.
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
    rowX: rowStarts[Math.floor(rowStarts.length / 2)], // median row start
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

  // Course History lists each attempt once. Without it, use every course row
  // in the requirements.
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
