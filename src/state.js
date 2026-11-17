// src/state.js — holds the current audit, changes it, and saves it.
//
// The audit object is defined in the Audit JSON Data Guide. Picks are stored
// on each course as `plannedTerm` and `locked`.
// Read with getAudit(); change only through the functions here, which
// return true when something changed.
// Used by: main.js.
// No DOM. Tests: State.test.js.

import { parseAudit, AuditError } from "./logic/parser.js";
import {
  termAfter,
  termLabel,
  isCourseCode,
  normalizeCode,
  idFromCode,
  MAX_TERMS,
} from "./logic/courseText.js";
import sample from "./data/sample-audit.json";

const STORAGE_KEY = "audit-solver-state";

export { MAX_TERMS }; // maximum semester columns

// The current audit; null until one is loaded (the empty first-visit page).
let audit = null;

// True while the demo audit is loaded. The demo is never saved or merged into
// an import.
let sampleLoaded = false;

/** The current audit object, or null before one is loaded. Read-only. */
export function getAudit() {
  return audit;
}

/** True while the demo audit is loaded. */
export function isSampleLoaded() {
  return sampleLoaded;
}

// ---------- Loading an audit ----------

/** Replaces the current audit with one already passed through parseAudit(). */
export function loadAudit(parsed) {
  audit = parsed;
  sampleLoaded = false;
}

/**
 * Validates and loads new audit data. A fresh scrape keeps the current picks
 * (see parseAudit). Throws AuditError for invalid data; the current audit is
 * left unchanged.
 */
export function importAudit(data) {
  const previous = sampleLoaded ? null : audit; // never merge demo picks
  loadAudit(parseAudit(data, previous));
}

/** Loads the demo audit. */
export function loadSample() {
  loadAudit(parseAudit(sample));
  sampleLoaded = true;
}

/**
 * Resets the plan: clears every pick and restores the default semester
 * columns. Registered courses return to their registered term (parseAudit).
 */
export function resetPlan() {
  if (sampleLoaded) {
    loadSample(); // the demo's starting plan is the sample file
    return;
  }
  const copy = structuredClone(audit);
  for (const course of Object.values(copy.courses)) {
    delete course.plannedTerm;
    delete course.locked;
  }
  // With no columns, parseAudit generates the defaults.
  delete copy.plan.terms;
  loadAudit(parseAudit(copy));
}

/** Deletes the saved audit and unloads it. Used by "Clear data". */
export function clearAllData() {
  clearSaved();
  audit = null;
  sampleLoaded = false;
}

// ---------- Changing the plan ----------

/**
 * Places a course in `term`, or removes it from the plan when `term` is "".
 * Refused for locked or completed courses and unknown terms.
 */
export function setTerm(id, term) {
  const course = findCourse(id);
  if (!course) return false;
  if (course.locked) return false; // locked
  if (course.status === "completed") return false; // already taken
  const next = term === "" ? null : term;
  if (next !== null && !isTermKey(next)) return false;
  if (course.plannedTerm === next) return false; // already there
  course.plannedTerm = next;
  return true;
}

/** Locks or unlocks a course. A course with no term can't be locked. */
export function toggleLock(id) {
  const course = findCourse(id);
  if (!course) return false;
  if (course.locked) {
    course.locked = false; // unlock
    return true;
  }
  if (!course.plannedTerm) return false; // no term to lock it in
  course.locked = true;
  return true;
}

// ---------- Courses added by the student ----------

/**
 * Adds a course the audit doesn't list.
 *
 *   code           "MATH 3110" (any spacing or case)
 *   title          optional
 *   credits        above 0, at most 12
 *   requirementId  requirement it counts toward, or ""
 *
 * Returns { ok: true, code } or { ok: false, message }.
 * The course is marked `custom: true`: removable, and kept across imports.
 * If the course is already on the audit and a requirement is given, it is
 * linked to that requirement instead (linkExisting) and the result includes
 * `linkedTo`.
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
  if (existing) return linkExisting(existing, requirementId);
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
    status: "option", // a choice, like the audit's own options
    requirementIds: req ? [req.id] : [],
    custom: true,
  };
  // Listing it as an option is what counts it toward the requirement.
  if (req) req.options.push(normalized);
  // parseAudit fills in the remaining course fields.
  audit = parseAudit(audit);
  return { ok: true, code: normalized };
}

// Links a course already on the audit to one more requirement.
// `linkedTo` records the student's own links so they can be undone and
// kept across imports.
function linkExisting(course, requirementId) {
  const { code } = course;
  if (course.status === "completed") {
    return {
      ok: false,
      message: `${code} is already completed on your audit.`,
    };
  }
  const req = audit.requirements.find((r) => r.id === requirementId);
  if (!req) {
    return {
      ok: false,
      message: `${code} is already in the course list. To count it toward another requirement, choose that requirement under "Counts toward".`,
    };
  }
  if (course.requirementIds.includes(req.id)) {
    return {
      ok: false,
      message: `${code} already counts toward ${req.title}.`,
    };
  }
  req.options.push(code);
  course.requirementIds.push(req.id);
  course.linkedTo.push(req.id);
  return { ok: true, code, linkedTo: req.title };
}

/**
 * Removes every link the student made for a course. The audit's own links stay.
 */
export function unlinkCourse(id) {
  const course = findCourse(id);
  if (!course || course.linkedTo.length === 0) return false;
  const mine = new Set(course.linkedTo);
  for (const req of audit.requirements) {
    if (!mine.has(req.id)) continue;
    req.options = req.options.filter((code) => code !== course.code);
  }
  course.requirementIds = course.requirementIds.filter((r) => !mine.has(r));
  course.linkedTo = [];
  return true;
}

/**
 * Removes a hand-added course. Refused for audit courses, unknown ids and
 * locked courses.
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

// ---------- Requirements on and off ----------

/**
 * Switches a requirement off or back on. Off: its courses leave the course
 * list and it is no longer counted. The audit's status and hours are unchanged.
 */
export function toggleRequirement(id) {
  const req = audit.requirements.find((r) => r.id === id);
  if (!req) return false;
  req.ignored = !req.ignored;
  return true;
}

/** Switches every unmet requirement in a section off (`off` true) or on. */
export function setSectionOff(section, off) {
  const reqs = audit.requirements.filter(
    (r) => r.section === section && r.status === "needs",
  );
  const changed = reqs.some((r) => r.ignored !== off);
  for (const req of reqs) req.ignored = off;
  return changed;
}

// ---------- Semester columns ----------

/**
 * Adds a column for the term after the last one. Returns false at MAX_TERMS.
 */
export function addTerm() {
  const terms = audit.plan.terms;
  if (terms.length >= MAX_TERMS) return false;
  const key = termAfter(terms.at(-1).key);
  terms.push({ key, label: termLabel(key) });
  return true;
}

/**
 * Removes a column; courses planned in it become unplaced.
 * Refused when `key` isn't a column, it is the only column, or it holds a
 * locked course.
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

// ---------- Saving (localStorage) ----------

/**
 * Loads the saved audit through parseAudit(), so old or edited saves are
 * validated and repaired, or skipped. Returns true if one was loaded.
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
 * Saves the current audit. Returns true on success. The demo, and the
 * empty page, are never saved.
 */
export function saveState() {
  if (sampleLoaded || !audit) return false;
  try {
    audit.plan.lastSaved = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(audit));
    return true;
  } catch (e) {
    // storage full, or blocked (private window)
    console.warn("Could not save planner state:", e);
    return false;
  }
}

/** Deletes the saved audit. */
export function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Could not clear saved planner state:", e);
  }
}

// ---------- Helpers ----------

// The course with this id, or null. Object.hasOwn keeps ids such as
// "__proto__" from matching built-in properties.
function findCourse(id) {
  return Object.hasOwn(audit.courses, id) ? audit.courses[id] : null;
}

// True if `term` is one of the plan's columns.
function isTermKey(term) {
  return audit.plan.terms.some((t) => t.key === term);
}

export { AuditError }; // for callers of importAudit
