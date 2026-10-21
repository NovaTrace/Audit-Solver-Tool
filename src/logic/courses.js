// Pure helpers for the course list: which courses to show.
// No `document` here, so these can be tested with Vitest (see courses.test.js).
 
/** True if the course matches the search text (empty search matches all). */
export function matchesQuery(course, query) {
  if (!query) return true;
  const haystack =
    `${course.code} ${course.title} ${course.sub ?? ""}`.toLowerCase();
  return haystack.includes(query);
}
 
/**
 * The categories and courses to display, in display order.
 * Returns [{ cat, items: [course, ...] }, ...], skipping empty categories.
 *
 * filterCat: "all" or one category key (from the active chip)
 * query:     search text, already trimmed and lower-cased
 */
export function visibleCourseGroups({ courses, catOrder, filterCat, query }) {
  return catOrder
    .filter((cat) => filterCat === "all" || cat === filterCat)
    .map((cat) => ({
      cat,
      items: courses.filter((c) => c.cat === cat && matchesQuery(c, query)),
    }))
    .filter((group) => group.items.length > 0);
}
