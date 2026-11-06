// =====================================================================
// state.js — the one audit object the app runs on, and saving it in
// the browser
//
//   logic/parser.js        = checks and completes audit data (parseAudit)
//   data/sample-audit.json = demo data shown until a real audit is loaded
//   state.js               = holds the current audit, changes it, saves it
//
// The audit object is the shape described in the Audit JSON Data Guide.
// The student's picks live on each course: `plannedTerm` and `locked`.
//
// No `document` in this file: it only holds and changes data, so it can be
// tested with Vitest (see State.test.js). main.js updates the page.
// =====================================================================

import { parseAudit, AuditError } from "./logic/parser.js";
import sample from "./data/sample-audit.json";

// v2: the whole audit object. (v1 saves only held picks, in the old
// format; they're ignored rather than converted.)
const STORAGE_KEY = "audit-solver-state";

// The current audit. Other files READ it through getAudit(). To CHANGE it,
// use the functions below, so the rules (e.g. "locked courses can't move")
// live in one place.
let audit = null;

// True while the demo audit is showing. The demo is never saved, and its
// picks are never merged into a real import.
let sampleLoaded = false;

/** The current audit object (read it; change it only through this file). */
export function getAudit() {
  return audit;
}

/** True while the built-in demo audit is showing instead of a real one. */
export function isSampleLoaded() {
  return sampleLoaded;
}

// ---------- Loading an audit ----------

/** Replace the current audit with one that already went through parseAudit(). */
export function loadAudit(parsed) {
  audit = parsed;
  sampleLoaded = false;
}

/**
 * Check and load new audit data (from the bookmarklet, a PDF or a JSON
 * file). A fresh scrape keeps the student's current picks; see parseAudit.
 * Throws AuditError if the data is bad; the current audit stays as it was.
 */
export function importAudit(data) {
  const previous = sampleLoaded ? null : audit; // never merge demo picks
  loadAudit(parseAudit(data, previous));
}

/** Load the built-in demo audit (used at startup). */
export function loadSample() {
  loadAudit(parseAudit(sample));
  sampleLoaded = true;
}

/**
 * Clear every pick on the current audit. Registered courses go back into
 * their registered term, locked (parseAudit does that). Semester columns
 * are kept.
 */
export function resetPlan() {
  const wasSample = sampleLoaded;
  const copy = structuredClone(audit);
  for (const course of Object.values(copy.courses)) {
    delete course.plannedTerm;
    delete course.locked;
  }
  loadAudit(parseAudit(copy));
  sampleLoaded = wasSample; // resetting the demo leaves it the demo
}

/**
 * Forget everything: delete this browser's save and go back to the demo
 * audit. Used by the "Clear data" button.
 */
export function clearAllData() {
  clearSaved();
  loadSample();
}

// ---------- Changing the plan ----------

/**
 * A term pill was clicked: place the course in that term, or unplace it if
 * it's already there. Returns true if something changed.
 */
export function toggleTerm(id, term) {
  const course = findCourse(id);
  if (!course || !isTermKey(term)) return false;
  if (course.locked) return false; // locked courses can't move
  if (course.status === "completed") return false; // already taken
  course.plannedTerm = course.plannedTerm === term ? null : term;
  return true;
}

/**
 * The lock button was clicked: lock or unlock the course.
 * Returns true if something changed.
 */
export function toggleLock(id) {
  const course = findCourse(id);
  if (!course) return false;
  if (course.locked) {
    course.locked = false; // unlock
    return true;
  }
  if (!course.plannedTerm) return false; // can't lock a course with no term
  course.locked = true;
  return true;
}

// ---------- Saving in this browser (localStorage) ----------

/**
 * Replace the current audit with this browser's saved one.
 * The save goes through parseAudit() like any other import, so old,
 * edited or broken saves are checked and repaired, or skipped.
 * Returns true if a saved audit was loaded.
 */
export function loadState() {
  let saved;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    saved = parseAudit(JSON.parse(raw));
  } catch (e) {
    // SyntaxError: not valid JSON. AuditError: valid JSON, wrong shape.
    console.warn("Could not load saved planner state:", e);
    return false;
  }
  loadAudit(saved);
  return true;
}

/**
 * Save the whole current audit. Returns true if it worked.
 * The demo audit is never saved, so playing with it can't overwrite a
 * student's real save.
 */
export function saveState() {
  if (sampleLoaded) return false;
  try {
    audit.plan.lastSaved = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(audit));
    return true;
  } catch (e) {
    // e.g. storage is full, or blocked in a private window
    console.warn("Could not save planner state:", e);
    return false;
  }
}

/** Delete this browser's saved audit (used by Reset). */
export function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear saved planner state:", e);
  }
}

// ---------- Helpers ----------

// The course with this id, or null. Object.hasOwn stops ids like
// "__proto__" or "toString" from finding built-in object properties.
function findCourse(id) {
  return Object.hasOwn(audit.courses, id) ? audit.courses[id] : null;
}

// True if `term` is one of the plan's semester columns right now.
function isTermKey(term) {
  return audit.plan.terms.some((t) => t.key === term);
}

export { AuditError }; // so callers of importAudit can catch it

// ---------- Startup ----------
loadSample(); // start from the demo audit; main.js then calls loadState()
