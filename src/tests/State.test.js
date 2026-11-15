// Tests for src/state.js: loading, changing and saving the audit.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAudit,
  loadAudit,
  importAudit,
  loadSample,
  resetPlan,
  setTerm,
  toggleLock,
  addTerm,
  removeTerm,
  addCustomCourse,
  removeCustomCourse,
  unlinkCourse,
  toggleRequirement,
  setSectionOff,
  MAX_TERMS,
  loadState,
  saveState,
  isSampleLoaded,
  clearAllData,
  AuditError,
} from "../state.js";
import { parseAudit } from "../logic/parser.js";
import sample from "./fixtures/test-audit.json";
import { NOV_2026, makeRegistered } from "./helpers.js";

// state.js loads the demo audit (data/sample-audit.json), which may change.
// Here it is replaced by the fixed test audit, so loadSample() loads the
// courses these tests expect.
vi.mock("../data/sample-audit.json", async () => ({
  default: (await import("./fixtures/test-audit.json")).default,
}));

const STORAGE_KEY = "audit-solver-state";

// Shortcuts: a course from the current audit; the plan's column keys.
const course = (id) => getAudit().courses[id];
const keys = () => getAudit().plan.terms.map((t) => t.key);

// Node has no localStorage; this Map-backed stand-in replaces it.
function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

beforeEach(() => {
  // "Today" is fixed at Nov 5, 2026: imports keep the semester columns
  // current, so results would otherwise change with the calendar.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOV_2026);
  vi.stubGlobal("localStorage", fakeStorage());
  // Each test starts from the test audit, loaded as a real import.
  // (The demo behaves differently; see "the demo audit" below.)
  loadAudit(parseAudit(structuredClone(sample)));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Test audit (fixtures/test-audit.json):
//   cs4500 needed, unplaced · math3400 completed · nothing registered
//   columns: FA26 SP27 SU27 FA27 SP28

describe("the demo audit", () => {
  it("is flagged while it's showing, and never saved", () => {
    loadSample();
    expect(isSampleLoaded()).toBe(true);
    expect(saveState()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    loadAudit(parseAudit(structuredClone(sample)));
    expect(isSampleLoaded()).toBe(false);
  });

  it("doesn't pass its picks on to a real import", () => {
    loadSample();
    setTerm("cs4500", "SP27");
    importAudit(structuredClone(sample));
    expect(isSampleLoaded()).toBe(false);
    expect(course("cs4500").plannedTerm).toBeNull();
  });
});

describe("importAudit", () => {
  it("keeps the student's picks on a fresh scrape", () => {
    setTerm("cs4500", "SP27");
    importAudit(structuredClone(sample));
    expect(course("cs4500").plannedTerm).toBe("SP27");
  });

  it("leaves the current audit alone when the data is bad", () => {
    setTerm("cs4500", "SP27");
    expect(() => importAudit({ schema: "nope" })).toThrow(AuditError);
    expect(course("cs4500").plannedTerm).toBe("SP27");
  });
});

describe("resetPlan", () => {
  it("clears picks, re-places registered courses and restores the default columns", () => {
    // The test audit has no registered courses; register ECE 2050.
    const data = makeRegistered(structuredClone(sample), "ece2050", "SP27");
    loadAudit(parseAudit(data));
    setTerm("cs4500", "FA27");
    toggleLock("cs4500");
    setTerm("ece2050", ""); // take the registered course out of the plan
    removeTerm("FA26");
    addTerm(); // the plan now starts late and runs a term longer

    resetPlan();

    expect(course("cs4500")).toMatchObject({
      plannedTerm: null,
      locked: false,
    });
    expect(course("ece2050")).toMatchObject({
      plannedTerm: "SP27", // back in the term it's registered for
      locked: false, // which hasn't started, so it can still be moved
    });
    // "Today" is Nov 5, 2026: six terms from the current one.
    expect(keys()).toEqual(["FA26", "SP27", "SU27", "FA27", "SP28", "SU28"]);
  });

  it("puts the demo back to the sample's own plan", () => {
    loadSample();
    removeTerm("FA26");
    addTerm();
    setTerm("cs4500", "SP27");

    resetPlan();

    expect(getAudit().plan.terms).toEqual(sample.plan.terms);
    expect(course("cs4500").plannedTerm).toBeNull();
    expect(isSampleLoaded()).toBe(true);
  });
});

describe("toggleLock", () => {
  it("locks, then unlocks, a placed course", () => {
    setTerm("cs4500", "FA27");
    expect(toggleLock("cs4500")).toBe(true);
    expect(course("cs4500").locked).toBe(true);
    expect(toggleLock("cs4500")).toBe(true);
    expect(course("cs4500").locked).toBe(false);
  });

  it("won't lock an unplaced or unknown course", () => {
    expect(toggleLock("cs4500")).toBe(false);
    expect(course("cs4500").locked).toBe(false);
    expect(toggleLock("nope")).toBe(false);
  });
});

describe("addTerm", () => {
  it("adds the term after the last column, with its label", () => {
    removeTerm("SU27"); // a gap in the middle doesn't change that
    expect(addTerm()).toBe(true);
    expect(getAudit().plan.terms.at(-1)).toEqual({
      key: "SU28",
      label: "Summer 2028",
    });
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28", "SU28"]);
  });

  it("makes the new column usable like any other", () => {
    addTerm();
    expect(setTerm("cs4500", "SU28")).toBe(true);
  });

  it("refuses one semester too many", () => {
    while (keys().length < MAX_TERMS) addTerm();
    expect(addTerm()).toBe(false);
    expect(keys()).toHaveLength(MAX_TERMS);
  });
});

describe("removeTerm", () => {
  it("removes a column and unplaces its courses", () => {
    setTerm("cs4500", "SU27");
    setTerm("ece3020", "FA27");
    expect(removeTerm("SU27")).toBe(true);
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28"]);
    expect(course("cs4500").plannedTerm).toBeNull();
    expect(course("ece3020").plannedTerm).toBe("FA27"); // other terms untouched
  });

  it("refuses a column with a locked course, an unknown term, and the last column", () => {
    setTerm("cs4500", "SU27");
    toggleLock("cs4500");
    expect(removeTerm("SU27")).toBe(false);
    expect(course("cs4500").plannedTerm).toBe("SU27");
    expect(removeTerm("FA35")).toBe(false);

    for (const key of ["FA26", "SP27", "FA27", "SP28"]) removeTerm(key);
    expect(keys()).toEqual(["SU27"]);
    toggleLock("cs4500"); // unlocked: only "last column" stops it now
    expect(removeTerm("SU27")).toBe(false);
  });
});

describe("toggleRequirement", () => {
  const req = (id) => getAudit().requirements.find((r) => r.id === id);

  it("switches a requirement off and back on, and ignores unknown ones", () => {
    expect(toggleRequirement("cpe-cs4500")).toBe(true);
    expect(req("cpe-cs4500").ignored).toBe(true);
    expect(req("cpe-cs4500").status).toBe("needs"); // the audit's fact stays
    expect(toggleRequirement("cpe-cs4500")).toBe(true);
    expect(req("cpe-cs4500").ignored).toBe(false);
    expect(toggleRequirement("nope")).toBe(false);
  });

  it("switches a whole section's unmet requirements at once", () => {
    const core = "Computer Engineering - Core";
    const offIn = (section) =>
      getAudit()
        .requirements.filter((r) => r.section === section && r.ignored)
        .map((r) => r.id);

    expect(setSectionOff(core, true)).toBe(true);
    expect(offIn(core)).toEqual([
      "cpe-cs3300",
      "cpe-cs4500",
      "cpe-ece4891",
      "cpe-ece4899",
    ]); // not cpe-arch: the audit says that one is already met
    expect(offIn("Electrical Engineering - Core")).toEqual([]);
    expect(setSectionOff(core, true)).toBe(false); // already all off

    toggleRequirement("cpe-cs4500"); // one back on by hand…
    expect(setSectionOff(core, false)).toBe(true); // …then the rest
    expect(offIn(core)).toEqual([]);
    expect(setSectionOff("No such section", true)).toBe(false);
  });

  it("is remembered through a save, a reload and a fresh audit import", () => {
    toggleRequirement("cpe-cs4500");
    saveState();
    loadSample(); // like a fresh page load
    loadState();
    expect(req("cpe-cs4500").ignored).toBe(true);
    importAudit(structuredClone(sample));
    expect(req("cpe-cs4500").ignored).toBe(true);
  });
});

describe("custom courses", () => {
  // The test audit's rule with no course list: "any MATH course 3100 or
  // higher".
  const RULE = "math-minor-electives";
  const rule = () => getAudit().requirements.find((r) => r.id === RULE);
  const add = (fields) =>
    addCustomCourse({ code: "math 3110", credits: "3", ...fields });

  it("adds a course with every field, linked to its requirement", () => {
    expect(add({ title: " Theory of Numbers ", requirementId: RULE })).toEqual({
      ok: true,
      code: "MATH 3110",
    });
    expect(course("math3110")).toMatchObject({
      code: "MATH 3110",
      title: "Theory of Numbers",
      credits: 3,
      status: "option",
      custom: true,
      requirementIds: [RULE],
      attempts: [], // filled in by parseAudit, like any course
      plannedTerm: null,
    });
    expect(rule().options).toContain("MATH 3110");
    expect(setTerm("math3110", "FA27")).toBe(true); // plans like any course
  });

  it("can be added with no requirement and no title", () => {
    expect(add().ok).toBe(true);
    expect(course("math3110")).toMatchObject({
      title: null,
      requirementIds: [],
    });
  });

  it.each([
    ["isn't a course code", { code: "calculus" }, /course code/],
    [
      "is already in the list",
      { code: "CS 4500" },
      /already in the course list/,
    ],
    ["is already completed", { code: "MATH3400" }, /already completed/],
    ["has no credits", { credits: "" }, /Credits/],
    ["has too many credits", { credits: "40" }, /Credits/],
    [
      "names a requirement that isn't there",
      { requirementId: "nope" },
      /requirement/,
    ],
  ])("refuses a course that %s, and says why", (_name, fields, message) => {
    const before = Object.keys(getAudit().courses).length;
    const result = add(fields);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
    expect(Object.keys(getAudit().courses)).toHaveLength(before);
  });

  it("removes a custom course and its link, but not audit or locked courses", () => {
    add({ requirementId: RULE });
    expect(removeCustomCourse("cs4500")).toBe(false); // from the audit
    expect(removeCustomCourse("nope")).toBe(false);

    setTerm("math3110", "FA27");
    toggleLock("math3110");
    expect(removeCustomCourse("math3110")).toBe(false); // locked
    toggleLock("math3110");
    expect(removeCustomCourse("math3110")).toBe(true);
    expect(course("math3110")).toBeUndefined();
    expect(rule().options).not.toContain("MATH 3110");
  });

  it("links a course that's already on the audit, instead of adding it twice", () => {
    const before = Object.keys(getAudit().courses).length;
    expect(add({ code: "cs 4500", requirementId: RULE })).toEqual({
      ok: true,
      code: "CS 4500",
      linkedTo: "MATHEMATICS ELECTIVES",
    });
    expect(Object.keys(getAudit().courses).length).toBe(before);
    expect(course("cs4500")).toMatchObject({
      custom: false,
      linkedTo: [RULE],
      requirementIds: ["cpe-cs4500", RULE],
    });
    expect(rule().options).toContain("CS 4500");

    // A second link is refused; a completed course can't be linked.
    expect(add({ code: "CS 4500", requirementId: RULE }).message).toMatch(
      /already counts toward/,
    );
    expect(add({ code: "MATH 3400", requirementId: RULE }).message).toMatch(
      /already completed/,
    );
  });

  it("unlinks only the links the student made", () => {
    expect(unlinkCourse("cs4500")).toBe(false); // nothing linked by hand yet
    add({ code: "CS 4500", requirementId: RULE });
    expect(unlinkCourse("cs4500")).toBe(true);
    expect(course("cs4500")).toMatchObject({
      linkedTo: [],
      requirementIds: ["cpe-cs4500"], // the audit's own link stays
    });
    expect(rule().options).not.toContain("CS 4500");
    const own = getAudit().requirements.find((r) => r.id === "cpe-cs4500");
    expect(own.options).toEqual(["CS 4500"]);
  });

  it("keeps a link through a save, a reload and a fresh audit import", () => {
    add({ code: "CS 4500", requirementId: RULE });
    saveState();
    loadSample(); // like a fresh page load
    loadState();
    expect(course("cs4500").linkedTo).toEqual([RULE]);

    importAudit(structuredClone(sample)); // a fresh scrape doesn't know it
    expect(course("cs4500")).toMatchObject({
      linkedTo: [RULE],
      requirementIds: ["cpe-cs4500", RULE],
    });
    expect(rule().options).toContain("CS 4500");
  });

  it("survives a save, a reload, Reset plan and a fresh audit import", () => {
    add({ requirementId: RULE });
    setTerm("math3110", "FA27");
    saveState();
    loadSample(); // like a fresh page load
    loadState();
    expect(course("math3110")).toMatchObject({
      custom: true,
      plannedTerm: "FA27",
    });

    importAudit(structuredClone(sample)); // a fresh scrape doesn't list it
    expect(course("math3110")).toMatchObject({
      custom: true,
      plannedTerm: "FA27",
    });
    expect(rule().options).toContain("MATH 3110");

    resetPlan(); // clears the pick, keeps the course
    expect(course("math3110")).toMatchObject({
      custom: true,
      plannedTerm: null,
    });
  });
});

describe("saving and loading", () => {
  it("brings back picks, locks and changed columns after a reload", () => {
    setTerm("cs4500", "FA27");
    toggleLock("cs4500");
    removeTerm("SU27");
    addTerm();
    expect(saveState()).toBe(true);
    expect(getAudit().plan.lastSaved).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    loadSample(); // like a fresh page load
    expect(course("cs4500").plannedTerm).toBeNull();

    expect(loadState()).toBe(true);
    expect(course("cs4500")).toMatchObject({
      plannedTerm: "FA27",
      locked: true,
    });
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28", "SU28"]);

    // A later fresh scrape keeps the student's columns too.
    importAudit(structuredClone(sample));
    expect(keys()).toEqual(["FA26", "SP27", "FA27", "SP28", "SU28"]);
  });

  it("repairs saved data through parseAudit", () => {
    const saved = structuredClone(sample);
    saved.courses.cs4500.plannedTerm = "FA35"; // not a column
    saved.courses.cs4500.locked = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    expect(loadState()).toBe(true);
    expect(course("cs4500")).toMatchObject({
      plannedTerm: null,
      locked: false,
    });
  });

  it.each([
    ["nothing was saved", null],
    ["the save fails parseAudit", JSON.stringify({ schema: "old" })],
    ["the save is broken JSON", "{not json"],
  ])("loads nothing when %s", (_name, saved) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    if (saved !== null) localStorage.setItem(STORAGE_KEY, saved);
    expect(loadState()).toBe(false);
    expect(getAudit().student.name).toBe(sample.student.name);
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
  it("deletes the save and goes back to the demo, columns included", () => {
    setTerm("cs4500", "FA27");
    removeTerm("FA26");
    addTerm();
    saveState();

    clearAllData();

    expect(isSampleLoaded()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(course("cs4500").plannedTerm).toBeNull();
    expect(getAudit().plan.terms).toEqual(sample.plan.terms);
  });
});

describe("setTerm (the semester dropdown)", () => {
  beforeEach(() => loadSample());
  const course = (id) => getAudit().courses[id];

  it("places a course, moves it, and takes it out of the plan", () => {
    expect(setTerm("cs4500", "SP27")).toBe(true);
    expect(course("cs4500").plannedTerm).toBe("SP27");
    expect(setTerm("cs4500", "FA27")).toBe(true);
    expect(course("cs4500").plannedTerm).toBe("FA27");
    expect(setTerm("cs4500", "")).toBe(true);
    expect(course("cs4500").plannedTerm).toBeNull();
  });

  it("reports no change when the course is already there", () => {
    setTerm("cs4500", "SP27");
    expect(setTerm("cs4500", "SP27")).toBe(false);
  });

  it("refuses a completed course and unknown courses", () => {
    expect(setTerm("math3400", "FA27")).toBe(false); // completed
    expect(setTerm("nope", "FA27")).toBe(false);
    expect(setTerm("__proto__", "FA27")).toBe(false);
    expect(setTerm("cs4500", "FA35")).toBe(false); // not a column
    expect(course("cs4500").plannedTerm).toBeNull();
  });

  it("won't move a locked course or accept a made-up term", () => {
    setTerm("cs4500", "SP27");
    toggleLock("cs4500");
    expect(setTerm("cs4500", "FA27")).toBe(false);
    expect(setTerm("cs4500", "")).toBe(false);
    toggleLock("cs4500");
    expect(setTerm("cs4500", "nope")).toBe(false);
    expect(course("cs4500").plannedTerm).toBe("SP27");
  });
});
