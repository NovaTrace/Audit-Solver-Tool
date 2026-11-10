// Shared helpers for the test files. Testing only, not a site element.

/** A fixed "today" (Nov 5, 2026), so tests don't change with the calendar. */
export const NOV_2026 = new Date(2026, 10, 5);

/**
 * Make a course in audit data registered in `term`: status "registered"
 * plus a "***" attempt, like the audit shows a course the student has
 * signed up for. The demo has no registered courses, so tests that need
 * one make it with this. Changes `data` and returns it.
 */
export function makeRegistered(data, id, term) {
  Object.assign(data.courses[id], {
    status: "registered",
    attempts: [{ term, grade: "***", credits: 3, flags: [], transfer: false }],
  });
  return data;
}
