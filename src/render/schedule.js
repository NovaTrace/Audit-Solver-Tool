// Draws the three schedule boxes in index.html:
//   #pool-status  elective pool progress
//   #sched-grid   one card per term
//   #unassigned   required courses that still need a term
//
// This file only DISPLAYS results. All math comes from logic/credits.js.
// Text is always set with textContent (never innerHTML), so course data from
// an imported file can never be run as HTML.

import {
  coursesInTerm,
  sumCredits,
  poolProgress,
  unplacedRequired,
} from "../logic/credits.js";

/** Redraws all three schedule boxes from the current state. */
export function renderSchedule({
  terms,
  courses,
  assignments,
  locked,
  poolGroups,
}) {
  renderPoolStatus(courses, assignments, poolGroups);
  renderTermCards(terms, courses, assignments, locked);
  renderUnassigned(courses, assignments, poolGroups);
}

function renderPoolStatus(courses, assignments, poolGroups) {
  const box = document.getElementById("pool-status");

  const badges = poolProgress(courses, assignments, poolGroups).map((pool) => {
    const badge = document.createElement("div");
    badge.className = `ps ${pool.done ? "done" : "pending"}`;
    badge.textContent = `${pool.label}: ${pool.chosen} of ${pool.need} selected`;
    return badge;
  });

  box.replaceChildren(...badges);
}

function renderTermCards(terms, courses, assignments, locked) {
  const grid = document.getElementById("sched-grid");
  const cardTemplate = document.getElementById("term-card-tpl");
  const courseTemplate = document.getElementById("term-course-tpl");

  const cards = terms.map((term) => {
    const items = coursesInTerm(courses, assignments, term.key);

    // Fresh copy of the card markup from <template id="term-card-tpl">
    const card = cardTemplate.content.cloneNode(true);
    card.querySelector(".term-name").textContent = term.label;
    card.querySelector(".term-cr").textContent = `${sumCredits(items)} cr`;

    const list = card.querySelector(".term-courses");

    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Nothing assigned";
      list.append(empty);
    }

    items.forEach((course) => {
      // Fresh copy of one course row from <template id="term-course-tpl">
      const row = courseTemplate.content.cloneNode(true);
      row
        .querySelector("li")
        .classList.toggle("is-locked", Boolean(locked[course.id]));
      row.querySelector(".course-code").textContent = course.code;
      row.querySelector(".course-cr").textContent = `${course.cr} cr`;
      list.append(row);
    });

    return card;
  });

  grid.replaceChildren(...cards);
}

function renderUnassigned(courses, assignments, poolGroups) {
  const box = document.getElementById("unassigned");
  const missing = unplacedRequired(courses, assignments, poolGroups);
  const label = document.createElement("b");

  if (missing.length > 0) {
    label.textContent = "Not yet placed in a term:";
    box.replaceChildren(label, " " + missing.map((c) => c.code).join(", "));
  } else {
    label.textContent = "Everything required has a term.";
    box.replaceChildren(
      label,
      " Elective picks above still show 0 until you check them off.",
    );
  }
}
