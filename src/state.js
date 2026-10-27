// =====================================================================
// state.js — the user's current plan, and saving it in the browser
//
//   data/defaults.js = the starting point (never changes while the app runs)
//   state.js         = the user's picks on top of it (changes on every click)
//
// No `document` in this file: it only holds and changes data, so it can be
// tested with Vitest (see state.test.js). main.js updates the page.
// =====================================================================

import { courses, TERMS } from "./data/defaults.js";

const STORAGE_KEY = "audit-solver-state-v1";

// Other files may READ these. To CHANGE them, use the functions below,
// so the rules (e.g. "locked courses can't move") live in one place.
export const assignments = {}; // course id -> term key, or null if unplaced
export const locked = {}; // course id -> true (only locked courses are listed)

// Valid ids and term keys, used to reject bad clicks and bad saved data
const courseIds = new Set(courses.map((c) => c.id));
const termKeys = new Set(TERMS.map((t) => t.key));

// ---------- Changing the plan ----------

/** Put every course back in its default term and unlock everything. */
export function resetToDefaults() {
  courses.forEach((c) => (assignments[c.id] = c.dflt ?? null));
  Object.keys(locked).forEach((id) => delete locked[id]);
}

/**
 * A term pill was clicked: place the course in that term, or unplace it if
 * it's already there. Returns true if something changed.
 */
export function toggleTerm(id, term) {
  if (!courseIds.has(id) || !termKeys.has(term)) return false;
  if (locked[id]) return false; // locked courses can't move
  assignments[id] = assignments[id] === term ? null : term;
  return true;
}

/**
 * The lock button was clicked: lock or unlock the course.
 * Returns true if something changed.
 */
export function toggleLock(id) {
  if (!courseIds.has(id)) return false;
  if (locked[id]) {
    delete locked[id]; // unlock
    return true;
  }
  if (!assignments[id]) return false; // can't lock a course with no term
  locked[id] = true;
  return true;
}

// ---------- Saving in this browser (localStorage) ----------

/**
 * Overwrite the defaults with this browser's saved picks.
 * Saved data is checked first: unknown courses, unknown terms, and locks on
 * unplaced courses are skipped (old saves, typos, or edited data).
 * Returns true if saved picks were found.
 */
export function loadState() {
  let saved;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (e) {
    console.warn("Could not load saved planner state:", e);
    return false;
  }
  if (!isPlainObject(saved)) return false;

  if (isPlainObject(saved.assignments)) {
    for (const [id, term] of Object.entries(saved.assignments)) {
      if (courseIds.has(id) && (term === null || termKeys.has(term))) {
        assignments[id] = term;
      }
    }
  }
  if (isPlainObject(saved.locked)) {
    for (const [id, isLocked] of Object.entries(saved.locked)) {
      if (courseIds.has(id) && isLocked === true && assignments[id]) {
        locked[id] = true;
      }
    }
  }
  return true;
}

/** Save the current picks. Returns true if it worked. */
export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ assignments, locked }));
    return true;
  } catch (e) {
    console.warn("Could not save planner state:", e);
    return false;
  }
}

/** Delete this browser's saved picks (used by Reset). */
export function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear saved planner state:", e);
  }
}

// ---------- Helpers ----------

// True for a {...} object (not null, not an array)
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------- Startup ----------
resetToDefaults(); // start from the defaults; main.js then calls loadState()
