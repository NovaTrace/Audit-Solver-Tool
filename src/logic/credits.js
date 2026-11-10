// Pure calculation helpers for the schedule and stats.
// They all read the audit object from state.js and never change it.
// No `document` here, so these can be tested with Vitest (see credits.test.js).

import { idFromCode } from "./courseText.js";

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
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  return sumCredits(
    Object.values(audit.courses).filter((c) => termKeys.has(c.plannedTerm)),
  );
}

// A requirement where the student picks which course to take: a pool, a
// rule, or an either/or course requirement ("ECE 4480 OR CS 4200"). A
// course requirement with ONE option isn't a choice: that course has status
// "needed" and is listed by unplacedRequired instead.
function isChoice(req) {
  if (req.type === "pool") return true;
  if (req.type === "rule") return req.needHours > 0; // not e.g. a GPA rule
  return req.type === "course" && req.options.length > 1;
}

/**
 * Progress on every requirement that still needs hours or courses and
 * lets the student choose (pools, rules and either/or courses).
 * Requirements the audit marks "in-progress" are left out: the audit
 * assumes registered courses will be passed, so those are already covered.
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
    .filter(isChoice)
    .map((r) => {
      // An either/or needs one of its courses, even if the audit gave no count
      const needCourses =
        r.type === "course" ? (r.needCourses ?? 1) : r.needCourses;
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
        needCourses,
        plannedHours,
        plannedCourses: planned.length,
        done:
          plannedHours >= (r.needHours ?? 0) &&
          planned.length >= (needCourses ?? 0),
      };
    });
}

/** Specific required courses (status "needed") that have no term yet. */
export function unplacedRequired(audit) {
  return Object.values(audit.courses)
    .filter((c) => c.status === "needed" && !c.plannedTerm)
    .sort((a, b) => a.code.localeCompare(b.code));
}
