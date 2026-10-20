// Sample data used until the audit import exists.
// Everything in this file will eventually be replaced by data parsed
// from the student's uploaded degree audit.

// Semesters shown as term cards and term pills
export const TERMS = [
  { key: "f26", label: "Fall ’26" },
  { key: "s27", label: "Spring ’27" },
  { key: "su27", label: "Summer ’27" },
  { key: "f27", label: "Fall ’27" },
  { key: "s28", label: "Spring ’28" },
  { key: "f28", label: "Fall ’28" },
];

// Category names shown as headings in the course list
export const catLabels = {
  "comp-cur": "Compass Curriculum",
  "cs-core": "Computer Science",
  "cs-math": "Computer Science: Mathmatics",
  writing: "Writing / administrative",
};

// Order the categories appear in the course list
export const catOrder = ["comp-cur", "cs-core", "cs-math", "writing"];

// Elective pools: courses with one of these `cat` values count toward the
// pool instead of being individually required
export const poolGroups = {
  "ee-lec": { label: "EE lecture elective", need: 2 },
  "ee-lab": { label: "EE lab elective", need: 1 },
  "cpen-elect": { label: "CpE technical elective", need: 1 },
};

// Hours already completed (placeholder until it comes from the audit)
export const EARNED_HOURS = 126;

// Remaining courses. `dflt` is the term a course starts in (null = unplaced)
export const courses = [
  //Compass Curriculum
  {
    id: "gps1010",
    cat: "comp-cur",
    code: "GPS 1010",
    title: "Gateway Program Seminar",
    sub: "Required for all UCCS students",
    cr: 3,
    term: "Fall & Spring",
    termC: "u",
    prereq: "None",
    preC: "c",
    dflt: "s27",
  },
  {
    id: "pes1110",
    cat: "comp-cur",
    code: "PES 1110",
    title: "General Physics I - Calc Based",
    sub: "Part of Compass Curriculum: Explore - Physical & Natural World",
    cr: 4,
    term: "Fall & Spring",
    termC: "c",
    prereq: "Coreq. MATH 1320 or MATH 1330 or MATH 1350",
    preC: "c",
    dflt: "f27",
  },

  //Computer Science Core
  {
    id: "cs1450",
    cat: "cs-core",
    code: "CS 1450",
    title: "Data Structures and Algorithms",
    sub: "",
    cr: 3,
    term: "Spring, Fall",
    termC: "c",
    prereq: "Confirmed",
    preC: "c",
    dflt: "s27",
  },

  //Computer Science Math
  {
    id: "math1350",
    cat: "cs-math",
    code: "CS 1350",
    title: "Calculus I",
    sub: "",
    cr: 4,
    term: "Spring only",
    termC: "u",
    prereq: "None",
    preC: "u",
    dflt: null,
  },

  //writing/admin
  {
    id: "port4000",
    cat: "writing",
    code: "PORT 4000",
    title: "Professional / Writing Portfolio",
    sub: "",
    cr: 1,
    term: "Runs most terms",
    termC: "i",
    prereq: "~60+ completed credit hours, typically junior year",
    preC: "c",
    dflt: "s27",
  },
];
