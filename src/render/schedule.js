// src/render/schedule.js — draws the "Your plan" panel below its heading row.
//
//   #plan-headline  "14 requirements needed"
//   #req-bar        requirements done / in progress / planned
//   #req-legend     the same counts in words
//   #credit-min     "71 of 120 credits"
//   #req-cats       a bar per audit section, a tick box per unmet
//                   requirement, and requirements no course can meet
//   #plan-check     plan warnings
//   #sched-grid     one card per semester, then the '+' tile
//   #unassigned     required courses with no term
//
// Progress is counted in requirements, not credits: extra majors, minors and
// courses add credits no requirement needs.
// Display only: values come from logic/credits.js and logic/planChecks.js;
// events are handled in main.js.
// Used by: main.js.
// Text is set with textContent only.

import {
  coursesInTerm,
  sumCredits,
  requirementProgress,
  unplacedRequired,
  creditSummary,
  categoryProgress,
  requirementTotals,
  isInProgress,
  otherRequirements,
} from "../logic/credits.js";
import {
  courseWarnings,
  shownWarnings,
  termWarning,
} from "../logic/planChecks.js";
import { creditText } from "../logic/courses.js";
import { termAfter, termLabel, MAX_TERMS } from "../logic/courseText.js";

/**
 * Redraws the plan panel. `settings.warnOverload` controls the
 * "Over 18 credits" warning.
 */
export function renderSchedule(audit, settings) {
  // Credit-load warning for a semester; "" when switched off.
  const loadWarning = (termKey) =>
    settings.warnOverload ? termWarning(audit, termKey) : "";

  renderProgress(audit);
  renderCredits(audit);
  renderCategories(audit);
  renderPlanCheck(audit, loadWarning);
  renderTermCards(audit, loadWarning);
  renderUnassigned(audit);
}

// ---------- Progress: headline, bar, legend ----------
function renderProgress(audit) {
  const t = requirementTotals(audit);

  const headline = document.getElementById("plan-headline");
  if (t.total === 0) {
    headline.textContent = "No requirements";
  } else if (t.needed === 0) {
    headline.textContent = "All requirements planned";
  } else {
    headline.textContent = `${t.needed} ${plural(t.needed, "requirement")} needed`;
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

// ---------- Credits ----------
function renderCredits(audit) {
  const { earned, inProgress, planned, required } = creditSummary(audit);

  // "71 of 120 credits": earned, in progress and planned against the degree's
  // minimum. Green once the minimum is reached.
  const line = document.getElementById("credit-min");
  const counted = earned + inProgress + planned;
  if (required == null) {
    line.textContent = `${counted} credits`;
    line.className = "credit-min";
    return;
  }
  line.textContent = `${counted} of ${required} credits`;
  line.className = counted >= required ? "credit-min is-met" : "credit-min";
  line.title = "Earned, in progress and planned, of the degree's minimum";
}

// ---------- Requirement categories ----------
// Per audit section: a section tick box (if anything is unmet), its name,
// "3 of 5" and a stacked bar; then a tick box per unmet requirement with
// its progress. Ticked means planned for.
function renderCategories(audit) {
  const others = otherRequirements(audit);
  const otherIds = new Set(others.map((r) => r.id));
  // Sections holding only requirements no course can meet go in "Other
  // requirements".
  const groups = categoryProgress(audit).filter(
    (g) => g.total > 0 || g.off > 0 || g.done > 0,
  );
  const unmet = audit.requirements.filter(
    (r) => r.status === "needs" && !otherIds.has(r.id),
  );
  const choiceNotes = new Map(
    requirementProgress(audit).map((p) => [p.id, progressNote(p)]),
  );

  // Summary: "2 of 9 complete · 1 switched off"
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

    // Per unmet requirement: [box] NAVIGATE    0/1 courses
    if (mine.length) {
      const list = document.createElement("ul");
      list.className = "cat-reqs";
      for (const req of mine) {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !req.ignored;
        box.dataset.id = req.id; // read by main.js
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

// "Other requirements": unfinished requirements no course can meet. Listed,
// but excluded from every count.
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

// Section tick box. Ticked: all on. Indeterminate: some off.
function sectionBox(section, unmet) {
  const off = unmet.filter((r) => r.ignored).length;
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = off === 0;
  box.indeterminate = off > 0 && off < unmet.length;
  box.dataset.section = section; // read by main.js
  box.setAttribute("aria-label", `Plan for all of ${section}`);
  return box;
}

// Bar split into done / in progress / planned, out of the total.
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

// "0/1 courses", "3/6 hrs", or both. A rule lists no courses, so the note
// says to add them.
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
// A dropdown: a count, then one line per warning, e.g. "MATH 1350 (Fall
// 2027): Usually offered Spring, not Fall". Empty while nothing is planned;
// "No problems found" when the plan is clean.
function renderPlanCheck(audit, loadWarning) {
  const box = document.getElementById("plan-check");
  const planned = audit.plan.terms.flatMap((t) => coursesInTerm(audit, t.key));
  if (planned.length === 0) {
    box.replaceChildren();
    box.className = "plan-check";
    return;
  }

  // Warnings on locked and registered courses are hidden (shownWarnings);
  // only their count is shown.
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
  // Credit-load lines get a "Hide" button, which switches the warning off.
  const loadLines = new Set();
  for (const term of audit.plan.terms) {
    const warning = loadWarning(term.key);
    if (!warning) continue;
    const text = `${term.label}: ${warning}`;
    lines.push(text);
    loadLines.add(text);
  }

  if (lines.length === 0) {
    box.className = "plan-check ok";
    box.replaceChildren(
      "No problems found in your plan" + (hiddenNote ? ` (${hiddenNote})` : ""),
    );
    return;
  }

  // The box is rebuilt on every change; keep the dropdown's open state.
  const wasOpen = box.querySelector("details")?.open ?? false;
  box.className = "plan-check has-problems";
  const details = document.createElement("details");
  details.open = wasOpen;

  const summary = document.createElement("summary");
  const count = document.createElement("span");
  count.className = "pc-count";
  count.textContent = lines.length;
  const title = document.createElement("b");
  title.textContent = `${plural(lines.length, "thing")} to check`;
  summary.append(count, title, chevron());

  const list = document.createElement("ul");
  list.append(
    ...lines.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      if (loadLines.has(text)) item.append(" ", hideLoadButton());
      return item;
    }),
  );
  details.append(summary, list);
  if (hiddenNote) {
    const note = document.createElement("small");
    note.className = "pc-hidden";
    note.textContent = hiddenNote;
    details.append(note);
  }
  box.replaceChildren(details);
}

// ---------- Helpers ----------
const plural = (n, word) => (n === 1 ? word : `${word}s`);
const percent = (n, whole) => `${Math.min(100, (n / whole) * 100)}%`;

// "Hide" button for a credit-load warning. Click handled in main.js.
function hideLoadButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-hide";
  button.textContent = "Hide";
  button.title =
    "Stop warning about heavy semesters (turn back on in Settings)";
  button.setAttribute("aria-label", "Hide credit-load warnings");
  return button;
}

// Down arrow for a dropdown heading (.chev in schedule.css).
function chevron() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const attributes = {
    class: "chev",
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2.6,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  };
  for (const [name, value] of Object.entries(attributes)) {
    svg.setAttribute(name, value);
  }
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  return svg;
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

// ---------- Semesters ----------
// One card per semester, three per row (Fall, Spring, Summer), so each row is
// an academic year; seasonClass() sets the column. Only the last semester
// has a '−'; the '+' tile follows it.
function renderTermCards(audit, loadWarning) {
  const grid = document.getElementById("sched-grid");
  const cardTemplate = document.getElementById("term-card-tpl");
  const courseTemplate = document.getElementById("term-course-tpl");
  const terms = audit.plan.terms;

  const cards = terms.map((term, i) => {
    const items = coursesInTerm(audit, term.key);
    const isLast = i === terms.length - 1;

    // Copy of <template id="term-card-tpl">.
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".term-card");
    card.dataset.term = term.key;
    card.classList.add(seasonClass(term.key));
    card.querySelector(".term-name").textContent = term.label;
    card.querySelector(".term-cr").textContent = `${sumCredits(items)} cr`;

    // Credit-load warning under the heading.
    const load = card.querySelector(".term-warn");
    const tooMuch = loadWarning(term.key);
    if (tooMuch) {
      load.textContent = tooMuch;
    } else {
      load.remove();
    }

    // '−' on the last semester only. Disabled for the only semester, or one
    // holding a locked course.
    const remove = card.querySelector(".term-remove");
    if (isLast) {
      card.classList.add("is-last");
      remove.dataset.term = term.key; // read by main.js
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

// "FA27" -> "season-fa", the card's grid column (.season-* in schedule.css).
const seasonClass = (termKey) => `season-${termKey.slice(0, 2).toLowerCase()}`;

// One course in a semester card: [grip or padlock] CODE  △  3
function courseRow(template, audit, course) {
  const fragment = template.content.cloneNode(true);
  const item = fragment.querySelector("li");
  // Being taken this term: fixed in its semester regardless of its lock.
  const takingNow = isInProgress(course);
  const locked = course.locked || takingNow;
  const term = termLabel(course.plannedTerm);

  item.classList.toggle("is-locked", locked);
  item.classList.toggle("is-in-progress", takingNow);
  // Only unlocked courses can be dragged (ui/dragDrop.js).
  item.classList.toggle("is-movable", !locked);
  item.dataset.id = course.id;
  fragment.querySelector(".course-code").textContent = course.code;
  // Number only; the card heading carries "cr".
  fragment.querySelector(".course-cr").textContent = creditText(course).replace(
    " cr",
    "",
  );

  // Lock button. Disabled for a course being taken now.
  const lock = fragment.querySelector(".tc-lock");
  lock.dataset.id = course.id; // read by main.js
  lock.setAttribute("aria-pressed", locked);
  if (takingNow) {
    lock.disabled = true;
    lock.setAttribute("aria-label", `${course.code}: taking it in ${term}`);
    lock.title = "You're taking it now: it stays in this semester";
  } else {
    const verb = locked ? "Unlock" : "Lock";
    lock.setAttribute("aria-label", `${verb} ${course.code} in ${term}`);
    lock.title = locked
      ? "Locked here. Click to unlock"
      : "Click to lock it in this semester";
  }

  // Warning mark, with the reasons in the tooltip.
  const warnings = shownWarnings(audit, course); // none once locked
  item.classList.toggle("has-warning", warnings.length > 0);
  if (warnings.length) {
    item.title = warnings.join("\n");
  } else {
    fragment.querySelector(".course-warn").remove();
  }
  return fragment;
}

// '+' tile in the cell after the last semester: "+ Summer 2028".
function addBlock(key, terms) {
  const label = termLabel(key);
  const isFull = terms.length >= MAX_TERMS;
  const add = document.createElement("button");
  add.type = "button";
  add.className = `term-add ${seasonClass(key)}`;
  add.disabled = isFull;

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
