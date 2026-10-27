// =====================================================================
// main.js — entry point
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
  TERMS,
  catLabels,
  catOrder,
  poolGroups,
  EARNED_HOURS,
  courses,
} from "./data/defaults.js";
import {
  assignments,
  locked,
  loadState,
  saveState,
  clearSaved,
  resetToDefaults,
  toggleTerm,
  toggleLock,
} from "./state.js";
import { setupPopups } from "./ui/popups.js";
import { renderSchedule } from "./render/schedule.js";
import { renderStats } from "./render/stats.js";
import { renderCourseList } from "./render/courseList.js";

// =====================================================================
// REDRAWING — call these after anything changes the state
// =====================================================================

// Stats tiles + schedule section
function refreshSchedule() {
  const data = { terms: TERMS, courses, assignments, locked, poolGroups };
  renderSchedule(data);
  renderStats({ ...data, earnedHours: EARNED_HOURS });
}

// Course list, keeping the current filter chip and search text
function refreshList() {
  renderCourseList({
    terms: TERMS,
    courses,
    catOrder,
    catLabels,
    poolGroups,
    assignments,
    locked,
    filterCat: document.querySelector(".chip.active").dataset.cat,
    query: document.getElementById("search").value.trim().toLowerCase(),
  });
}

// Everything
function refreshAll() {
  refreshList();
  refreshSchedule();
}

// Save, update the "Saved 3:42 PM" text, and redraw.
// Call this after any change to the plan.
function saveAndRefresh() {
  if (saveState()) {
    setSaveStatus("Saved " + new Date().toLocaleTimeString());
  }
  refreshAll();
}

function setSaveStatus(text) {
  document.getElementById("save-status").textContent = text;
}

// =====================================================================
// HEADER + ALL ⓘ POPUPS
// =====================================================================
setupPopups(); // handles every .info-popup on the page

// =====================================================================
// SCHEDULE SECTION (#pool-status, #sched-grid, #unassigned)
// Drawing lives in render/schedule.js; only the Reset button is wired here.
// =====================================================================
document.getElementById("reset-btn").addEventListener("click", () => {
  const ok = confirm(
    "Clear all saved term picks and locks, and go back to the built-in defaults?",
  );
  if (!ok) return;
  clearSaved();
  resetToDefaults();
  setSaveStatus("Autosaves in browser");
  refreshAll();
});

// =====================================================================
// COURSE LIST SECTION (chips, search, #list)
// Drawing lives in render/courseList.js; clicks are handled here.
// =====================================================================

// Filter chips
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    refreshList();
  });
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
loadState(); // state.js starts from the defaults; this adds saved picks
refreshAll(); // first draw
