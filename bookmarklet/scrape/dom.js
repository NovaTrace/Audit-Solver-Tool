// bookmarklet/scrape/dom.js — helpers for reading the audit page.
//
// The scrapers read elements, not visible text, so sections collapsed with
// CSS are read too.
// Used by: scrape/courses.js, scrape/requirements.js, scrape/student.js.

/**
 * The audit's main copy. The page holds a phone layout (#responsiveAudit)
 * and a desktop one (#selectedAudit); only one is read.
 */
export function auditRoot(doc) {
  return (
    doc.querySelector("#selectedAudit #auditRequirements") ??
    doc.querySelector("#auditRequirements") ??
    doc.body
  );
}

/** Element text with whitespace collapsed; "" for none. */
export function text(el) {
  return el?.textContent.replace(/\s+/g, " ").trim() ?? "";
}

/** First number in an element's text, or null. */
export function num(el) {
  const m = text(el).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Element text split into lines at <br> tags. */
export function lines(el) {
  if (!el) return [];
  const out = [""];
  for (const node of el.childNodes) {
    if (node.nodeName === "BR") out.push("");
    else out[out.length - 1] += node.textContent;
  }
  return out.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * Sub-requirement status from its title's class (srTitle_substatusOK / IP /
 * NO / NONE). null means information only.
 */
export function subStatus(sub) {
  const cls = sub.querySelector(".subreqTitle")?.className ?? "";
  if (/substatusOK/.test(cls)) return "complete";
  if (/substatusIP/.test(cls)) return "in-progress";
  if (/substatusNO\b/.test(cls)) return "needs";
  return null;
}

/** Each requirement block once, by its rname attribute. */
export function requirementBlocks(root) {
  const seen = new Set();
  return [...root.querySelectorAll(".requirement")].filter((req) => {
    const name = req.getAttribute("rname") ?? req.id;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/** Taken-course row -> { term, code, credits, grade, flags, lines }. */
export function readTakenRow(row) {
  return {
    term: text(row.querySelector(".term")),
    code: text(row.querySelector(".course")),
    credits: num(row.querySelector(".credit")) ?? 0,
    grade: text(row.querySelector(".grade")),
    flags: text(row.querySelector(".ccode")).split(/\s+/).filter(Boolean),
    lines: [...row.querySelectorAll(".descLine")].map(text).filter(Boolean),
  };
}

/** Course codes in a block's SELECT FROM lists. */
export function selectFromCodes(el) {
  return [...el.querySelectorAll(".selectcourses .course[number]")].map(
    (c) =>
      `${c.getAttribute("department").trim()} ${c.getAttribute("number").trim()}`,
  );
}

/**
 * One .subrequirement as plain values, in the shape src/logic/auditBuild.js
 * takes. Totals missing from the page are null.
 */
export function readSubrequirement(sub) {
  const gpaTable = sub.querySelector(".gpaDetail");
  return {
    status: subStatus(sub),
    titleLines: lines(sub.querySelector(".subreqTitle")),
    select: selectFromCodes(sub),
    applied: [...sub.querySelectorAll(".takenCourse")].map(readTakenRow),
    needHours: num(sub.querySelector(".subreqNeeds .hours")),
    needCourses: num(sub.querySelector(".subreqNeeds .count")),
    earnedHours: num(sub.querySelector(".subreqEarned .hours")),
    inProgressHours: num(sub.querySelector(".subreqIpHours .hours")),
    hasGpa: Boolean(gpaTable),
    gpa: num(gpaTable?.querySelector(".gpa")),
    attemptedHours: num(gpaTable?.querySelector(".hours")),
  };
}
