// Tests for ui/exporter.js: the exported file, and that it round-trips
// back through parseAudit().

import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { parseAudit } from "../logic/parser.js";
import { exportFile } from "../ui/exporter.js";

const audit = () => parseAudit(structuredClone(sample));
const NOV_6 = new Date(2026, 10, 6, 21, 30); // 9:30 PM local time

describe("exportFile", () => {
  it("names the file with the local date", () => {
    expect(exportFile(audit(), NOV_6).filename).toBe(
      "audit-plan-2026-11-06.json",
    );
  });

  it("stamps exportedAt without changing the audit it was given", () => {
    const a = audit();
    const data = JSON.parse(exportFile(a, NOV_6).text);
    expect(data.source.exportedAt).toBe(NOV_6.toISOString());
    expect(a.source.exportedAt).toBeNull();
  });

  it("round-trips: importing the file restores its own picks", () => {
    const planned = audit();
    planned.courses.cs4500.plannedTerm = "FA27";
    planned.courses.cs4500.locked = true;
    const file = JSON.parse(exportFile(planned).text);

    // Import it over a state with a different pick for the same course
    const current = audit();
    current.courses.cs4500.plannedTerm = "SP27";
    const restored = parseAudit(file, current);

    expect(restored.courses.cs4500.plannedTerm).toBe("FA27");
    expect(restored.courses.cs4500.locked).toBe(true);
  });
});
