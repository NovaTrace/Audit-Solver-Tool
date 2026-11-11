// =====================================================================
// logic/auditBuild.js — turning what was READ from an audit into our
// audit JSON (the "requirements", "courses" and student totals).
//
// An audit can be read two ways, and both hand the same plain values here:
//   bookmarklet/scrape/*.js   reads the audit web page (its elements)
//   logic/pdfAudit.js         reads the text of an audit PDF
// Keeping the DECISIONS in this one file (is a course completed? is this
// requirement a single course, a pool or a rule?) means both imports
// agree, and a fix made here fixes both.
//
// The plain values (see the Audit JSON Data Guide for what they become):
//   sub-requirement  { status, titleLines, select, applied, needHours,
//                      needCourses, earnedHours, inProgressHours, gpa,
//                      attemptedHours }
//   course row       { term, code, credits, grade, flags, lines }
//
// Pure logic: no `document`. Tested through bookmarklet.test.js and
// pdfAudit.test.js.
// =====================================================================

import { normalizeCode, idFromCode, codesIn } from "./courseText.js";

// ---------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------

// A title line that starts with a course code: "CS 4500 Operating Systems I"
const COURSE_TITLE = /^[A-Z]{2,4} \d{4}\b/;

/**
 * The audit's requirement blocks -> the `requirements` array.
 * `blocks` is [{ section, subs }]: a block's heading ("Computer
 * Engineering - Core") and the sub-requirements read from it. Our format
 * flattens the two levels: every sub-requirement becomes one requirement,
 * with the block's heading as its `section`.
 */
export function buildRequirements(blocks) {
  const requirements = [];
  const usedIds = new Set();

  for (const { section, subs } of blocks) {
    for (const sub of subs) {
      const req = buildRequirement(sub, section);
      if (!req) continue;
      req.id = uniqueId(`${section}-${req.title}`, usedIds);
      requirements.push(req);
    }
  }
  return requirements;
}

// One sub-requirement -> a requirement, or null if it's information only
function buildRequirement(sub, section) {
  const { status, titleLines, select, applied } = sub;

  // Headings like "PROGRAM INFORMATION": nothing to complete
  if (status === null && !select.length && !applied.length) return null;

  // Title: "CS 4500 Operating Systems I", or the first line of the heading.
  // Either/or titles list each choice on its own line between "OR" lines.
  const courseLines = titleLines.filter((l) => COURSE_TITLE.test(l));
  const isCourse = COURSE_TITLE.test(titleLines[0] ?? "");
  const title = isCourse
    ? courseLines.join(" OR ")
    : (titleLines[0] ?? section);
  const description = titleLines
    .filter((l) => !(isCourse && COURSE_TITLE.test(l)) && l !== "OR")
    .filter((l, i) => isCourse || i > 0 || l !== title)
    .join(" ");

  const titleCodes = isCourse ? courseLines.flatMap((l) => codesIn(l)) : [];
  const options = [...new Set([...titleCodes, ...select])].map(normalizeCode);

  // Rules with no course list (MINIMUM HOURS, residency, GPA, ...) only
  // matter to planning while they still need something
  if (!isCourse && !options.length && status !== "needs") return null;

  return {
    id: null, // set by buildRequirements
    section,
    title,
    type: isCourse ? "course" : options.length ? "pool" : "rule",
    status: status ?? "complete",
    needCourses: sub.needCourses,
    needHours: sub.needHours,
    earnedHours: sub.earnedHours ?? 0,
    inProgressHours: sub.inProgressHours ?? 0,
    options,
    applied: mergeApplied(applied),
    description,
  };
}

// The same course can be listed twice (e.g. a repeat); keep one entry per
// course, with its hours added up
function mergeApplied(rows) {
  const byCode = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    byCode.set(code, (byCode.get(code) ?? 0) + row.credits);
  }
  return [...byCode].map(([code, hours]) => ({ code, hours }));
}

// "Computer Engineering - Core-CS 4500" -> "computer-engineering-core-cs-4500"
function uniqueId(name, used) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

// ---------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------

/**
 * Course-history rows -> the `courses` object: one entry per course, with
 * every attempt. `rows` lists each attempt once, oldest first.
 */
export function coursesFromRows(rows) {
  const courses = {};
  const seen = new Set();
  for (const row of rows) {
    if (!row.term || !row.code) continue;
    const key = `${row.term} ${normalizeCode(row.code)} ${row.grade}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const course = courseFor(courses, row.code);
    course.attempts.push({
      term: row.term,
      grade: row.grade,
      credits: row.credits,
      flags: row.flags,
      transfer: /^T[A-F]/.test(row.grade),
    });
    // Credits until the course details say otherwise: the most recent
    // attempt that carried credit (a W carries 0)
    if (row.credits > 0) course.credits = row.credits;
    course.title ??= row.lines.find((l) => !l.startsWith("CO-")) ?? null;
    course.transferNote ??= row.lines.find((l) => l.startsWith("CO-")) ?? null;
  }
  return courses;
}

/**
 * Point courses and requirements at each other (requirementIds), add the
 * courses that only appear as options, and set every course's status.
 * Changes `courses` in place.
 */
export function linkCourses(courses, requirements) {
  for (const req of requirements) {
    const codes = [...req.applied.map((a) => a.code), ...req.options];
    for (const code of new Set(codes)) {
      const course = courseFor(courses, code);
      if (!course.requirementIds.includes(req.id)) {
        course.requirementIds.push(req.id);
      }
    }
  }

  for (const course of Object.values(courses)) {
    course.status = statusOf(course, requirements);
  }
  return courses;
}

// Completed if any attempt passed; registered if it has a "***" attempt;
// needed if an unfinished requirement asks for exactly this course;
// otherwise one option among several.
function statusOf(course, requirements) {
  const neededAlone = requirements.some(
    (r) =>
      r.status !== "complete" &&
      r.options.length === 1 &&
      r.options[0] === course.code,
  );
  // A pass only counts if the audit accepted it: a D where the requirement
  // wants a C- or better leaves that requirement unfinished
  if (course.attempts.some(passed) && !neededAlone) return "completed";
  if (course.attempts.some((a) => a.grade === "***")) return "registered";
  return neededAlone ? "needed" : "option";
}

function passed(attempt) {
  if (attempt.flags.includes(">E")) return false; // grade forgiveness
  return /^T?([A-D][+-]?|S|P)$/.test(attempt.grade);
}

// The course entry for a code, created on first use
function courseFor(courses, code) {
  const c = normalizeCode(code);
  return (courses[idFromCode(c)] ??= {
    id: idFromCode(c),
    code: c,
    title: null,
    credits: null,
    attempts: [],
    transferNote: null,
    requirementIds: [],
  });
}

// ---------------------------------------------------------------------
// Student totals
// ---------------------------------------------------------------------

/**
 * The degree's hours and overall GPA, found among every sub-requirement
 * on the audit (`subs`). Found by what they say, not by their headings,
 * which vary by school.
 * -> { hoursRequired, hoursEarned, hoursInProgress, gpa, attemptedHours }
 */
export function studentTotals(subs) {
  const minimum = degreeHours(subs);
  const gpa = overallGpa(subs);
  return {
    hoursRequired: minimum?.hours ?? null,
    hoursEarned: minimum?.sub.earnedHours ?? null,
    hoursInProgress: minimum?.sub.inProgressHours ?? null,
    gpa: gpa?.gpa ?? null,
    attemptedHours: gpa?.attemptedHours ?? null,
  };
}

// The degree's total-hours rule: the sub-requirement whose title says "a
// minimum of N" with the largest N (128 for the degree beats 30 for
// residency). -> { sub, hours } or undefined
function degreeHours(subs) {
  let best;
  for (const sub of subs) {
    const match = sub.titleLines.join(" ").match(/minimum of (\d+)/i);
    const hours = match && Number(match[1]);
    if (hours && (!best || hours > best.hours)) best = { sub, hours };
  }
  return best;
}

// The overall GPA: a sub-requirement with a GPA table. If there are
// several (e.g. a major GPA too), prefer the overall one.
function overallGpa(subs) {
  const withGpa = subs.filter((s) => s.hasGpa);
  return (
    withGpa.find((s) =>
      /UNIVERSITY OF|OVERALL|CUMULATIVE|INSTITUTION/i.test(
        s.titleLines.join(" "),
      ),
    ) ?? withGpa[0]
  );
}
