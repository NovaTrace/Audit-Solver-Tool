// src/logic/parser.js
// =====================================================================
// parseAudit() — the one checkpoint every piece of audit data passes
// through: bookmarklet imports, PDF imports, JSON files, and the startup
// load from localStorage.
//
// 1. REJECT data that is broken in a way we can't safely guess about
//      (throws an AuditError with a message that says what is wrong).
// 2. MERGE with the previous state, so a re-import keeps the plan.
// 3. REPAIR data that is just incomplete, by filling in defaults.
//
// Pure logic: no `document`, no localStorage. It never changes the object
// it was given; it returns a new, complete one. Tested in parser.test.js.
// The rules come from the "Rules the data must follow" section of the
// Audit JSON Data Guide.
// =====================================================================

import {
  idFromCode,
  termIndex,
  termFromIndex,
  termLabel,
  termForDate,
} from "./courseText.js";

export const SCHEMA = "audit-solver/v1";

/** Thrown for bad audit data, so the importer can show the message to the
 *  student instead of treating it as a bug in our code. */
export class AuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditError";
  }
}

// Every course has exactly these fields. Anything missing gets this value.
// (Arrays and objects are created fresh per course in fillCourse.)
const COURSE_DEFAULTS = {
  title: null,
  credits: null,
  minCredits: null,
  maxCredits: null,
  status: "needed",
  attempts: [],
  transferNote: null,
  requirementIds: [],
  termsOffered: [],
  availability: {},
  auditNotes: [],
  description: null,
  prereqText: null,
  prereqs: null,
  coreqText: null,
  coreqs: null,
  detailsLoaded: false,
  plannedTerm: null,
  locked: false,
};

// The fields that come from the course-details fetch (bookmarklet only).
// A PDF re-import doesn't have them, so they're kept from the previous state.
const DETAIL_FIELDS = [
  "title",
  "credits",
  "minCredits",
  "maxCredits",
  "termsOffered",
  "availability",
  "description",
  "prereqText",
  "prereqs",
  "coreqText",
  "coreqs",
  "detailsLoaded",
];

const SOURCE_DEFAULTS = {
  type: "json",
  importedAt: null,
  collectorVersion: null,
  exportedAt: null,
};

/**
 * Check, merge and complete audit data.
 *
 * @param {object} data      Audit JSON from any source.
 * @param {object|null} previous  The current state, when re-importing.
 * @param {Date} now         Today's date (tests pass a fixed one).
 * @returns {object}         A new, complete audit object.
 * @throws {AuditError}      If the data is broken.
 */
export function parseAudit(data, previous = null, now = new Date()) {
  // 1. Reject (looks at the input; changes nothing)
  checkShape(data);
  const audit = structuredClone(data); // from here on we only touch our copy
  checkCourses(audit);
  checkRequirements(audit);

  // 2. Merge with what the student already had
  if (previous) mergePrevious(audit, previous);

  // 3. Repair
  audit.source = { ...SOURCE_DEFAULTS, ...audit.source };
  for (const course of Object.values(audit.courses)) fillCourse(course);
  fillPlan(audit, now);
  placeRegistered(audit);
  cleanPicks(audit);

  return audit;
}

// =====================================================================
// 1. REJECT
// =====================================================================

/** Rejects 1 + 2: right schema, and the required keys have the right types. */
function checkShape(data) {
  if (!isPlainObject(data)) {
    throw new AuditError("Audit data must be a JSON object.");
  }
  if (data.schema !== SCHEMA) {
    throw new AuditError(
      `Unsupported schema "${data.schema}" (expected "${SCHEMA}").`,
    );
  }
  if (!isPlainObject(data.student)) {
    throw new AuditError(`"student" must be an object.`);
  }
  if (!Array.isArray(data.requirements)) {
    throw new AuditError(`"requirements" must be an array.`);
  }
  if (!isPlainObject(data.courses)) {
    throw new AuditError(`"courses" must be an object keyed by course id.`);
  }
  if (data.source !== undefined && !isPlainObject(data.source)) {
    throw new AuditError(`"source" must be an object.`);
  }
  if (data.plan !== undefined && !isPlainObject(data.plan)) {
    throw new AuditError(`"plan" must be an object.`);
  }
}

/** Reject 3: each course's key, id and code agree. */
function checkCourses(audit) {
  for (const [key, course] of Object.entries(audit.courses)) {
    if (!isPlainObject(course) || typeof course.code !== "string") {
      throw new AuditError(`Course "${key}" needs a "code" string.`);
    }
    if (course.id !== key) {
      throw new AuditError(
        `Course "${key}" has id "${course.id}"; the key and id must match.`,
      );
    }
    if (course.id !== idFromCode(course.code)) {
      throw new AuditError(
        `Course "${key}" should have id "${idFromCode(course.code)}" for code "${course.code}".`,
      );
    }
  }
}

/** Rejects 4, 5, 6: requirements and courses point at each other correctly. */
function checkRequirements(audit) {
  const reqIds = new Set();

  for (const req of audit.requirements) {
    if (!isPlainObject(req) || typeof req.id !== "string") {
      throw new AuditError(`Every requirement needs an "id" string.`);
    }
    // 6. unique ids
    if (reqIds.has(req.id)) {
      throw new AuditError(`Two requirements share the id "${req.id}".`);
    }
    reqIds.add(req.id);

    // 5. every applied course exists and lists this requirement back
    for (const { code } of req.applied ?? []) {
      const course = audit.courses[idFromCode(code)];
      if (!course) {
        throw new AuditError(
          `Requirement "${req.id}" applies ${code}, which isn't in "courses".`,
        );
      }
      if (!(course.requirementIds ?? []).includes(req.id)) {
        throw new AuditError(
          `Requirement "${req.id}" applies ${code}, but ${code} doesn't list "${req.id}" in its requirementIds.`,
        );
      }
    }
  }

  // 4. every requirementId on a course exists
  for (const course of Object.values(audit.courses)) {
    for (const reqId of course.requirementIds ?? []) {
      if (!reqIds.has(reqId)) {
        throw new AuditError(
          `${course.code} lists requirement "${reqId}", which doesn't exist.`,
        );
      }
    }
  }
}

// =====================================================================
// 2. MERGE
// =====================================================================

/**
 * Re-importing over existing data.
 * - A fresh scrape (no `exportedAt`) has no real plan, so the student's
 *   picks and semester columns come from `previous`.
 * - An exported file (has `exportedAt`) is a saved plan: its own picks win.
 * - Either way, if the new data lacks course details (a PDF import) and the
 *   previous state had them (from the bookmarklet), keep the old details.
 */
function mergePrevious(audit, previous) {
  const isExport = audit.source?.exportedAt != null;

  if (!isExport && previous.plan) {
    audit.plan = structuredClone(previous.plan);
  }

  for (const [id, course] of Object.entries(audit.courses)) {
    const old = previous.courses?.[id];
    if (!old) continue; // a course that's new in this import

    // Keep the old pick, unless the audit now says the course is registered
    // or completed: then the audit's fact replaces the plan (a registered
    // course is placed in its real term below; a completed one is cleared)
    const nowSettled =
      course.status !== old.status &&
      (course.status === "registered" || course.status === "completed");
    if (!isExport && !nowSettled) {
      course.plannedTerm = old.plannedTerm;
      course.locked = old.locked;
    }
    if (!course.detailsLoaded && old.detailsLoaded) {
      for (const field of DETAIL_FIELDS) {
        course[field] = structuredClone(old[field]);
      }
    }
  }
}

// =====================================================================
// 3. REPAIR
// =====================================================================

/** Repairs 2 + 6: every course gets every field. */
function fillCourse(course) {
  for (const [field, value] of Object.entries(COURSE_DEFAULTS)) {
    if (course[field] === undefined) {
      // structuredClone so courses never share one [] or {}
      course[field] = structuredClone(value);
    }
  }
}

/** Repair 1: make sure there's a plan with semester columns. */
function fillPlan(audit, now) {
  audit.plan = { lastSaved: null, ...audit.plan };
  if (!Array.isArray(audit.plan.terms) || audit.plan.terms.length === 0) {
    audit.plan.terms = generateTerms(audit, now);
  }
}

/** Repair 3: registered courses start in their registered term, locked. */
function placeRegistered(audit) {
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  for (const course of Object.values(audit.courses)) {
    if (course.status !== "registered" || course.plannedTerm) continue;
    const term = registeredTerm(course);
    if (term && termKeys.has(term)) {
      course.plannedTerm = term;
      course.locked = true;
    }
  }
}

/** Repairs 4 + 5: picks must point at a real column; locks need a term;
 *  a completed course can't be planned (its hours are already earned). */
function cleanPicks(audit) {
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  for (const course of Object.values(audit.courses)) {
    if (course.plannedTerm !== null && !termKeys.has(course.plannedTerm)) {
      course.plannedTerm = null;
    }
    if (course.status === "completed") course.plannedTerm = null;
    if (course.plannedTerm === null) course.locked = false;
  }
}

// =====================================================================
// SEMESTER COLUMNS  (term helpers live in logic/courseText.js)
// =====================================================================

const MIN_TERMS = 6; // always show at least this many columns

/**
 * Columns from the earlier of (this term, the first registered term) up to
 * at least MIN_TERMS columns and at least the last registered term.
 */
function generateTerms(audit, now) {
  const registered = Object.values(audit.courses)
    .filter((c) => c.status === "registered")
    .map(registeredTerm)
    .filter(Boolean)
    .map(termIndex);

  const current = termIndex(termForDate(now));
  const first = Math.min(current, ...registered);
  const last = Math.max(first + MIN_TERMS - 1, ...registered);

  const terms = [];
  for (let i = first; i <= last; i++) {
    const key = termFromIndex(i);
    terms.push({ key, label: termLabel(key) });
  }
  return terms;
}

// =====================================================================
// HELPERS
// =====================================================================

/** The term of the course's registered ("***") attempt, or null. */
function registeredTerm(course) {
  const attempt = (course.attempts ?? []).findLast((a) => a.grade === "***");
  return attempt?.term ?? null;
}

// True for a {...} object (not null, not an array)
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
