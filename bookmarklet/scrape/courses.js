// bookmarklet/scrape/courses.js — every course the audit mentions, read
// from the page's text:
//   - course lines   "FA22 MATH2350 4.0 A Calculus III"  -> attempts
//   - SELECT FROM    "SELECT FROM: ECE 3120,4020,4162"   -> courses to take
// Which requirement each course belongs to comes from requirements.js.

import { normalizeCode, idFromCode } from "../../src/logic/courseText.js";

// term, code, credits, grade, optional flags (">S", ">E"), title
const COURSE_LINE =
  /^\s*(FA|SP|SU)(\d{2})\s+([A-Z]{2,4}\s?\d{4}[A-Z]*)\s+(\d+\.\d)\s+(\*\*\*|[A-Z]{1,2}[+-]?)\s*((?:>[A-Z]\s*)*)\s*(.*?)\s*$/;

/** Page text -> the `courses` object (see the Audit JSON Data Guide). */
export function scrapeCourses(text) {
  const courses = {};
  const course = (code) => {
    const c = normalizeCode(code);
    return (courses[idFromCode(c)] ??= {
      id: idFromCode(c),
      code: c,
      title: null,
      credits: null,
      attempts: [],
      transferNote: null,
      requirementIds: [],
      selectedFrom: [], // sizes of the SELECT FROM lists it appeared in
    });
  };

  // Course lines repeat in every requirement they count toward, sometimes
  // with split hours. The "Course History" section lists each attempt once,
  // with full credits, so read from there when the page has it.
  const historyStart = text.search(/^\s*Course History\s*$/m);
  const historyText = historyStart >= 0 ? text.slice(historyStart) : text;

  const lines = historyText.split("\n");
  const seen = new Set();
  lines.forEach((line, i) => {
    const m = line.match(COURSE_LINE);
    if (!m) return;
    const [, season, year, code, credits, grade, flags, title] = m;
    const term = season + year;
    const key = `${term} ${normalizeCode(code)} ${grade}`;
    if (seen.has(key)) return;
    seen.add(key);

    const c = course(code);
    c.attempts.push({
      term,
      grade,
      credits: Number(credits),
      flags: flags.trim() ? flags.trim().split(/\s+/) : [],
      transfer: /^T/.test(grade),
    });
    if (title && !c.title) c.title = title;
    // A transfer course's equivalent sits on the next line
    const next = lines[i + 1]?.trim() ?? "";
    if (next.startsWith("CO-") && !c.transferNote) c.transferNote = next;
  });

  // SELECT FROM lists: "ECE 3120,4020,4162" -> ECE 3120, ECE 4020, ECE 4162
  for (const m of text.matchAll(/SELECT FROM:\s*([A-Z0-9 ,]+)/g)) {
    const codes = expandList(m[1]);
    codes.forEach((code) => course(code).selectedFrom.push(codes.length));
  }

  for (const c of Object.values(courses)) {
    c.status = statusOf(c);
    delete c.selectedFrom;
  }
  return courses;
}

// A course is completed if any attempt passed, registered if it has a
// "***" attempt, needed if the audit lists it alone (SELECT FROM one
// course), and otherwise one option among several.
function statusOf(c) {
  if (c.attempts.some(passed)) return "completed";
  if (c.attempts.some((a) => a.grade === "***")) return "registered";
  if (c.selectedFrom.includes(1)) return "needed";
  return c.selectedFrom.length ? "option" : "needed";
}

function passed(attempt) {
  if (attempt.flags.includes(">E")) return false; // grade forgiveness
  return /^T?([A-D][+-]?|S|P)$/.test(attempt.grade);
}

// "ECE 3120,4020, CS 4500" -> ["ECE 3120", "ECE 4020", "CS 4500"]
function expandList(list) {
  let dept = "";
  const codes = [];
  for (const token of list.split(",")) {
    const m = token.trim().match(/^(?:([A-Z]{2,4})\s*)?(\d{4})$/);
    if (!m) continue;
    if (m[1]) dept = m[1];
    if (dept) codes.push(`${dept} ${m[2]}`);
  }
  return codes;
}
