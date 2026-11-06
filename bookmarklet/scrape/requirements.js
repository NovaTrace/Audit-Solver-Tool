// bookmarklet/scrape/requirements.js — the audit's requirement blocks
// (sections, titles, NEEDS counts, applied courses, options).
//
// NOT BUILT YET: this needs the real audit page's HTML, so it can read the
// requirement blocks by their elements instead of guessing from text.
// Until then the bookmarklet sends no requirements, and the app lists the
// courses under "Not linked to a requirement".

/** The audit page -> the `requirements` array. Empty for now. */
// eslint-disable-next-line no-unused-vars
export function scrapeRequirements(doc) {
  return [];
}
