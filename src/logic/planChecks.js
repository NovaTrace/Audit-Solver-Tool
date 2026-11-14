// src/logic/planChecks.js — warnings about the plan.
//
//   courseWarnings()  one planned course: prerequisites, term offered
//   shownWarnings()   courseWarnings(), minus locked and registered courses
//   termWarning()     one semester: credit load
//
// Warnings never block a placement.
// Used by: render/schedule.js, render/courseList.js, logic/courses.js, main.js.
// Pure functions, no DOM. Tests: planChecks.test.js.

import { prereqWarning } from "./prereqs.js";
import { coursesInTerm, sumCredits } from "./credits.js";
import { termLabel } from "./courseText.js";

/** Semester credit limit; above it a warning is raised. */
export const MAX_CREDITS = 18;

// "FA27" -> "Fall"
const seasonOf = (termKey) => termLabel(termKey).split(" ")[0];

/**
 * Warning if the course is planned in a term it isn't offered, else "".
 * - `availability`: the site's term-by-term schedule. Any value other than
 *   "available" means no section is scheduled.
 * - `termsOffered`: the usual seasons, used for terms the schedule omits.
 * Registered courses never warn.
 */
export function offeredWarning(course) {
  const term = course.plannedTerm;
  if (!term || course.status === "registered") return "";
  const usual = course.termsOffered.join(", ");
  const scheduled = course.availability[term];

  if (scheduled === "available") return "";
  if (scheduled !== undefined) {
    return (
      `Not scheduled for ${termLabel(term)}` +
      (usual ? ` (usually offered ${usual})` : "")
    );
  }
  if (usual && !course.termsOffered.includes(seasonOf(term))) {
    return `Usually offered ${usual}, not ${seasonOf(term)}`;
  }
  return "";
}

/** Every warning for one planned course, as a list of strings. */
export function courseWarnings(audit, course) {
  return [prereqWarning(audit, course), offeredWarning(course)].filter(Boolean);
}

/** Warning if a semester holds more than MAX_CREDITS, else "". */
export function termWarning(audit, termKey) {
  const credits = sumCredits(coursesInTerm(audit, termKey));
  return credits > MAX_CREDITS ? `Over ${MAX_CREDITS} credits` : "";
}

/** courseWarnings(), but none for a locked or registered course. */
export function shownWarnings(audit, course) {
  if (course.locked || course.status === "registered") return [];
  return courseWarnings(audit, course);
}
