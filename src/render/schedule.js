// Draws the stat tiles and the three schedule boxes in index.html:
//   #stat-earned / #stat-assigned / #stat-total   the three stat tiles
//   #pool-status  progress on requirements the student chooses courses for
//   #req-toggles  a tick box per unmet requirement (and per section), to
//                 switch it on or off
//   #plan-check   one line adding up the plan's warnings
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
import {
  courseWarnings,
  termWarning,
  planCheckText,
} from "../logic/planChecks.js";
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
  renderRequirementToggles(audit);
  renderPlanCheck(audit);
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

  // Each badge is a button: clicking it switches the requirement off or
  // back on (the click is handled in main.js)
  const badges = requirementProgress(audit).map((req) => {
    const badge = document.createElement("button");
    badge.type = "button";
    const state = req.ignored ? "off" : req.done ? "done" : "pending";
    badge.className = `ps ${state}`;
    badge.dataset.id = req.id; // read by the click listener in main.js
    badge.setAttribute("aria-pressed", !req.ignored); // pressed = it counts
    badge.title = req.ignored
      ? "Switched off. Click to plan for it again."
      : "Click to switch this requirement off";
    badge.textContent = req.ignored
      ? `${req.title}: switched off`
      : badgeText(req);
    return badge;
  });

  box.replaceChildren(...badges);
}

// The "Requirements you're planning for" panel: every requirement the
// audit says isn't met, under its section, each with a tick box. Unlike
// the badges, this lists single required courses too.
function renderRequirementToggles(audit) {
  const unmet = audit.requirements.filter((r) => r.status === "needs");
  const off = unmet.filter((r) => r.ignored).length;
  document.getElementById("req-toggles-summary").textContent =
    "Requirements you're planning for" + (off ? ` (${off} switched off)` : "");

  const nodes = [];
  let section = null;
  for (const req of unmet) {
    if (req.section !== section) {
      section = req.section;
      nodes.push(sectionToggle(section, unmet));
    }
    const label = document.createElement("label");
    label.className = "req-toggle";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !req.ignored;
    box.dataset.id = req.id; // read by the change listener in main.js
    label.append(box, " " + req.title);
    nodes.push(label);
  }
  if (nodes.length === 0) {
    const none = document.createElement("p");
    none.textContent = "The audit lists no unmet requirements.";
    nodes.push(none);
  }
  document.getElementById("req-toggles-list").replaceChildren(...nodes);
}

// A section's heading in the panel, with a tick box that switches every
// requirement under it at once. Ticked = all on; a dash = some on, some off.
function sectionToggle(section, unmet) {
  const inSection = unmet.filter((r) => r.section === section);
  const off = inSection.filter((r) => r.ignored).length;

  const label = document.createElement("label");
  label.className = "req-toggle-section";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = off === 0;
  box.indeterminate = off > 0 && off < inSection.length; // the dash
  box.dataset.section = section; // read by the change listener in main.js
  label.append(box, " " + section);
  return label;
}

// The one-line summary of the plan's warnings, above the semester cards.
// Empty (and so hidden by CSS) while nothing is planned.
function renderPlanCheck(audit) {
  const line = document.getElementById("plan-check");
  const text = planCheckText(audit);
  line.textContent = text;
  line.classList.toggle("ok", text.endsWith("no problems found"));
}

// "TECHNICAL ELECTIVES: 3/6 hrs planned". A rule ("any MATH course 3100 or
// higher") lists no courses, so its badge also says how to plan for it.
function badgeText(req) {
  if (req.type === "rule") {
    return `${req.title}: ${req.plannedHours}/${req.needHours} hrs planned (add your own courses below)`;
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

    // Too many or too few credits? Say so under the heading
    const load = card.querySelector(".term-warn");
    const loadWarning = termWarning(audit, term.key);
    if (loadWarning) {
      load.textContent = loadWarning;
    } else {
      load.remove();
    }

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
      const item = row.querySelector("li");
      item.classList.toggle("is-locked", course.locked);
      // A course planned before its prerequisites, or in a term it isn't
      // offered, gets a warning mark; hovering says why
      const warnings = courseWarnings(audit, course);
      item.classList.toggle("has-warning", warnings.length > 0);
      if (warnings.length) item.title = warnings.join("\n");
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
