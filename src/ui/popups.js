// src/ui/popups.js — the ⓘ help popups (.info-popup in index.html).
//
// One document-level click listener handles all popups. Clicking an ⓘ
// button opens its popup; any other click, or Escape, closes the open one.
// While open, the page is dimmed except the element named by the popup's
// data-spotlight selector, which gets .is-spotlit.
// Used by: main.js.

export function setupPopups() {
  document.addEventListener("click", (e) => {
    if (e.target.closest(".info-text")) return; // clicks inside a popup keep it open

    const btn = e.target.closest(".info-btn");
    const popup = btn?.closest(".info-popup");
    const wasOpen = popup?.classList.contains("open");

    closeAll(); // every click closes the open popup…

    if (popup && !wasOpen) {
      // …and a click on a closed popup's button opens it.
      popup.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.add("popup-open");
      const topic = popup.dataset.spotlight;
      if (topic) document.querySelector(topic)?.classList.add("is-spotlit");
      keepOnScreen(popup.querySelector(".info-text"));
    }
  });

  // Escape closes the open popup and returns focus to its button.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const openButton = document.querySelector(".info-popup.open .info-btn");
    if (!openButton) return; // nothing open
    closeAll();
    openButton.focus();
  });
}

function closeAll() {
  document.querySelectorAll(".info-popup.open").forEach((p) => {
    p.classList.remove("open");
    p.querySelector(".info-btn").setAttribute("aria-expanded", "false");
  });
  document.body.classList.remove("popup-open");
  document
    .querySelectorAll(".is-spotlit")
    .forEach((el) => el.classList.remove("is-spotlit"));
}

// Moves a popup back inside the window, or inside the plan panel when it is
// in there (the panel clips its contents).
function keepOnScreen(el) {
  const margin = 8;
  el.style.translate = ""; // clear the previous offset
  // Measure at full size; the opening animation starts scaled down.
  el.style.animation = "none";
  const box = el.getBoundingClientRect();
  el.style.animation = "";
  // Panel's inner edges, excluding its scrollbar.
  const panelEl = el.closest(".plan");
  const panel = panelEl?.getBoundingClientRect();
  const right = Math.min(
    document.documentElement.clientWidth,
    panel ? panel.left + panelEl.clientLeft + panelEl.clientWidth : Infinity,
  );
  const left = Math.max(0, panel?.left ?? 0);
  // Vertical limits: the window, or the panel while it scrolls on its own.
  const clipsY = panelEl && getComputedStyle(panelEl).overflowY !== "visible";
  const top = Math.max(0, clipsY ? panel.top : 0);
  // clientHeight, not innerHeight: phones count the hidden toolbar in the
  // latter.
  const bottom = Math.min(
    document.documentElement.clientHeight,
    clipsY ? panel.bottom : Infinity,
  );
  let shift = 0;
  let drop = 0;

  if (box.right > right - margin) {
    shift = right - margin - box.right; // past the right edge
  }
  if (box.left + shift < left + margin) {
    shift = left + margin - box.left; // past the left edge
  }
  if (box.bottom > bottom - margin) {
    drop = bottom - margin - box.bottom; // past the bottom edge
  }
  if (box.top + drop < top + margin) {
    drop = top + margin - box.top; // above the top; wins if both apply
  }
  // `translate`, not `transform`: the opening animation in popups.css uses
  // `scale`.
  el.style.translate = `${shift}px ${drop}px`;
  // Last resort (e.g. the panel is mostly below the window): scroll just
  // far enough to show the popup.
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}
