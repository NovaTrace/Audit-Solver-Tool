// ui/popups.js — the ⓘ help popups (.info-popup in index.html).
//
// One click listener on the whole page handles all of them: clicking an ⓘ
// button opens its popup, and clicking anywhere else (or pressing Escape)
// closes whichever one is open. Only one is open at a time.

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
}

function keepOnScreen(el) {
  const margin = 8;
  el.style.transform = ""; // clear any earlier nudge
  const box = el.getBoundingClientRect(); // where it is right now
  let shift = 0;
  let drop = 0;

  if (box.right > window.innerWidth - margin) {
    shift = window.innerWidth - margin - box.right; // off the right edge: move left
  }
  if (box.left + shift < margin) {
    shift = margin - box.left; // off the left edge: move right
  }
  if (box.top < margin) {
    drop = margin - box.top; // off the top: move down
  }
  el.style.transform = `translate(${shift}px, ${drop}px)`;
}
