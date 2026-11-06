// =====================================================================
// bookmarklet/collector.js — the bookmarklet's entry point. Runs on the
// student's audit page when they click the bookmark:
//
//   check the page -> show the overlay -> read the audit -> fetch course
//   details -> check the result with parseAudit() -> offer Send/Download
//
// vite.bookmarklet.config.js bundles this and everything it imports into
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
  SessionExpiredError,
} from "./scrape/courseDetails.js";
import { parseAudit, SCHEMA } from "../src/logic/parser.js";

// Bump when the bookmarklet changes, so the app can tell old bookmarks
const COLLECTOR_VERSION = "0.3.0";

// Replaced with the planner's real address when the student drags the
// link from the planner (bookmarkletPanel.js), so the bookmark always
// sends back to the copy of the site it came from.
const APP_URL = "__APP_URL__";

run();

async function run() {
  if (!/\/audit\//.test(location.pathname)) {
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
    const failed = await addCourseDetails(list, {
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

    ui.ready(summary, [
      {
        label: "Send to Audit Solver",
        main: true,
        run: (say) =>
          sendToApp(audit, APP_URL).then(
            () => say("Sent! Switch to the Audit Solver tab."),
            (e) => say(e.message),
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
            () => say("Copied."),
            () => say("Couldn't copy. Use Download instead."),
          ),
      },
    ]);
  } catch (e) {
    console.error("Audit Solver:", e);
    ui.error(
      e instanceof SessionExpiredError
        ? e.message
        : `Something went wrong: ${e.message}`,
    );
  }
}
