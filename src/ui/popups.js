// ui/popups.js — the ⓘ help popups (.info-popup in index.html).
//
// One click listener on the whole page handles all of them: clicking an ⓘ
// button opens its popup, and clicking anywhere else (or pressing Escape)
// closes whichever one is open. Only one is open at a time.
//
// While a popup is open the page is dimmed, except the part it explains:
// the popup's data-spotlight="selector" names it (e.g. ".plan"), and that
// element gets .is-spotlit, which lifts it above the dimming.

export function setupPopups() {
  document.addEventListener("click", (e) => {
    if (e.target.closest(".info-text")) return; // clicks inside a popup: stay open

    const btn = e.target.closest(".info-btn");
    const popup = btn?.closest(".info-popup");
    const wasOpen = popup?.classList.contains("open");

    closeAll(); // every click closes whatever was open...

    if (popup && !wasOpen) {
      // ...then a click on a closed popup's button opens that one
      popup.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.add("popup-open");
      const topic = popup.dataset.spotlight;
      if (topic) document.querySelector(topic)?.classList.add("is-spotlit");
      keepOnScreen(popup.querySelector(".info-text"));
    }
  });

  // Escape closes the open popup and puts the keyboard back on its button,
  // so a keyboard user carries on from where they were
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const openButton = document.querySelector(".info-popup.open .info-btn");
    if (!openButton) return; // nothing open: leave Escape alone
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

// Nudges a popup back inside the window, or inside the plan panel when
// it's in there (the panel scrolls, so it would cut the popup off)
function keepOnScreen(el) {
  const margin = 8;
  el.style.translate = ""; // clear any earlier nudge
  // Measure at full size: the opening animation starts it slightly shrunk
  el.style.animation = "none";
  const box = el.getBoundingClientRect(); // where it is right now
  el.style.animation = "";
  // The panel's inside edges, not counting its scrollbar
  const panelEl = el.closest(".plan");
  const panel = panelEl?.getBoundingClientRect();
  const right = Math.min(
    document.documentElement.clientWidth,
    panel ? panel.left + panelEl.clientLeft + panelEl.clientWidth : Infinity,
  );
  const left = Math.max(0, panel?.left ?? 0);
  let shift = 0;
  let drop = 0;

  if (box.right > right - margin) {
    shift = right - margin - box.right; // off the right edge: move left
  }
  if (box.left + shift < left + margin) {
    shift = left + margin - box.left; // off the left edge: move right
  }
  if (box.top < margin) {
    drop = margin - box.top; // off the top: move down
  }
  // `translate` (not `transform`), so it doesn't fight the opening
  // animation in popups.css, which uses `scale`
  el.style.translate = `${shift}px ${drop}px`;
}
