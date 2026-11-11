// bookmarklet/scrape/courses.js — every course the audit mentions.
//
//   scrapeCourses(doc)    attempts from the Course History block, which
//                         lists each attempt once with full credits
//   linkCourses(...)      ties courses to the requirements that list them,
//                         adds courses that only appear as options, and
//                         works out each course's status
//
// This file only READS the page's course rows. The rules (which attempt
// sets the credits, when a course counts as completed) live in
// src/logic/auditBuild.js, which the PDF import shares.

import { auditRoot, requirementBlocks, readTakenRow } from "./dom.js";
import { coursesFromRows, linkCourses } from "../../src/logic/auditBuild.js";

export { linkCourses }; // so the collector gets both from this one file

/** The audit page -> the `courses` object, from course history. */
export function scrapeCourses(doc) {
  const blocks = requirementBlocks(auditRoot(doc));
  const history = blocks.find((b) => b.getAttribute("rname") === "CRSHIST");
  // Without a Course History block, fall back to every taken-course row
  const rows = [
    ...(history ?? auditRoot(doc)).querySelectorAll(".takenCourse"),
  ];
  return coursesFromRows(rows.map(readTakenRow));
}
