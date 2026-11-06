// Fills in the three stat tiles (#stat-earned, #stat-assigned, #stat-total).

import { totalPlannedCredits } from "../logic/credits.js";

export function renderStats(audit) {
  const earned = audit.student.hoursEarned ?? 0;
  const assigned = totalPlannedCredits(audit);

  document.getElementById("stat-earned").textContent = earned;
  document.getElementById("stat-assigned").textContent = assigned;
  document.getElementById("stat-total").textContent = earned + assigned;
}
