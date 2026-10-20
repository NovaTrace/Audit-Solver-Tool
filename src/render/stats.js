// Fills in the three stat tiles (#stat-earned, #stat-assigned, #stat-total).

import { totalAssignedCredits } from "../logic/credits.js";

export function renderStats({ terms, courses, assignments, earnedHours }) {
  const assigned = totalAssignedCredits(terms, courses, assignments);

  document.getElementById("stat-earned").textContent = earnedHours;
  document.getElementById("stat-assigned").textContent = assigned;
  document.getElementById("stat-total").textContent = earnedHours + assigned;
}
