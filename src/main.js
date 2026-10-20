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
  const activeCat = document.querySelector(".chip.active").dataset.cat;
  const query = document.getElementById("search").value.trim().toLowerCase();
  renderList(activeCat, query);
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
  if (s) s.textContent = "Autosaves in this browser";
  refreshAll();
});

// =====================================================================
// COURSE LIST SECTION (chips, search, #list)
// Not rebuilt yet — next candidate to move into render/courseList.js
// =====================================================================

const chipMap = {
  "comp-cur": "comp-cur",
  "cs-core": "cs-core",
  "cs-math": "cs-math",
  writing: "writing",
};

function termClass(c) {
  return c === "c" ? "term-c" : c === "i" ? "term-i" : "term-u";
}

function confClass(c) {
  return c === "c" ? "conf-c" : c === "i" ? "conf-i" : "conf-u";
}

function renderList(filterCat, query) {
  const list = document.getElementById("list");
  list.innerHTML = "";
  const grouped = {};
  courses.forEach((c) => {
    if (!grouped[c.cat]) grouped[c.cat] = [];
    grouped[c.cat].push(c);
  });
  catOrder.forEach((cat) => {
    if (filterCat !== "all" && chipMap[cat] !== filterCat) return;
    const items = (grouped[cat] || []).filter((c) => {
      if (!query) return true;
      const hay = (c.code + " " + c.title + " " + c.sub).toLowerCase();
      return hay.includes(query);
    });
    if (items.length === 0) return;
    const head = document.createElement("div");
    head.className = "cat-head";
    head.textContent = catLabels[cat];
    list.appendChild(head);
    items.forEach((c) => {
      const row = document.createElement("div");
      const isLocked = !!locked[c.id];
      row.className =
        "row" +
        (cat === "ee-lec" || cat === "ee-lab" || cat === "cpen-elect"
          ? " pool"
          : "") +
        (isLocked ? " locked" : "");
      const pillsHtml = TERMS.map(
        (t) =>
          `<button class="pill${assignments[c.id] === t.key ? " on" : ""}" data-id="${c.id}" data-term="${t.key}" ${isLocked ? "disabled" : ""}>${t.label}</button>`,
      ).join("");
      row.innerHTML = `
					<div><span class="r-code">${c.code}</span><span class="r-cr">${c.cr} cr</span></div>
					<div>
  						<span class="r-title">${c.title}</span>
  							${c.sub ? `<span class="r-sub">${c.sub}</span>` : ""}
  						<span class="r-term ${termClass(c.termC)}">${c.term}</span>
  						<span class="r-prereq"><i class="conf-dot ${confClass(c.preC)}" style="margin-right:5px;"></i>${c.prereq}</span>
					</div>
					<div class="pills">
  						${pillsHtml}

  						<button class="lock-btn${isLocked ? " on" : ""}" data-id="${c.id}" ${!assignments[c.id] && !isLocked ? "disabled" : ""}>${isLocked ? "Locked🔒" : "lock🔓"}</button>

					</div>
  				`;
      list.appendChild(row);
    });
  });
  list.querySelectorAll(".pill").forEach((p) => {
    p.addEventListener("click", () => {
      const id = p.dataset.id,
        term = p.dataset.term;
      if (locked[id]) return;
      assignments[id] = assignments[id] === term ? null : term;
      saveState();
      refreshAll();
    });
  });
  list.querySelectorAll(".lock-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (!assignments[id] && !locked[id]) return;
      locked[id] = !locked[id];
      saveState();
      refreshAll();
    });
  });
}

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
document.getElementById("search").addEventListener("input", () => {
  refreshList();
});

// =====================================================================
// STARTUP
// =====================================================================
loadState(); // restore saved picks from this browser
refreshAll(); // first draw
