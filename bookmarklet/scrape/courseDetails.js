// bookmarklet/scrape/courseDetails.js — fetches course details from the
// endpoint the audit page's own course popup uses:
//   POST populate-course-cat-details.ajax  (same folder as read.html)
// Requests use the student's existing login, since the bookmarklet runs on
// the audit page.
// Used by: collector.js.

import {
  normalizeCode,
  parsePrereqs,
  availabilityByTerm,
} from "../../src/logic/courseText.js";

const ENDPOINT = "populate-course-cat-details.ajax";

/**
 * Thrown when the site answers with its login page: the session expired,
 * and every further request would fail the same way.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super(
      "Your audit session has expired. Reload the audit page (log in again if asked), then click the bookmark again.",
    );
    this.name = "SessionExpiredError";
  }
}

/** Thrown on 429 or 503. `waitMs` is the wait the site asked for. */
export class SlowDownError extends Error {
  constructor(waitMs) {
    super(
      "The audit site asked us to slow down. Wait a minute, then click the bookmark again.",
    );
    this.name = "SlowDownError";
    this.waitMs = waitMs;
  }
}

export const AT_ONCE = 5; // concurrent requests
const DEFAULT_WAIT_MS = 2000; // wait when the site gives no Retry-After
const MAX_WAIT_MS = 10000; // longest pause before retrying

/**
 * True if a course needs a details request. Completed courses don't: they
 * are never planned.
 */
export function needsDetails(course) {
  return course.status !== "completed";
}

/** Endpoint response -> our course fields (Audit JSON Data Guide). Pure. */
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
 * Fetches one course's details. Returns our fields, or throws.
 * `fetchImpl` and `baseUrl` are injectable for tests.
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
      // A logged-out request redirects to the login page. Not followed: the
      // redirect itself signals an expired session.
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
      if (res.type === "opaqueredirect") {
        throw new SessionExpiredError();
      }
      if (res.status === 429 || res.status === 503) {
        throw new SlowDownError(waitTime(res.headers?.get("retry-after")));
      }
      if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
      return res.json();
    });

  let raw = await request(dept);
  // The page sends the department padded to 4 characters ("PES "); retry
  // that form if the short one finds nothing.
  if (!raw?.title && dept.length < 4) raw = await request(dept.padEnd(4));
  if (!raw?.title) throw new Error(`${code}: no details found`);
  return toCourseDetails(raw);
}

// Retry-After header (seconds or a date) -> milliseconds.
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
 * Copies fetched details onto a course, keeping the audit's credits when:
 * - the catalog gives none (variable credit, `credits: null`);
 * - the course is registered ("***"), where the registered hours apply.
 */
export function applyDetails(course, details) {
  const fromAudit = course.credits ?? null;
  const registered = (course.attempts ?? []).some((a) => a.grade === "***");
  Object.assign(course, details);
  if (fromAudit !== null && (details.credits == null || registered)) {
    course.credits = fromAudit;
  }
}

/**
 * Adds details to every course, AT_ONCE at a time, calling
 * onProgress(done, total). A failed course keeps detailsLoaded: false.
 * Returns the codes that failed.
 *
 * Throws SessionExpiredError if the login expired. On a slow-down response
 * every worker pauses and the course is retried once; a second one throws
 * SlowDownError.
 */
export async function addCourseDetails(courses, options = {}) {
  const { onProgress = () => {}, ...fetchOptions } = options;
  const queue = [...courses];
  const failed = [];
  let done = 0;
  let stopError = null; // set when further requests are pointless
  let pause = null; // Promise all workers await while slowing down

  async function fetchWithRetry(code) {
    await pause;
    try {
      return await fetchCourseDetails(code, fetchOptions);
    } catch (e) {
      if (!(e instanceof SlowDownError)) throw e;
      // The first worker told to slow down starts the pause; the others await
      // it.
      pause ??= sleep(e.waitMs).then(() => (pause = null));
      await pause;
      return fetchCourseDetails(code, fetchOptions); // a second SlowDownError stops everything
    }
  }

  async function worker() {
    while (queue.length) {
      const course = queue.shift();
      try {
        applyDetails(course, await fetchWithRetry(course.code));
      } catch (e) {
        if (e instanceof SessionExpiredError || e instanceof SlowDownError) {
          stopError ??= e;
          queue.length = 0; // stop other workers taking new courses
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
