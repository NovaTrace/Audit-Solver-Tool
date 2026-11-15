// bookmarklet/scrape/courses.js — reads every course on the audit page.
//
//   scrapeCourses(doc)   attempts from Course History, which lists each once
//   linkCourses(...)     re-exported from src/logic/auditBuild.js
//
// Reads rows only; the rules are in src/logic/auditBuild.js, shared with the
// PDF import.
// Used by: collector.js.

import { auditRoot, requirementBlocks, readTakenRow } from "./dom.js";
import { coursesFromRows, linkCourses } from "../../src/logic/auditBuild.js";

export { linkCourses }; // re-exported for collector.js

/** Audit page -> the `courses` object, from Course History. */
export function scrapeCourses(doc) {
  const blocks = requirementBlocks(auditRoot(doc));
  const history = blocks.find((b) => b.getAttribute("rname") === "CRSHIST");
  // No Course History block: use every taken-course row.
  const rows = [
    ...(history ?? auditRoot(doc)).querySelectorAll(".takenCourse"),
  ];
  return coursesFromRows(rows.map(readTakenRow));
}
