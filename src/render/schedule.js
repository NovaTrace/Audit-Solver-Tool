// Draws the "Your plan" panel in index.html, apart from its heading row:
//   #plan-headline  "14 requirements still need a semester"
//   #req-bar        every requirement: done / in progress / planned
//   #req-legend     the same counts in words
//   #stat-*         credits earned, in progress and planned (for reference)
//   #credit-min     "Credits: 162 of 128 minimum"
//   #req-cats       "Requirement categories": a bar per audit section, a
//                   tick box per unmet requirement to switch it off, and
//                   the requirements no course can meet
//   #plan-check     the plan's warnings, course by course
//   #sched-grid     one card per semester, then a narrow '+' column after
//                   the last one; only the last semester has a '−'
//   #unassigned     required courses that still need a term
// They're drawn together because they all change whenever a pick changes.
//
// Progress is counted in requirements, not credits: with two majors, a
// minor or extra courses, credits pile up that no requirement needs, so
// a credit total says "done" long before the degree is.
//
// This file only DISPLAYS results. All math comes from logic/credits.js.
// Text is always set with textContent (never innerHTML), so course data from
// an imported file can never be run as HTML.

import {
  coursesInTerm,
  sumCredits,
  requirementProgress,
  unplacedRequired,
  creditSummary,
  categoryProgress,
  requirementTotals,
  otherRequirements,
} from "../logic/credits.js";
import {
  courseWarnings,
  shownWarnings,
  termWarning,
} from "../logic/planChecks.js";
import { creditText } from "../logic/courses.js";
import {
  termAfter,
  termLabel,
  isPastTerm,
  MAX_TERMS,
} from "../logic/courseText.js";

/** Redraws the whole plan panel (below its heading row) from the audit. */
export function renderSchedule(audit) {
  renderProgress(audit);
  renderCredits(audit);
  renderCategories(audit);
  renderPlanCheck(audit);
  renderTermCards(audit);
  renderUnassigned(audit);
}

// ---------- Progress: headline, bar and legend (in requirements) ----------
function renderProgress(audit) {
  const t = requirementTotals(audit);

  const headline = document.getElementById("plan-headline");
  if (t.total === 0) {
    headline.textContent = "No requirements to plan for";
  } else if (t.needed === 0) {
    headline.textContent = "Every requirement has a semester";
  } else {
    headline.textContent = `${t.needed} ${plural(t.needed, "requirement")} still need${t.needed === 1 ? "s" : ""} a semester`;
  }
  headline.classList.toggle("is-complete", t.total > 0 && t.needed === 0);

  const whole = Math.max(t.total, 1);
  const bar = document.getElementById("req-bar");
  const [done, prog, plan] = bar.children;
  done.style.width = percent(t.done, whole);
  prog.style.width = percent(t.inProgress, whole);
  plan.style.width = percent(t.planned, whole);
  const words =
    `${t.done} done, ${t.inProgress} in progress, ` +
    `${t.planned} planned, ${t.needed} to go`;
  bar.setAttribute("aria-label", `Requirements: ${words}, of ${t.total}`);

  // "● 4 done  ● 2 in progress  ● 3 planned  ○ 14 to go"
  const legend = document.getElementById("req-legend");
  legend.replaceChildren(
    ...[
      ["done", t.done, "done"],
      ["prog", t.inProgress, "in progress"],
      ["plan", t.planned, "planned"],
      ["rest", t.needed, "to go"],
    ].map(([kind, n, label]) => {
      const item = document.createElement("span");
      const dot = document.createElement("i");
      dot.className = `dot dot-${kind}`;
      dot.setAttribute("aria-hidden", "true");
      item.append(dot, `${n} ${label}`);
      return item;
    }),
  );
}

// ---------- Credits: tiles and the minimum-hours line ----------
function renderCredits(audit) {
  const { earned, inProgress, planned, required } = creditSummary(audit);
  setText("stat-earned", earned);
  setText("stat-progress", inProgress);
  setText("stat-planned", planned);

  // Degrees still have a minimum number of hours, so that's checked too:
  // "Credits: 162 of 128 minimum ✓" or "... 28 more needed"
  const line = document.getElementById("credit-min");
  const counted = earned + inProgress + planned;
  if (required == null) {
    line.textContent = `Credits: ${counted} earned, in progress or planned`;
    line.className = "credit-min";
    return;
  }
  const short = required - counted;
  line.textContent =
    `Credits: ${counted} of ${required} minimum` +
    (short > 0 ? ` (${short} more needed)` : " ✓");
  line.className = short > 0 ? "credit-min is-short" : "credit-min is-met";
}

// ---------- Requirement categories ----------
// A block per audit section: a tick box for the whole section (when it
// has anything unmet), its name, "3 of 5" and a stacked bar; then a tick
// box per unmet requirement with its progress. Ticked = planning for it.
function renderCategories(audit) {
  const others = otherRequirements(audit);
  const otherIds = new Set(others.map((r) => r.id));
  // Sections holding only requirements no course can meet are left to the
  // "Other requirements" block at the end
  const groups = categoryProgress(audit).filter(
    (g) => g.total > 0 || g.off > 0 || g.done > 0,
  );
  const unmet = audit.requirements.filter(
    (r) => r.status === "needs" && !otherIds.has(r.id),
  );
  const choiceNotes = new Map(
    requirementProgress(audit).map((p) => [p.id, progressNote(p)]),
  );

  // Summary line: "2 of 9 complete · 1 switched off"
  const complete = groups.filter((g) => g.total > 0 && g.done === g.total);
  const off = unmet.filter((r) => r.ignored).length;
  setText(
    "req-cats-count",
    `${complete.length} of ${groups.length} complete` +
      (off ? ` · ${off} switched off` : ""),
  );

  const blocks = groups.map((g) => {
    const block = document.createElement("div");
    block.className = "cat";
    const mine = unmet.filter((r) => r.section === g.section);

    // Heading row: [box] Section name ........ 3 of 5
    const head = document.createElement("div");
    head.className = "cat-row";
    const name = document.createElement(mine.length ? "label" : "span");
    name.className = "cat-name";
    if (mine.length) name.append(sectionBox(g.section, mine));
    name.append(g.section);
    const frac = document.createElement("span");
    frac.className = "cat-frac";
    const counted = g.done + g.inProgress + g.planned;
    frac.textContent = g.total ? `${counted} of ${g.total}` : "switched off";
    head.append(name, frac);

    block.append(head, stackedBar(g));

    // One line per unmet requirement: [box] NAVIGATE    0/1 courses
    if (mine.length) {
      const list = document.createElement("ul");
      list.className = "cat-reqs";
      for (const req of mine) {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !req.ignored;
        box.dataset.id = req.id; // read by the change listener in main.js
        label.append(box, " " + req.title);
        item.append(label);
        const note = req.ignored ? "switched off" : choiceNotes.get(req.id);
        if (note) {
          const span = document.createElement("span");
          span.className = "cat-note";
          span.textContent = note;
          item.append(span);
        }
        list.append(item);
      }
      block.append(list);
    }
    return block;
  });

  if (others.length) blocks.push(otherBlock(others));

  if (blocks.length === 0) {
    const none = document.createElement("p");
    none.textContent = "The audit lists no requirements.";
    blocks.push(none);
  }
  document.getElementById("req-categories").replaceChildren(...blocks);
}

// "Other requirements": unfinished ones no course can meet, such as
// applying for graduation. Listed so they aren't forgotten, but left out
// of every count, since planning courses can't change them.
function otherBlock(others) {
  const block = document.createElement("div");
  block.className = "cat cat-other";
  const head = document.createElement("div");
  head.className = "cat-row";
  const name = document.createElement("span");
  name.className = "cat-name";
  name.textContent = "Other requirements";
  const frac = document.createElement("span");
  frac.className = "cat-frac";
  frac.textContent = `${others.length} open`;
  head.append(name, frac);

  const note = document.createElement("p");
  note.className = "cat-other-note";
  note.textContent =
    "No course can meet these, so they aren't counted above. Check them with your advisor.";

  const list = document.createElement("ul");
  list.className = "cat-reqs";
  for (const req of others) {
    const item = document.createElement("li");
    item.textContent = `${req.title} (${req.section})`;
    list.append(item);
  }
  block.append(head, note, list);
  return block;
}

// A section's tick box: switches everything under it at once.
// Ticked = all on; a dash = some on, some off.
function sectionBox(section, unmet) {
  const off = unmet.filter((r) => r.ignored).length;
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = off === 0;
  box.indeterminate = off > 0 && off < unmet.length; // the dash
  box.dataset.section = section; // read by the change listener in main.js
  box.setAttribute("aria-label", `Plan for all of ${section}`);
  return box;
}

// A thin bar split into done / in progress / planned, out of the total
function stackedBar(g) {
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    `${g.section}: ${g.done} done, ${g.inProgress} in progress, ` +
      `${g.planned} planned, ${g.needed} still needed`,
  );
  const whole = Math.max(g.total, 1);
  for (const [cls, n] of [
    ["seg-done", g.done],
    ["seg-prog", g.inProgress],
    ["seg-plan", g.planned],
  ]) {
    const seg = document.createElement("span");
    seg.className = cls;
    seg.style.width = percent(n, whole);
    bar.append(seg);
  }
  return bar;
}

// "0/1 courses", "3/6 hrs", or "3/6 hrs, 0/1 courses". A rule ("any MATH
// course 3100 or higher") lists no courses, so it says how to plan for it.
function progressNote(req) {
  const parts = [];
  if (req.needHours != null) {
    parts.push(`${req.plannedHours}/${req.needHours} hrs`);
  }
  if (req.needCourses != null) {
    parts.push(`${req.plannedCourses}/${req.needCourses} courses`);
  }
  const text = parts.join(", ") + " planned";
  return req.type === "rule" ? `${text}: add your own courses` : text;
}

// ---------- Warnings ----------
// Every warning about the plan, one line each: "MATH 1350 (Fall 2027):
// Usually offered Spring, not Fall". A count goes first, so the size of
// the problem shows even when the list is long. Empty while nothing is
// planned; one quiet "no problems" line once something is.
function renderPlanCheck(audit) {
  const box = document.getElementById("plan-check");
  const planned = audit.plan.terms.flatMap((t) => coursesInTerm(audit, t.key));
  if (planned.length === 0) {
    box.replaceChildren();
    box.className = "plan-check";
    return;
  }

  // Locked and registered courses keep their warnings to themselves
  // (shownWarnings); the box just says how many it isn't showing
  const lines = [];
  let hidden = 0;
  for (const course of planned) {
    const all = courseWarnings(audit, course);
    const shown = shownWarnings(audit, course);
    hidden += all.length - shown.length;
    for (const warning of shown) {
      lines.push(
        `${course.code} (${termLabel(course.plannedTerm)}): ${warning}`,
      );
    }
  }
  const hiddenNote =
    hidden === 0
      ? ""
      : `${hidden} more on locked or registered courses ${hidden === 1 ? "isn't" : "aren't"} shown.`;
  for (const term of audit.plan.terms) {
    const warning = termWarning(audit, term.key);
    if (warning) lines.push(`${term.label}: ${warning}`);
  }

  if (lines.length === 0) {
    box.className = "plan-check ok";
    box.replaceChildren(
      "No problems found in your plan" + (hiddenNote ? ` (${hiddenNote})` : ""),
    );
    return;
  }

  box.className = "plan-check has-problems";
  const count = document.createElement("span");
  count.className = "pc-count";
  count.textContent = lines.length;
  const body = document.createElement("div");
  const title = document.createElement("b");
  title.textContent = `${lines.length} thing${lines.length === 1 ? "" : "s"} to check`;
  const list = document.createElement("ul");
  list.append(
    ...lines.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }),
  );
  body.append(title, list);
  if (hiddenNote) {
    const note = document.createElement("small");
    note.className = "pc-hidden";
    note.textContent = hiddenNote;
    body.append(note);
  }
  box.replaceChildren(count, body);
}

// ---------- Small helpers ----------
const plural = (n, word) => (n === 1 ? word : `${word}s`);
const percent = (n, whole) => `${Math.min(100, (n / whole) * 100)}%`;

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

// ---------- Semesters ----------
// One card per semester, in a 2-column grid. Only the LAST semester can be
// removed (its '−' sits in its heading), and a new one is only ever added
// after it: one narrow '+' column at the end. (state.js still accepts any term, so older saved plans with a
// gap in the middle keep working.)
function renderTermCards(audit) {
  const grid = document.getElementById("sched-grid");
  const cardTemplate = document.getElementById("term-card-tpl");
  const courseTemplate = document.getElementById("term-course-tpl");
  const terms = audit.plan.terms;

  const cards = terms.map((term, i) => {
    const items = coursesInTerm(audit, term.key);
    const isLast = i === terms.length - 1;

    // Fresh copy of the card markup from <template id="term-card-tpl">
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".term-card");
    card.dataset.term = term.key;
    card.querySelector(".term-name").textContent = term.label;
    card.querySelector(".term-cr").textContent = `${sumCredits(items)} cr`;

    // Too many credits? Say so under the heading
    const load = card.querySelector(".term-warn");
    const loadWarning = termWarning(audit, term.key);
    if (loadWarning) {
      load.textContent = loadWarning;
    } else {
      load.remove();
    }

    // The '−' button, on the last semester only. It can't be used on the
    // only semester left, or on one holding a locked course.
    const remove = card.querySelector(".term-remove");
    if (isLast) {
      card.classList.add("is-last");
      remove.dataset.term = term.key; // read by the click listener in main.js
      remove.setAttribute("aria-label", `Remove ${term.label}`);
      const isOnlyTerm = terms.length <= 1;
      const hasLocked = items.some((course) => course.locked);
      remove.disabled = isOnlyTerm || hasLocked;
      remove.title = hasLocked
        ? "Unlock its courses first"
        : isOnlyTerm
          ? "The plan needs at least one semester"
          : `Remove ${term.label}`;
    } else {
      remove.remove();
    }

    const list = card.querySelector(".term-courses");
    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No courses yet";
      list.append(empty);
    }
    items.forEach((course) =>
      list.append(courseRow(courseTemplate, audit, course)),
    );

    return fragment;
  });

  grid.replaceChildren(...cards, addBlock(termAfter(terms.at(-1).key), terms));
}

// One course inside a semester card: [grip or padlock] CODE  △  3
function courseRow(template, audit, course) {
  const fragment = template.content.cloneNode(true);
  const item = fragment.querySelector("li");
  const isRegistered = course.status === "registered";
  const locked = course.locked || isRegistered;
  const term = termLabel(course.plannedTerm);

  item.classList.toggle("is-locked", locked);
  item.classList.toggle("is-registered", isRegistered);
  // Only unlocked courses can be dragged to another semester (ui/dragDrop.js)
  item.classList.toggle("is-movable", !locked);
  item.dataset.id = course.id;
  fragment.querySelector(".course-code").textContent = course.code;
  fragment.querySelector(".course-cr").textContent = creditText(course);

  // The left button locks and unlocks. A registered course is already
  // fixed in its term, so its padlock can't be opened.
  const lock = fragment.querySelector(".tc-lock");
  lock.dataset.id = course.id; // read by the click listener in main.js
  lock.setAttribute("aria-pressed", locked);
  if (isRegistered) {
    lock.disabled = true;
    lock.setAttribute("aria-label", `${course.code}: registered in ${term}`);
    lock.title = "Registered: it stays in this semester";
  } else {
    const verb = locked ? "Unlock" : "Lock";
    lock.setAttribute("aria-label", `${verb} ${course.code} in ${term}`);
    lock.title = locked
      ? "Locked here. Click to unlock"
      : "Click to lock it in this semester";
  }

  // Planned before its prerequisites, or in a term it isn't offered: a
  // warning mark, with the reason on hover
  const warnings = shownWarnings(audit, course); // none once locked
  item.classList.toggle("has-warning", warnings.length > 0);
  if (warnings.length) {
    item.title = warnings.join("\n");
  } else {
    fragment.querySelector(".course-warn").remove();
  }
  return fragment;
}

// The narrow '+' column after the last semester: "+ Summer 2028"
function addBlock(key, terms) {
  const label = termLabel(key);
  const isFull = terms.length >= MAX_TERMS;
  const add = document.createElement("button");
  add.type = "button";
  add.className = "term-add";
  add.dataset.term = key; // read by the click listener in main.js
  add.disabled = isFull || isPastTerm(key);

  const plus = document.createElement("span");
  plus.className = "term-add-plus";
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+";
  const name = document.createElement("span");
  name.textContent = label;
  add.setAttribute("aria-label", `Add ${label}`);
  add.title = isFull ? `A plan can have at most ${MAX_TERMS} semesters` : "";
  add.append(plus, name);
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
