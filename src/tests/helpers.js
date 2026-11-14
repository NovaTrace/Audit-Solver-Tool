// src/tests/helpers.js — shared test helpers.

/** Fixed "today" (Nov 5, 2026), so tests don't depend on the calendar. */
export const NOV_2026 = new Date(2026, 10, 5);

/**
 * Makes a course registered in `term`: status "registered" plus a "***"
 * attempt. Changes `data` and returns it.
 */
export function makeRegistered(data, id, term) {
  Object.assign(data.courses[id], {
    status: "registered",
    attempts: [{ term, grade: "***", credits: 3, flags: [], transfer: false }],
  });
  return data;
}
