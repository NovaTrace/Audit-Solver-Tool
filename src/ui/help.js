// src/ui/help.js — the "How Audit Solver works" panel (#help-panel).
//
// Shown only while the sample audit is loaded (main.js calls show() on every
// redraw). The minimize button hides it until the page is reloaded. The
// panel's ⓘ buttons (data-tip) open the matching help popup on the page.
// Used by: main.js.

/** Wires the panel. Returns show(visible) for main.js. */
export function setupHelp() {
  const panel = document.getElementById("help-panel");
  let minimized = false; // until the page is reloaded

  document.getElementById("help-min").addEventListener("click", () => {
    minimized = true;
    collapse(panel);
  });

  // "Import tips" and the others: scroll to that popup's ⓘ and open it.
  panel.querySelectorAll("[data-tip]").forEach((tip) => {
    tip.addEventListener("click", (e) => {
      // Kept from the page's click listener in popups.js, which would close
      // the popup this click opens.
      e.stopPropagation();
      const button = document.getElementById(tip.dataset.tip);
      if (!button) return;
      button.scrollIntoView({ block: "center" });
      button.focus({ preventScroll: true });
      if (button.getAttribute("aria-expanded") !== "true") button.click();
    });
  });

  return {
    show(visible) {
      if (panel.classList.contains("is-collapsing")) return; // let it finish
      panel.hidden = !visible || minimized;
    },
  };
}

// Shrinks the panel to nothing (.is-collapsing in layout.css), then hides
// it. Reduced motion (base.css) makes the transition instant; the timer is a
// fallback in case transitionend never fires.
function collapse(panel) {
  if (panel.classList.contains("is-collapsing")) return; // already closing
  panel.style.height = `${panel.offsetHeight}px`;
  void panel.offsetHeight; // start the transition from the measured height
  panel.classList.add("is-collapsing");
  panel.style.height = "0px";

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    panel.hidden = true;
    panel.style.height = "";
    panel.classList.remove("is-collapsing");
  };
  panel.addEventListener("transitionend", (e) => {
    if (e.target === panel && e.propertyName === "height") finish();
  });
  setTimeout(finish, 400);
}
