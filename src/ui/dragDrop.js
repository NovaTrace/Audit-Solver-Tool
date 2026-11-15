// src/ui/dragDrop.js — drag a course from one semester card to another.
//
// Uses Pointer Events, so mouse, pen and touch all work:
//   mouse / pen  press a course row and move a few pixels
//   touch        press and hold, then move (a quick swipe still scrolls)
// A copy of the row follows the pointer and the semester under it is
// outlined. Releasing over another semester moves the course; releasing
// elsewhere, or Escape, cancels.
//
// Only rows marked .is-movable (render/schedule.js) can be dragged.
// Knows nothing about the audit. main.js passes in:
//   onMove(id, termKey)   perform the move and redraw
//   warnFor(id, termKey)  "" or the warning to show on the hovered semester
// Used by: main.js.

const MOVE_PX = 6; // mouse movement that starts a drag
const HOLD_MS = 350; // touch hold time before a drag starts
const EDGE_PX = 48; // distance from the top/bottom edge that triggers scrolling
const SCROLL_PX = 8; // scroll step per frame

export function setupDragDrop({ onMove, warnFor }) {
  const grid = document.getElementById("sched-grid");
  let drag = null; // the drag in progress, or a press that may become one

  grid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // left button or touch only
    const row = e.target.closest(".tc.is-movable");
    if (!row) return;
    drag = {
      row,
      id: row.dataset.id,
      from: row.closest(".term-card").dataset.term,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      started: false,
      target: null,
      ghost: null,
      holdTimer: null,
    };
    // Touch must hold still first, so swipes still scroll.
    if (e.pointerType === "touch") {
      drag.holdTimer = setTimeout(() => start(e), HOLD_MS);
    }
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      const moved = Math.hypot(
        e.clientX - drag.startX,
        e.clientY - drag.startY,
      );
      if (moved < MOVE_PX) return;
      if (drag.holdTimer) {
        cancel(); // moved before the hold finished: a scroll
        return;
      }
      start(e);
    }
    follow(e);
  });

  document.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.started && drag.target && drag.target !== drag.from) {
      const { id, target } = drag;
      finish();
      onMove(id, target);
      return;
    }
    finish();
  });

  document.addEventListener("pointercancel", () => drag && finish());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drag?.started) finish();
  });

  // While a touch drag is active, stop the page scrolling under it.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (drag?.started) e.preventDefault();
    },
    { passive: false },
  );

  // A drag that began on the grip must not also count as a click on it.
  grid.addEventListener(
    "click",
    (e) => {
      if (grid.dataset.justDragged) {
        e.stopPropagation();
        e.preventDefault();
        delete grid.dataset.justDragged;
      }
    },
    true,
  );

  function start(e) {
    clearTimeout(drag.holdTimer);
    drag.holdTimer = null;
    drag.started = true;
    const box = drag.row.getBoundingClientRect();
    drag.offsetX = drag.startX - box.left;
    drag.offsetY = drag.startY - box.top;

    // Copy of the row that follows the pointer.
    const ghost = drag.row.cloneNode(true);
    ghost.classList.add("tc-ghost");
    ghost.style.width = `${box.width}px`;
    ghost.setAttribute("aria-hidden", "true");
    document.body.append(ghost);
    drag.ghost = ghost;

    drag.row.classList.add("is-dragging");
    document.body.classList.add("is-dragging-course");
    follow(e);
    drag.scrollFrame = requestAnimationFrame(scrollLoop);
  }

  function follow(e) {
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.ghost.style.left = `${drag.x - drag.offsetX}px`;
    drag.ghost.style.top = `${drag.y - drag.offsetY}px`;
    updateTarget();
  }

  // Finds the semester under the pointer (the ghost ignores pointer events).
  // Also called after scrolling, when a different semester may be under a
  // pointer that hasn't moved.
  function updateTarget() {
    const under = document.elementFromPoint(drag.x, drag.y);
    const card = under?.closest(".term-card");
    const target = card?.dataset.term ?? null;
    if (target !== drag.target) {
      clearTarget();
      drag.target = target;
      if (card && target !== drag.from) {
        card.classList.add("is-drop-target");
        const warning = warnFor(drag.id, target);
        if (warning) {
          card.classList.add("is-drop-warn");
          card.dataset.dropWarning = warning;
        }
      }
    }
  }

  // Runs every frame during a drag, so holding a course near an edge keeps
  // scrolling.
  function scrollLoop() {
    if (!drag?.started) return;
    if (autoScroll(drag.y)) updateTarget();
    drag.scrollFrame = requestAnimationFrame(scrollLoop);
  }

  // Scrolls one step if the pointer is near an edge; returns true if it did.
  // The plan panel scrolls when it has its own scrollbar (wide screens);
  // otherwise the page scrolls.
  function autoScroll(y) {
    const panel = grid.closest(".plan");
    const panelScrolls = panel && panel.scrollHeight > panel.clientHeight;
    const box = panelScrolls
      ? panel.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    let step = 0;
    if (y < box.top + EDGE_PX) step = -SCROLL_PX;
    else if (y > box.bottom - EDGE_PX) step = SCROLL_PX;
    if (step === 0) return false;
    if (panelScrolls) panel.scrollTop += step;
    else window.scrollBy(0, step);
    return true;
  }

  function clearTarget() {
    grid.querySelectorAll(".is-drop-target").forEach((card) => {
      card.classList.remove("is-drop-target", "is-drop-warn");
      delete card.dataset.dropWarning;
    });
  }

  function finish() {
    if (drag.started) grid.dataset.justDragged = "true";
    cancel();
  }

  function cancel() {
    clearTimeout(drag.holdTimer);
    cancelAnimationFrame(drag.scrollFrame);
    clearTarget();
    drag.ghost?.remove();
    drag.row.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-course");
    drag = null;
    // The click that ends a drag fires right after pointerup; clear the flag in
    // case it never comes.
    setTimeout(() => delete grid.dataset.justDragged, 0);
  }
}
