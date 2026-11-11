// =====================================================================
// bookmarklet/collector.js — the bookmarklet's entry point. Runs on the
// student's audit page when they click the bookmark:
//
//   check the page -> show the overlay -> read the audit -> fetch course
//   details -> check the result with parseAudit() -> offer Send/Download
//
// bookmarklet/vite.config.js bundles this and everything it imports into
// one file, src/generated/collector.js. The app's "Grab my audit" link is
// that file's code (see src/ui/bookmarkletPanel.js).
// =====================================================================

import { showOverlay } from "./overlay.js";
import { sendToApp, downloadJson, copyJson } from "./send.js";
import { scrapeStudent } from "./scrape/student.js";
import { scrapeCourses, linkCourses } from "./scrape/courses.js";
import { scrapeRequirements } from "./scrape/requirements.js";
import {
  addCourseDetails,
  needsDetails,
  SessionExpiredError,
  SlowDownError,
} from "./scrape/courseDetails.js";
import { parseAudit, SCHEMA } from "../src/logic/parser.js";

// Filled in by bookmarkletPanel.js with a fingerprint of this code. The
// planner compares it with the code it hands out now, to spot old bookmarks.
const COLLECTOR_VERSION = "__COLLECTOR_VERSION__";

// Replaced with the planner's real address when the student drags the
// link from the planner (bookmarkletPanel.js), so the bookmark always
// sends back to the copy of the site it came from.
const APP_URL = "__APP_URL__";

run();

async function run() {
  if (!document.querySelector("#auditRequirements")) {
    alert(
      "Audit Solver: open your degree audit first, then click the bookmark.",
    );
    return;
  }
  if (document.getElementById("audit-solver-overlay")) return; // already open

  const ui = showOverlay();
  try {
    ui.status("Reading your audit…");
    // The scrapers read the page's elements, so collapsed sections count too
    const student = scrapeStudent(document);
    const requirements = scrapeRequirements(document);
    const courses = linkCourses(scrapeCourses(document), requirements);

    const list = Object.values(courses);
    // Only courses still to plan: skipping completed ones saves most requests
    const failed = await addCourseDetails(list.filter(needsDetails), {
      onProgress: (done, total) =>
        ui.status(`Loading course details: ${done} of ${total}`),
    });

    const audit = {
      schema: SCHEMA,
      source: {
        type: "bookmarklet",
        importedAt: new Date().toISOString(),
        collectorVersion: COLLECTOR_VERSION,
        exportedAt: null,
      },
      student,
      requirements,
      courses,
    };
    parseAudit(audit); // throws if we built something the planner would reject

    const summary =
      `Found ${list.length} courses for ${student.name}.` +
      (failed.length ? ` Details missing for ${failed.length}.` : "");

    ui.ready(
      summary,
      [
        {
          label: "Send to Audit Solver",
          main: true,
          run: (say) =>
            sendToApp(audit, APP_URL).then(
              () => say("Sent! Switch to the Audit Solver tab."),
              (e) => say(e.message, true), // true = show it as an error (red)
            ),
        },
        {
          label: "Download .json",
          run: (say) => {
            downloadJson(audit);
            say("Downloaded. Load it with Import in Audit Solver.");
          },
        },
        {
          label: "Copy",
          run: (say) =>
            copyJson(audit).then(
              () => say("Copied. Open Audit Solver and press Ctrl+V."),
              () => say("Couldn't copy. Use Download instead.", true),
            ),
        },
      ],
      failed, // the codes behind "Details missing", under "See more"
    );
  } catch (e) {
    console.error("Audit Solver:", e);
    // Known situations the student can fix get their own message as-is
    const known =
      e instanceof SessionExpiredError || e instanceof SlowDownError;
    ui.error(known ? e.message : `Something went wrong: ${e.message}`);
  }
}
