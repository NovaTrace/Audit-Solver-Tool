// =====================================================================
// ui/dragDrop.js — drag a course from one semester card to another
//
// Works with a mouse, a pen or a finger (Pointer Events, not the browser's
// built-in drag and drop, which doesn't work with touch):
//   mouse / pen  press on a course row and move a few pixels
//   touch        press and hold a course row for a moment, then move
//                (a quick swipe still scrolls the page as normal)
// While dragging, a copy of the row follows the pointer and the semester
// under it is outlined. Letting go over another semester moves the course
// there; letting go anywhere else, or pressing Escape, puts it back.
//
// Locked and registered courses can't be dragged (render/schedule.js only
// marks movable rows with .is-movable). The same move is always possible
// without dragging, with the term buttons in the course list.
//
// This file knows nothing about the audit. main.js passes in:
//   onMove(id, termKey)   do the move (state.js) and redraw
//   warnFor(id, termKey)  "" or a reason the course doesn't fit that term,
//                         shown on the outlined semester while hovering
// =====================================================================

const MOVE_PX = 6; // how far a mouse moves before it counts as a drag
const HOLD_MS = 350; // how long a finger presses before a drag starts
const EDGE_PX = 48; // near the plan panel's top/bottom edge: scroll it

export function setupDragDrop({ onMove, warnFor }) {
  const grid = document.getElementById("sched-grid");
  let drag = null; // the drag in progress, or a press that might become one

  grid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // left button / a finger only
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
    // A finger has to hold still first, so swipes still scroll
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
        cancel(); // a finger moved before the hold finished: it's a scroll
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

  // While a finger drags, stop the page scrolling underneath it
  document.addEventListener(
    "touchmove",
    (e) => {
      if (drag?.started) e.preventDefault();
    },
    { passive: false },
  );

  // A drag that began on the grip mustn't also count as a click on it
  // (which would lock the course)
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

    // A copy of the row that follows the pointer
    const ghost = drag.row.cloneNode(true);
    ghost.classList.add("tc-ghost");
    ghost.style.width = `${box.width}px`;
    ghost.setAttribute("aria-hidden", "true");
    document.body.append(ghost);
    drag.ghost = ghost;

    drag.row.classList.add("is-dragging");
    document.body.classList.add("is-dragging-course");
    follow(e);
  }

  function follow(e) {
    drag.ghost.style.left = `${e.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${e.clientY - drag.offsetY}px`;

    // Which semester is under the pointer? (The ghost ignores the pointer,
    // so it doesn't get in the way.)
    const under = document.elementFromPoint(e.clientX, e.clientY);
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
    autoScroll(e.clientY);
  }

  // Dragging near the top or bottom of the plan panel scrolls it, so a
  // semester further down can be reached
  function autoScroll(y) {
    const panel = grid.closest(".plan");
    if (!panel || panel.scrollHeight <= panel.clientHeight) return;
    const box = panel.getBoundingClientRect();
    if (y < box.top + EDGE_PX) panel.scrollTop -= 12;
    else if (y > box.bottom - EDGE_PX) panel.scrollTop += 12;
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
    clearTarget();
    drag.ghost?.remove();
    drag.row.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-course");
    drag = null;
    // The click that ends a drag fires right after pointerup; forget the
    // flag if it never comes (e.g. the pointer was released off the grid)
    setTimeout(() => delete grid.dataset.justDragged, 0);
  }
}
