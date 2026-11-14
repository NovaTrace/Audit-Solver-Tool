// Tests for ui/settings.js: the saved Settings are checked before use, and
// "Automatic" picks light or dark. Testing only, not a site element.

import { describe, it, expect } from "vitest";
import {
  normalizeSettings,
  resolvePalette,
  DEFAULT_SETTINGS,
} from "../ui/settings.js";

describe("normalizeSettings", () => {
  it("gives the defaults for nothing saved", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid choices and replaces invalid ones", () => {
    const s = normalizeSettings({
      palette: "dusk",
      showNeededFor: false,
      prereqs: "codes",
      showCounts: "yes", // not a true/false: ignored
      extra: 1,
    });
    expect(s).toEqual({
      ...DEFAULT_SETTINGS,
      palette: "dusk",
      showNeededFor: false,
      prereqs: "codes",
    });
  });

  it("moves Mist's old name over to the new one", () => {
    expect(normalizeSettings({ palette: "mist-light" }).palette).toBe("mist");
  });

  it("ignores a palette that doesn't exist", () => {
    expect(normalizeSettings({ palette: "neon" }).palette).toBe("auto");
  });
});

describe("resolvePalette", () => {
  it("follows the system on Automatic", () => {
    expect(resolvePalette("auto", true)).toBe("mist");
    expect(resolvePalette("auto", false)).toBe("graphite");
  });

  it("keeps a chosen palette whatever the system says", () => {
    expect(resolvePalette("harbor", true)).toBe("harbor");
  });
});
