import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  assignments,
  locked,
  resetToDefaults,
  toggleTerm,
  toggleLock,
  loadState,
  saveState,
  clearSaved,
} from "../state.js";
import { courses } from "../data/defaults.js";

// Each course's starting term, straight from data/defaults.js
const dflt = (id) => courses.find((c) => c.id === id).dflt;

// Tests run in Node, which has no real localStorage, so we hand state.js a
// simple stand-in that keeps values in a Map.
function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  resetToDefaults(); // every test starts from the defaults
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Sample courses from data/defaults.js: cs1450 and gps1010.
// To get an unplaced course, a test clicks its current term pill again.
function unplace(id) {
  toggleTerm(id, assignments[id]);
}

describe("resetToDefaults", () => {
  it("puts courses in their default terms and unlocks everything", () => {
    toggleTerm("cs1450", "f28");
    toggleLock("cs1450");
    unplace("gps1010");
    resetToDefaults();
    expect(assignments.cs1450).toBe(dflt("cs1450"));
    expect(assignments.gps1010).toBe(dflt("gps1010"));
    expect(locked).toEqual({});
  });
});

describe("toggleTerm", () => {
  it("moves a course to a new term", () => {
    expect(toggleTerm("cs1450", "f27")).toBe(true);
    expect(assignments.cs1450).toBe("f27");
  });

  it("unplaces a course when its current term is clicked again", () => {
    expect(toggleTerm("cs1450", dflt("cs1450"))).toBe(true);
    expect(assignments.cs1450).toBe(null);
  });

  it("won't move a locked course", () => {
    toggleLock("cs1450");
    expect(toggleTerm("cs1450", "f27")).toBe(false);
    expect(assignments.cs1450).toBe(dflt("cs1450"));
  });

  it("ignores unknown courses and terms", () => {
    expect(toggleTerm("nope", "f27")).toBe(false);
    expect(toggleTerm("cs1450", "w99")).toBe(false);
    expect(assignments.cs1450).toBe(dflt("cs1450"));
    expect("nope" in assignments).toBe(false);
  });
});

describe("toggleLock", () => {
  it("locks, then unlocks, a placed course", () => {
    expect(toggleLock("cs1450")).toBe(true);
    expect(locked.cs1450).toBe(true);
    expect(toggleLock("cs1450")).toBe(true);
    expect(locked.cs1450).toBeUndefined();
  });

  it("won't lock an unplaced course", () => {
    unplace("gps1010");
    expect(toggleLock("gps1010")).toBe(false);
    expect(locked.gps1010).toBeUndefined();
  });
});

describe("saving and loading", () => {
  it("brings back saved picks after a reload", () => {
    toggleTerm("cs1450", "f28");
    toggleLock("cs1450");
    expect(saveState()).toBe(true);

    resetToDefaults(); // like a fresh page load
    expect(loadState()).toBe(true);
    expect(assignments.cs1450).toBe("f28");
    expect(locked.cs1450).toBe(true);
  });

  it("returns false when nothing was saved", () => {
    expect(loadState()).toBe(false);
    expect(assignments.cs1450).toBe(dflt("cs1450"));
  });

  it("forgets saved picks after clearSaved", () => {
    toggleTerm("cs1450", "f28");
    saveState();
    clearSaved();
    resetToDefaults();
    expect(loadState()).toBe(false);
    expect(assignments.cs1450).toBe(dflt("cs1450"));
  });

  it("skips bad saved data instead of loading it", () => {
    unplace("gps1010");
    localStorage.setItem(
      "audit-solver-state-v1",
      JSON.stringify({
        assignments: {
          cs1450: "f27", // fine
          pes1110: "w99", // unknown term
          hacked: "f26", // unknown course
          ["__proto__"]: "f26", // sneaky key
        },
        locked: {
          cs1450: true, // fine
          gps1010: true, // unplaced, can't be locked
          pes1110: "yes", // not true/false
        },
      }),
    );
    expect(loadState()).toBe(true);
    expect(assignments.cs1450).toBe("f27");
    expect(assignments.pes1110).toBe(dflt("pes1110")); // kept its default
    expect("hacked" in assignments).toBe(false);
    expect(locked).toEqual({ cs1450: true });
  });

  it("survives broken JSON", () => {
    localStorage.setItem("audit-solver-state-v1", "{not json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadState()).toBe(false);
    expect(assignments.cs1450).toBe(dflt("cs1450"));
  });
});
