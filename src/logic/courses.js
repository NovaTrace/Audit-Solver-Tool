// src/logic/courses.js — which courses the list shows, and the text for each.
//
// Used by: main.js, render/courseList.js, render/schedule.js.
// Pure functions, no DOM. Tests: courses.test.js.

import { isOpen } from "./credits.js";
import { shownWarnings } from "./planChecks.js";
import { isTermKey, termLabel } from "./courseText.js";

/** True if the course matches the search text; an empty search matches all. */
export function matchesQuery(course, query) {
  if (!query) return true;
  const haystack = `${course.code} ${course.title ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

/** Section heading for courses tied to no requirement. */
export const UNLINKED = "Not linked to a requirement";

/** The audit's section names, in audit order, without repeats. */
export function sectionNames(audit) {
  return [...new Set(audit.requirements.map((r) => r.section))];
}

/** "Show" switch choices as [value, label] pairs. */
export const SHOW_OPTIONS = [
  ["all", "Everything"],
  ["attention", "Needs attention"],
  ["unplaced", "Unplaced"],
];

/**
 * True if the course belongs under a "Show" choice:
 *   all        everything still to plan
 *   attention  has a visible warning (shownWarnings)
 *   unplaced   not in a semester
 */
export function matchesShow(audit, course, show) {
  if (show === "attention") return shownWarnings(audit, course).length > 0;
  if (show === "unplaced") return !course.plannedTerm;
  return true;
}

/**
 * Narrows groups (from allSections or listGroups) by section, search text
 * and "Show" choice, and drops empty groups.
 * `completed` courses are kept only when showing everything.
 */
export function filterGroups(
  groups,
  { filterSection, query, show = "all", audit = null },
) {
  return groups
    .filter((g) => filterSection === "all" || g.section === filterSection)
    .map((g) => {
      const narrowed = {
        section: g.section,
        courses: g.courses.filter(
          (c) => matchesQuery(c, query) && matchesShow(audit, c, show),
        ),
      };
      if (g.completed) {
        narrowed.completed =
          show === "all"
            ? g.completed.filter((c) => matchesQuery(c, query))
            : [];
      }
      return narrowed;
    })
    .filter((g) => g.courses.length > 0 || g.completed?.length > 0);
}

/**
 * Sections for the course list, in audit order:
 * [{ section, courses, completed }]. A section appears while it has either.
 * Completed courses appear under every section they count toward.
 */
export function listGroups(audit) {
  const open = new Map(allSections(audit).map((g) => [g.section, g.courses]));
  const done = completedBySection(audit);
  const names = sectionNames(audit);
  if (open.has(UNLINKED)) names.push(UNLINKED);
  return names
    .map((section) => ({
      section,
      courses: open.get(section) ?? [],
      completed: done.get(section) ?? [],
    }))
    .filter((g) => g.courses.length > 0 || g.completed.length > 0);
}

// Map of section name -> completed courses, sorted by code.
function completedBySection(audit) {
  const sectionOf = new Map(audit.requirements.map((r) => [r.id, r.section]));
  const bySection = new Map();
  const completed = Object.values(audit.courses)
    .filter((c) => c.status === "completed")
    .sort((a, b) => a.code.localeCompare(b.code));
  for (const course of completed) {
    const sections = new Set(
      course.requirementIds.map((id) => sectionOf.get(id)).filter(Boolean),
    );
    for (const section of sections) {
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section).push(course);
    }
  }
  return bySection;
}

/** "B · Summer 2026": grade and term of the last attempt. */
export function finalGradeText(course) {
  const last = course.attempts?.at(-1);
  if (!last) return "";
  const term = isTermKey(last.term) ? termLabel(last.term) : last.term;
  return last.grade ? `${last.grade} · ${term}` : term;
}

/** Every section with something to plan, unfiltered. */
export function allSections(audit) {
  const plannable = Object.values(audit.courses)
    .filter((c) => c.status !== "completed")
    .sort((a, b) => a.code.localeCompare(b.code));

  // Courses tied to no requirement go under UNLINKED.
  const sections = sectionNames(audit);
  if (plannable.some((c) => c.requirementIds.length === 0)) {
    sections.push(UNLINKED);
  }

  return sections
    .map((section) => {
      if (section === UNLINKED) {
        return {
          section,
          courses: plannable.filter((c) => c.requirementIds.length === 0),
        };
      }
      // A course appears under a section while one of its requirements there is
      // open, or once it has been placed in a term.
      const inSection = (id) =>
        audit.requirements.some((r) => r.id === id && r.section === section);
      const reqIds = new Set(
        audit.requirements
          .filter((r) => r.section === section)
          .filter(isOpen)
          .map((r) => r.id),
      );
      return {
        section,
        courses: plannable.filter(
          (c) =>
            c.requirementIds.some((id) => reqIds.has(id)) ||
            (c.plannedTerm && c.requirementIds.some((id) => inSection(id))),
        ),
      };
    })
    .filter((group) => group.courses.length > 0);
}

/** "3 cr", "1–3 cr" for variable credit, "? cr" when unknown. */
export function creditText(course) {
  const { credits, minCredits, maxCredits } = course;
  if (minCredits != null && maxCredits != null && minCredits !== maxCredits) {
    return `${minCredits}–${maxCredits} cr`;
  }
  return credits == null ? "? cr" : `${credits} cr`;
}

/** "Fall, Spring", or a note when the offering is unknown. */
export function offeredText(course) {
  if (course.termsOffered.length) return course.termsOffered.join(", ");
  return course.detailsLoaded ? "Offering not listed" : "Offerings unknown";
}

/**
 * Prerequisite and corequisite line. A null prereqText means the details
 * were never loaded, which differs from having none.
 */
export function prereqText(course) {
  if (course.prereqText == null) return "Prereqs unknown";
  const parts = [
    course.prereqText ? `Prereqs: ${course.prereqText}` : "No prereqs",
  ];
  if (course.coreqText) parts.push(`Coreq: ${course.coreqText}`);
  return parts.join(" · ");
}

/**
 * Short prerequisite line with course numbers only:
 * "Prereqs: CS 2060 or ECE 1021; CS 2080".
 * Falls back to the full text when no course numbers could be parsed.
 */
export function prereqCodesText(course) {
  if (course.prereqText == null) return "Prereqs unknown";
  const codes = (req) =>
    (req?.groups ?? [])
      .map((g) => g.anyOf.join(" or "))
      .filter(Boolean)
      .join("; ");
  const pre = codes(course.prereqs);
  const parts = [];
  if (pre) parts.push(`Prereqs: ${pre}`);
  else if (course.prereqText)
    return prereqText(course); // no course numbers parsed
  else parts.push("No prereqs");
  const co = codes(course.coreqs);
  if (co) parts.push(`Coreq: ${co}`);
  return parts.join(" · ");
}

/** True if the schedule lists the term and the course isn't available in it. */
export function notOfferedIn(course, termKey) {
  const status = course.availability[termKey];
  return status !== undefined && status !== "available";
}
