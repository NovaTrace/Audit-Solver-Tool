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

/** Thrown when the audit site answers 429 (Too Many Requests) or 503
 *  (overloaded). `waitMs` is how long it asked us to wait. */
export class SlowDownError extends Error {
  constructor(waitMs) {
    super(
      "The audit site asked us to slow down. Wait a minute, then click the bookmark again.",
    );
    this.name = "SlowDownError";
    this.waitMs = waitMs;
  }
}

export const AT_ONCE = 5; // requests in flight at a time: be polite to the server
const DEFAULT_WAIT_MS = 2000; // when told to slow down without saying how long
const MAX_WAIT_MS = 10000; // never pause longer than this before retrying

/**
 * Whether a course is worth a details request. Completed courses aren't:
 * their title and credits come from the course history, and they're never
 * planned, so their prereqs and offerings don't matter.
 */
export function needsDetails(course) {
  return course.status !== "completed";
}

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
      if (res.status === 429 || res.status === 503) {
        throw new SlowDownError(waitTime(res.headers?.get("retry-after")));
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

// A Retry-After header ("5" seconds, or a date) -> milliseconds to wait
function waitTime(retryAfter) {
  if (retryAfter == null || retryAfter === "") return DEFAULT_WAIT_MS;
  const seconds = Number(retryAfter);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(retryAfter) - Date.now();
  if (Number.isNaN(ms)) return DEFAULT_WAIT_MS;
  return Math.min(Math.max(ms, 0), MAX_WAIT_MS);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Add details to every course, AT_ONCE at a time, calling
 * onProgress(done, total) as they finish. A course whose request fails
 * keeps detailsLoaded: false; returns the codes that failed.
 *
 * Stops and throws SessionExpiredError if the login has run out. If the
 * site says to slow down, every worker pauses, then the course is tried
 * once more; if it says so again, stops and throws SlowDownError.
 */
export async function addCourseDetails(courses, options = {}) {
  const { onProgress = () => {}, ...fetchOptions } = options;
  const queue = [...courses];
  const failed = [];
  let done = 0;
  let stopError = null; // set when there's no point asking again
  let pause = null; // a Promise every worker waits on while slowing down

  async function fetchWithRetry(code) {
    await pause;
    try {
      return await fetchCourseDetails(code, fetchOptions);
    } catch (e) {
      if (!(e instanceof SlowDownError)) throw e;
      // The first worker told to slow down starts the pause; any others
      // told the same wait on that same pause
      pause ??= sleep(e.waitMs).then(() => (pause = null));
      await pause;
      return fetchCourseDetails(code, fetchOptions); // a 2nd SlowDownError stops all
    }
  }

  async function worker() {
    while (queue.length) {
      const course = queue.shift();
      try {
        Object.assign(course, await fetchWithRetry(course.code));
      } catch (e) {
        if (e instanceof SessionExpiredError || e instanceof SlowDownError) {
          stopError ??= e;
          queue.length = 0; // stop the other workers taking new courses
          return;
        }
        console.warn("Audit Solver:", e.message);
        failed.push(course.code);
      }
      onProgress(++done, courses.length);
    }
  }

  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  if (stopError) throw stopError;
  return failed;
}
