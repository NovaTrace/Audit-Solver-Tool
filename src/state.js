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
import {
  termAfter,
  termLabel,
  termIndex,
  isTermKey as isRealTerm, // "is this text a term at all?" ("FA26": yes)
  isPastTerm,
  isCourseCode,
  normalizeCode,
  idFromCode,
  MAX_TERMS,
} from "./logic/courseText.js";
import sample from "./data/sample-audit.json";

const STORAGE_KEY = "audit-solver-state";

export { MAX_TERMS }; // the most semester columns a plan can have

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
 * Put the plan back to how it starts: every pick cleared and the semester
 * columns back to the default ones, so added or removed semesters are
 * undone too. Registered courses go back into their registered term,
 * locked (parseAudit does that).
 */
export function resetPlan() {
  if (sampleLoaded) {
    loadSample(); // the demo's starting plan is the sample file itself
    return;
  }
  const copy = structuredClone(audit);
  for (const course of Object.values(copy.courses)) {
    delete course.plannedTerm;
    delete course.locked;
  }
  // With no columns, parseAudit makes the default ones again: from the
  // current term (or the first registered one), at least 6 terms
  delete copy.plan.terms;
  loadAudit(parseAudit(copy));
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

// ---------- Courses the student adds by hand ----------

/**
 * Add a course the audit doesn't list, for requirements like "any MATH
 * course numbered 3100 or higher" where the audit names no choices.
 *
 *   code           "MATH 3110" (any spacing or case)
 *   title          optional
 *   credits        a number above 0, at most 12
 *   requirementId  the requirement it counts toward, or "" for none
 *
 * Returns { ok: true, code } or { ok: false, message } with words to show
 * the student. The course is marked `custom: true`, so it can be removed
 * again and is kept when a new audit is imported.
 */
export function addCustomCourse({
  code,
  title = "",
  credits,
  requirementId = "",
}) {
  if (!isCourseCode(code)) {
    return { ok: false, message: "Enter a course code like MATH 3110." };
  }
  const normalized = normalizeCode(code);
  const id = idFromCode(normalized);
  const existing = findCourse(id);
  if (existing) {
    const where =
      existing.status === "completed"
        ? "already completed on your audit"
        : "already in the course list";
    return { ok: false, message: `${normalized} is ${where}.` };
  }
  const hours = Number(credits);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 12) {
    return { ok: false, message: "Credits must be a number from 0.5 to 12." };
  }
  const req = audit.requirements.find((r) => r.id === requirementId);
  if (requirementId !== "" && !req) {
    return { ok: false, message: "Pick a requirement from the list." };
  }

  audit.courses[id] = {
    id,
    code: normalized,
    title: String(title).trim() || null,
    credits: hours,
    minCredits: hours,
    maxCredits: hours,
    status: "option", // a choice, like the options the audit lists itself
    requirementIds: req ? [req.id] : [],
    custom: true,
  };
  // Listing it as one of the requirement's options is what makes it count
  // toward that requirement's progress
  if (req) req.options.push(normalized);
  // parseAudit gives the new course every other field (attempts, prereqs…)
  audit = parseAudit(audit);
  return { ok: true, code: normalized };
}

/**
 * Remove a course the student added by hand. Returns true if it was
 * removed. Refused (false) for a course from the audit, an unknown id, or
 * a locked course (unlock it first, as with removing a semester).
 */
export function removeCustomCourse(id) {
  const course = findCourse(id);
  if (!course || !course.custom || course.locked) return false;
  for (const req of audit.requirements) {
    req.options = req.options.filter((code) => code !== course.code);
  }
  delete audit.courses[id];
  return true;
}

// ---------- Switching requirements on and off ----------

/**
 * A requirement's badge or tick box was clicked: switch it off, or back
 * on. Off means "I don't need to finish this one" (a track the student
 * isn't taking, a minor they're dropping): its courses leave the course
 * list and it stops counting as something to plan. The audit's own facts
 * (status, hours) are not changed. Returns true if something changed.
 */
export function toggleRequirement(id) {
  const req = audit.requirements.find((r) => r.id === id);
  if (!req) return false;
  req.ignored = !req.ignored;
  return true;
}

/**
 * A section's tick box was clicked: switch every unmet requirement in the
 * section off (`off` true) or back on, in one go. This is what makes a
 * track of many single courses one click instead of many.
 * Returns true if anything changed.
 */
export function setSectionOff(section, off) {
  const reqs = audit.requirements.filter(
    (r) => r.section === section && r.status === "needs",
  );
  const changed = reqs.some((r) => r.ignored !== off);
  for (const req of reqs) req.ignored = off;
  return changed;
}

// ---------- Changing the semester columns ----------

/**
 * A '+' block was clicked: add a semester column. `key` is the term to
 * add ("SP27"): one before the first column (back to the current term,
 * no further), one missing in the middle, or one after the last. With no key, it's the term after the last column.
 * Returns true if a column was added.
 *
 * Refused (false) when the plan is at MAX_TERMS, `key` isn't a real term,
 * that term is already a column, or it is already over (a semester that
 * has finished can't be planned).
 */
export function addTerm(key = termAfter(audit.plan.terms.at(-1).key)) {
  const terms = audit.plan.terms;
  if (terms.length >= MAX_TERMS) return false;
  if (!isRealTerm(key) || isTermKey(key)) return false;
  if (isPastTerm(key)) return false;
  terms.push({ key, label: termLabel(key) });
  // Keep the columns in time order, wherever the new one belongs
  terms.sort((a, b) => termIndex(a.key) - termIndex(b.key));
  return true;
}

/**
 * A column's '−' was clicked: remove that column. Courses planned in it
 * go back to unplaced. Returns true if the column was removed.
 *
 * Refused (false) when:
 * - `key` isn't one of the columns;
 * - it's the only column left (the plan needs somewhere to put courses);
 * - a locked course is in it. Locking means "this one stays here", so the
 *   student unlocks it first rather than losing it by accident.
 */
export function removeTerm(key) {
  const terms = audit.plan.terms;
  if (!isTermKey(key) || terms.length <= 1) return false;
  const inTerm = Object.values(audit.courses).filter(
    (c) => c.plannedTerm === key,
  );
  if (inTerm.some((c) => c.locked)) return false;
  for (const course of inTerm) course.plannedTerm = null;
  audit.plan.terms = terms.filter((t) => t.key !== key);
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
