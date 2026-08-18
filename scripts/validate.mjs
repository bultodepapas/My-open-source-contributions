// Checks the published record before it ships.
//
// Two kinds of problem live here and they deserve different consequences:
//
//   * Contract errors mean the site would be wrong or broken. They always fail.
//   * Curation drift means a curated note now points at work that has fallen
//     out of the snapshot. That is a real editorial signal, but it is caused by
//     upstream movement, so on the publishing path it must not take the site
//     down. Pass --strict (used on pull requests) to treat it as an error.

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ELEMENTS = [
  "main",
  "attention-list",
  "highlight-list",
  "ledger-rows",
  "project-list"
];

const strict = process.argv.slice(2).includes("--strict");
const errors = [];
const warnings = [];

const [site, curation, github, html] = await Promise.all([
  readJson("data/site.json"),
  readJson("data/curation.json"),
  readJson("data/generated/github.json"),
  readFile(path.join(ROOT, "index.html"), "utf8")
]);

check(github.version === 1, "GitHub snapshot version must be 1");
check(
  github.source && github.source.username === site.owner.username,
  "Site owner and sync username must match"
);
check(Array.isArray(github.contributions), "Contributions must be an array");
check(Array.isArray(github.projects), "Projects must be an array");

const contributionIds = collectIds(github.contributions || [], "contribution", [
  "open",
  "merged",
  "closed"
]);
const projectIds = collectIds(github.projects || [], "project");

Object.keys(curation.contributions || {}).forEach(function knownContribution(id) {
  note(
    contributionIds.has(id),
    "Curated contribution is no longer in the snapshot: " + id
  );
});

Object.keys(curation.projects || {}).forEach(function knownProject(id) {
  note(projectIds.has(id), "Curated project is no longer in the snapshot: " + id);
});

REQUIRED_ELEMENTS.forEach(function requiredElement(id) {
  check(
    new RegExp('id="' + id + '"').test(html),
    "index.html is missing #" + id
  );
});

check(/styles\.css/.test(html), "index.html must load styles.css");
check(/app\.js/.test(html), "index.html must load app.js");

await report();

function check(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

// A soft finding: an error under --strict, otherwise a warning.
function note(condition, message) {
  if (condition) {
    return;
  }

  if (strict) {
    errors.push(message);
  } else {
    warnings.push(message);
  }
}

function collectIds(items, label, allowedStatuses) {
  const ids = new Set();
  const urls = new Set();

  items.forEach(function validateItem(item) {
    check(Boolean(item.id), "Every " + label + " needs an id");
    check(!ids.has(item.id), "Duplicate " + label + " id: " + item.id);
    ids.add(item.id);

    check(
      /^https:\/\/github\.com\//.test(item.url),
      label + " must link to GitHub: " + item.id
    );
    check(!urls.has(item.url), "Duplicate " + label + " URL: " + item.url);
    urls.add(item.url);

    if (allowedStatuses) {
      check(
        allowedStatuses.includes(item.status),
        "Invalid status on " + item.id + ": " + item.status
      );
    }
  });

  return ids;
}

async function report() {
  const headline =
    "Validated " +
    (github.contributions || []).length +
    " contributions, " +
    (github.projects || []).length +
    " repositories, and the public page contract.";

  warnings.forEach(function show(message) {
    console.warn("Warning: " + message);
  });

  errors.forEach(function show(message) {
    console.error("Error: " + message);
  });

  await writeSummary(headline);

  if (errors.length > 0) {
    console.error(
      errors.length + " validation error(s); the record was not accepted."
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    headline +
      (warnings.length > 0
        ? " " + warnings.length + " curation warning(s) need attention."
        : "")
  );
}

async function writeSummary(headline) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return;
  }

  const lines = ["### Validation", "", headline];

  if (warnings.length > 0) {
    lines.push("", "Curation warnings:", "");
    warnings.forEach(function add(message) {
      lines.push("- " + message);
    });
  }

  if (errors.length > 0) {
    lines.push("", "Errors:", "");
    errors.forEach(function add(message) {
      lines.push("- " + message);
    });
  }

  await appendFile(summaryPath, lines.join("\n") + "\n", "utf8");
}

async function readJson(relativePath) {
  const contents = await readFile(path.join(ROOT, relativePath), "utf8");
  return JSON.parse(contents);
}
