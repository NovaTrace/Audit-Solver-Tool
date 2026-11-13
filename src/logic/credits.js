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

/**
 * True for a requirement the student is still planning for: the audit
 * says it isn't finished, and the student hasn't switched it off.
 */
export function isOpen(req) {
  return req.status !== "complete" && !req.ignored;
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
 *   { id, type, title, needHours, needCourses, plannedHours, plannedCourses,
 *     done, ignored }
 * A switched-off requirement stays in the list (`ignored: true`), so its
 * badge can still be shown and switched back on.
 *
 * "Planned" counts the requirement's options the student has put in a term
 * that the audit hasn't already applied. A rule ("any MATH course 3100 or
 * higher") has no options from the audit; the courses the student adds by
 * hand for it become its options, so they count the same way.
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
        ignored: r.ignored,
        done:
          plannedHours >= (r.needHours ?? 0) &&
          planned.length >= (needCourses ?? 0),
      };
    });
}

/**
 * Specific required courses (status "needed") that have no term yet. A
 * course only counts while a requirement that lists it is still open: if
 * the student switched all of those off, it isn't required any more.
 */
export function unplacedRequired(audit) {
  const open = new Set(audit.requirements.filter(isOpen).map((r) => r.id));
  return Object.values(audit.courses)
    .filter((c) => c.status === "needed" && !c.plannedTerm)
    .filter((c) => c.requirementIds.some((id) => open.has(id)))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Credit totals for the plan panel's headline and progress bar:
 *   { earned, inProgress, planned, required, left }
 * - earned:     hours the audit says are done
 * - inProgress: hours registered this term (the audit's figure, or the
 *               registered courses added up if that's larger)
 * - planned:    hours placed in a semester that aren't registered yet
 * - required:   hours the degree needs, or null if the audit doesn't say
 * - left:       required hours not yet earned, in progress or planned
 *               (never below 0), or null when `required` is unknown
 */
export function creditSummary(audit) {
  const { student } = audit;
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  const inPlan = Object.values(audit.courses).filter((c) =>
    termKeys.has(c.plannedTerm),
  );
  const registered = inPlan.filter((c) => c.status === "registered");

  const earned = student.hoursEarned ?? 0;
  const inProgress = Math.max(
    student.hoursInProgress ?? 0,
    sumCredits(registered),
  );
  const planned = sumCredits(inPlan.filter((c) => c.status !== "registered"));
  const required = student.hoursRequired ?? null;
  const left =
    required == null
      ? null
      : Math.max(0, required - earned - inProgress - planned);
  return { earned, inProgress, planned, required, left };
}

/**
 * Progress per audit section, counted in requirements, for the
 * "Requirement categories" bars. One object per section, in audit order:
 *   { section, total, done, inProgress, planned, needed, off, other }
 * Each requirement lands in exactly one count:
 * - done:       the audit says it's complete
 * - off:        the student switched it off
 * - other:      no course can satisfy it (e.g. "Apply for graduation", a
 *               GPA rule), so it can't be planned here
 * - inProgress: the audit says in progress, or registered courses cover it
 * - planned:    courses placed in semesters cover it
 * - needed:     none of the above yet
 * `total` leaves out `off` and `other`: it's what planning can move.
 */
export function categoryProgress(audit) {
  const states = requirementStates(audit);
  const sections = [...new Set(audit.requirements.map((r) => r.section))];

  return sections.map((section) => {
    const counts = {
      done: 0,
      inProgress: 0,
      planned: 0,
      needed: 0,
      off: 0,
      other: 0,
    };
    const reqs = audit.requirements.filter((r) => r.section === section);
    for (const req of reqs) counts[states.get(req.id)]++;
    const total = reqs.length - counts.off - counts.other;
    return { section, total, ...counts };
  });
}

/**
 * The same counts as categoryProgress, added up over every section: the
 * plan panel's headline ("14 requirements still need a semester") and
 * main bar. A course that counts toward requirements in both majors is
 * counted wherever the audit applies it, never as extra credits.
 */
export function requirementTotals(audit) {
  const sum = { total: 0, done: 0, inProgress: 0, planned: 0, needed: 0 };
  sum.off = 0;
  sum.other = 0;
  for (const group of categoryProgress(audit)) {
    for (const key of Object.keys(sum)) sum[key] += group[key];
  }
  return sum;
}

/**
 * Requirements no course can satisfy ("Apply for graduation", a GPA
 * rule), unfinished and not switched off. Listed apart, since the only
 * thing to do about them is check with an advisor.
 */
export function otherRequirements(audit) {
  const states = requirementStates(audit);
  return audit.requirements.filter((r) => states.get(r.id) === "other");
}

// Every requirement's count (see categoryProgress), by requirement id
function requirementStates(audit) {
  const choices = new Map(requirementProgress(audit).map((p) => [p.id, p]));
  return new Map(
    audit.requirements.map((r) => [r.id, requirementState(audit, r, choices)]),
  );
}

// Which count one requirement goes in (see categoryProgress)
function requirementState(audit, req, choices) {
  if (req.status === "complete") return "done";
  if (req.ignored) return "off";
  if (req.status === "in-progress") return "inProgress";

  // A choice (pool, rule, either/or): covered once enough is planned
  const choice = choices.get(req.id);
  if (choice) {
    const somethingPlanned = choice.plannedCourses > 0;
    return choice.done && somethingPlanned ? "planned" : "needed";
  }

  // Specific courses: covered once every one has a term (or is done).
  // No courses at all means no course can satisfy it.
  const courses = req.options
    .map((code) => audit.courses[idFromCode(code)])
    .filter(Boolean);
  if (courses.length === 0) return "other";
  const covered = courses.every(
    (c) => c.plannedTerm || c.status === "completed",
  );
  if (!covered) return "needed";
  const allTaking = courses.every(
    (c) => c.status === "registered" || c.status === "completed",
  );
  return allTaking ? "inProgress" : "planned";
}
