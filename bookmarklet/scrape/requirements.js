// bookmarklet/scrape/requirements.js — reads the audit's requirements.
//
// The page nests two levels; our format flattens them:
//   .requirement     "Computer Engineering - Core"   -> `section`
//   .subrequirement  "CS 4500 Operating Systems I"   -> one requirement
//
// Reads the page only (readSubrequirement in dom.js); src/logic/auditBuild.js
// builds the requirements, shared with the PDF import.
// Used by: collector.js.

import {
  auditRoot,
  text,
  requirementBlocks,
  readSubrequirement,
} from "./dom.js";
import { buildRequirements } from "../../src/logic/auditBuild.js";

// Blocks that are not requirements.
const SKIP = new Set(["CRSHIST", "LEGEND", "WORKN/A"]);

/** Audit page -> the `requirements` array. */
export function scrapeRequirements(doc) {
  const blocks = requirementBlocks(auditRoot(doc))
    .filter((block) => !SKIP.has(block.getAttribute("rname")))
    .map((block) => ({
      section: text(block.querySelector(".reqTitle")),
      subs: [...block.querySelectorAll(".subrequirement")].map(
        readSubrequirement,
      ),
    }))
    .filter((block) => block.section);
  return buildRequirements(blocks);
}
