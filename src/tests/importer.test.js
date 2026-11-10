// Tests for ui/importer.js: spotting an audit in pasted text (Ctrl+V).
// Testing only, not a site element.

import { describe, it, expect } from "vitest";
import sample from "../data/sample-audit.json";
import { auditFromText } from "../ui/importer.js";

describe("auditFromText", () => {
  it("reads audit JSON, with or without space around it", () => {
    const text = `\n  ${JSON.stringify(sample)}  \n`;
    expect(auditFromText(text)).toEqual(sample);
  });

  it("ignores text that isn't JSON", () => {
    expect(auditFromText("CS 3300")).toBeNull();
    expect(auditFromText("{not json")).toBeNull();
    expect(auditFromText("")).toBeNull();
  });

  it("ignores JSON that isn't an audit", () => {
    expect(auditFromText('{"name":"something else"}')).toBeNull();
    expect(auditFromText('{"schema":5}')).toBeNull();
    expect(auditFromText("[1,2,3]")).toBeNull();
  });

  it("passes on an audit with an old schema, for parseAudit to explain", () => {
    expect(auditFromText('{"schema":"audit-solver/v0"}')).toEqual({
      schema: "audit-solver/v0",
    });
  });
});
