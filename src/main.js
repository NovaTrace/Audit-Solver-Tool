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
import { setupPopups } from "./ui/popups.js";
import { renderSchedule } from "./render/schedule.js";
import { renderStats } from "./render/stats.js";
import { renderCourseList } from "./render/courseList.js";

// =====================================================================
// STATE — which term each course is in, and which are locked
// (candidate to move into state.js later)
// =====================================================================
const STORAGE_KEY = "audit-solver-state-v1";

const assignments = {}; // course id -> term key (or null)
courses.forEach((c) => (assignments[c.id] = c.dflt));
const locked = {}; // course id -> true when locked

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.assignments)
      Object.keys(saved.assignments).forEach((id) => {
        if (id in assignments) assignments[id] = saved.assignments[id];
      });
    if (saved.locked)
      Object.keys(saved.locked).forEach((id) => {
        locked[id] = saved.locked[id];
      });
  } catch (e) {
    console.warn("Could not load saved planner state:", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ assignments, locked }));
    const s = document.getElementById("save-status");
    if (s) {
      s.textContent = "Saved " + new Date().toLocaleTimeString();
    }
  } catch (e) {
    console.warn("Could not save planner state:", e);
  }
}

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

// =====================================================================
// HEADER + ALL ⓘ POPUPS
// =====================================================================
setupPopups(); // handles every .info-popup on the page

// =====================================================================
// SCHEDULE SECTION (#pool-status, #sched-grid, #unassigned)
// Drawing lives in render/schedule.js; only the Reset button is wired here.
// =====================================================================
document.getElementById("reset-btn").addEventListener("click", () => {
  if (
    !confirm(
      "Clear all saved term picks and locks, and go back to the built-in defaults?",
    )
  )
    return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    console.error("Could not clear saved data from localStorage.");
  }
  courses.forEach((c) => (assignments[c.id] = c.dflt));
  Object.keys(locked).forEach((id) => delete locked[id]);
  const s = document.getElementById("save-status");
  if (s) s.textContent = "Autosaves in browser";
  refreshAll();
});

// =====================================================================
// COURSE LIST SECTION (chips, search)
// Drawing lives in render/courseList.js; clicks are handled here.”
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

   // Term pills and lock buttons: ONE listener on the whole list.
   document.getElementById("list").addEventListener("click", (e) => {
     const pill = e.target.closest(".pill");
     const lockBtn = e.target.closest(".lock-btn");

     if (pill) {
       const { id, term } = pill.dataset;
       if (locked[id]) return;
       assignments[id] = assignments[id] === term ? null : term; // toggle
     } else if (lockBtn) {
       const id = lockBtn.dataset.id;
       if (!assignments[id] && !locked[id]) return;
       locked[id] = !locked[id]; // toggle
     } else {
       return; // the click wasn't on a pill or a lock button
     }

     saveState();
     refreshAll();
   });

// Search box
document.getElementById("search").addEventListener("input", refreshList);

// =====================================================================
// STARTUP
// =====================================================================
loadState(); // restore saved picks from this browser
refreshAll(); // first draw
