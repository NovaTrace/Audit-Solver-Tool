// Draws the stat tiles and the three schedule boxes in index.html:
//   #stat-earned / #stat-assigned / #stat-total   the three stat tiles
//   #pool-status  progress on requirements the student chooses courses for
//   #sched-grid   one card per term in the plan (each with a '−' button),
//                 with '+' blocks before, between (in gaps) and after
//                 them that add a term
//   #unassigned   required courses that still need a term
// They're drawn together because they all change whenever a pick changes.
//
// This file only DISPLAYS results. All math comes from logic/credits.js.
// Text is always set with textContent (never innerHTML), so course data from
// an imported file can never be run as HTML.

import {
  coursesInTerm,
  sumCredits,
  totalPlannedCredits,
  requirementProgress,
  unplacedRequired,
} from "../logic/credits.js";
import { creditText } from "../logic/courses.js";
import {
  termAfter,
  termBefore,
  termLabel,
  isTermKey,
  isPastTerm,
  MAX_TERMS,
} from "../logic/courseText.js";

/** Redraws the stat tiles and all three schedule boxes from the audit. */
export function renderSchedule(audit) {
  renderStats(audit);
  renderPoolStatus(audit);
  renderTermCards(audit);
  renderUnassigned(audit);
}

// The three stat tiles: hours earned, hours assigned, and their total
function renderStats(audit) {
  const earned = audit.student.hoursEarned ?? 0;
  const assigned = totalPlannedCredits(audit);

  document.getElementById("stat-earned").textContent = earned;
  document.getElementById("stat-assigned").textContent = assigned;
  document.getElementById("stat-total").textContent = earned + assigned;
}

function renderPoolStatus(audit) {
  const box = document.getElementById("pool-status");

  const badges = requirementProgress(audit).map((req) => {
    const badge = document.createElement("div");
    badge.className = `ps ${req.done ? "done" : "pending"}`;
    badge.textContent = badgeText(req);
    return badge;
  });

  box.replaceChildren(...badges);
}

// "TECHNICAL ELECTIVES: 3/6 hrs planned", or for a rule with no option
// list, just what's still needed
function badgeText(req) {
  if (req.type === "rule") {
    return `${req.title}: needs ${req.needHours} hrs (see audit)`;
  }
  const parts = [];
  if (req.needHours != null) {
    parts.push(`${req.plannedHours}/${req.needHours} hrs`);
  }
  if (req.needCourses != null) {
    parts.push(`${req.plannedCourses}/${req.needCourses} courses`);
  }
  return `${req.title}: ${parts.join(", ")} planned`;
}

function renderTermCards(audit) {
  const grid = document.getElementById("sched-grid");
  const cardTemplate = document.getElementById("term-card-tpl");
  const courseTemplate = document.getElementById("term-course-tpl");

  const cards = audit.plan.terms.map((term) => {
    const items = coursesInTerm(audit, term.key);

    // Fresh copy of the card markup from <template id="term-card-tpl">
    const card = cardTemplate.content.cloneNode(true);
    card.querySelector(".term-name").textContent = term.label;
    card.querySelector(".term-cr").textContent = `${sumCredits(items)} cr`;

    // The '−' button. It can't be used on the only column left, or on a
    // column holding a locked course; hovering says which.
    const remove = card.querySelector(".term-remove");
    remove.dataset.term = term.key; // read by the click listener in main.js
    remove.setAttribute("aria-label", `Remove ${term.label}`);
    const isOnlyTerm = audit.plan.terms.length <= 1;
    const hasLocked = items.some((course) => course.locked);
    remove.disabled = isOnlyTerm || hasLocked;
    remove.title = hasLocked
      ? "Unlock its courses first"
      : isOnlyTerm
        ? "The plan needs at least one semester"
        : `Remove ${term.label}`;

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
      row.querySelector("li").classList.toggle("is-locked", course.locked);
      row.querySelector(".course-code").textContent = course.code;
      row.querySelector(".course-cr").textContent = creditText(course);
      list.append(row);
    });

    return card;
  });

  // '+' blocks go wherever a semester could be added: before the first
  // card, in any gap between two cards, and after the last card. None is
  // offered for a term that is already over (state.js would refuse it).
  const terms = audit.plan.terms;
  const isFull = terms.length >= MAX_TERMS;
  const nodes = [];

  const earlier = termBefore(terms[0].key);
  if (isTermKey(earlier) && !isPastTerm(earlier)) {
    nodes.push(addBlock(earlier, isFull));
  }

  cards.forEach((card, i) => {
    nodes.push(card);
    // A gap: the term after this card isn't the next card (it was removed)
    const following = termAfter(terms[i].key);
    if (
      terms[i + 1] &&
      terms[i + 1].key !== following &&
      !isPastTerm(following)
    ) {
      nodes.push(addBlock(following, isFull));
    }
  });

  nodes.push(addBlock(termAfter(terms.at(-1).key), isFull));
  grid.replaceChildren(...nodes);
}

// One narrow '+' box. The term it adds is in its tooltip and its label
// for screen readers: "Add Summer 2028"
function addBlock(key, isFull) {
  const label = termLabel(key);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "term-add";
  add.dataset.term = key; // read by the click listener in main.js
  add.textContent = "+";
  add.setAttribute("aria-label", `Add ${label}`);
  add.disabled = isFull;
  add.title = isFull
    ? `A plan can have at most ${MAX_TERMS} semesters`
    : `Add ${label}`;
  return add;
}

function renderUnassigned(audit) {
  const box = document.getElementById("unassigned");
  const missing = unplacedRequired(audit);
  const label = document.createElement("b");

  if (missing.length > 0) {
    label.textContent = "Required, not yet placed in a term:";
    box.replaceChildren(label, " " + missing.map((c) => c.code).join(", "));
  } else {
    label.textContent = "Every required course has a term.";
    box.replaceChildren(label, " Elective progress is shown above.");
  }
}
