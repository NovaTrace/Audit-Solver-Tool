// bookmarklet/scrape/requirements.js — the audit's requirements.
//
// The page nests them two levels deep; our format flattens them:
//   .requirement     "Computer Engineering - Core"   -> `section`
//   .subrequirement  "CS 4500 Operating Systems I"  -> one requirement
//
// Each sub-requirement gives: its title (first line of .subreqTitle),
// status (title's class), NEEDS / HOURS ADDED / IN-P totals, the courses
// already applied (.takenCourse rows) and its SELECT FROM options.

import {
  auditRoot,
  text,
  num,
  lines,
  subStatus,
  requirementBlocks,
  readTakenRow,
  selectFromCodes,
} from "./dom.js";
import { normalizeCode, codesIn } from "../../src/logic/courseText.js";

// Blocks that aren't requirements to plan for
const SKIP = new Set(["CRSHIST", "LEGEND", "WORKN/A"]);

// A title line that starts with a course code: "CS 4500 Operating Systems I"
const COURSE_TITLE = /^[A-Z]{2,4} \d{4}\b/;

/** The audit page -> the `requirements` array. */
export function scrapeRequirements(doc) {
  const requirements = [];
  const usedIds = new Set();

  for (const block of requirementBlocks(auditRoot(doc))) {
    const section = text(block.querySelector(".reqTitle"));
    if (!section || SKIP.has(block.getAttribute("rname"))) continue;

    for (const sub of block.querySelectorAll(".subrequirement")) {
      const req = readSubrequirement(sub, section);
      if (!req) continue;
      req.id = uniqueId(`${section}-${req.title}`, usedIds);
      requirements.push(req);
    }
  }
  return requirements;
}

// One .subrequirement -> a requirement, or null if it's information only
function readSubrequirement(sub, section) {
  const status = subStatus(sub);
  const titleLines = lines(sub.querySelector(".subreqTitle"));
  const select = selectFromCodes(sub);
  const applied = [...sub.querySelectorAll(".takenCourse")].map(readTakenRow);

  // Headings like "PROGRAM INFORMATION": nothing to complete
  if (status === null && !select.length && !applied.length) return null;

  // Title: "CS 4500 Operating Systems I", or the first line of the heading.
  // Either/or titles list each choice on its own line between "OR" lines.
  const courseLines = titleLines.filter((l) => COURSE_TITLE.test(l));
  const isCourse = COURSE_TITLE.test(titleLines[0] ?? "");
  const title = isCourse
    ? courseLines.join(" OR ")
    : (titleLines[0] ?? section);
  const description = titleLines
    .filter((l) => !(isCourse && COURSE_TITLE.test(l)) && l !== "OR")
    .filter((l, i) => isCourse || i > 0 || l !== title)
    .join(" ");

  const titleCodes = isCourse ? courseLines.flatMap((l) => codesIn(l)) : [];
  const options = [...new Set([...titleCodes, ...select])].map(normalizeCode);

  // Rules with no course list (MINIMUM HOURS, residency, GPA, ...) only
  // matter to planning while they still need something
  if (!isCourse && !options.length && status !== "needs") return null;
  const needHours = num(sub.querySelector(".subreqNeeds .hours"));
  const needCourses = num(sub.querySelector(".subreqNeeds .count"));

  return {
    id: null, // set by scrapeRequirements
    section,
    title,
    type: isCourse ? "course" : options.length ? "pool" : "rule",
    status: status ?? "complete",
    needCourses,
    needHours,
    earnedHours: num(sub.querySelector(".subreqEarned .hours")) ?? 0,
    inProgressHours: num(sub.querySelector(".subreqIpHours .hours")) ?? 0,
    options,
    applied: mergeApplied(applied),
    description,
  };
}

// The same course can be listed twice (e.g. a repeat); keep one entry per
// course, with its hours added up
function mergeApplied(rows) {
  const byCode = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.code);
    byCode.set(code, (byCode.get(code) ?? 0) + row.credits);
  }
  return [...byCode].map(([code, hours]) => ({ code, hours }));
}

// "Computer Engineering - Core-CS 4500" -> "computer-engineering-core-cs-4500"
function uniqueId(name, used) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}
