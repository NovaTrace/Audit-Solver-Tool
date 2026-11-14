// Pure helpers for the course list: which courses to show, and the words
// shown about each one.
// No `document` here, so these can be tested with Vitest (see courses.test.js).

import { isOpen } from "./credits.js";
import { shownWarnings } from "./planChecks.js";
import { isTermKey, termLabel } from "./courseText.js";

/** True if the course matches the search text (empty search matches all). */
export function matchesQuery(course, query) {
  if (!query) return true;
  const haystack = `${course.code} ${course.title ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

/** Heading for courses that aren't tied to any requirement. */
export const UNLINKED = "Not linked to a requirement";

/** The audit's section names, in audit order, each listed once. */
export function sectionNames(audit) {
  return [...new Set(audit.requirements.map((r) => r.section))];
}

/**
 * The sections and courses to display, in display order.
 * Returns [{ section, courses: [course, ...] }, ...], skipping empty sections.
 *
 * Only courses the student can still plan are listed (completed courses
 * are left out). A course that counts toward requirements in several
 * sections appears under each of them.
 *
 * filterSection: "all" or one section name (the category dropdown)
 * query:         search text, already trimmed and lower-cased
 */
export function visibleSections({ audit, filterSection, query }) {
  return filterGroups(allSections(audit), { filterSection, query });
}

/** The course list's "Show" dropdown: [value, label] pairs, in order. */
export const SHOW_OPTIONS = [
  ["all", "Everything left"],
  ["attention", "Needs attention"],
  ["unplaced", "Not in a semester yet"],
];

/**
 * True if the course belongs under the "Show" choice:
 *   all        everything still to plan
 *   attention  placed somewhere it gets a warning (shownWarnings: locked
 *              and registered courses never count)
 *   unplaced   not in any semester yet
 */
export function matchesShow(audit, course, show) {
  if (show === "attention") return shownWarnings(audit, course).length > 0;
  if (show === "unplaced") return !course.plannedTerm;
  return true;
}

/**
 * Narrow a list of groups (from allSections or listGroups) to one
 * section, the search text and the "Show" choice, dropping groups left
 * empty. Lets the page work the full list out once and reuse it for the
 * category dropdown and the list.
 *
 * A group from listGroups also carries `completed` courses: they're kept
 * (if they match the search) only while showing everything.
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
 * Every section for the course list, with what's left to plan AND what's
 * already completed: [{ section, courses, completed }, ...] in audit
 * order. A section shows while it has either. Completed courses sit under
 * every section whose requirements they count toward.
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

// Completed courses by section name, each list sorted by course code
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

/** "B · Summer 2026": the grade and term of the attempt that counted. */
export function finalGradeText(course) {
  const last = course.attempts?.at(-1);
  if (!last) return "";
  const term = isTermKey(last.term) ? termLabel(last.term) : last.term;
  return last.grade ? `${last.grade} · ${term}` : term;
}

/** Every section with something to plan: no category, search or Show applied. */
export function allSections(audit) {
  const plannable = Object.values(audit.courses)
    .filter((c) => c.status !== "completed")
    .sort((a, b) => a.code.localeCompare(b.code));

  // Courses the audit doesn't tie to any requirement (e.g. an F in a course
  // no requirement lists) still need to be plannable somewhere
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
      // A course shows under a section while one of its requirements there
      // is open (unfinished, and not switched off by the student), or once
      // the student has placed it in a term
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

/** "3 cr", "1–3 cr" for variable credit, or "? cr" when unknown. */
export function creditText(course) {
  const { credits, minCredits, maxCredits } = course;
  if (minCredits != null && maxCredits != null && minCredits !== maxCredits) {
    return `${minCredits}–${maxCredits} cr`;
  }
  return credits == null ? "? cr" : `${credits} cr`;
}

/** "Counts toward: NAVIGATE · TECHNICAL ELECTIVES" (empty if none). */
export function countsTowardText(audit, course) {
  const titles = course.requirementIds
    .map((id) => audit.requirements.find((r) => r.id === id)?.title)
    .filter(Boolean);
  return titles.length ? `Counts toward: ${titles.join(" · ")}` : "";
}

/** "Fall, Spring", or a note when the details haven't been loaded. */
export function offeredText(course) {
  if (course.termsOffered.length) return course.termsOffered.join(", ");
  return course.detailsLoaded ? "Offering not listed" : "Offerings unknown";
}

/**
 * Prereq and coreq line. null means the details were never loaded, which
 * is different from a course that has none.
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
 * The short prereq line: course numbers only, without grades or notes.
 * "Prereqs: CS 2060 or ECE 1021; CS 2080". Falls back to the full text
 * when the details couldn't be read into course numbers.
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
    return prereqText(course); // couldn't shorten
  else parts.push("No prereqs");
  const co = codes(course.coreqs);
  if (co) parts.push(`Coreq: ${co}`);
  return parts.join(" · ");
}

/** True when the details say the course isn't scheduled that term. */
export function notOfferedIn(course, termKey) {
  const status = course.availability[termKey];
  return status !== undefined && status !== "available";
}
