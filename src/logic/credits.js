// Pure calculation helpers for the schedule and stats.
// They all read the audit object from state.js and never change it.
// No `document` here, so these can be tested with Vitest (see credits.test.js).

import { idFromCode } from "./parser.js";

/** A course's credit hours for adding up (unknown counts as 0). */
export function creditsOf(course) {
  return course.credits ?? 0;
}

/** Total credit hours for a list of courses. */
export function sumCredits(courseList) {
  return courseList.reduce((sum, c) => sum + creditsOf(c), 0);
}

/** Courses planned in the given term, sorted by code. */
export function coursesInTerm(audit, termKey) {
  return Object.values(audit.courses)
    .filter((c) => c.plannedTerm === termKey)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Credit hours planned across all of the plan's terms. */
export function totalPlannedCredits(audit) {
  return audit.plan.terms.reduce(
    (sum, t) => sum + sumCredits(coursesInTerm(audit, t.key)),
    0,
  );
}

/**
 * Progress on every requirement that still needs hours or courses and
 * lets the student choose (pools and rules). Requirements the audit marks
 * "in-progress" are left out: the audit assumes registered courses will be
 * passed, so those are already covered.
 * Returns one object per requirement:
 *   { id, type, title, needHours, needCourses, plannedHours, plannedCourses, done }
 *
 * "Planned" counts the requirement's options the student has put in a term
 * that the audit hasn't already applied. Rule requirements have no option
 * list, so their planned counts stay 0; the badge just shows what's needed.
 */
export function requirementProgress(audit) {
  return audit.requirements
    .filter((r) => r.status === "needs")
    .filter((r) => r.type === "pool" || r.type === "rule")
    .map((r) => {
      const applied = new Set(r.applied.map((a) => a.code));
      const planned = r.options
        .filter((code) => !applied.has(code))
        .map((code) => audit.courses[idFromCode(code)])
        .filter((c) => c && c.plannedTerm && c.status !== "completed");
      const plannedHours = sumCredits(planned);
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        needHours: r.needHours,
        needCourses: r.needCourses,
        plannedHours,
        plannedCourses: planned.length,
        done:
          plannedHours >= (r.needHours ?? 0) &&
          planned.length >= (r.needCourses ?? 0),
      };
    });
}

/** Specific required courses (status "needed") that have no term yet. */
export function unplacedRequired(audit) {
  return Object.values(audit.courses)
    .filter((c) => c.status === "needed" && !c.plannedTerm)
    .sort((a, b) => a.code.localeCompare(b.code));
}
