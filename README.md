# Audit Solver

A degree planner for students attending schools belonging to the University of Colorado. Import your degree audit, then plan
your remaining courses semester by semester to find hidden conflicts.

**Use it here: https://novatrace.github.io/Audit-Solver-Tool/**

Version 1.0.0 · Quinn Hackenberg, Zoe Hall, Bryson Nguyen​

## What it does

- **Imports your audit** with a one-click bookmarklet on the audit site, or
  from an audit PDF.
- **Builds a plan**: place courses into semesters, add or remove semesters,
  add your own courses, and switch off requirements you aren't pursuing.
- **Checks the plan**: warns about missing prerequisites, course offerings, and semesters course    limits.

Full feature list: [v1.0.0 release notes](https://github.com/NovaTrace/Audit-Solver-Tool/releases/tag/v1.0.0)

## How to use it

1. Open the planner and drag the **Grab my audit** button to your bookmarks bar.
2. Open your degree audit on the UCCS audit site and click the bookmarklet.
3. Choose **Send** to pass the audit straight to the planner.
4. Place your remaining courses into semesters

Can't use bookmarks? Save your audit as a PDF and use **Import** instead.

## Your data

Audit Solver has no server and no accounts. Your audit stays in your own
browser, and **Export** saves it as a file you can load back later.
**Clear data** removes it from browser memory completely.

## Editing the Code

Needs [Node.js](https://nodejs.org) 22 or newer.

Clone the repository and install Node.js

```bash
git clone https://github.com/NovaTrace/Audit-Solver-Tool
cd Audit-Solver-Tool
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Starts the planner at http://localhost:5173 |
| `npm test` | Runs the tests |
| `npm run lint` | Checks the code for mistakes (ESLint) |
| `npm run format` | Tidies the code style (Prettier) |

Every push to `main` runs the tests and, if they pass, publishes the site.

## How the code is laid out

<sub>God help you</sub>
