// bookmarklet/scrape/courseDetails.js — the course popup's data, fetched
// directly from the endpoint the audit page itself uses:
//   POST populate-course-cat-details.ajax  (same folder as read.html)
// The request rides on the student's own login, because the bookmarklet
// runs on the audit page.

import {
  normalizeCode,
  parsePrereqs,
  availabilityByTerm,
} from "../../src/logic/courseText.js";

const ENDPOINT = "populate-course-cat-details.ajax";

/** Thrown when the audit site answers with its login page: the student's
 *  session ran out. Every other request would fail the same way. */
export class SessionExpiredError extends Error {
  constructor() {
    super(
      "Your audit session has expired. Reload the audit page (log in again if asked), then click the bookmark again.",
    );
    this.name = "SessionExpiredError";
  }
}
const AT_ONCE = 3; // requests in flight at a time: be polite to the server

/**
 * Raw endpoint response -> our course fields (see the Audit JSON Data
 * Guide). Pure, so it's tested with saved responses.
 */
export function toCourseDetails(raw) {
  return {
    title: raw.title || null,
    credits: raw.creditHours ?? null,
    minCredits: raw.minimumCredits ?? null,
    maxCredits: raw.maximumCredits ?? null,
    // The description ends with "3 Credits (Minimum) 3 Credits (Maximum)."
    description:
      raw.description?.replace(/\s*[\d.]+ Credits \(Minimum\).*$/, "") ?? null,
    prereqText: raw.preReqs ?? "",
    prereqs: parsePrereqs(raw.preReqs ?? ""),
    coreqText: raw.coReqs ?? "",
    coreqs: parsePrereqs(raw.coReqs ?? ""),
    termsOffered: raw.yearTermAvailability ?? [],
    availability: availabilityByTerm(raw.courseAvailability),
    detailsLoaded: true,
  };
}

/**
 * Fetch one course's details. Returns our fields, or throws.
 * `fetchImpl` and `baseUrl` let tests run it without a real server.
 */
export async function fetchCourseDetails(
  code,
  { fetchImpl = fetch, baseUrl = location.href } = {},
) {
  const [dept, number] = normalizeCode(code).split(" ");
  const url = new URL(ENDPOINT, baseUrl);

  const request = (courseDept) =>
    fetchImpl(url, {
      method: "POST",
      credentials: "include",
      // A logged-out request is redirected to the CU login page. Don't
      // follow it: the redirect itself tells us the session expired.
      redirect: "manual",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body: new URLSearchParams({
        courseDept,
        courseNum: number,
        planTermId: "",
        courseId: "",
      }),
    }).then((res) => {
      if (res.type === "opaqueredirect" || res.redirected) {
        throw new SessionExpiredError();
      }
      if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
      return res.json();
    });

  let raw = await request(dept);
  // The page itself sends the department padded to 4 characters ("PES ").
  // If the short form finds nothing, try that.
  if (!raw?.title && dept.length < 4) raw = await request(dept.padEnd(4));
  if (!raw?.title) throw new Error(`${code}: no details found`);
  return toCourseDetails(raw);
}

/**
 * Add details to every course, AT_ONCE at a time, calling
 * onProgress(done, total) as they finish. A course whose request fails
 * keeps detailsLoaded: false; returns the codes that failed.
 * Stops and throws SessionExpiredError if the login has run out.
 */
export async function addCourseDetails(courses, options = {}) {
  const { onProgress = () => {}, ...fetchOptions } = options;
  const queue = [...courses];
  const failed = [];
  let done = 0;
  let expired = null;

  async function worker() {
    while (queue.length) {
      const course = queue.shift();
      try {
        Object.assign(
          course,
          await fetchCourseDetails(course.code, fetchOptions),
        );
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          expired = e;
          queue.length = 0; // no point asking again
          return;
        }
        console.warn("Audit Solver:", e.message);
        failed.push(course.code);
      }
      onProgress(++done, courses.length);
    }
  }

  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  if (expired) throw expired;
  return failed;
}
