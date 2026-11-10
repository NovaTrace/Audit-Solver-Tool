import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAudit,
  loadAudit,
  importAudit,
  loadSample,
  resetPlan,
  toggleTerm,
  toggleLock,
  addTerm,
  removeTerm,
  MAX_TERMS,
  loadState,
  saveState,
  clearSaved,
  isSampleLoaded,
  clearAllData,
  AuditError,
} from "../state.js";
import { parseAudit } from "../logic/parser.js";
import sample from "../data/sample-audit.json";
import { NOV_2026, makeRegistered } from "./helpers.js";

const STORAGE_KEY = "audit-solver-state";

// Shortcut: one course from the current audit
const course = (id) => getAudit().courses[id];

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
  // Pin "today" to Nov 5, 2026: an import keeps the semester columns
  // current, so the tests would otherwise change with the calendar
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOV_2026);
  vi.stubGlobal("localStorage", fakeStorage());
  // Every test starts from the sample, loaded as if it were a real import.
  // (The demo has its own rules; see "the demo audit" below.)
  loadAudit(parseAudit(structuredClone(sample)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Sample courses used below (see sample-audit.json):
//   cs4500   needed, unplaced          math3400 completed
// The demo's schedule starts blank (nothing registered).

describe("the demo audit", () => {
  it("is flagged while it's showing", () => {
    loadSample();
    expect(isSampleLoaded()).toBe(true);
    loadAudit(parseAudit(structuredClone(sample)));
    expect(isSampleLoaded()).toBe(false);
  });

  it("is never saved", () => {
    loadSample();
    expect(saveState()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("doesn't pass its picks on to a real import", () => {
    loadSample();
    toggleTerm("cs4500", "SP27");
    importAudit(structuredClone(sample));
    expect(isSampleLoaded()).toBe(false);
    expect(course("cs4500").plannedTerm).toBeNull();
  });

  it("stays the demo after resetPlan", () => {
    loadSample();
    resetPlan();
    expect(isSampleLoaded()).toBe(true);
  });
});

describe("loading an audit", () => {
  it("starts from the parsed sample", () => {
    expect(getAudit().student.name).toBe(sample.student.name);
  });

  it("loadAudit replaces the whole audit", () => {
    const other = parseAudit(structuredClone(sample));
    other.student.name = "Roe, Sam";
    loadAudit(other);
    expect(getAudit().student.name).toBe("Roe, Sam");
  });

  it("importAudit keeps the student's picks on a fresh scrape", () => {
    toggleTerm("cs4500", "SP27");
    importAudit(structuredClone(sample));
    expect(course("cs4500").plannedTerm).toBe("SP27");
  });

  it("importAudit leaves the current audit alone when the data is bad", () => {
    toggleTerm("cs4500", "SP27");
    expect(() => importAudit({ schema: "nope" })).toThrow(AuditError);
    expect(course("cs4500").plannedTerm).toBe("SP27");
  });
});

describe("resetPlan", () => {
  it("clears picks but re-places registered courses and keeps the columns", () => {
    // The demo has no registered courses, so make ECE 2050 one for this test
    const data = makeRegistered(structuredClone(sample), "ece2050", "SP27");
    loadAudit(parseAudit(data));

    toggleTerm("cs4500", "SP27");
    toggleLock("cs4500");
    toggleLock("ece2050"); // unlock a registered course
    toggleTerm("ece2050", "SP27"); // and unplace it
    const columns = getAudit().plan.terms;

    resetPlan();

    expect(course("cs4500").plannedTerm).toBeNull();
    expect(course("cs4500").locked).toBe(false);
    expect(course("ece2050").plannedTerm).toBe("SP27");
    expect(course("ece2050").locked).toBe(true);
    expect(getAudit().plan.terms).toEqual(columns);
  });
});

describe("toggleTerm", () => {
  it("places an unplaced course", () => {
    expect(toggleTerm("cs4500", "FA27")).toBe(true);
    expect(course("cs4500").plannedTerm).toBe("FA27");
  });

  it("moves a course to a different term", () => {
    toggleTerm("cs4500", "FA27");
    expect(toggleTerm("cs4500", "SP28")).toBe(true);
    expect(course("cs4500").plannedTerm).toBe("SP28");
  });

  it("unplaces a course when its current term is clicked again", () => {
    toggleTerm("cs4500", "FA27");
    expect(toggleTerm("cs4500", "FA27")).toBe(true);
    expect(course("cs4500").plannedTerm).toBeNull();
  });

  it("won't move a locked course", () => {
    toggleTerm("cs4500", "SP27");
    toggleLock("cs4500");
    expect(toggleTerm("cs4500", "FA27")).toBe(false);
    expect(course("cs4500").plannedTerm).toBe("SP27");
  });

  it("won't place a completed course", () => {
    expect(toggleTerm("math3400", "FA27")).toBe(false);
    expect(course("math3400").plannedTerm).toBeNull();
  });

  it("ignores unknown courses and terms", () => {
    expect(toggleTerm("nope", "FA27")).toBe(false);
    expect(toggleTerm("__proto__", "FA27")).toBe(false);
    expect(toggleTerm("cs4500", "FA35")).toBe(false);
    expect(course("cs4500").plannedTerm).toBeNull();
  });
});

describe("addTerm and removeTerm", () => {
  const keys = () => getAudit().plan.terms.map((t) => t.key);
  // The sample's columns: FA26 SP27 SU27 FA27 SP28

  it("adds the term after the last column, with its label", () => {
    expect(addTerm()).toBe(true);
    expect(getAudit().plan.terms.at(-1)).toEqual({
      key: "SU28",
      label: "Summer 2028",
    });
    addTerm();
    expect(keys().slice(-2)).toEqual(["SU28", "FA28"]);
  });

  it("stops adding at MAX_TERMS", () => {
    while (keys().length < MAX_TERMS) addTerm();
    expect(addTerm()).toBe(false);
    expect(keys()).toHaveLength(MAX_TERMS);
  });

  it("removes a column and unplaces its courses", () => {
    toggleTerm("cs4500", "SU27");
    toggleTerm("ece3020", "FA27");
    expect(removeTerm("SU27")).toBe(true);
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28"]);
    expect(course("cs4500").plannedTerm).toBeNull();
    expect(course("ece3020").plannedTerm).toBe("FA27"); // other terms untouched
  });

  it("won't remove a column holding a locked course", () => {
    toggleTerm("cs4500", "SU27");
    toggleLock("cs4500");
    expect(removeTerm("SU27")).toBe(false);
    expect(keys()).toContain("SU27");
    expect(course("cs4500").plannedTerm).toBe("SU27");
  });

  it("won't remove the last column, or one that isn't there", () => {
    expect(removeTerm("FA35")).toBe(false);
    for (const key of ["FA26", "SP27", "SU27", "FA27"]) removeTerm(key);
    expect(removeTerm("SP28")).toBe(false);
    expect(keys()).toEqual(["SP28"]);
  });

  it("adds after the last column even when one in the middle was removed", () => {
    removeTerm("SU27");
    addTerm();
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28", "SU28"]);
  });

  it("keeps the changed columns through a save, a reload and a re-import", () => {
    removeTerm("SU27");
    addTerm();
    saveState();
    loadSample(); // like a fresh page load
    loadState();
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28", "SU28"]);
    importAudit(structuredClone(sample)); // a fresh scrape
    expect(keys()).not.toContain("SU27");
    expect(keys()).toContain("SU28");
  });
});

describe("toggleLock", () => {
  it("locks, then unlocks, a placed course", () => {
    toggleTerm("cs4500", "FA27");
    expect(toggleLock("cs4500")).toBe(true);
    expect(course("cs4500").locked).toBe(true);
    expect(toggleLock("cs4500")).toBe(true);
    expect(course("cs4500").locked).toBe(false);
  });

  it("won't lock an unplaced course", () => {
    expect(toggleLock("cs4500")).toBe(false);
    expect(course("cs4500").locked).toBe(false);
  });

  it("ignores unknown courses", () => {
    expect(toggleLock("nope")).toBe(false);
  });
});

describe("saving and loading", () => {
  it("brings back the whole audit after a reload", () => {
    toggleTerm("cs4500", "FA27");
    toggleLock("cs4500");
    expect(saveState()).toBe(true);

    loadSample(); // like a fresh page load
    expect(course("cs4500").plannedTerm).toBeNull();

    expect(loadState()).toBe(true);
    expect(course("cs4500").plannedTerm).toBe("FA27");
    expect(course("cs4500").locked).toBe(true);
  });

  it("records when it was saved", () => {
    saveState();
    expect(getAudit().plan.lastSaved).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns false when nothing was saved", () => {
    expect(loadState()).toBe(false);
    expect(getAudit().student.name).toBe(sample.student.name);
  });

  it("forgets the save after clearSaved", () => {
    toggleTerm("cs4500", "FA27");
    saveState();
    clearSaved();
    loadSample();
    expect(loadState()).toBe(false);
    expect(course("cs4500").plannedTerm).toBeNull();
  });

  it("repairs saved data through parseAudit", () => {
    const saved = structuredClone(sample);
    saved.courses.cs4500.plannedTerm = "FA35"; // not a column
    saved.courses.cs4500.locked = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    expect(loadState()).toBe(true);
    expect(course("cs4500").plannedTerm).toBeNull();
    expect(course("cs4500").locked).toBe(false);
  });

  it("skips saved data that fails parseAudit", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: "old" }));
    expect(loadState()).toBe(false);
    expect(getAudit().student.name).toBe(sample.student.name);
  });

  it("survives broken JSON", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toBe(false);
  });

  it("returns false when the browser refuses to save", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(saveState()).toBe(false);
  });
});

describe("clearAllData", () => {
  it("deletes the save and goes back to the demo", () => {
    toggleTerm("cs4500", "FA27");
    saveState();
    clearAllData();
    expect(isSampleLoaded()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(course("cs4500").plannedTerm).toBeNull();
  });
});
