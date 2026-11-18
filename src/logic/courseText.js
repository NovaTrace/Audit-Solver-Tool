// src/logic/courseText.js — text helpers for course codes, prerequisites and
// terms.
//
// Converts the audit site's spellings to ours: "MATH1350" -> "MATH 1350",
// "Fall 2026" -> "FA26".
// Used by: parser.js, auditBuild.js, pdfAudit.js, the other logic files,
// state.js, render/*, and the bookmarklet scrapers.
// Pure functions, no DOM. Tests: courseText.test.js.

// ---------- Course codes ----------

// Department (2–4 letters), optional space, 4-digit number, optional suffix
// such as the transfer-credit "TC" in "PSY 2999TC".
const CODE_PATTERN = /^([A-Za-z]{2,4})\s*(\d{4}[A-Za-z]*)$/;

/**
 * "MATH1350" or " math 1350 " -> "MATH 1350". Other shapes are trimmed and
 * upper-cased only.
 */
export function normalizeCode(code) {
  const text = code.trim();
  const match = text.match(CODE_PATTERN);
  return match ? `${match[1]} ${match[2]}`.toUpperCase() : text.toUpperCase();
}

/** True for text shaped like a course code: "MATH 3110", "cs1150L". */
export function isCourseCode(code) {
  return typeof code === "string" && CODE_PATTERN.test(code.trim());
}

/** "MATH 1350" -> "math1350", the key used in `courses`. */
export function idFromCode(code) {
  return code.replace(/\s+/g, "").toLowerCase();
}

// Looks like a department but isn't: "FALL 2026" is a term.
const NOT_DEPARTMENTS = new Set(["FALL"]);

/** Every course code in the text, normalized, without repeats. */
export function codesIn(text = "") {
  const found = [...text.matchAll(/\b([A-Z]{2,4})\s?(\d{4}[A-Z]*)\b/g)]
    .filter((m) => !NOT_DEPARTMENTS.has(m[1]))
    .map((m) => `${m[1]} ${m[2]}`);
  return [...new Set(found)];
}

// ---------- Prerequisites and corequisites ----------

const GRADE = /grade of\s*["“”']?([A-F][+-]?)["“”']?/i;

/**
 * Parses prerequisite text into groups.
 *
 * "A or B with a grade of C or better; D. Engineering students only" ->
 * { groups: [{ anyOf: ["A","B"], minGrade: "C" },
 *             { anyOf: ["D"], minGrade: null }],
 *   notes: ["Engineering students only"] }
 *
 * Every group is required; any one course in a group satisfies it.
 * - Sentences with no course code become `notes`.
 * - Groups split on ";" and on "and".
 * - A group with no grade takes the grade of the next group in the same ";"
 *   piece.
 * - "A and B or C and D" (two "and" lists joined by "or", with or without
 *   parentheses) means either whole list. It becomes one group per way of
 *   picking a course from each list: A or C, A or D, B or C, B or D.
 * - null -> null (details never loaded); "" -> no groups.
 */
export function parsePrereqs(text) {
  if (text == null) return null;
  const groups = [];
  const notes = [];

  for (const sentence of text.split(/\.\s+|\.$/)) {
    if (!sentence.trim()) continue;
    if (codesIn(sentence).length === 0) {
      notes.push(sentence.trim());
      continue;
    }
    for (const piece of sentence.split(";")) {
      // "or" between whole "and" lists; "or better" belongs to a grade.
      const branches = piece.split(/\s+or\s+(?!better)/i);
      const isList = (b) => /\s+and\s+/i.test(b) && codesIn(b).length > 1;
      groups.push(
        ...(branches.filter(isList).length >= 2
          ? eitherList(branches.map(andGroups))
          : andGroups(piece)),
      );
    }
  }
  return { groups, notes };
}

// One ";" piece split on "and": a group per part, each an OR of its codes.
function andGroups(piece) {
  const groups = [];
  for (const part of piece.split(/,?\s+and\s+/i)) {
    const anyOf = codesIn(part);
    if (anyOf.length) {
      groups.push({ anyOf, minGrade: part.match(GRADE)?.[1] ?? null });
    }
  }
  // Backwards, so a grade written once at the end reaches the groups before
  // it.
  for (let i = groups.length - 2; i >= 0; i--) {
    groups[i].minGrade ??= groups[i + 1].minGrade;
  }
  return groups;
}

// Either of several group lists (an OR of ANDs) as one list of groups (an
// AND of ORs): a group for each way of taking one group from every list.
// A grade is kept only when all the picked groups agree on it.
function eitherList(lists) {
  let combos = [[]];
  for (const list of lists.filter((l) => l.length)) {
    combos = combos.flatMap((picked) => list.map((g) => [...picked, g]));
  }
  const groups = [];
  const seen = new Set();
  for (const picked of combos) {
    const anyOf = [...new Set(picked.flatMap((g) => g.anyOf))];
    const key = [...anyOf].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const grades = new Set(picked.map((g) => g.minGrade));
    groups.push({ anyOf, minGrade: grades.size === 1 ? [...grades][0] : null });
  }
  return groups;
}

// ---------- Terms ----------

const SEASONS = ["SP", "SU", "FA"]; // order within a calendar year
const SEASON_NAMES = { SP: "Spring", SU: "Summer", FA: "Fall" };
const SEASON_KEYS = { Spring: "SP", Summer: "SU", Fall: "FA" };

/** True for a term key: "FA26", "SP27", "SU27". */
export function isTermKey(key) {
  return typeof key === "string" && /^(SP|SU|FA)\d{2}$/.test(key);
}

/** "FA26" -> a number that sorts in time order (year × 3 + season). */
export function termIndex(key) {
  const season = SEASONS.indexOf(key.slice(0, 2));
  const year = Number(key.slice(2));
  return year * 3 + season;
}

/** Inverse of termIndex. */
export function termFromIndex(index) {
  const year = Math.floor(index / 3);
  return SEASONS[index % 3] + String(year).padStart(2, "0");
}

/** The next term: "FA26" -> "SP27", "SP27" -> "SU27". */
export function termAfter(key) {
  return termFromIndex(termIndex(key) + 1);
}

/** Maximum semester columns in a plan (8 years × 3 terms). */
export const MAX_TERMS = 24;

/** "FA26" -> "Fall 2026" */
export function termLabel(key) {
  return `${SEASON_NAMES[key.slice(0, 2)]} 20${key.slice(2)}`;
}

/** "Fall 2026" -> "FA26"; null if the name isn't a term. */
export function termKeyFromName(name) {
  const match = name.trim().match(/^(Spring|Summer|Fall)\s+20(\d{2})$/i);
  if (!match) return null;
  const season = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return SEASON_KEYS[season] + match[2];
}

/** The term a date falls in: Jan–May Spring, Jun–Jul Summer, Aug–Dec Fall. */
export function termForDate(date) {
  const month = date.getMonth(); // 0 = January
  const season = month <= 4 ? "SP" : month <= 6 ? "SU" : "FA";
  return season + String(date.getFullYear() % 100).padStart(2, "0");
}

/** The term of the course's registered ("***") attempt, or null. */
export function registeredTerm(course) {
  const attempt = (course.attempts ?? []).findLast((a) => a.grade === "***");
  return attempt?.term ?? null;
}

/** True if the term ended before the current term began. */
export function isPastTerm(key, now = new Date()) {
  return termIndex(key) < termIndex(termForDate(now));
}

/**
 * Converts the site's courseAvailability to ours, in time order:
 * { "Fall 2026": "available" } -> { FA26: "available" }.
 * Names that aren't terms are skipped.
 */
export function availabilityByTerm(siteAvailability = {}) {
  return Object.fromEntries(
    Object.entries(siteAvailability)
      .map(([name, status]) => [termKeyFromName(name), status])
      .filter(([key]) => key !== null)
      .sort(([a], [b]) => termIndex(a) - termIndex(b)),
  );
}
