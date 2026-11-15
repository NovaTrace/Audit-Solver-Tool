// src/ui/settings.js — Settings dialog: palette, course-list details, plan
// warnings.
//
// Stored in localStorage under SETTINGS_KEY, separate from the plan. Imports
// leave settings alone; "Clear data" resets them (reset()). If saving fails,
// defaults apply on the next load.
// An inline script in index.html applies the saved palette before first
// paint, using the same rules as resolvePalette().
// Used by: main.js. Tests: settings.test.js.

export const SETTINGS_KEY = "audit-solver-settings";

/** Palettes, in dialog order. */
export const PALETTES = [
  { id: "graphite", name: "Graphite", note: "Dark (default)" },
  { id: "mist", name: "Mist", note: "Light blue" },
  { id: "paper", name: "Paper", note: "Light" },
  { id: "midnight", name: "Midnight", note: "Blue-black" },
  { id: "forest", name: "Forest", note: "Dark green" },
  { id: "dusk", name: "Dusk", note: "Dark violet" },
  { id: "harbor", name: "Harbor", note: "Dark teal" },
];

/** Defaults. "auto" follows the system's light/dark mode. */
export const DEFAULT_SETTINGS = {
  palette: "auto",
  showOffered: true, // "Fall, Spring"
  prereqs: "full", // "full" text, course "codes" only, or "hide"
  showNeededFor: false, // "Needed for: ..."
  warnOverload: true, // "Over 18 credits" warning
};

const PREREQ_CHOICES = ["full", "codes", "hide"];

/** Replaces missing or invalid values with the defaults. */
export function normalizeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS };
  if (!saved || typeof saved !== "object") return s;
  const paletteIds = ["auto", ...PALETTES.map((p) => p.id)];
  const palette = saved.palette === "mist-light" ? "mist" : saved.palette;
  if (paletteIds.includes(palette)) s.palette = palette;
  for (const key of ["showOffered", "showNeededFor", "warnOverload"]) {
    if (typeof saved[key] === "boolean") s[key] = saved[key];
  }
  if (PREREQ_CHOICES.includes(saved.prereqs)) s.prereqs = saved.prereqs;
  return s;
}

/** The palette to apply; "auto" resolves to light or dark. */
export function resolvePalette(palette, prefersLight) {
  if (palette !== "auto") return palette;
  return prefersLight ? "mist" : "graphite";
}

/** Saved settings, or the defaults. */
export function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)));
  } catch {
    return { ...DEFAULT_SETTINGS }; // storage blocked or unreadable
  }
}

function clearSavedSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // Storage blocked: nothing was saved to begin with.
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private window or storage full: the choice lasts until reload.
  }
}

// System light/dark query. Evaluated lazily so tests can import this file
// without a window.
const lightQuery = () => window.matchMedia("(prefers-color-scheme: light)");

/** Sets the palette on <html> and the browser's theme-color. */
export function applyPalette(settings) {
  const id = resolvePalette(settings.palette, lightQuery().matches);
  document.documentElement.dataset.pal = id;
  const page = getComputedStyle(document.documentElement)
    .getPropertyValue("--page")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", page);
}

/**
 * Wires the Settings button and dialog. `onChange(settings)` runs after
 * every change. Returns { settings, change, reset }: the settings at startup,
 * a function for changing some of them from outside the dialog, and one
 * that deletes the saved settings and returns to the defaults.
 */
export function setupSettings({ onChange }) {
  let settings = loadSettings();
  applyPalette(settings);

  const dialog = document.getElementById("settings");
  const form = document.getElementById("settings-form");
  buildPaletteChoices(document.getElementById("palette-choices"));
  showInForm(form, settings);

  const button = document.getElementById("settings-btn");
  button.addEventListener("click", () => {
    showInForm(form, settings);
    dialog.showModal();
    growFrom(dialog, button);
  });

  // Saves and applies new settings, then notifies main.js.
  const use = (next) => {
    settings = normalizeSettings(next);
    saveSettings(settings);
    applyPalette(settings);
    onChange(settings);
  };

  // Changes apply immediately; there is no Save button.
  form.addEventListener("change", () => use(readForm(form)));

  // Escape or a click on the backdrop closes the dialog with the shrink
  // animation.
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault(); // close after the animation instead
    shrinkAway(dialog);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) shrinkAway(dialog);
  });
  document
    .getElementById("settings-close")
    .addEventListener("click", () => shrinkAway(dialog));

  // "Automatic": follow the system when it switches.
  lightQuery().addEventListener("change", () => applyPalette(settings));

  // `change` applies a setting from the page (e.g. the "Hide" button on a
  // warning) as if it were changed in the dialog.
  return {
    settings,
    change: (changes) => use({ ...settings, ...changes }),
    reset: () => {
      use(DEFAULT_SETTINGS);
      clearSavedSettings();
      showInForm(form, settings);
    },
  };
}

// Opens the dialog below the Settings button, growing out of it
// (.settings.is-growing in layout.css). On a narrow screen it stays centered.
function growFrom(dialog, button) {
  const btn = button.getBoundingClientRect();
  const gap = 8;
  const edge = 16;
  dialog.style.margin = "";
  dialog.style.top = "";
  dialog.style.left = "";
  dialog.style.maxHeight = "";

  if (window.innerWidth > 640) {
    // Right edges aligned, kept on screen.
    const width = dialog.offsetWidth;
    const left = Math.max(
      edge,
      Math.min(btn.right - width, window.innerWidth - width - edge),
    );
    dialog.style.margin = "0";
    dialog.style.top = `${btn.bottom + gap}px`;
    dialog.style.left = `${left}px`;
    // Scrolls inside if the window is too short.
    dialog.style.maxHeight = `${window.innerHeight - btn.bottom - gap - edge}px`;
  }

  // Grow from the point nearest the button's centre.
  const box = dialog.getBoundingClientRect();
  const x = btn.left + btn.width / 2 - box.left;
  const y = btn.top + btn.height / 2 - box.top;
  dialog.style.transformOrigin = `${x}px ${y}px`;
  dialog.classList.remove("is-growing");
  void dialog.offsetWidth; // restarts the animation
  dialog.classList.add("is-growing");
}

// Plays the opening animation in reverse (.settings.is-closing), then
// closes the dialog.
function shrinkAway(dialog) {
  if (dialog.classList.contains("is-closing")) return; // already closing
  dialog.classList.remove("is-growing");
  dialog.classList.add("is-closing");
  const done = (e) => {
    if (e.animationName !== "settings-shrink") return; // ignore the backdrop's animation
    dialog.removeEventListener("animationend", done);
    dialog.classList.remove("is-closing");
    dialog.close();
  };
  dialog.addEventListener("animationend", done);
}

// One radio button per palette, with three dots in its colors. The dots take
// their colors from data-pal, so base.css remains the only place colors
// are defined.
function buildPaletteChoices(box) {
  const choices = [
    {
      id: "auto",
      name: "Automatic",
      note: "Graphite or Mist",
    },
    ...PALETTES,
  ].map(({ id, name, note }) => {
    const label = document.createElement("label");
    label.className = "pal-choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "palette";
    radio.value = id;
    const swatch = document.createElement("span");
    swatch.className = "pal-swatch";
    swatch.setAttribute("aria-hidden", "true");
    if (id !== "auto") swatch.dataset.pal = id; // applies that palette's colors
    swatch.append(
      ...["page", "accent", "done"].map((token) => {
        const dot = document.createElement("i");
        dot.className = `sw-${token}`;
        return dot;
      }),
    );
    const words = document.createElement("span");
    const strong = document.createElement("b");
    strong.textContent = name;
    const small = document.createElement("small");
    small.textContent = note;
    words.append(strong, small);
    label.append(radio, swatch, words);
    return label;
  });
  box.replaceChildren(...choices);
}

function showInForm(form, s) {
  form.elements.palette.value = s.palette;
  form.elements.showOffered.checked = s.showOffered;
  form.elements.showNeededFor.checked = s.showNeededFor;
  form.elements.warnOverload.checked = s.warnOverload;
  form.elements.prereqs.value = s.prereqs;
}

function readForm(form) {
  return {
    palette: form.elements.palette.value,
    showOffered: form.elements.showOffered.checked,
    showNeededFor: form.elements.showNeededFor.checked,
    warnOverload: form.elements.warnOverload.checked,
    prereqs: form.elements.prereqs.value,
  };
}
