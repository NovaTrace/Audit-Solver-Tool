// Fills in the page's header and footer from the audit's student info:
//   #student-info   name, degree, programs and minors
//   #stat-catalog / #stat-audit / #stat-sheet   the catalog box
//   #source-note    the footer line saying where the data came from
//
// Text is always set with textContent, so imported data can never be run
// as HTML.

/** Redraws the header and footer. `isSample` is true while the demo shows. */
export function renderHeader(audit, { isSample, now }) {
  const { student, source } = audit;

  // Name, then one "· ..." line per detail that exists
  const lines = [student.name, `· ${student.degreeTitle}`];
  const programs = student.programs ?? [];
  const majors = programs.filter((p) => p.includes("-") && !p.endsWith("-MIN"));
  const minors = programs
    .filter((p) => p.endsWith("-MIN"))
    .map((p) => p.replace("-MIN", ""));
  if (majors.length > 1) lines.push(`· Programs: ${majors.join(" + ")}`);
  if (minors.length) lines.push(`· Minors: ${minors.join(", ")}`);
  setLines(document.getElementById("student-info"), lines);

  // Catalog box
  setText("stat-catalog", student.catalogYear ?? "—");
  setText("stat-audit", formatDate(student.preparedOn));
  setText("stat-sheet", formatDate(now));

  // Footer
  setText(
    "source-note",
    isSample
      ? "Showing sample data for a made-up student. Load your own audit above to plan your degree."
      : `Sources: your degree audit, prepared ${formatDate(student.preparedOn)}` +
          ` (imported from ${source.type}).`,
  );
}

// "Nov 5, 2026" from a Date or a date string; "—" when there's no date
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

// Several lines of text with <br> between them, built without innerHTML
function setLines(element, lines) {
  const nodes = lines.flatMap((line, i) =>
    i === 0 ? [line] : [document.createElement("br"), line],
  );
  element.replaceChildren(...nodes);
}
