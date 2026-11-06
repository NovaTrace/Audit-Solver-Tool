// bookmarklet/overlay.js — the small panel the bookmarklet shows on the
// audit page: progress, errors, and the Send / Download / Copy buttons.
//
// It lives inside a Shadow DOM, a private corner of the page whose styles
// can't leak in or out, so the audit site's CSS can't break it and ours
// can't break the audit page.

const STYLE = `
  .box { position: fixed; top: 16px; right: 16px; z-index: 2147483647;
    width: 300px; padding: 14px 16px; border-radius: 8px;
    background: #fff; color: #1c3547; border: 1px solid #1f7a8c;
    box-shadow: 0 6px 24px rgba(0,0,0,.18);
    font: 13px/1.5 system-ui, sans-serif; }
  h2 { margin: 0 0 6px; font: 600 13px ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: .5px; color: #0f4e59; }
  p { margin: 0 0 10px; }
  .error { color: #ad3f38; }
  .buttons { display: flex; flex-wrap: wrap; gap: 6px; }
  button { font: 12px ui-monospace, monospace; padding: 6px 10px;
    border-radius: 6px; border: 1px solid #1f7a8c; background: #fff;
    color: #0f4e59; cursor: pointer; }
  button.main { background: #1f7a8c; color: #fff; }
  .close { position: absolute; top: 6px; right: 8px; border: none;
    padding: 2px 6px; font-size: 16px; }
`;

/** Show the panel. Returns { status, ready, error, close }. */
export function showOverlay() {
  const host = document.createElement("div");
  host.id = "audit-solver-overlay";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="box" role="dialog" aria-label="Audit Solver">
      <button class="close" aria-label="Close">×</button>
      <h2>Audit Solver</h2>
      <p class="msg">Starting…</p>
      <div class="buttons"></div>
    </div>`;
  document.body.append(host);

  const msg = root.querySelector(".msg");
  const buttons = root.querySelector(".buttons");
  const close = () => host.remove();
  root.querySelector(".close").addEventListener("click", close);

  // Our own text only ever goes in through textContent
  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle("error", isError);
  };

  return {
    status: (text) => say(text),
    error: (text) => say(text, true),
    close,
    /** Show the finished buttons. Each action is { label, run, main? }. */
    ready(text, actions) {
      say(text);
      buttons.replaceChildren(
        ...actions.map(({ label, run, main }) => {
          const button = document.createElement("button");
          button.textContent = label;
          if (main) button.className = "main";
          button.addEventListener("click", () => run(say));
          return button;
        }),
      );
    },
  };
}
