// =====================================================================
// logic/courseText.js — turning the audit site's text into our values
//
// Shared by everything that reads audit data: parseAudit(), the app's
// helpers, the bookmarklet's scrapers and (later) the PDF reader.
// Keeping them here means "MATH1350" becomes "MATH 1350", and "Fall 2026"
// becomes "FA26", the same way everywhere.
//
// Pure functions: no `document`. Tested in courseText.test.js.
// =====================================================================

// ---------------------------------------------------------------------
// Course codes
// ---------------------------------------------------------------------

// Department (2–4 letters), optional space, 4-digit number, and an optional
// suffix the audit uses for transfer credit ("PSY 2999TC")
const CODE_PATTERN = /^([A-Za-z]{2,4})\s*(\d{4}[A-Za-z]*)$/;

/** "MATH1350" or " math 1350 " -> "MATH 1350". Unknown shapes are only
 *  trimmed and upper-cased. */
export function normalizeCode(code) {
  const text = code.trim();
  const match = text.match(CODE_PATTERN);
  return match ? `${match[1]} ${match[2]}`.toUpperCase() : text.toUpperCase();
}

/** "MATH 1350" or "MATH1350" -> "math1350" (the key in `courses`). */
export function idFromCode(code) {
  return code.replace(/\s+/g, "").toLowerCase();
}

// Words that look like a department but aren't one: "FALL 2026" is a term
const NOT_DEPARTMENTS = new Set(["FALL"]);

/**
 * Every course code in a piece of text, normalized, each listed once.
 * Allows the same letter suffix as CODE_PATTERN ("CS 1150L").
 */
export function codesIn(text = "") {
  const found = [...text.matchAll(/\b([A-Z]{2,4})\s?(\d{4}[A-Z]*)\b/g)]
    .filter((m) => !NOT_DEPARTMENTS.has(m[1]))
    .map((m) => `${m[1]} ${m[2]}`);
  return [...new Set(found)];
}

// ---------------------------------------------------------------------
// Prerequisites and corequisites
// ---------------------------------------------------------------------

const GRADE = /grade of\s*["“”']?([A-F][+-]?)["“”']?/i;

/**
 * "A or B with a grade of C or better; D. Engineering students only" ->
 * { groups: [{ anyOf: ["A","B"], minGrade: "C" }, { anyOf: ["D"], minGrade: null }],
 *   notes: ["Engineering students only"] }
 *
 * Every group is required; any one course inside a group satisfies it.
 * - Sentences (split on ". ") with no course code become `notes`.
 * - Groups are split on ";" and on the word "and" (with or without a
 *   comma), so "A and B" is two groups: both are required.
 * - "A and B with a grade of C": a group with no grade of its own takes
 *   the grade of the next group in the same ";" piece.
 * - null in -> null out (details never loaded); "" -> no groups.
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
      const pieceGroups = [];
      for (const part of piece.split(/,?\s+and\s+/i)) {
        const anyOf = codesIn(part);
        if (anyOf.length) {
          pieceGroups.push({ anyOf, minGrade: part.match(GRADE)?.[1] ?? null });
        }
      }
      // Work backwards, so a grade written once at the end reaches the
      // groups before it
      for (let i = pieceGroups.length - 2; i >= 0; i--) {
        pieceGroups[i].minGrade ??= pieceGroups[i + 1].minGrade;
      }
      groups.push(...pieceGroups);
    }
  }
  return { groups, notes };
}

// ---------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------

const SEASONS = ["SP", "SU", "FA"]; // order within a calendar year
const SEASON_NAMES = { SP: "Spring", SU: "Summer", FA: "Fall" };
const SEASON_KEYS = { Spring: "SP", Summer: "SU", Fall: "FA" };

/** True for a real term key: "FA26", "SP27", "SU27". */
export function isTermKey(key) {
  return typeof key === "string" && /^(SP|SU|FA)\d{2}$/.test(key);
}

/** "FA26" -> a number that sorts in time order (year × 3 + season). */
export function termIndex(key) {
  const season = SEASONS.indexOf(key.slice(0, 2));
  const year = Number(key.slice(2));
  return year * 3 + season;
}

/** The reverse of termIndex. */
export function termFromIndex(index) {
  const year = Math.floor(index / 3);
  return SEASONS[index % 3] + String(year).padStart(2, "0");
}

/** "FA26" -> "Fall 2026" */
export function termLabel(key) {
  return `${SEASON_NAMES[key.slice(0, 2)]} 20${key.slice(2)}`;
}

/** "FA26" -> "Fall ’26" (short enough for a term pill) */
export function shortTermLabel(key) {
  return `${SEASON_NAMES[key.slice(0, 2)]} ’${key.slice(2)}`;
}

/** "Fall 2026" -> "FA26" (the site's spelling); null if it doesn't fit. */
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

/**
 * The site's courseAvailability -> our availability:
 * { "Fall 2026": "available", "Spring 2027": "unknown" } ->
 * { FA26: "available", SP27: "unknown" }, in time order.
 * Names that don't look like a term are skipped.
 */
export function availabilityByTerm(siteAvailability = {}) {
  return Object.fromEntries(
    Object.entries(siteAvailability)
      .map(([name, status]) => [termKeyFromName(name), status])
      .filter(([key]) => key !== null)
      .sort(([a], [b]) => termIndex(a) - termIndex(b)),
  );
}
