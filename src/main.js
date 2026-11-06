// =====================================================================
// main.js — entry point: connects the page to state.js
//
//   state.js   holds the audit and changes it (no `document`)
//   render/*   draws parts of the page from the audit (no state changes)
//   main.js    listens for clicks, asks state.js to change, then redraws
// =====================================================================

// ---------- Styles ----------
// Order matters: when two files style the same thing, the later one wins.
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/popups.css";
import "./styles/schedule.css";
import "./styles/course-list.css";

// ---------- Modules ----------
import {
  getAudit,
  isSampleLoaded,
  loadState,
  saveState,
  resetPlan,
  toggleTerm,
  toggleLock,
  importAudit,
  AuditError,
  clearAllData,
} from "./state.js";
import { visibleSections } from "./logic/courses.js";
import { setupPopups } from "./ui/popups.js";
import { setupImport, setupReceiver } from "./ui/importer.js";
import { setupBookmarkletPanel } from "./ui/bookmarkletPanel.js";
import { setupExport } from "./ui/exporter.js";
import { renderHeader } from "./render/header.js";
import { renderSchedule } from "./render/schedule.js";
import { renderStats } from "./render/stats.js";
import { renderCourseList, renderFilterChips } from "./render/courseList.js";

// The chosen filter chip: "all" or a section name. This is display state,
// not plan data, so it lives here rather than in state.js and isn't saved.
let activeSection = "all";

// =====================================================================
// REDRAWING — call these after anything changes the audit
// =====================================================================

// Which audit the get-started panel was last opened/closed for
// (null until the first draw)
let panelShowsSample = null;

// Header, footer, and the get-started panel (only shown with the demo)
function refreshHeader() {
  renderHeader(getAudit(), { isSample: isSampleLoaded(), now: new Date() });
  const panel = document.getElementById("get-started");
  panel.querySelector("h2").textContent = isSampleLoaded()
    ? "Load your degree audit"
    : "Update your audit or get the bookmarklet again";

  // Open on first visit, collapsed once an audit is loaded. Only change it
  // when switching between the demo and a real audit: this runs after every
  // click, and would otherwise shut a panel the student just opened.
  if (panelShowsSample !== isSampleLoaded()) {
    panelShowsSample = isSampleLoaded();
    panel.open = panelShowsSample;
  }
}

// Stats tiles + schedule section
function refreshSchedule() {
  renderSchedule(getAudit());
  renderStats(getAudit());
}

// Chips + course list, keeping the current chip and search text
function refreshList() {
  const audit = getAudit();
  // One chip per section that still has something to plan
  const sections = visibleSections({
    audit,
    filterSection: "all",
    query: "",
  }).map((group) => group.section);
  // A new audit may not have the section that was chosen before
  if (activeSection !== "all" && !sections.includes(activeSection)) {
    activeSection = "all";
  }
  renderFilterChips(sections, activeSection);
  renderCourseList({
    audit,
    filterSection: activeSection,
    query: document.getElementById("search").value.trim().toLowerCase(),
  });
}

// Everything
function refreshAll() {
  refreshHeader();
  refreshList();
  refreshSchedule();
}

// Save, update the "Saved 3:42 PM" text, and redraw.
// Call this after any change to the plan.
function saveAndRefresh() {
  if (saveState()) {
    setSaveStatus("Saved " + new Date().toLocaleTimeString());
  } else if (isSampleLoaded()) {
    setSaveStatus("Sample data: changes aren't saved");
  }
  refreshAll();
}

function setSaveStatus(text) {
  document.getElementById("save-status").textContent = text;
}

// =====================================================================
// HEADER + POPUPS
// =====================================================================
setupPopups(); // handles every .info-popup on the page

// Import: from a file (Import button) or from the bookmarklet (Send).
// importAudit() runs parseAudit(), which throws AuditError for data that
// isn't a valid audit; the current plan is left untouched in that case.
function handleImport(raw) {
  try {
    importAudit(raw.content);
  } catch (e) {
    if (!(e instanceof AuditError)) throw e; // a bug in our code: let it show
    alert(`That isn't a valid audit, so nothing was changed.\n\n${e.message}`);
    return;
  }
  saveAndRefresh();
}
setupImport(handleImport);
setupReceiver(handleImport);

// The "Grab my audit" bookmarklet link and its Copy code button
setupBookmarkletPanel();

// Export button: downloads the current audit as .json
setupExport(getAudit);

// =====================================================================
// SCHEDULE SECTION (#pool-status, #sched-grid, #unassigned)
// Drawing lives in render/schedule.js; only the Reset button is wired here.
// =====================================================================
document.getElementById("reset-btn").addEventListener("click", () => {
  const ok = confirm(
    "Clear all term picks and locks? Registered courses stay in their terms.",
  );
  if (!ok) return;
  resetPlan();
  saveAndRefresh();
});

// "Clear data" button (footer): delete the save and go back to the demo
document.getElementById("clear-data-btn").addEventListener("click", () => {
  const ok = confirm(
    "Delete your saved audit and plan from this browser and go back to the sample data?\n\nExport first if you want to keep a copy.",
  );
  if (!ok) return;
  clearAllData();
  setSaveStatus("Sample data: changes aren't saved");
  refreshAll();
});

// =====================================================================
// COURSE LIST SECTION (#chips, #search, #list)
// Drawing lives in render/courseList.js; clicks are handled here.
// =====================================================================

// Filter chips: ONE listener on the chip box, since the chips are rebuilt
// on every redraw (a listener on each chip would be thrown away with it)
document.getElementById("chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  activeSection = chip.dataset.section;
  refreshList();
});

// Search box
document.getElementById("search").addEventListener("input", refreshList);

// Term pills and lock buttons: ONE listener on the whole list.
// state.js decides whether the click is allowed; we just save and redraw.
document.getElementById("list").addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  const lockBtn = e.target.closest(".lock-btn");

  let changed = false;
  if (pill) {
    changed = toggleTerm(pill.dataset.id, pill.dataset.term);
  } else if (lockBtn) {
    changed = toggleLock(lockBtn.dataset.id);
  }

  if (changed) saveAndRefresh();
});

// =====================================================================
// STARTUP
// =====================================================================
loadState(); // state.js starts from the demo; this swaps in a saved audit
setSaveStatus(
  isSampleLoaded()
    ? "Sample data: changes aren't saved"
    : "Autosaves in browser",
);
refreshAll(); // first draw
