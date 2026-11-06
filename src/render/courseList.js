// Draws the filter chips (#chips) and the course list (#list): a heading
// per audit section, then one row per course built from
// <template id="course-row-tpl"> in index.html.
//
// This file only DISPLAYS. Clicks on chips, pills and lock buttons are
// handled by listeners in main.js, which owns the state and saving.
// All text is set with textContent, so imported course data can never be
// run as HTML.

import {
  visibleSections,
  creditText,
  countsTowardText,
  offeredText,
  prereqText,
  notOfferedIn,
} from "../logic/courses.js";

const SHORT_SEASON = { SP: "Spring", SU: "Summer", FA: "Fall" };

/** One chip for "All", then one per section. `active` is the chosen one. */
export function renderFilterChips(sections, active) {
  const box = document.getElementById("chips");
  const chips = ["all", ...sections].map((section) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.classList.toggle("active", section === active);
    chip.setAttribute("aria-pressed", section === active);
    chip.dataset.section = section; // read by the click listener in main.js
    chip.textContent = section === "all" ? "All" : section;
    return chip;
  });
  box.replaceChildren(...chips);
}

/** Redraws the course list for the chosen section and search text. */
export function renderCourseList({ audit, filterSection, query }) {
  const list = document.getElementById("list");
  const rowTemplate = document.getElementById("course-row-tpl");
  const groups = visibleSections({ audit, filterSection, query });

  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = query
      ? "No courses match your search."
      : "Nothing left to plan in this section.";
    list.replaceChildren(empty);
    return;
  }

  const nodes = [];
  groups.forEach(({ section, courses }) => {
    const head = document.createElement("div");
    head.className = "cat-head";
    head.textContent = section;
    nodes.push(head);

    courses.forEach((course) =>
      nodes.push(buildRow(rowTemplate, audit, course)),
    );
  });

  list.replaceChildren(...nodes);
}

// Fills one copy of the row template for a single course
function buildRow(template, audit, course) {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector(".row");

  row.classList.toggle("pool", course.status === "option");
  row.classList.toggle("locked", course.locked);

  // Column 1: code and credits
  row.querySelector(".r-code").textContent = course.code;
  row.querySelector(".r-cr").textContent = creditText(course);

  // Column 2: details
  row.querySelector(".r-title").textContent =
    course.title ?? "Details not loaded";
  const sub = row.querySelector(".r-sub");
  const counts = countsTowardText(audit, course);
  if (counts) {
    sub.textContent = counts;
  } else {
    sub.remove(); // nothing to say: drop the empty span
  }
  row.querySelector(".r-term").textContent = offeredText(course);
  row.querySelector(".r-prereq").textContent = prereqText(course);

  // Column 3: one pill per term, placed before the lock button
  const pills = row.querySelector(".pills");
  const lockBtn = row.querySelector(".lock-btn");

  audit.plan.terms.forEach((term) => {
    const isOn = course.plannedTerm === term.key;
    const offTerm = notOfferedIn(course, term.key);
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "pill";
    pill.classList.toggle("on", isOn);
    pill.classList.toggle("not-offered", offTerm);
    pill.setAttribute("aria-pressed", isOn);
    if (offTerm) pill.title = "Not scheduled this term";
    pill.dataset.id = course.id; // read by the click listener in main.js
    pill.dataset.term = term.key;
    pill.disabled = course.locked; // locked courses can't move
    pill.textContent = shortTermLabel(term.key);
    pills.insertBefore(pill, lockBtn);
  });

  lockBtn.dataset.id = course.id;
  lockBtn.classList.toggle("on", course.locked);
  lockBtn.setAttribute("aria-pressed", course.locked);
  lockBtn.disabled = !course.plannedTerm && !course.locked; // nothing to lock
  lockBtn.textContent = course.locked ? "Locked🔒" : "lock🔓";

  return fragment;
}

// "FA26" -> "Fall ’26" (short enough for a pill)
function shortTermLabel(key) {
  return `${SHORT_SEASON[key.slice(0, 2)]} ’${key.slice(2)}`;
}
