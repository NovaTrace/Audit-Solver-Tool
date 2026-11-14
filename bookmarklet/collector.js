// bookmarklet/collector.js — bookmarklet entry point. Runs on the audit page.
//
//   check the page -> show the overlay -> read the audit -> fetch course
//   details -> validate with parseAudit() -> offer Send / Download / Copy
//
// Bundled with its imports into src/generated/collector.js by
// bookmarklet/vite.config.js. src/ui/bookmarkletPanel.js turns that file
// into the "Grab my audit" link.
// Tests: bookmarklet.test.js.

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

// Replaced by bookmarkletPanel.js with a fingerprint of this code, which the
// planner uses to detect an outdated bookmark.
const COLLECTOR_VERSION = "__COLLECTOR_VERSION__";

// Replaced by bookmarkletPanel.js with the planner's address, so the
// bookmark sends audits back to the site it came from.
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
    // The scrapers read elements, so collapsed sections are included.
    const student = scrapeStudent(document);
    const requirements = scrapeRequirements(document);
    const courses = linkCourses(scrapeCourses(document), requirements);

    const list = Object.values(courses);
    // Only courses still to plan; skipping completed ones saves most requests.
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
    parseAudit(audit); // throws if the planner would reject it

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
              (e) => say(e.message, true), // true = shown as an error
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
      failed, // codes behind "Details missing", under "See more"
    );
  } catch (e) {
    console.error("Audit Solver:", e);
    // Known problems the student can fix keep their own message.
    const known =
      e instanceof SessionExpiredError || e instanceof SlowDownError;
    ui.error(known ? e.message : `Something went wrong: ${e.message}`);
  }
}
