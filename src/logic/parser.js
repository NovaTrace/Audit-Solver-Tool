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
  isTermKey,
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
  custom: false, // true for a course the student added by hand
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

// Every student has exactly these fields, so the page never prints
// "undefined".
const STUDENT_DEFAULTS = {
  name: "Unknown student",
  degreeTitle: null,
  programCode: null,
  programs: [],
  catalogYear: null,
  preparedOn: null,
  graduationDate: null,
  allRequirementsMet: false,
  hoursRequired: null,
  hoursEarned: null,
  hoursInProgress: null,
  gpa: null,
  attemptedHours: null,
};

// Every requirement has exactly these fields. `title` and `type` have no
// fixed default: fillRequirement works them out.
const REQUIREMENT_DEFAULTS = {
  section: "Other requirements",
  status: "needs",
  needCourses: null,
  needHours: null,
  earnedHours: 0,
  inProgressHours: 0,
  options: [],
  applied: [],
  description: "",
  ignored: false, // true when the student switched the requirement off
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
  const keptColumns = previous ? mergePrevious(audit, previous) : false;

  // 3. Repair
  audit.source = { ...SOURCE_DEFAULTS, ...audit.source };
  audit.student = { ...structuredClone(STUDENT_DEFAULTS), ...audit.student };
  for (const req of audit.requirements) fillRequirement(req);
  for (const course of Object.values(audit.courses)) fillCourse(course);
  fillPlan(audit, now, keptColumns);

  // Both pick repairs need to know which columns exist
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  placeRegistered(audit, termKeys);
  cleanPicks(audit, termKeys);

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
  mustBeList(data.student.programs, `"student.programs"`);
}

/** Reject 3: each course's key, id and code agree, and the fields the
 *  page does math or loops with have the right type. */
function checkCourses(audit) {
  for (const [key, course] of Object.entries(audit.courses)) {
    if (!isPlainObject(course) || typeof course.code !== "string") {
      throw new AuditError(`Course "${key}" needs a "code" string.`);
    }
    for (const field of ["attempts", "requirementIds", "termsOffered"]) {
      mustBeList(course[field], `Course "${key}": "${field}"`);
    }
    for (const field of ["credits", "minCredits", "maxCredits"]) {
      mustBeNumber(course[field], `Course "${key}": "${field}"`);
    }
    if (!(course.attempts ?? []).every(isPlainObject)) {
      throw new AuditError(`Course "${key}": every attempt must be an object.`);
    }
    if (
      course.availability !== undefined &&
      !isPlainObject(course.availability)
    ) {
      throw new AuditError(
        `Course "${key}": "availability" must be an object.`,
      );
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

    // The lists and numbers the page loops over and adds up
    mustBeList(req.options, `Requirement "${req.id}": "options"`);
    mustBeList(req.applied, `Requirement "${req.id}": "applied"`);
    mustBeNumber(req.needHours, `Requirement "${req.id}": "needHours"`);
    mustBeNumber(req.needCourses, `Requirement "${req.id}": "needCourses"`);
    if (!(req.options ?? []).every((code) => typeof code === "string")) {
      throw new AuditError(
        `Requirement "${req.id}": every option must be a course code.`,
      );
    }

    // 5. every applied course exists and lists this requirement back
    for (const entry of req.applied ?? []) {
      if (!isPlainObject(entry) || typeof entry.code !== "string") {
        throw new AuditError(
          `Requirement "${req.id}": every applied course needs a "code" string.`,
        );
      }
      const { code } = entry;
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
 *
 * Returns true if the student's old semester columns were kept (fillPlan
 * then brings them up to date).
 */
function mergePrevious(audit, previous) {
  const isExport = audit.source?.exportedAt != null;
  const keptColumns = !isExport && Boolean(previous.plan);

  if (keptColumns) {
    audit.plan = structuredClone(previous.plan);
  }

  for (const [id, course] of Object.entries(audit.courses)) {
    const old = previous.courses?.[id];
    if (!old) continue; // a course that's new in this import

    if (!isExport && !auditOverridesPick(course, old)) {
      course.plannedTerm = old.plannedTerm;
      course.locked = old.locked;
    }
    if (!course.detailsLoaded && old.detailsLoaded) {
      for (const field of DETAIL_FIELDS) {
        course[field] = structuredClone(old[field]);
      }
    }
  }
  if (!isExport) {
    keepCustomCourses(audit, previous);
    keepSwitchedOff(audit, previous);
  }
  return keptColumns;
}

/**
 * A fresh scrape doesn't know which requirements the student switched off
 * (a track they aren't taking, say), so that choice is carried over from
 * the previous state. Requirements are matched by id, which is made from
 * the section and title and so stays the same from one audit to the next.
 */
function keepSwitchedOff(audit, previous) {
  const off = new Set(
    (previous.requirements ?? []).filter((r) => r.ignored).map((r) => r.id),
  );
  for (const req of audit.requirements) {
    if (off.has(req.id)) req.ignored = true;
  }
}

/**
 * A fresh scrape only knows the courses on the audit, so the ones the
 * student added by hand (`custom: true`) are brought over from the
 * previous state, with their picks.
 * - If the audit now lists that course itself (e.g. the student registered
 *   for it), the audit's version is used and the hand-made one is dropped.
 * - A link to a requirement that no longer exists is removed; the course
 *   then shows under "Not linked to a requirement".
 * An exported file is a whole plan and already holds its own custom courses.
 */
function keepCustomCourses(audit, previous) {
  const reqIds = new Set(audit.requirements.map((r) => r.id));
  for (const [id, old] of Object.entries(previous.courses ?? {})) {
    if (!old.custom || audit.courses[id]) continue;
    const course = structuredClone(old);
    course.requirementIds = (course.requirementIds ?? []).filter((reqId) =>
      reqIds.has(reqId),
    );
    audit.courses[id] = course;
    // List it as an option again, so it counts toward the requirement
    for (const req of audit.requirements) {
      if (!course.requirementIds.includes(req.id)) continue;
      req.options = [...new Set([...(req.options ?? []), course.code])];
    }
  }
}

/**
 * True when the new audit states a fact that replaces the student's old
 * pick for a course:
 * - it's completed now (the pick is cleared);
 * - it's registered now, and it wasn't before or its term changed (it's
 *   placed in its real term by placeRegistered);
 * - it was registered and isn't any more, e.g. dropped (it goes back to
 *   unplaced instead of staying locked in a term it's no longer in).
 * A registered course whose term is unchanged keeps the old pick, so a
 * student who unlocked and moved it doesn't lose that.
 */
function auditOverridesPick(course, old) {
  if (course.status === "completed") return true;
  if (course.status === "registered") {
    return (
      old.status !== "registered" ||
      registeredTerm(course) !== registeredTerm(old)
    );
  }
  return old.status === "registered";
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
  course.locked = course.locked === true; // anything else isn't a lock
  course.custom = course.custom === true;
}

/** Every requirement gets every field (the page loops over `options` and
 *  `applied`, so a missing one would stop it drawing). */
function fillRequirement(req) {
  for (const [field, value] of Object.entries(REQUIREMENT_DEFAULTS)) {
    if (req[field] === undefined) req[field] = structuredClone(value);
  }
  req.title ??= req.id;
  // With no type given: a list of options is a pool, none is a rule
  req.type ??= req.options.length ? "pool" : "rule";
  req.ignored = req.ignored === true; // anything else isn't "switched off"
}

/**
 * Repair 1: make sure there's a plan with usable semester columns.
 * `keptColumns` is true when they are the student's old ones, kept through
 * a fresh scrape: those are brought up to date (see rollTerms).
 */
function fillPlan(audit, now, keptColumns) {
  audit.plan = { lastSaved: null, ...audit.plan };
  const terms = cleanTerms(audit.plan.terms);
  if (terms.length === 0) {
    audit.plan.terms = generateTerms(audit, now);
  } else {
    audit.plan.terms = keptColumns ? rollTerms(terms, audit, now) : terms;
  }
}

/** Repair 3: registered courses start in their registered term, locked. */
function placeRegistered(audit, termKeys) {
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
function cleanPicks(audit, termKeys) {
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
  const registered = registeredTerms(audit).map(termIndex);

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

/**
 * The plan's columns with anything unusable removed: each one needs a real
 * term key ("FA26"), listed once, in time order. A missing label is filled
 * in. Returns [] if nothing usable is left.
 */
function cleanTerms(terms) {
  if (!Array.isArray(terms)) return [];
  const byKey = new Map();
  for (const term of terms) {
    if (!isPlainObject(term) || !isTermKey(term.key)) continue;
    if (byKey.has(term.key)) continue;
    const label =
      typeof term.label === "string" ? term.label : termLabel(term.key);
    byKey.set(term.key, { ...term, label });
  }
  return [...byKey.values()].sort(
    (a, b) => termIndex(a.key) - termIndex(b.key),
  );
}

/**
 * Bring the student's old columns up to date after a fresh scrape:
 * - terms that are over are dropped (picks left in them are cleared by
 *   cleanPicks, so those courses show as unplaced again);
 * - new terms are added at the end, so there are always columns to plan
 *   in and every registered course has its column;
 * - a term the student left out in the middle stays out, unless a course
 *   is registered in it.
 */
function rollTerms(terms, audit, now) {
  const fresh = generateTerms(audit, now); // what a brand-new plan would get
  const first = termIndex(fresh[0].key);
  const kept = terms.filter((t) => termIndex(t.key) >= first);
  if (kept.length === 0) return fresh;

  const keptKeys = new Set(kept.map((t) => t.key));
  const firstKept = termIndex(kept[0].key);
  const lastKept = termIndex(kept.at(-1).key);
  const registered = new Set(registeredTerms(audit));
  const added = fresh.filter((t) => {
    if (keptKeys.has(t.key)) return false;
    const i = termIndex(t.key);
    return i < firstKept || i > lastKept || registered.has(t.key);
  });
  return [...kept, ...added].sort(
    (a, b) => termIndex(a.key) - termIndex(b.key),
  );
}

// =====================================================================
// HELPERS
// =====================================================================

/** The term of the course's registered ("***") attempt, or null. */
function registeredTerm(course) {
  const attempt = (course.attempts ?? []).findLast((a) => a.grade === "***");
  return attempt?.term ?? null;
}

/** The terms that registered courses are in (real term keys only). */
function registeredTerms(audit) {
  return Object.values(audit.courses)
    .filter((c) => c.status === "registered")
    .map(registeredTerm)
    .filter(isTermKey);
}

// Reject helpers: a field that is present must have the right type
function mustBeList(value, what) {
  if (value !== undefined && !Array.isArray(value)) {
    throw new AuditError(`${what} must be a list.`);
  }
}
function mustBeNumber(value, what) {
  if (value != null && !Number.isFinite(value)) {
    throw new AuditError(`${what} must be a number.`);
  }
}

// True for a {...} object (not null, not an array)
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
