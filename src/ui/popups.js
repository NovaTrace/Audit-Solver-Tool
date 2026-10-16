export function setupPopups() {
  document.addEventListener("click", (e) => {
    if (e.target.closest(".info-text")) return;

    const btn = e.target.closest(".info-btn");
    const popup = btn?.closest(".info-popup");
    const wasOpen = popup?.classList.contains("open");

    closeAll();

    if (popup && !wasOpen) {
      // ...then reopens the clicked one
      popup.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.add("popup-open");
      keepOnScreen(popup.querySelector(".info-text"));
    }
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

  if (box.right > window.innerWidth - margin) {
    shift = window.innerWidth - margin - box.right; // off the right edge: move left
  }
  if (box.left + shift < margin) {
    shift = margin - box.left; // off the left edge: move right
  }
  el.style.transform = `translateX(${shift}px)`;
}
