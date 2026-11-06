// bookmarklet/scrape/dom.js — small helpers for reading the audit page.
//
// The scrapers read the page's elements (not its visible text), so
// collapsed sections are read too: collapsing only hides them with CSS.

/** The audit's main copy. The page holds two: a phone layout
 *  (#responsiveAudit) and a desktop one (#selectedAudit); read one. */
export function auditRoot(doc) {
  return (
    doc.querySelector("#selectedAudit #auditRequirements") ??
    doc.querySelector("#auditRequirements") ??
    doc.body
  );
}

/** An element's text with whitespace collapsed ("" for none). */
export function text(el) {
  return el?.textContent.replace(/\s+/g, " ").trim() ?? "";
}

/** The first number in an element's text, or null. */
export function num(el) {
  const m = text(el).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** An element's text split into lines at its <br> tags. */
export function lines(el) {
  if (!el) return [];
  const out = [""];
  for (const node of el.childNodes) {
    if (node.nodeName === "BR") out.push("");
    else out[out.length - 1] += node.textContent;
  }
  return out.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** A sub-requirement's status, from its title's class
 *  (srTitle_substatusOK / IP / NO / NONE). null = information only. */
export function subStatus(sub) {
  const cls = sub.querySelector(".subreqTitle")?.className ?? "";
  if (/substatusOK/.test(cls)) return "complete";
  if (/substatusIP/.test(cls)) return "in-progress";
  if (/substatusNO\b/.test(cls)) return "needs";
  return null;
}

/** Each requirement block once (by its rname attribute). */
export function requirementBlocks(root) {
  const seen = new Set();
  return [...root.querySelectorAll(".requirement")].filter((req) => {
    const name = req.getAttribute("rname") ?? req.id;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/** One taken-course row -> { term, code, credits, grade, flags, lines }. */
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

/** The course codes in a block's SELECT FROM lists. */
export function selectFromCodes(el) {
  return [...el.querySelectorAll(".selectcourses .course[number]")].map(
    (c) =>
      `${c.getAttribute("department").trim()} ${c.getAttribute("number").trim()}`,
  );
}
