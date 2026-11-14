// =====================================================================
// logic/planChecks.js — things worth a second look in the student's plan
//
//   courseWarnings()  about one planned course: it comes before its
//                     prerequisites (logic/prereqs.js), or it sits in a
//                     term it isn't offered
//   shownWarnings()   courseWarnings(), except none for a locked or
//                     registered course: the student has settled it there
//   termWarning()     about one semester: too many credits
//   planCheckText()   one line adding all of them up, for above the
//                     schedule
//
// These only warn. The plan is the student's to make: a waiver, a summer
// section that hasn't been announced, or an approved overload are all
// fine, so nothing here stops a course being placed.
//
// Pure logic: no `document`. Tested in planChecks.test.js.
// =====================================================================

import { prereqWarning } from "./prereqs.js";
import { coursesInTerm, sumCredits } from "./credits.js";
import { termLabel } from "./courseText.js";

/** More credits than this in one semester usually needs approval. */
export const MAX_CREDITS = 18;

// "FA27" -> "Fall"
const seasonOf = (termKey) => termLabel(termKey).split(" ")[0];

/**
 * A warning if the course is planned in a term it isn't offered, else "".
 * Two things say when a course runs, both from the course details:
 * - `availability`: the audit site's term-by-term schedule. Any answer
 *   but "available" means no section is scheduled then.
 * - `termsOffered`: the seasons it usually runs ("Fall", "Spring"), used
 *   for a term the schedule says nothing about.
 * Says nothing for a registered course: it has a section already.
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

/** Every warning about one planned course, as a list of sentences. */
export function courseWarnings(audit, course) {
  return [prereqWarning(audit, course), offeredWarning(course)].filter(Boolean);
}

/**
 * A warning if one semester holds more credits than MAX_CREDITS, else "".
 * A light semester isn't flagged: every term is light while it's still
 * being filled in.
 */
export function termWarning(audit, termKey) {
  const credits = sumCredits(coursesInTerm(audit, termKey));
  return credits > MAX_CREDITS ? `Over ${MAX_CREDITS} credits` : "";
}

/**
 * How many of each kind of problem the plan has:
 * { prereqs, notOffered, heavy, planned }. The first two count courses;
 * `heavy` counts overloaded semesters; `planned` is how many courses
 * are in the plan at all.
 */
/**
 * The warnings to SHOW for a course: the same as courseWarnings(), but
 * none once it's locked or registered. Locking says "I know, it stays
 * here", so its warning would only be noise. (The plan's warning box
 * still says how many are hidden.)
 */
export function shownWarnings(audit, course) {
  if (course.locked || course.status === "registered") return [];
  return courseWarnings(audit, course);
}

export function planProblems(audit) {
  const planned = audit.plan.terms.flatMap((t) => coursesInTerm(audit, t.key));
  return {
    planned: planned.length,
    prereqs: planned.filter((c) => prereqWarning(audit, c)).length,
    notOffered: planned.filter((c) => offeredWarning(c)).length,
    heavy: audit.plan.terms.filter((t) => termWarning(audit, t.key)).length,
  };
}

// 1 -> "1 course", 2 -> "2 courses"
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The plan's problems as one line: "Plan check: 2 courses before their
 * prerequisites · 1 semester over 18 credits". "" while nothing is
 * planned, since there's nothing to check yet.
 */
export function planCheckText(audit) {
  const p = planProblems(audit);
  if (p.planned === 0) return "";
  const parts = [
    p.prereqs && `${count(p.prereqs, "course")} before prerequisites`,
    p.notOffered && `${count(p.notOffered, "course")} in a term not offered`,
    p.heavy && `${count(p.heavy, "semester")} over ${MAX_CREDITS} credits`,
  ].filter(Boolean);
  return parts.length
    ? `Plan check: ${parts.join(" · ")}`
    : "Plan check: no problems found";
}
