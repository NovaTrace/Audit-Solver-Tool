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

import {
  extractRequirementPages,
  extractRequiredCoreText,
  extractRequirementStatuses,
  summarizeRequirementStatuses,
  parseAuditCourses,
  parseRequiredCoreCourse,
  extractRequirementSections,
  getSpecialtyTrackOptions,
  getSpecialtyTrackNeeds,
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
  console.log("Imported:", raw.kind);

  // ---------------------------------------------------------------
  // PDF IMPORT
  // ---------------------------------------------------------------

  if (raw.kind === "pdf") {
    const auditData = JSON.parse(raw.content);

    // First page contains student and overall credit information.
    const firstPageText = auditData.pages[0] ?? "";

    console.log("FIRST PAGE TEXT:", firstPageText);

    // -------------------------------------------------------------
    // STUDENT INFORMATION
    // -------------------------------------------------------------

    const studentNameMatch = firstPageText.match(
      /PREPARED: (.+?)\s+[A-Z]{2,5}---/,
    );

    const earnedCreditsMatch = firstPageText.match(
      /EARNED:\s*([\d.]+)\s*HOURS/,
    );

    const neededCreditsMatch = firstPageText.match(/NEEDS:\s*([\d.]+)\s*HOURS/);

    const majorMatch = firstPageText.match(/BS in (.+?)\s+\d{9,}/);

    const studentInfo = {
      name: studentNameMatch ? studentNameMatch[1].trim() : null,
      earnedCredits: earnedCreditsMatch ? Number(earnedCreditsMatch[1]) : null,
      neededCredits: neededCreditsMatch ? Number(neededCreditsMatch[1]) : null,
    };

    const major = majorMatch ? majorMatch[1].trim() : null;

    // Prepare student and credit information for the shared JSON format.
    const student = {
      name: studentInfo.name,
      majors: major ? [major] : [],
      minors: [],
    };

    const credits = {
      earned: studentInfo.earnedCredits,
    };

    console.log("Extracted student information:", studentInfo);
    console.log("Extracted major:", major);
    console.log("Student object:", student);
    console.log("Credits object:", credits);

    // -------------------------------------------------------------
    // REQUIREMENT STATUSES
    // -------------------------------------------------------------

    const requirementStatuses = extractRequirementStatuses(auditData.pages);

    const requirementSummary =
      summarizeRequirementStatuses(requirementStatuses);

    console.log("Requirement summary:", requirementSummary);
    console.log(
      "NOT SATISFIED REQUIREMENTS:",
      JSON.stringify(requirementSummary.notSatisfied, null, 2),
    );

    console.log(
      "IN-PROGRESS REQUIREMENTS:",
      JSON.stringify(requirementSummary.inProgress, null, 2),
    );
    console.log("Satisfied requirements:", requirementSummary.satisfied);
    console.log("In-progress requirements:", requirementSummary.inProgress);
    console.log("Not-satisfied requirements:", requirementSummary.notSatisfied);
    console.log("Requirements needing review:", requirementSummary.needsReview);

    // -------------------------------------------------------------
    // REQUIREMENT PAGES AND SECTIONS
    // -------------------------------------------------------------

    console.log(
      "ALL PDF PAGE TEXT:",
      auditData.pages.map((text, index) => ({
        page: index + 1,
        preview: text.slice(0, 300),
      })),
    );

    console.log(
      "PAGES 4-6 FULL TEXT:",
      auditData.pages.slice(3, 6).map((text, index) => ({
        page: index + 4,
        text,
      })),
    );

    console.log("PAGE 5 FULL TEXT:", auditData.pages[4]);
    console.log("PAGE 6 FULL TEXT:", auditData.pages[5]);

    const requirementPages = extractRequirementPages(auditData.pages);

    const requirementSections = extractRequirementSections(requirementPages);

    const requiredTrack = parseRequiredTrackSection(requirementSections);

    console.log("REQUIRED TRACK DATA:", requiredTrack);

    console.log("Required Track:", JSON.stringify(requiredTrack, null, 2));

    console.log("Extracted requirement sections:", requirementSections);

    console.table(
      requirementSections.map((section) => ({
        page: section.pageNumber,
        heading: section.heading,
        contentPreview: section.content.slice(0, 180),
      })),
    );

    // -------------------------------------------------------------
    // SPECIALTY TRACK INFORMATION
    // -------------------------------------------------------------

    const specialtyTrackOptions = getSpecialtyTrackOptions(requirementSections);

    console.log(
      "FULL SPECIALTY TRACK OPTIONS:",
      JSON.stringify(specialtyTrackOptions, null, 2),
    );

    console.log("Specialty track options:", specialtyTrackOptions);

    const specialtyTrackNeeds = getSpecialtyTrackNeeds(requirementSections);

    console.log("Specialty track hours needed:", specialtyTrackNeeds);

    const trackEligibleCourses = getTrackEligibleCourses(requirementSections);

    console.log(
      "FULL TRACK ELIGIBLE COURSES:",
      JSON.stringify(trackEligibleCourses, null, 2),
    );

    console.log("Track eligible courses:", trackEligibleCourses);

    // -------------------------------------------------------------
    // PAGE 9 DEBUGGING
    // -------------------------------------------------------------

    console.log("FULL PAGE 9 SECTIONS:");

    requirementSections
      .filter((section) => section.pageNumber === 9)
      .forEach((section) => {
        console.log(`--- ${section.heading} ---`, section.content);
      });

    console.log(
      "Page 9 text:",
      requirementPages.find((page) => page.pageNumber === 9)?.text,
    );

    // -------------------------------------------------------------
    // REQUIRED CORE INFORMATION
    // -------------------------------------------------------------

    const requiredCoreData = extractRequiredCoreText(requirementPages);

    console.log("Required Core data:", requiredCoreData);
    console.log("Required Core summary:", requiredCoreData?.summary);
    console.log("Required Core section:", requiredCoreData?.coreSection);

    const requiredCoreCourses = parseRequiredCoreCourse(
      requiredCoreData?.coreSection,
    );

    console.log("Parsed Required Core courses:", requiredCoreCourses);

    // -------------------------------------------------------------
    // COURSE HISTORY
    // -------------------------------------------------------------

    // The second page contains the course history.
    const pageTwoText = auditData.pages[1] ?? "";

    const auditCourses = parseAuditCourses(pageTwoText);

    console.log("Extracted audit courses:", auditCourses);
    console.table(auditCourses);

    console.table(
      auditCourses.map((course) => ({
        term: course.term,
        courseCode: course.courseCode,
        credits: course.credits,
        grade: course.grade,
        status: course.status,
        title: course.title,
      })),
    );

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
        required: null, // Not yet identified in the PDF.
      },

      courses: [],

      requirements: [],

      courseCatalog: [],
    };

    console.log("SHARED AUDIT JSON:", JSON.stringify(sharedAudit, null, 2));

    // -------------------------------------------------------------
    // IMPORT SUMMARY
    // -------------------------------------------------------------

    console.log("PDF student:", student);
    console.log("PDF credits:", credits);
    console.log("PDF course count:", auditCourses.length);
    console.log("PDF requirement section count:", requirementSections.length);

    console.table(
      requirementSections.map((section) => ({
        heading: section.heading,
        pageNumber: section.pageNumber,
        contentLength: section.content.length,
      })),
    );

    console.log(
      "REQUIRED TRACK CONTENT:",
      requirementSections.find((section) =>
        section.heading.includes("Required Track"),
      )?.content,
    );

    console.log(
      "REQUIRED TRACK RAW TEXT:",
      JSON.stringify(
        requirementSections.find((section) =>
          section.heading.includes("Required Track"),
        )?.content,
        null,
        2,
      ),
    );

    console.log(
      "MATHEMATICS CONTENT:",
      requirementSections.find((section) =>
        section.heading.includes("Mathematics"),
      )?.content,
    );

    alert(
      `PDF read successfully. Found ${auditCourses.length} course records.`,
    );

    return;
  }

  // ---------------------------------------------------------------
  // JSON IMPORT
  // ---------------------------------------------------------------

  if (raw.kind === "json") {
    console.log("Imported JSON:", raw.content);

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
