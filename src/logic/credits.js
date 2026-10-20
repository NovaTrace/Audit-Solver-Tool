// Pure calculation helpers for the schedule.

/** Courses currently assigned to the given term. */
export function coursesInTerm(courses, assignments, termKey) {
  return courses.filter((c) => assignments[c.id] === termKey);
}

/** Total credit hours for a list of courses. */
export function sumCredits(courseList) {
  return courseList.reduce((sum, c) => sum + c.cr, 0);
}

/** Credit hours assigned across all of the given terms. */
export function totalAssignedCredits(terms, courses, assignments) {
  return terms.reduce(
    (sum, t) => sum + sumCredits(coursesInTerm(courses, assignments, t.key)),
    0,
  );
}

/**
 * Progress toward each elective pool.
 * Returns one object per pool: { key, label, chosen, need, done }.
 */
export function poolProgress(courses, assignments, poolGroups) {
  return Object.entries(poolGroups).map(([key, group]) => {
    const chosen = courses.filter(
      (c) => c.cat === key && assignments[c.id],
    ).length;
    return {
      key,
      label: group.label,
      chosen,
      need: group.need,
      done: chosen >= group.need,
    };
  });
}

/** Required courses (anything not in an elective pool) with no term yet. */
export function unplacedRequired(courses, assignments, poolGroups) {
  return courses.filter(
    (c) => !Object.hasOwn(poolGroups, c.cat) && !assignments[c.id],
  );
}
