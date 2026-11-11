// bookmarklet/scrape/requirements.js — the audit's requirements.
//
// The page nests them two levels deep; our format flattens them:
//   .requirement     "Computer Engineering - Core"   -> `section`
//   .subrequirement  "CS 4500 Operating Systems I"  -> one requirement
//
// This file only READS the page (dom.js's readSubrequirement gives each
// sub-requirement's title lines, status, totals, applied courses and
// SELECT FROM options). Turning those into requirements is done by
// src/logic/auditBuild.js, which the PDF import shares.

import {
  auditRoot,
  text,
  requirementBlocks,
  readSubrequirement,
} from "./dom.js";
import { buildRequirements } from "../../src/logic/auditBuild.js";

// Blocks that aren't requirements to plan for
const SKIP = new Set(["CRSHIST", "LEGEND", "WORKN/A"]);

/** The audit page -> the `requirements` array. */
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
