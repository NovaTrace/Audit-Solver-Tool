
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
  registerImportedCourses,
  loadImportedCourses,
} from "./state.js";

import { setupPopups } from "./ui/popups.js";
import { setupImport } from "./ui/importer.js";

import { parseAudit } from "./logic/parser.js";

import {
  extractRequirementPages,
  extractRequiredCoreText,
  parseAuditCourses,
  parseRequiredCoreCourse,
  extractRequirementSections,
  getTrackEligibleCourses,
  parseRequiredTrackSection,
} from "./logic/pdf-extractor.js";

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
}

function setSaveStatus(text) {
  document.getElementById("save-status").textContent = text;
}

// =====================================================================
// HEADER + POPUPS
// =====================================================================

setupPopups();

// =====================================================================
// PDF AND JSON IMPORT
// =====================================================================

setupImport((raw) => {
  // ---------------------------------------------------------------
  // PDF IMPORT
  // ---------------------------------------------------------------

  if (raw.kind === "pdf") {
    const auditData = JSON.parse(raw.content);

    // First page contains student and overall credit information.
    const firstPageText = auditData.pages[0] ?? "";

    // -------------------------------------------------------------
    // STUDENT INFORMATION
    // -------------------------------------------------------------

    const studentNameMatch = firstPageText.match(
      /PREPARED: (.+?)\s+[A-Z]{2,5}---/,
    );

    const earnedCreditsMatch = firstPageText.match(
      /EARNED:\s*([\d.]+)\s*HOURS/,
    );

    const neededCreditsMatch = firstPageText.match(
      /NEEDS:\s*([\d.]+)\s*HOURS/,
    );

    const majorMatch = firstPageText.match(/BS in (.+?)\s+\d{9,}/);

    const studentInfo = {
      name: studentNameMatch ? studentNameMatch[1].trim() : null,
      earnedCredits: earnedCreditsMatch
        ? Number(earnedCreditsMatch[1])
        : null,
      neededCredits: neededCreditsMatch
        ? Number(neededCreditsMatch[1])
        : null,
    };

    const major = majorMatch ? majorMatch[1].trim() : null;

    const student = {
      name: studentInfo.name,
      majors: major ? [major] : [],
      minors: [],
    };

    const credits = {
      earned: studentInfo.earnedCredits,
    };

    // -------------------------------------------------------------
    // REQUIREMENT PAGES AND SECTIONS
    // -------------------------------------------------------------

    const requirementPages = extractRequirementPages(auditData.pages);

    const requirementSections =
      extractRequirementSections(requirementPages);

    // -------------------------------------------------------------
    // REQUIRED TRACK INFORMATION
    // -------------------------------------------------------------

    const requiredTrack =
      parseRequiredTrackSection(requirementSections);

    if (!requiredTrack) {
      throw new Error(
        "Could not find the Required Track section in this degree audit.",
      );
    }

    const sharedRequiredTrackCourses =
      requiredTrack.courseRecords.map((course, index) => ({
        id: `required-track-course-${index + 1}`,
        code: course.courseCode,
        title: course.title,
        credits: course.credits,
        requirementIds: ["required-track"],
      }));

    // Normalize course codes so equivalent courses can be matched
    // even when the PDF uses different spacing.
    const normalizeCourseCode = (courseCode) =>
      courseCode.replace(/\s+/g, "").toUpperCase();

    const requiredTrackCourseIds = new Map(
      sharedRequiredTrackCourses.map((course) => [
        normalizeCourseCode(course.code),
        course.id,
      ]),
    );

    // Connect equivalent courses to the matching imported course IDs.
    const sharedRequiredTrackGroups = requiredTrack.courseGroups
      .map((group) => ({
        courseIds: group.courseCodes
          .map((courseCode) =>
            requiredTrackCourseIds.get(
              normalizeCourseCode(courseCode),
            ),
          )
          .filter(Boolean),
      }))
      .filter((group) => group.courseIds.length > 0);

    // -------------------------------------------------------------
    // SPECIALTY TRACK INFORMATION
    // -------------------------------------------------------------

    const trackEligibleCourses =
      getTrackEligibleCourses(requirementSections);

    // Convert extracted track information into shared audit subgroups.
    const sharedSpecialtyTrackSubgroups = trackEligibleCourses.map(
      (track, index) => {
        const trackId = `specialty-track-${index + 1}`;

        const subgroup = {
          id: trackId,
          name: track.heading,
          requiredCredits: track.requiredCredits,
          earnedCredits: null,
          remainingCredits: null,
          courseIds: [],
          eligibleCourseIds: [],
          eligibleCourseCodes: track.eligibleCourses,
        };

        // General Track contains two separate 9-credit categories.
        if (track.categories) {
          subgroup.categories = track.categories.map(
            (category, categoryIndex) => ({
              id: `${trackId}-category-${categoryIndex + 1}`,
              name: category.name,
              requiredCredits: category.requiredCredits,
              earnedCredits: null,
              remainingCredits: null,
              eligibleCourseIds: [],
              eligibleCourseCodes: category.eligibleCourses,
            }),
          );
        }

        return subgroup;
      },
    );

    // -------------------------------------------------------------
    // REQUIRED CORE INFORMATION
    // -------------------------------------------------------------

    const requiredCoreData =
      extractRequiredCoreText(requirementPages);

    const requiredCoreCourses = parseRequiredCoreCourse(
      requiredCoreData?.coreSection,
    );

    const sharedRequiredCoreCourses =
      requiredCoreCourses.map((course, index) => ({
        id: `required-core-course-${index + 1}`,
        code: course.courseCode,
        title: course.title,
        credits: course.credits,
        requirementIds: ["required-core"],
      }));

    // -------------------------------------------------------------
    // COURSE HISTORY
    // -------------------------------------------------------------

    // The second page contains the course history.
    const pageTwoText = auditData.pages[1] ?? "";

    const auditCourses = parseAuditCourses(pageTwoText);

    // -------------------------------------------------------------
    // SHARED AUDIT JSON
    // -------------------------------------------------------------

    const sharedAudit = {
      schemaVersion: 1,
      source: "pdf",

      student: {
        name: student.name,
        majors: student.majors,
        minors: student.minors,
      },

      credits: {
        earned: credits.earned,
        required: null,
      },

      courses: [
        ...sharedRequiredCoreCourses,
        ...sharedRequiredTrackCourses,
      ],

      requirements: [
        {
          id: "required-core",
          name: "Required Core",
          selection: {
            type: "all",
          },
          requiredCredits: null,
          earnedCredits:
            requiredCoreData?.summary?.earnedHours ?? null,
          remainingCredits:
            requiredCoreData?.summary?.needsHours ?? null,
          courseIds: sharedRequiredCoreCourses.map(
            (course) => course.id,
          ),
          eligibleCourseIds: [],
        },
        {
          id: "required-track",
          name: "Required Track",
          selection: {
            type: "choose",
            subgroupsRequired: 1,
          },
          requiredCredits: 18,
          earnedCredits: null,
          remainingCredits: null,
          courseIds: sharedRequiredTrackCourses.map(
            (course) => course.id,
          ),
          eligibleCourseIds: [],
          courseGroups: sharedRequiredTrackGroups,
          subgroups: sharedSpecialtyTrackSubgroups,
        },
      ],

      courseCatalog: [],
    };

    // Validate the shared audit against the project schema.
    parseAudit(sharedAudit);

    // -------------------------------------------------------------
    // IMPORT SUMMARY
    // -------------------------------------------------------------

    alert(
      `PDF read successfully. Found ${auditCourses.length} course records.`,
    );

    return;
  }

  // ---------------------------------------------------------------
  // JSON IMPORT
  // ---------------------------------------------------------------

  if (raw.kind === "json") {
    alert(
      "JSON file read successfully. JSON import processing is not implemented yet.",
    );

    return;
  }
});

// =====================================================================
// SCHEDULE SECTION
// =====================================================================

// Reset button
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
// COURSE LIST SECTION
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

// Term pills and lock buttons
document.getElementById("list").addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  const lockBtn = e.target.closest(".lock-btn");

  let changed = false;

  if (pill) {
    changed = toggleTerm(pill.dataset.id, pill.dataset.term);
  } else if (lockBtn) {
    changed = toggleLock(lockBtn.dataset.id);
  }

  if (changed) {
    saveAndRefresh();
    refreshAll();
  }
});

// =====================================================================
// STARTUP
// =====================================================================

const savedImportedCourses = loadImportedCourses();

courses.push(
  ...savedImportedCourses.filter(
    (saved) => !courses.some((course) => course.id === saved.id),
  ),
);

registerImportedCourses(savedImportedCourses);

loadState();
refreshAll();
