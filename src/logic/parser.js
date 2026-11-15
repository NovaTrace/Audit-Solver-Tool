// src/logic/parser.js — parseAudit(): validates, merges and completes audit
// data.
//
// Every source passes through it: bookmarklet, PDF, JSON file, and the
// saved copy in localStorage.
//   1. Reject  data too broken to guess about (throws AuditError)
//   2. Merge   with the previous state, so a re-import keeps the plan
//   3. Repair  incomplete data by filling in defaults
//
// Returns a new object; the input is never changed.
// Used by: state.js, ui/importer.js (AuditError), bookmarklet/collector.js.
// Rules: "Rules the data must follow" in the Audit JSON Data Guide.
// Pure logic, no DOM or localStorage. Tests: parser.test.js.

import {
  idFromCode,
  termIndex,
  termFromIndex,
  termLabel,
  termForDate,
  isTermKey,
  registeredTerm,
} from "./courseText.js";

export const SCHEMA = "audit-solver/v1";

/** Thrown for invalid audit data. The message is shown to the student. */
export class AuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuditError";
  }
}

// Fields every course has, with the value used when one is missing.
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
  custom: false, // added by the student
  linkedTo: [], // requirement ids the student linked this course to
  plannedTerm: null,
  locked: false,
};

// Fields from the course-details fetch (bookmarklet only). A PDF import
// lacks them, so they are kept from the previous state.
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

// Fields every student has.
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

// Fields every requirement has. `title` and `type` are set by fillRequirement.
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
  ignored: false, // switched off by the student
};

/**
 * Validates, merges and completes audit data.
 *
 * @param {object} data           Audit JSON from any source.
 * @param {object|null} previous  Current state, when re-importing.
 * @param {Date} now              Current date (tests pass a fixed one).
 * @returns {object}              A new, complete audit object.
 * @throws {AuditError}           If the data is invalid.
 */
export function parseAudit(data, previous = null, now = new Date()) {
  // 1. Reject (reads the input only)
  checkShape(data);
  const audit = structuredClone(data); // only the copy is changed from here on
  checkCourses(audit);
  checkRequirements(audit);

  // 2. Merge with the previous state
  const keptColumns = previous ? mergePrevious(audit, previous) : false;

  // 3. Repair
  audit.source = { ...SOURCE_DEFAULTS, ...audit.source };
  audit.student = { ...structuredClone(STUDENT_DEFAULTS), ...audit.student };
  for (const req of audit.requirements) fillRequirement(req);
  for (const course of Object.values(audit.courses)) fillCourse(course);
  fillPlan(audit, now, keptColumns);

  // Both pick repairs need the set of columns.
  const termKeys = new Set(audit.plan.terms.map((t) => t.key));
  placeRegistered(audit, termKeys, now);
  cleanPicks(audit, termKeys);

  return audit;
}

// ---------- 1. Reject ----------

/** Rejects 1 + 2: schema matches; required keys have the right types. */
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

/**
 * Reject 3: each course's key, id and code agree; numeric and list fields have
 * the right type.
 */
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

/** Rejects 4, 5, 6: requirements and courses reference each other correctly. */
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

    // Lists and numbers the page iterates and sums
    mustBeList(req.options, `Requirement "${req.id}": "options"`);
    mustBeList(req.applied, `Requirement "${req.id}": "applied"`);
    mustBeNumber(req.needHours, `Requirement "${req.id}": "needHours"`);
    mustBeNumber(req.needCourses, `Requirement "${req.id}": "needCourses"`);
    if (!(req.options ?? []).every((code) => typeof code === "string")) {
      throw new AuditError(
        `Requirement "${req.id}": every option must be a course code.`,
      );
    }

    // 5. every applied course exists and lists this requirement
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

// ---------- 2. Merge ----------

/**
 * Merges a re-import with the previous state.
 * - Fresh scrape (no `exportedAt`): picks and semester columns come from
 *   `previous`.
 * - Exported file (`exportedAt` set): its own picks are used.
 * - Either way, course details missing from the new data are kept from
 *   `previous`.
 *
 * Returns true if the previous semester columns were kept.
 */
function mergePrevious(audit, previous) {
  const isExport = audit.source?.exportedAt != null;
  const keptColumns = !isExport && Boolean(previous.plan);

  if (keptColumns) {
    audit.plan = structuredClone(previous.plan);
  }

  for (const [id, course] of Object.entries(audit.courses)) {
    const old = previous.courses?.[id];
    if (!old) continue; // new in this import

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
    keepLinks(audit, previous);
  }
  return keptColumns;
}

/**
 * Restores the student's hand-made links (`linkedTo`) after a fresh scrape,
 * unless the requirement is gone or the audit now makes the link itself.
 */
function keepLinks(audit, previous) {
  for (const [id, old] of Object.entries(previous.courses ?? {})) {
    const course = audit.courses[id];
    if (!course || !Array.isArray(old.linkedTo)) continue;
    for (const reqId of old.linkedTo) {
      const req = audit.requirements.find((r) => r.id === reqId);
      if (!req || (course.requirementIds ?? []).includes(reqId)) continue;
      req.options = [...new Set([...(req.options ?? []), course.code])];
      course.requirementIds = [...(course.requirementIds ?? []), reqId];
      course.linkedTo = [...(course.linkedTo ?? []), reqId];
    }
  }
}

/** Carries switched-off requirements over a fresh scrape, matched by id. */
function keepSwitchedOff(audit, previous) {
  const off = new Set(
    (previous.requirements ?? []).filter((r) => r.ignored).map((r) => r.id),
  );
  for (const req of audit.requirements) {
    if (off.has(req.id)) req.ignored = true;
  }
}

/**
 * Carries hand-added courses (`custom: true`) and their picks over a fresh
 * scrape.
 * - If the audit now lists the course, the audit's version is used.
 * - Links to requirements that no longer exist are removed.
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
    // Re-list it as an option so it counts toward the requirement.
    for (const req of audit.requirements) {
      if (!course.requirementIds.includes(req.id)) continue;
      req.options = [...new Set([...(req.options ?? []), course.code])];
    }
  }
}

/**
 * True when the new audit replaces the student's pick for a course:
 * - completed now (pick cleared);
 * - registered now, and it wasn't before or its term changed;
 * - no longer registered, e.g. dropped (pick cleared).
 * A registered course whose term is unchanged keeps the previous pick.
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

// ---------- 3. Repair ----------

/** Repairs 2 + 6: fills in every missing course field. */
function fillCourse(course) {
  for (const [field, value] of Object.entries(COURSE_DEFAULTS)) {
    if (course[field] === undefined) {
      // cloned so courses never share one [] or {}
      course[field] = structuredClone(value);
    }
  }
  course.locked = course.locked === true; // only `true` is a lock
  course.custom = course.custom === true;
  course.linkedTo = Array.isArray(course.linkedTo)
    ? course.linkedTo.filter((id) => typeof id === "string")
    : [];
}

/** Fills in every missing requirement field. */
function fillRequirement(req) {
  for (const [field, value] of Object.entries(REQUIREMENT_DEFAULTS)) {
    if (req[field] === undefined) req[field] = structuredClone(value);
  }
  req.title ??= req.id;
  // No type given: options make it a pool, none a rule.
  req.type ??= req.options.length ? "pool" : "rule";
  req.ignored = req.ignored === true; // only `true` switches it off
}

/**
 * Repair 1: ensures a plan with valid semester columns.
 * `keptColumns`: the columns are the student's previous ones and are
 * brought up to date (rollTerms).
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

/**
 * Repair 3: places registered courses in their registered term.
 * - Term started: always placed there and locked.
 * - Later term: placed there only if it has no term, unlocked. From then on
 *   it is an ordinary pick.
 */
function placeRegistered(audit, termKeys, now) {
  const current = termIndex(termForDate(now));
  for (const course of Object.values(audit.courses)) {
    if (course.status !== "registered") continue;
    const term = registeredTerm(course);
    if (!term || !termKeys.has(term)) continue;
    if (termIndex(term) <= current) {
      course.plannedTerm = term;
      course.locked = true;
    } else if (!course.plannedTerm) {
      course.plannedTerm = term;
      course.locked = false;
    }
  }
}

/**
 * Repairs 4 + 5: picks must name a column; locks need a term; completed courses
 * have no pick.
 */
function cleanPicks(audit, termKeys) {
  for (const course of Object.values(audit.courses)) {
    if (course.plannedTerm !== null && !termKeys.has(course.plannedTerm)) {
      course.plannedTerm = null;
    }
    if (course.status === "completed") course.plannedTerm = null;
    if (course.plannedTerm === null) course.locked = false;
  }
}

// ---------- Semester columns (term helpers: courseText.js) ----------

const MIN_TERMS = 6; // minimum number of columns

/**
 * Columns from the earlier of the current term and the first registered
 * term, through at least MIN_TERMS columns and the last registered term.
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
 * Valid columns only: real term keys, without repeats, in time order, labels
 * filled in. Returns [] if none are valid.
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
 * Brings previous columns up to date after a fresh scrape:
 * - past terms are dropped (cleanPicks clears picks left in them);
 * - new terms are appended, covering every registered course;
 * - a term the student removed stays out unless a course is registered in it.
 */
function rollTerms(terms, audit, now) {
  const fresh = generateTerms(audit, now); // columns a new plan would get
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

// ---------- Helpers ----------

/** Terms that registered courses are in (valid term keys only). */
function registeredTerms(audit) {
  return Object.values(audit.courses)
    .filter((c) => c.status === "registered")
    .map(registeredTerm)
    .filter(isTermKey);
}

// Reject helpers: a field that is present must have the right type.
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

// True for a plain {...} object (not null, not an array).
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
