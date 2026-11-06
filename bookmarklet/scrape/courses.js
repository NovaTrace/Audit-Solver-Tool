// bookmarklet/scrape/courses.js — every course the audit mentions.
//
//   scrapeCourses(doc)    attempts from the Course History block, which
//                         lists each attempt once with full credits
//   linkCourses(...)      ties courses to the requirements that list them,
//                         adds courses that only appear as options, and
//                         works out each course's status

import { auditRoot, requirementBlocks, readTakenRow } from "./dom.js";
import { normalizeCode, idFromCode } from "../../src/logic/courseText.js";

/** The audit page -> the `courses` object, from course history. */
export function scrapeCourses(doc) {
  const blocks = requirementBlocks(auditRoot(doc));
  const history = blocks.find((b) => b.getAttribute("rname") === "CRSHIST");
  // Without a Course History block, fall back to every taken-course row
  const rows = [
    ...(history ?? auditRoot(doc)).querySelectorAll(".takenCourse"),
  ];

  const courses = {};
  const seen = new Set();
  for (const row of rows.map(readTakenRow)) {
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
 * Point courses and requirements at each other (requirementIds), and set
 * every course's status. Changes `courses` in place.
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
  if (course.attempts.some(passed)) return "completed";
  if (course.attempts.some((a) => a.grade === "***")) return "registered";
  const neededAlone = requirements.some(
    (r) =>
      r.status !== "complete" &&
      r.options.length === 1 &&
      r.options[0] === course.code,
  );
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
