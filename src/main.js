// src/main.js — entry point. Wires the page to state.js.
//
//   state.js   holds and changes the audit (no DOM)
//   render/*   draws the page from the audit (no state changes)
//   main.js    handles events, calls state.js, then redraws
//
// Sections:
//   Redrawing            refreshAll() and parts; call after any change
//   Importing            handleImport(): every incoming audit
//   setupHeader()        popups, Import / Export, bookmarklet panel
//   setupSemesters()     '+' and '−' on semester cards, course locks
//   setupDragging()      dragging a course between semesters
//   setupRequirements()  requirement tick boxes
//   setupPlanButtons()   Reset plan, Clear data
//   setupCourseList()    category / Show dropdowns, search, row controls
//   setupAddCourse()     add-a-course form
//   setupWarnings()      "Hide" on a credit-load warning
//   Startup              runs the setup functions, then the first draw
//
// Listener pattern: find the target, call state.js, and if it returns true
// call saveAndRefresh().

// ---------- Fonts ----------
// Bundled from the @fontsource packages; no requests to other sites.
// Only weights 400 and 600 and the Latin subset are shipped. Family names
// are set in --sans and --mono (styles/base.css).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";

// ---------- Styles ----------
// Order matters: later files override earlier ones.
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/popups.css";
import "./styles/schedule.css";
import "./styles/course-list.css";

// ---------- Modules ----------
import "./ui/titleAnimation.js";
import {
  getAudit,
  isSampleLoaded,
  loadState,
  saveState,
  resetPlan,
  setTerm,
  toggleLock,
  addTerm,
  removeTerm,
  addCustomCourse,
  removeCustomCourse,
  unlinkCourse,
  toggleRequirement,
  setSectionOff,
  importAudit,
  AuditError,
  clearAllData,
  loadSample,
} from "./state.js";
import { listGroups, filterGroups } from "./logic/courses.js";
import { coursesInTerm } from "./logic/credits.js";
import { setupPopups } from "./ui/popups.js";
import { setupImport, setupPaste, setupReceiver } from "./ui/importer.js";
import {
  setupBookmarkletPanel,
  BOOKMARKLET_VERSION,
} from "./ui/bookmarkletPanel.js";
import { setupExport } from "./ui/exporter.js";
import { setupDragDrop } from "./ui/dragDrop.js";
import { setupSettings } from "./ui/settings.js";
import { setupHelp } from "./ui/help.js";
import { courseWarnings } from "./logic/planChecks.js";
import { renderHeader } from "./render/header.js";
import { renderSchedule } from "./render/schedule.js";
import {
  renderCourseList,
  renderCategoryOptions,
  renderShowOptions,
  renderRequirementChoices,
} from "./render/courseList.js";

// Course-list dropdown choices: category ("all" or a section name) and
// Show ("all", "attention", "unplaced"). Display state only; not saved.
let activeSection = "all";
let activeShow = "all";

// Current settings from ui/settings.js. Set at startup.
let settings = null;

// ---------- Redrawing ----------

// Whether the get-started panel was last set for a real audit (null before
// the first draw).
let panelShowsOwn = null;

// "How Audit Solver works" panel (ui/help.js).
const help = setupHelp();

// Header and the get-started panel.
function refreshHeader() {
  const audit = getAudit();
  if (audit) renderHeader(audit);
  help.show(isSampleLoaded()); // help panel: sample audit only
  const own = audit !== null && !isSampleLoaded(); // the student's own audit
  const panel = document.getElementById("get-started");
  panel.querySelector("h2").textContent = own
    ? "Update your audit or get the bookmarklet again"
    : "Load your degree audit";

  // Open until the student loads their own audit, then collapsed. Changed
  // only when switching, so a panel the student opened stays open.
  if (panelShowsOwn !== own) {
    panelShowsOwn = own;
    panel.open = !own;
  }
}

// Plan panel, below its heading row.
function refreshSchedule() {
  renderSchedule(getAudit(), settings);
}

// Dropdowns and course list, keeping the current choices and search text.
function refreshList() {
  const audit = getAudit();
  // Computed once; used for the category dropdown and the list.
  const everything = listGroups(audit);
  const sections = everything.map((group) => group.section);
  // A new audit may lack the previously chosen section.
  if (activeSection !== "all" && !sections.includes(activeSection)) {
    activeSection = "all";
  }
  renderCategoryOptions(sections, activeSection);
  renderShowOptions(activeShow);
  renderRequirementChoices(audit); // add-a-course form's requirement list

  const query = document.getElementById("search").value.trim().toLowerCase();
  renderCourseList({
    audit,
    groups: filterGroups(everything, {
      filterSection: activeSection,
      query,
      show: activeShow,
      audit,
    }),
    query,
    show: activeShow,
    settings,
  });
}

// Everything. With no audit loaded, body.is-empty hides the header details,
// course list and plan (layout.css), leaving the get-started panel.
function refreshAll() {
  const empty = getAudit() === null;
  document.body.classList.toggle("is-empty", empty);
  refreshHeader();
  if (empty) return;
  refreshList();
  refreshSchedule();
}

// Save-status text while the demo is loaded.
const SAMPLE_STATUS = "Sample data: changes aren't saved";

// Saves, updates the save-status text, and redraws. Call after any change to
// the plan.
function saveAndRefresh() {
  if (saveState()) {
    // "Saved 3:42 PM"
    const time = new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    setSaveStatus("Saved " + time);
  } else if (isSampleLoaded()) {
    setSaveStatus(SAMPLE_STATUS);
  } else {
    // Storage full or blocked (e.g. a private window).
    setSaveStatus("Couldn't save in this browser. Export to keep a copy.");
  }
  refreshAll();
}

function setSaveStatus(text) {
  const status = document.getElementById("save-status");
  status.textContent = text;
  // The dot shows only after a successful save. Removing the class and
  // reading the layout first restarts its pulse on every save.
  status.classList.remove("is-saved");
  void status.offsetWidth;
  status.classList.toggle("is-saved", text.startsWith("Saved"));
}

// ---------- Importing ----------
// Files, PDFs, pasted text and the bookmarklet's Send all reach handleImport().

// Loads incoming audit data. Invalid data (AuditError) leaves the current plan
// unchanged.
function handleImport(raw) {
  if (!okToReplacePlan(raw.content)) return;
  try {
    importAudit(raw.content);
  } catch (e) {
    if (e instanceof AuditError) {
      alert(
        `That isn't a valid audit, so nothing was changed.\n\n${e.message}`,
      );
    } else {
      // Unexpected error. Reported here because the async import callers would
      // otherwise swallow it.
      console.error("Import failed:", e);
      alert("Something went wrong loading that audit, so nothing was changed.");
    }
    return;
  }
  saveAndRefresh();
  warnIfOldBookmark(raw.content);
}

// Asks before an exported plan replaces the current one. A fresh audit
// keeps the current picks, and the demo has nothing to lose, so neither asks.
function okToReplacePlan(data) {
  const isSavedPlan = data?.source?.exportedAt != null;
  if (!isSavedPlan || isSampleLoaded()) return true;
  return confirm(
    "This file is a saved plan. Loading it replaces the plan you have now, including its semester choices.\n\nExport first if you want to keep a copy. Load it?",
  );
}

// Warns when a fresh scrape came from an older bookmarklet version.
// Exported plans are skipped: they keep the version that made them.
function warnIfOldBookmark(data) {
  const { type, exportedAt, collectorVersion } = data.source ?? {};
  if (type !== "bookmarklet" || exportedAt != null) return;
  if (collectorVersion === BOOKMARKLET_VERSION) return;

  alert(
    "Your audit was loaded, but your Audit Solver bookmark is out of date.\n\nDrag the new “Grab my audit” link to your bookmarks bar to replace it.",
  );
  // Open the panel holding the link and scroll to it.
  const panel = document.getElementById("get-started");
  panel.open = true;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Header ----------
// Popups, Import / Export and the bookmarklet panel; each lives in ui/.
// Footer version: package.json's version (put in by vite.config.js), linked
// to its release on GitHub. The release's tag must be "v" + the version,
// e.g. v1.2.1.
function showVersion() {
  const version = import.meta.env.APP_VERSION;
  const link = document.getElementById("app-version");
  link.textContent = `v${version}`;
  link.href = `https://github.com/NovaTrace/Audit-Solver-Tool/releases/tag/v${version}`;
  link.title = `Version ${version} on GitHub`;
}

function setupHeader() {
  setupPopups(); // every .info-popup
  setupImport(handleImport); // Import button: .json or audit PDF
  setupPaste(handleImport); // Ctrl+V: JSON copied by the bookmarklet
  setupReceiver(handleImport); // bookmarklet's Send button
  setupBookmarkletPanel(); // "Grab my audit" link, Copy code
  setupExport(getAudit); // Export button

  // "Try it with a sample student" on the empty page.
  document.getElementById("try-sample").addEventListener("click", () => {
    loadSample();
    setSaveStatus(SAMPLE_STATUS);
    refreshAll();
  });
}

// ---------- Semesters (#sched-grid) ----------
// '+' tile, the last semester's '−', and each course's lock. Drawn by
// render/schedule.js.
function setupSemesters() {
  // One listener on the grid: the cards are rebuilt on every redraw.
  document.getElementById("sched-grid").addEventListener("click", (e) => {
    // Grip / padlock: lock or unlock the course.
    const lockBtn = e.target.closest(".tc-lock");
    if (lockBtn) {
      if (toggleLock(lockBtn.dataset.id)) saveAndRefresh();
      return;
    }

    // '+' tile: add the next semester.
    const addBtn = e.target.closest(".term-add");
    if (addBtn) {
      if (addTerm()) saveAndRefresh();
      return;
    }

    const removeBtn = e.target.closest(".term-remove");
    if (!removeBtn) return;
    const term = removeBtn.dataset.term;

    // An empty semester is removed at once; one with courses asks first.
    const count = coursesInTerm(getAudit(), term).length;
    if (count > 0) {
      const ok = confirm(
        `Remove this semester? Its ${count} course${count === 1 ? "" : "s"} will go back to unplaced.`,
      );
      if (!ok) return;
    }
    if (removeTerm(term)) saveAndRefresh();
  });
}

// Dragging a course between semester cards (ui/dragDrop.js). `warnFor`
// supplies the warning shown while hovering a semester.
function setupDragging() {
  setupDragDrop({
    onMove: (id, term) => {
      if (setTerm(id, term)) saveAndRefresh();
    },
    warnFor: (id, term) => {
      const { courses } = getAudit();
      if (!Object.hasOwn(courses, id)) return "";
      const course = courses[id];
      const there = { ...course, plannedTerm: term };
      return courseWarnings(getAudit(), there).join(" · ");
    },
  });
}

// ---------- Requirements (#req-categories) ----------
// Tick boxes that switch requirements off and on. Drawn by render/schedule.js.
function setupRequirements() {
  // Tick boxes fire "change", not "click".
  document.getElementById("req-categories").addEventListener("change", (e) => {
    // A section's box switches every requirement under it; ticked means on.
    const { id, section } = e.target.dataset;
    const changed =
      section !== undefined
        ? setSectionOff(section, !e.target.checked)
        : toggleRequirement(id);
    if (changed) saveAndRefresh();
  });
}

// ---------- Plan buttons ----------
// Reset plan and Clear data. Both confirm first; neither can be undone.
function setupPlanButtons() {
  document.getElementById("reset-btn").addEventListener("click", () => {
    const ok = confirm(
      "Clear all term picks and locks, and put the semesters back to the default ones? Registered courses stay in their terms.",
    );
    if (!ok) return;
    resetPlan();
    saveAndRefresh();
  });

  // Delete the saved audit and settings, and return to the empty page.
  document.getElementById("clear-data-btn").addEventListener("click", () => {
    const ok = confirm(
      "Delete your saved audit, plan and settings from this browser and start over?\n\nExport first if you want to keep a copy.",
    );
    if (!ok) return;
    clearAllData();
    setSaveStatus("");
    settingsDialog.reset(); // redraws the page through onChange
    window.scrollTo({ top: 0 });
  });
}

// ---------- Course list (#category, #show, #search, #list) ----------
// Drawn by render/courseList.js.
function setupCourseList() {
  document.getElementById("category").addEventListener("change", (e) => {
    activeSection = e.target.value;
    refreshList();
  });
  document.getElementById("show").addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button || button.dataset.value === activeShow) return;
    activeShow = button.dataset.value;
    refreshList();
  });

  // Redraw on every keystroke.
  document.getElementById("search").addEventListener("input", refreshList);

  const list = document.getElementById("list");

  // Semester dropdowns: one listener on the list, since rows are rebuilt on
  // every redraw. state.js decides whether the move is allowed.
  list.addEventListener("change", (e) => {
    const select = e.target.closest(".term-select");
    if (select && setTerm(select.dataset.id, select.value)) saveAndRefresh();
  });

  // Lock and remove buttons
  list.addEventListener("click", (e) => {
    const lockBtn = e.target.closest(".lock-btn");
    const removeBtn = e.target.closest(".remove-course-btn");

    let changed = false;
    if (lockBtn) {
      changed = toggleLock(lockBtn.dataset.id);
    } else if (removeBtn) {
      // "Remove" on a hand-added course, "Unlink" on an audit course.
      const { id } = removeBtn.dataset;
      changed = removeCustomCourse(id) || unlinkCourse(id);
    }
    if (changed) saveAndRefresh();
  });
}

// ---------- Add a course (#add-course-form) ----------
// state.js validates the input and returns the message to show.
function setupAddCourse() {
  const field = (id) => document.getElementById(id);

  field("add-course-form").addEventListener("submit", (e) => {
    e.preventDefault(); // no page reload
    const result = addCustomCourse({
      code: field("add-code").value,
      title: field("add-title").value,
      credits: field("add-credits").value,
      requirementId: field("add-req").value,
    });

    const message = field("add-course-msg");
    message.classList.toggle("error", !result.ok);
    if (!result.ok) {
      message.textContent = result.message;
      return;
    }
    message.textContent = result.linkedTo
      ? `${result.code} now counts toward ${result.linkedTo} too.`
      : `Added ${result.code}. Pick its semester in the list above.`;
    // Clear for the next entry; credits and requirement stay as chosen.
    field("add-code").value = "";
    field("add-title").value = "";
    saveAndRefresh();
  });
}

// ---------- Warnings (#plan-check) ----------
// "Hide" on an "Over 18 credits" line switches that warning off, the same
// as the tick box in Settings.
function setupWarnings() {
  document.getElementById("plan-check").addEventListener("click", (e) => {
    if (e.target.closest(".pc-hide")) {
      settingsDialog.change({ warnOverload: false });
    }
  });
}

// ---------- Startup ----------
// Settings first: palette, list details and plan warnings depend on them.
const settingsDialog = setupSettings({
  onChange: (next) => {
    settings = next;
    refreshAll();
  },
});
settings = settingsDialog.settings;
setupWarnings();
setupHeader();
showVersion();
setupSemesters();
setupDragging();
setupRequirements();
setupPlanButtons();
setupCourseList();
setupAddCourse();

// A saved audit, if any; otherwise the empty page.
if (loadState()) setSaveStatus("Autosaves in browser");
refreshAll(); // first draw

// Entrance animation for the first draw only (layout.css); later redraws
// rebuild the same elements and must not replay it.
document.body.classList.add("is-first-draw");
setTimeout(() => document.body.classList.remove("is-first-draw"), 800);
