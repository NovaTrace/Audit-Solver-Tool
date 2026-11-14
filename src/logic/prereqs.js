// src/logic/prereqs.js — prerequisite and corequisite checks.
//
// Course details hold groups parsed by parsePrereqs() (courseText.js):
//   prereqs  every group satisfied before the course's term
//   coreqs   every group satisfied before it, or in the same term
// One course in a group satisfies the group. A course counts if it is
// completed, or planned or registered in an early enough term.
//
//   prereqProblems(), prereqWarning()   is the course planned too early?
//   unlocks()                           which courses need it?
//
// Warnings only: waivers, placement tests, transfer equivalents and
// minimum grades are not visible here.
// Used by: logic/planChecks.js, render/courseList.js.
// Pure functions, no DOM. Tests: prereqs.test.js.

import { idFromCode, termIndex, isTermKey } from "./courseText.js";

/**
 * Unmet groups for a planned course:
 * [{ kind: "prereq" | "coreq", anyOf: ["CS 2060", "ECE 1021"] }].
 * Empty for a course that is unplanned, completed, registered, or has no
 * details loaded.
 */
export function prereqProblems(audit, course) {
  if (!course.plannedTerm) return [];
  if (course.status === "completed" || course.status === "registered") {
    return [];
  }
  const term = termIndex(course.plannedTerm);

  // Groups in `list` that no course satisfies by term index `latest`.
  const unmet = (list, kind, latest) =>
    (list?.groups ?? [])
      .filter(
        (group) =>
          !group.anyOf.some(
            (code) => code === course.code || doneBy(audit, code, latest),
          ),
      )
      .map((group) => ({ kind, anyOf: group.anyOf }));

  return [
    ...unmet(course.prereqs, "prereq", term - 1), // at least one term earlier
    ...unmet(course.coreqs, "coreq", term), // same term allowed
  ];
}

/**
 * The problems as one line, or "":
 * "Check prerequisites: needs CS 2060 or ECE 1021 first; needs ECE 3230 in
 * the same term or earlier".
 */
export function prereqWarning(audit, course) {
  const parts = prereqProblems(audit, course).map(({ kind, anyOf }) => {
    const courses = anyOf.join(" or ");
    return kind === "prereq"
      ? `needs ${courses} first`
      : `needs ${courses} in the same term or earlier`;
  });
  return parts.length ? `Check prerequisites: ${parts.join("; ")}` : "";
}

/**
 * Codes of uncompleted courses that list this one as a prerequisite or
 * corequisite, sorted.
 */
export function unlocks(audit, course) {
  const needsIt = (list) =>
    (list?.groups ?? []).some((group) => group.anyOf.includes(course.code));
  return Object.values(audit.courses)
    .filter((other) => other.id !== course.id && other.status !== "completed")
    .filter((other) => needsIt(other.prereqs) || needsIt(other.coreqs))
    .map((other) => other.code)
    .sort();
}

// True if the course is completed, or in the plan no later than term index
// `latest`. A code not on the audit is false.
function doneBy(audit, code, latest) {
  const id = idFromCode(code);
  if (!Object.hasOwn(audit.courses, id)) return false;
  const other = audit.courses[id];
  if (other.status === "completed") return true;
  const when = termTaken(other);
  return when !== null && when <= latest;
}

// Term index the course is planned or registered in, or null.
function termTaken(course) {
  if (course.plannedTerm) return termIndex(course.plannedTerm);
  const registered = course.attempts.findLast((a) => a.grade === "***");
  return registered && isTermKey(registered.term)
    ? termIndex(registered.term)
    : null;
}
