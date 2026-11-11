// =====================================================================
// logic/prereqs.js — is a course planned before what it needs?
//
// Each course's details say what must come first, already sorted into
// groups by parsePrereqs() (logic/courseText.js):
//   prereqs  every group must be done BEFORE the course's term
//   coreqs   every group must be done before it, or in the SAME term
// Any one course in a group is enough ("CS 2060 or ECE 1021").
//
// A course counts as done if the audit shows it completed, or the plan
// has it (planned or registered) in an early enough term.
//
//   prereqProblems() / prereqWarning()   is this course planned too early?
//   unlocks()                            which courses is it needed for?
//
// This only warns. It can't see everything the university accepts (a
// placement test, a waiver, a course that transferred under another
// code, a minimum grade), so the wording says "check", not "wrong".
//
// Pure logic: no `document`. Tested in prereqs.test.js.
// =====================================================================

import { idFromCode, termIndex, isTermKey } from "./courseText.js";

/**
 * The prerequisite and corequisite groups a planned course doesn't meet:
 * [{ kind: "prereq" | "coreq", anyOf: ["CS 2060", "ECE 1021"] }, ...].
 * Empty when all is well, and for a course that isn't planned, has no
 * details loaded, or is completed or registered (the university already
 * checked those when it let the student in).
 */
export function prereqProblems(audit, course) {
  if (!course.plannedTerm) return [];
  if (course.status === "completed" || course.status === "registered") {
    return [];
  }
  const term = termIndex(course.plannedTerm);

  // The groups in `list` that no course satisfies by term `latest`
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
    ...unmet(course.prereqs, "prereq", term - 1), // a term before, at least
    ...unmet(course.coreqs, "coreq", term), // the same term will do
  ];
}

/**
 * The problems as one line for the page, or "" if there are none:
 * "Check prerequisites: needs CS 2060 or ECE 1021 first; needs ECE 3230
 * in the same term or earlier"
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
 * The courses still to take that need this one first (or alongside):
 * the reverse of a prerequisite list. Useful for deciding what to take
 * early. Returns their codes, sorted; completed courses are left out.
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

// True if the course with this code is completed, or sits in the plan no
// later than term number `latest`. A code that isn't on the audit at all
// hasn't been taken and isn't planned.
function doneBy(audit, code, latest) {
  const id = idFromCode(code);
  if (!Object.hasOwn(audit.courses, id)) return false;
  const other = audit.courses[id];
  if (other.status === "completed") return true;
  const when = termTaken(other);
  return when !== null && when <= latest;
}

// The term number a course is planned or registered in, or null
function termTaken(course) {
  if (course.plannedTerm) return termIndex(course.plannedTerm);
  const registered = course.attempts.findLast((a) => a.grade === "***");
  return registered && isTermKey(registered.term)
    ? termIndex(registered.term)
    : null;
}
