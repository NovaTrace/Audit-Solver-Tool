// src/logic/credits.js — credit totals and requirement progress.
//
// Reads the audit object; never changes it.
// Used by: render/schedule.js, render/courseList.js, logic/courses.js,
// logic/planChecks.js, main.js.
// Pure functions, no DOM. Tests: credits.test.js.

import {
  idFromCode,
  termIndex,
  termForDate,
  isTermKey,
  registeredTerm,
} from "./courseText.js";

/** A course's credit hours; unknown counts as 0. */
export function creditsOf(course) {
  return course.credits ?? 0;
}

/** Total credit hours of a list of courses. */
export function sumCredits(courseList) {
  return courseList.reduce((sum, c) => sum + creditsOf(c), 0);
}

/**
 * True for a course being taken now: registered for the current term, or an
 * earlier one on an old audit.
 * Goes by the registered term, not the plan. A course registered for a later
 * term counts as planned and can still be moved.
 */
export function isInProgress(course, now = new Date()) {
  if (course.status !== "registered") return false;
  const term = registeredTerm(course);
  if (!isTermKey(term)) return true; // registered term unknown
  return termIndex(term) <= termIndex(termForDate(now));
}

/** Courses planned in a term, sorted by code. */
export function coursesInTerm(audit, termKey) {
  return Object.values(audit.courses)
    .filter((c) => c.plannedTerm === termKey)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * True for a requirement still being planned for: unfinished and not switched
 * off.
 */
export function isOpen(req) {
  return req.status !== "complete" && !req.ignored;
}

// True for a requirement where the student picks the course: a pool, a rule,
// or an either/or course requirement. A single-option course requirement is
// not a choice; unplacedRequired() lists those.
function isChoice(req) {
  if (req.type === "pool") return true;
  if (req.type === "rule") return req.needHours > 0; // excludes e.g. GPA rules
  return req.type === "course" && req.options.length > 1;
}

/**
 * Progress on each unfinished requirement the student chooses courses for.
 * Returns [{ id, type, title, needHours, needCourses, plannedHours,
 * plannedCourses, done, ignored }].
 * - "Planned" counts options placed in a term that the audit hasn't applied.
 * - Requirements the audit marks "in-progress" are excluded.
 * - Switched-off requirements are included with `ignored: true`.
 */
export function requirementProgress(audit) {
  return audit.requirements
    .filter((r) => r.status === "needs")
    .filter(isChoice)
    .map((r) => {
      // An either/or needs one course even when the audit gives no count.
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
 * Required courses (status "needed") with no term, where at least one
 * requirement listing them is still open.
 */
export function unplacedRequired(audit) {
  const open = new Set(audit.requirements.filter(isOpen).map((r) => r.id));
  return Object.values(audit.courses)
    .filter((c) => c.status === "needed" && !c.plannedTerm)
    .filter((c) => c.requirementIds.some((id) => open.has(id)))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Credit totals for the plan panel: { earned, inProgress, planned, required }.
 * - earned:     hours the audit counts as done
 * - inProgress: hours being taken this term (isInProgress)
 * - planned:    hours placed in a later semester, registered or not
 * - required:   the degree's minimum hours, or null
 */
export function creditSummary(audit, now = new Date()) {
  const { student } = audit;
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  const inPlan = Object.values(audit.courses).filter((c) =>
    termKeys.has(c.plannedTerm),
  );
  const registered = inPlan.filter((c) => c.status === "registered");

  const current = inPlan.filter((c) => isInProgress(c, now));

  const earned = student.hoursEarned ?? 0;
  // The audit's in-progress figure covers every registered course. Any excess
  // over the registered courses in the plan still counts.
  const unlisted = Math.max(
    0,
    (student.hoursInProgress ?? 0) - sumCredits(registered),
  );
  const inProgress = sumCredits(current) + unlisted;
  const planned = sumCredits(inPlan.filter((c) => !isInProgress(c, now)));
  const required = student.hoursRequired ?? null;
  return { earned, inProgress, planned, required };
}

/**
 * Requirement counts per audit section, in audit order:
 * [{ section, total, done, inProgress, planned, needed, off, other }].
 * Each requirement falls in exactly one count:
 * - done:       complete on the audit
 * - off:        switched off by the student
 * - other:      no course can satisfy it (e.g. a GPA rule)
 * - inProgress: covered by courses being taken this term
 * - planned:    covered by courses in later semesters
 * - needed:     none of the above
 * `total` excludes `off` and `other`.
 */
export function categoryProgress(audit, now = new Date()) {
  const states = requirementStates(audit, now);
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

/** categoryProgress() summed over every section. */
export function requirementTotals(audit, now = new Date()) {
  const sum = { total: 0, done: 0, inProgress: 0, planned: 0, needed: 0 };
  sum.off = 0;
  sum.other = 0;
  for (const group of categoryProgress(audit, now)) {
    for (const key of Object.keys(sum)) sum[key] += group[key];
  }
  return sum;
}

/** Unfinished requirements no course can satisfy, not switched off. */
export function otherRequirements(audit) {
  const states = requirementStates(audit);
  return audit.requirements.filter((r) => states.get(r.id) === "other");
}

// Map of requirement id -> count name (see categoryProgress).
function requirementStates(audit, now = new Date()) {
  const choices = new Map(requirementProgress(audit).map((p) => [p.id, p]));
  return new Map(
    audit.requirements.map((r) => [
      r.id,
      requirementState(audit, r, choices, now),
    ]),
  );
}

// The count one requirement falls in (see categoryProgress).
function requirementState(audit, req, choices, now) {
  if (req.status === "complete") return "done";
  if (req.ignored) return "off";
  if (req.status === "in-progress") {
    // The audit marks a requirement in progress once any registered course
    // covers it, including one that starts in a later term. That case is
    // planned.
    const waiting = req.applied
      .map((a) => audit.courses[idFromCode(a.code)])
      .some((c) => c?.status === "registered" && !isInProgress(c, now));
    return waiting ? "planned" : "inProgress";
  }

  // Choice (pool, rule, either/or): covered once enough is planned.
  const choice = choices.get(req.id);
  if (choice) {
    const somethingPlanned = choice.plannedCourses > 0;
    return choice.done && somethingPlanned ? "planned" : "needed";
  }

  // Specific courses: covered once each has a term or is completed.
  // No courses at all: nothing can satisfy it.
  const courses = req.options
    .map((code) => audit.courses[idFromCode(code)])
    .filter(Boolean);
  if (courses.length === 0) return "other";
  const covered = courses.every(
    (c) => c.plannedTerm || c.status === "completed",
  );
  if (!covered) return "needed";
  const allTaking = courses.every(
    (c) => isInProgress(c, now) || c.status === "completed",
  );
  return allTaking ? "inProgress" : "planned";
}
