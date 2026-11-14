// src/render/courseList.js — draws the course list and its dropdowns.
//
//   #category, #show   filter dropdowns
//   #list              one card per audit section: a fold of completed
//                      courses, then a row per course left to plan
//                      (<template id="course-row-tpl"> in index.html)
//   #add-req           the add-a-course form's requirement choices
//
// Display only: events are handled in main.js.
// Used by: main.js.
// Text is set with textContent only.

import {
  creditText,
  offeredText,
  prereqText,
  prereqCodesText,
  notOfferedIn,
  finalGradeText,
  SHOW_OPTIONS,
  UNLINKED,
} from "../logic/courses.js";
import { termLabel } from "../logic/courseText.js";
import { unlocks } from "../logic/prereqs.js";
import { shownWarnings } from "../logic/planChecks.js";
import { categoryProgress, isInProgress } from "../logic/credits.js";

/** Category dropdown: "All categories", then one option per section. */
export function renderCategoryOptions(sections, active) {
  const select = document.getElementById("category");
  const options = ["all", ...sections].map((section) => {
    const option = document.createElement("option");
    option.value = section;
    option.textContent = section === "all" ? "All categories" : section;
    return option;
  });
  select.replaceChildren(...options);
  select.value = active;
}

/** "Show" dropdown, filled once from SHOW_OPTIONS. */
export function renderShowOptions(active) {
  const select = document.getElementById("show");
  if (select.options.length === 0) {
    select.append(
      ...SHOW_OPTIONS.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
  }
  select.value = active;
}

/**
 * Fills the add-a-course form's "Counts toward" list: "nothing", then every
 * unfinished requirement, rules first. The current choice is kept across
 * redraws.
 */
export function renderRequirementChoices(audit) {
  const select = document.getElementById("add-req");
  const chosen = select.value;

  const open = audit.requirements.filter((r) => r.status !== "complete");
  const rules = open.filter((r) => r.type === "rule");
  const others = open.filter((r) => r.type !== "rule");

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Nothing: just plan it";
  const choices = [...rules, ...others].map((req) => {
    const option = document.createElement("option");
    option.value = req.id;
    option.textContent = `${req.title} (${req.section})`;
    return option;
  });
  select.replaceChildren(none, ...choices);

  // Keep the current choice if still present; first draw selects the first
  // rule.
  const values = [...select.options].map((o) => o.value);
  if (select.dataset.drawn && values.includes(chosen)) {
    select.value = chosen;
  } else {
    select.value = rules[0]?.id ?? "";
  }
  select.dataset.drawn = "true";
}

/**
 * Redraws the course list.
 * `groups`: [{ section, courses, completed }], already filtered
 * (logic/courses.js).
 * `query` and `show` only select the empty-list message.
 */
export function renderCourseList({ audit, groups, query, show, settings }) {
  const list = document.getElementById("list");
  const rowTemplate = document.getElementById("course-row-tpl");

  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = query
      ? "No courses match your search."
      : show === "attention"
        ? "Nothing needs attention: no warnings in your plan."
        : show === "unplaced"
          ? "Every course here has a semester."
          : "Nothing left to plan in this category.";
    list.replaceChildren(empty);
    return;
  }

  // "2 of 5 requirements done" beside each section heading.
  const progress = new Map(categoryProgress(audit).map((g) => [g.section, g]));

  const cards = groups.map(({ section, courses, completed = [] }) => {
    const group = document.createElement("section");
    group.className = "grp";

    const head = document.createElement("div");
    head.className = "grp-h";
    const title = document.createElement("h3");
    title.textContent = section;
    head.append(title);
    const p = progress.get(section);
    if (p && p.total > 0 && section !== UNLINKED) {
      const frac = document.createElement("span");
      frac.textContent = `${p.done} of ${p.total} requirements done`;
      head.append(frac);
    }

    const card = document.createElement("div");
    card.className = "card";
    if (completed.length) card.append(completedFold(completed));
    courses.forEach((course) =>
      card.append(buildRow(rowTemplate, audit, course, settings)),
    );

    group.append(head, card);
    return group;
  });

  list.replaceChildren(...cards);
}

// Fold of a section's completed courses: "✓ 3 completed courses", opening
// to code, title, grade and term, credits.
function completedFold(completed) {
  const fold = document.createElement("details");
  fold.className = "fold";
  const summary = document.createElement("summary");
  const check = document.createElement("span");
  check.className = "fold-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "✓";
  const words = document.createElement("b");
  const n = completed.length;
  words.textContent = `${n} completed course${n === 1 ? "" : "s"}`;
  const toggle = document.createElement("span");
  toggle.className = "fold-toggle";
  toggle.setAttribute("aria-hidden", "true");
  summary.append(check, words, toggle);

  const list = document.createElement("ul");
  list.className = "done-list";
  for (const course of completed) {
    const item = document.createElement("li");
    const code = document.createElement("span");
    code.className = "r-code";
    code.textContent = course.code;
    const title = document.createElement("span");
    title.className = "done-title";
    title.textContent = course.title ?? "";
    const grade = document.createElement("span");
    grade.className = "done-grade";
    grade.textContent = finalGradeText(course);
    const credits = document.createElement("span");
    credits.className = "done-cr";
    credits.textContent = creditText(course);
    item.append(code, title, grade, credits);
    list.append(item);
  }
  fold.append(summary, list);
  return fold;
}

// Row status as [icon, word].
function statusOf(course, warnings) {
  // Current term only; a course registered for a later term shows as planned.
  if (isInProgress(course)) return ["prog", "In progress"];
  if (warnings.length) return ["check", "Check"];
  if (course.plannedTerm) return ["plan", "Planned"];
  if (course.status === "option") return ["need", "Option"];
  return ["need", "Needed"];
}

// Fills one copy of the row template. `settings` selects the detail lines
// shown.
function buildRow(template, audit, course, settings) {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector(".row");
  // none for locked or registered courses
  const warnings = shownWarnings(audit, course);

  const [kind, word] = statusOf(course, warnings);
  row.classList.add(`is-${kind}`);
  row.classList.toggle("locked", course.locked);
  row.classList.toggle("custom", course.custom);
  row.querySelector(".r-status").classList.add(`st-${kind}`);
  row.querySelector(`.ic-${kind}`)?.classList.add("on");
  row.querySelector(".r-status-word").textContent = word;

  // Code and title, then details.
  row.querySelector(".r-code").textContent = course.code;
  // Hand-added courses have no details to load.
  row.querySelector(".r-title").textContent =
    course.title ?? (course.custom ? "Added by you" : "Details not loaded");
  // "Fall, Spring · Prereqs: ...", each part per settings.
  const meta = [];
  if (settings.showOffered) meta.push(offeredText(course));
  if (settings.prereqs === "full") meta.push(prereqText(course));
  if (settings.prereqs === "codes") meta.push(prereqCodesText(course));
  const metaLine = row.querySelector(".r-meta");
  if (meta.length) {
    metaLine.textContent = meta.join(" · ");
  } else {
    metaLine.remove();
  }
  // Courses that require this one.
  const neededFor = settings.showNeededFor ? unlocks(audit, course) : [];
  const unlocksLine = row.querySelector(".r-unlocks");
  if (neededFor.length) {
    unlocksLine.textContent = `Needed for: ${neededFor.join(", ")}`;
  } else {
    unlocksLine.remove();
  }
  // "Locked in Spring 2027"
  const lockedLine = row.querySelector(".r-locked");
  if (course.locked && course.plannedTerm) {
    lockedLine.append(`Locked in ${termLabel(course.plannedTerm)}`);
  } else {
    lockedLine.remove();
  }
  // One line per warning.
  const warn = row.querySelector(".r-warn");
  if (warnings.length) {
    warn.replaceChildren(
      ...warnings.map((text) => {
        const line = document.createElement("span");
        line.textContent = text;
        return line;
      }),
    );
  } else {
    warn.remove();
  }

  row.querySelector(".r-cr").textContent = creditText(course);

  // Last column: semester dropdown and lock button. A course being taken
  // this term shows "Taking it now" instead and can't be moved.
  const when = row.querySelector(".r-when");
  const select = when.querySelector(".term-select");
  const lockBtn = when.querySelector(".lock-btn");
  if (isInProgress(course)) {
    const now = document.createElement("span");
    now.className = "r-now";
    now.textContent = `Taking it now (${termLabel(course.plannedTerm)})`;
    when.replaceChildren(now);
    return fragment;
  }

  fillTermSelect(select, audit, course);
  select.dataset.id = course.id; // read by main.js
  select.setAttribute("aria-label", `Semester for ${course.code}`);
  select.disabled = course.locked; // locked
  if (course.locked) select.title = "Unlock it to move it";

  lockBtn.dataset.id = course.id;
  lockBtn.classList.toggle("on", course.locked);
  lockBtn.setAttribute("aria-pressed", course.locked);
  lockBtn.disabled = !course.plannedTerm && !course.locked; // nothing to lock
  lockBtn.setAttribute(
    "aria-label",
    `${course.locked ? "Unlock" : "Lock"} ${course.code}`,
  );
  lockBtn.title = lockBtn.disabled
    ? "Pick a semester first"
    : course.locked
      ? "Locked in its semester. Click to unlock"
      : "Lock it in this semester";

  // Hand-added courses get a Remove button.
  if (course.custom) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-course-btn";
    remove.dataset.id = course.id; // read by main.js
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${course.code}`);
    remove.disabled = course.locked; // unlock first
    remove.title = course.locked
      ? "Unlock it first"
      : "Remove this course you added";
    when.append(remove);
  } else if (course.linkedTo.length) {
    // Audit course linked to another requirement by the student: Unlink undoes
    // it.
    const unlink = document.createElement("button");
    unlink.type = "button";
    unlink.className = "remove-course-btn";
    unlink.dataset.id = course.id; // read by main.js
    unlink.textContent = "Unlink";
    unlink.setAttribute(
      "aria-label",
      `Stop counting ${course.code} toward the requirement you added`,
    );
    unlink.title = "Stop counting it toward the requirement you added";
    when.append(unlink);
  }

  return fragment;
}

// Semester dropdown options: "Choose a semester" (or "Remove from plan"),
// then each semester in the plan. A term the course isn't scheduled in is
// labelled and greyed out but can still be picked.
function fillTermSelect(select, audit, course) {
  const first = document.createElement("option");
  first.value = "";
  first.textContent = course.plannedTerm
    ? "Remove from plan"
    : "Choose a semester";
  const options = audit.plan.terms.map((term) => {
    const option = document.createElement("option");
    const isHere = course.plannedTerm === term.key;
    const notOffered = notOfferedIn(course, term.key);
    option.value = term.key;
    option.textContent = term.label + (notOffered ? " (not offered)" : "");
    // Greyed out, not disabled: the schedule can be wrong or unpublished.
    option.classList.toggle("not-offered", notOffered && !isHere);
    return option;
  });
  select.replaceChildren(first, ...options);
  select.value = course.plannedTerm ?? "";
}
