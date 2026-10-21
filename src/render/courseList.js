// Draws the course list (#list): a heading per category, then one row per
// course built from <template id="course-row-tpl"> in index.html.
//
// This file only DISPLAYS. Clicks on pills and lock buttons are handled by a
// single listener in main.js, which owns the state and saving.
// All text is set with textContent, so imported course data can never be
// run as HTML.

import { visibleCourseGroups } from "../logic/courses.js";

export function renderCourseList({
  terms,
  courses,
  catOrder,
  catLabels,
  poolGroups,
  assignments,
  locked,
  filterCat,
  query,
}) {
  const list = document.getElementById("list");
  const rowTemplate = document.getElementById("course-row-tpl");
  const nodes = [];

  visibleCourseGroups({ courses, catOrder, filterCat, query }).forEach(
    ({ cat, items }) => {
      // Category heading
      const head = document.createElement("div");
      head.className = "cat-head";
      head.textContent = catLabels[cat];
      nodes.push(head);

      // One row per course
      const isPool = Object.hasOwn(poolGroups, cat);
      items.forEach((course) => {
        nodes.push(
          buildRow(rowTemplate, course, { terms, assignments, locked, isPool }),
        );
      });
    },
  );

  list.replaceChildren(...nodes);
}

// Fills one copy of the row template for a single course
function buildRow(template, course, { terms, assignments, locked, isPool }) {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector(".row");
  const assignedTerm = assignments[course.id];
  const isLocked = Boolean(locked[course.id]);

  row.classList.toggle("pool", isPool);
  row.classList.toggle("locked", isLocked);

  // Column 1: code and credits
  row.querySelector(".r-code").textContent = course.code;
  row.querySelector(".r-cr").textContent = `${course.cr} cr`;

  // Column 2: details
  row.querySelector(".r-title").textContent = course.title;
  const sub = row.querySelector(".r-sub");
  if (course.sub) {
    sub.textContent = course.sub;
  } else {
    sub.remove(); // no subtitle: drop the empty span
  }
  row.querySelector(".r-term").textContent = course.term;
  row.querySelector(".r-prereq").textContent = course.prereq;

  // Column 3: one pill per term, placed before the lock button
  const pills = row.querySelector(".pills");
  const lockBtn = row.querySelector(".lock-btn");

  terms.forEach((term) => {
    const isOn = assignedTerm === term.key;
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "pill";
    pill.classList.toggle("on", isOn);
    pill.setAttribute("aria-pressed", isOn);
    pill.dataset.id = course.id; // read by the click listener in main.js
    pill.dataset.term = term.key;
    pill.disabled = isLocked; // locked courses can't move
    pill.textContent = term.label;
    pills.insertBefore(pill, lockBtn);
  });

  lockBtn.dataset.id = course.id;
  lockBtn.classList.toggle("on", isLocked);
  lockBtn.setAttribute("aria-pressed", isLocked);
  lockBtn.disabled = !assignedTerm && !isLocked; // nothing to lock yet
  lockBtn.textContent = isLocked ? "Locked🔒" : "lock🔓";

  return fragment;
}
