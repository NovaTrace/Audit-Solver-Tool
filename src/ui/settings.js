// =====================================================================
// ui/settings.js — the Settings dialog: color palette, and how much
// detail each course in the list shows
//
// Settings are saved in this browser (localStorage, under their own key),
// separately from the plan: "Clear data" and importing an audit leave them
// alone. They're only a preference, so if saving fails nothing breaks:
// the page just uses the defaults next time.
//
// A small script in index.html's <head> applies the saved palette before
// the page is drawn, so a light-theme user never sees a dark flash. It
// reads the same key and follows the same rules as resolvePalette() below.
// =====================================================================

export const SETTINGS_KEY = "audit-solver-settings";

/** The palettes, in the order the dialog lists them. */
export const PALETTES = [
  { id: "graphite", name: "Graphite", note: "Dark (default)" },
  { id: "mist", name: "Mist", note: "Light" },
  { id: "denim", name: "Denim", note: "Dark blue, rose accent" },
  { id: "dusk", name: "Dusk", note: "Dark violet, butter accent" },
  { id: "harbor", name: "Harbor", note: "Dark teal, coral accent" },
];

/** What a first visit gets. "auto" follows the system's light/dark mode. */
export const DEFAULT_SETTINGS = {
  palette: "auto",
  showCounts: true, // "Counts toward: ..."
  showOffered: true, // "Fall, Spring"
  prereqs: "full", // "full" text, course "codes" only, or "hide"
  showNeededFor: true, // "Needed for: ..."
};

const PREREQ_CHOICES = ["full", "codes", "hide"];

/**
 * Fills in anything missing or invalid with the default, so an old or
 * hand-edited saved copy can never break the page.
 */
export function normalizeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS };
  if (!saved || typeof saved !== "object") return s;
  const paletteIds = ["auto", ...PALETTES.map((p) => p.id)];
  // "mist-light" was Mist's earlier name: keep anyone who picked it on it
  const palette = saved.palette === "mist-light" ? "mist" : saved.palette;
  if (paletteIds.includes(palette)) s.palette = palette;
  for (const key of ["showCounts", "showOffered", "showNeededFor"]) {
    if (typeof saved[key] === "boolean") s[key] = saved[key];
  }
  if (PREREQ_CHOICES.includes(saved.prereqs)) s.prereqs = saved.prereqs;
  return s;
}

/** The palette to use: the chosen one, or for "auto", light or dark. */
export function resolvePalette(palette, prefersLight) {
  if (palette !== "auto") return palette;
  return prefersLight ? "mist" : "graphite";
}

/** The saved settings, or the defaults. */
export function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)));
  } catch {
    return { ...DEFAULT_SETTINGS }; // storage blocked or unreadable
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private window or storage full: the choice lasts until reload
  }
}

// The system's light/dark setting (asked when needed, so this file can be
// imported by tests that have no window)
const lightQuery = () => window.matchMedia("(prefers-color-scheme: light)");

/** Puts the palette on <html> and matches the browser bar's color. */
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
 * Wires up the Settings button and dialog. `onChange(settings)` runs after
 * every change (main.js redraws the course list); the palette is applied
 * here. Returns the settings in effect now.
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

  // Every change applies at once: no Save button
  form.addEventListener("change", () => {
    settings = normalizeSettings(readForm(form));
    saveSettings(settings);
    applyPalette(settings);
    onChange(settings);
  });

  // Escape, or a click on the dimmed area around it, closes the dialog,
  // shrinking back into the button (the opening played in reverse)
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault(); // instead of closing at once
    shrinkAway(dialog);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) shrinkAway(dialog);
  });

  // On "Automatic", follow the system when it switches light/dark
  lightQuery().addEventListener("change", () => applyPalette(settings));

  return settings;
}

// Opens the dialog just below the Settings button, growing out of it.
// On a narrow screen there's no room beside the button, so the dialog
// stays centered and grows from the button's direction instead. The
// animation itself is .settings.is-growing in layout.css.
function growFrom(dialog, button) {
  const btn = button.getBoundingClientRect();
  const gap = 8;
  const edge = 16;
  dialog.style.margin = "";
  dialog.style.top = "";
  dialog.style.left = "";
  dialog.style.maxHeight = "";

  if (window.innerWidth > 640) {
    // Right edge lined up with the button's, kept on screen
    const width = dialog.offsetWidth;
    const left = Math.max(
      edge,
      Math.min(btn.right - width, window.innerWidth - width - edge),
    );
    dialog.style.margin = "0";
    dialog.style.top = `${btn.bottom + gap}px`;
    dialog.style.left = `${left}px`;
    // Scrolls inside if the window is too short to show it all
    dialog.style.maxHeight = `${window.innerHeight - btn.bottom - gap - edge}px`;
  }

  // Grow from the point of the dialog nearest the button's centre
  const box = dialog.getBoundingClientRect();
  const x = btn.left + btn.width / 2 - box.left;
  const y = btn.top + btn.height / 2 - box.top;
  dialog.style.transformOrigin = `${x}px ${y}px`;
  dialog.classList.remove("is-growing");
  void dialog.offsetWidth; // restart the animation if opened again
  dialog.classList.add("is-growing");
}

// Plays the opening animation backwards (.settings.is-closing in
// layout.css), then closes the dialog. It shrinks toward the same point
// it grew from, since growFrom() left the transform-origin there.
function shrinkAway(dialog) {
  if (dialog.classList.contains("is-closing")) return; // already closing
  dialog.classList.remove("is-growing");
  dialog.classList.add("is-closing");
  const done = (e) => {
    if (e.animationName !== "settings-shrink") return; // not the backdrop's
    dialog.removeEventListener("animationend", done);
    dialog.classList.remove("is-closing");
    dialog.close();
  };
  dialog.addEventListener("animationend", done);
}

// One radio button per palette, with three dots of its colors. The dots
// read the colors from a hidden sample inside the label, so the palette
// list in base.css stays the only place colors are written down.
function buildPaletteChoices(box) {
  const choices = [
    {
      id: "auto",
      name: "Automatic",
      note: "Graphite or Mist, following your system",
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
    if (id !== "auto") swatch.dataset.pal = id; // takes that palette's colors
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
  form.elements.showCounts.checked = s.showCounts;
  form.elements.showOffered.checked = s.showOffered;
  form.elements.showNeededFor.checked = s.showNeededFor;
  form.elements.prereqs.value = s.prereqs;
}

function readForm(form) {
  return {
    palette: form.elements.palette.value,
    showCounts: form.elements.showCounts.checked,
    showOffered: form.elements.showOffered.checked,
    showNeededFor: form.elements.showNeededFor.checked,
    prereqs: form.elements.prereqs.value,
  };
}
