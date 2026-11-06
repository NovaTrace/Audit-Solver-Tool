// Pure helpers for the course list: which courses to show, and the words
// shown about each one.
// No `document` here, so these can be tested with Vitest (see courses.test.js).

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
 * filterSection: "all" or one section name (from the active chip)
 * query:         search text, already trimmed and lower-cased
 */
export function visibleSections({ audit, filterSection, query }) {
  const plannable = Object.values(audit.courses)
    .filter((c) => c.status !== "completed" && matchesQuery(c, query))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Courses the audit doesn't tie to any requirement (e.g. the bookmarklet
  // before requirements.js exists) still need to be plannable somewhere
  const sections = sectionNames(audit);
  if (plannable.some((c) => c.requirementIds.length === 0)) {
    sections.push(UNLINKED);
  }

  return sections
    .filter((section) => filterSection === "all" || section === filterSection)
    .map((section) => {
      if (section === UNLINKED) {
        return {
          section,
          courses: plannable.filter((c) => c.requirementIds.length === 0),
        };
      }
      const reqIds = new Set(
        audit.requirements
          .filter((r) => r.section === section)
          .map((r) => r.id),
      );
      return {
        section,
        courses: plannable.filter((c) =>
          c.requirementIds.some((id) => reqIds.has(id)),
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

/** True when the details say the course isn't scheduled that term. */
export function notOfferedIn(course, termKey) {
  const status = course.availability[termKey];
  return status !== undefined && status !== "available";
}
