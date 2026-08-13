import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [site, curation, github, html] = await Promise.all([
  readJson("data/site.json"),
  readJson("data/curation.json"),
  readJson("data/generated/github.json"),
  readFile(path.join(ROOT, "index.html"), "utf8")
]);

assert.equal(github.version, 1, "GitHub snapshot version must be 1");
assert.equal(
  github.source.username,
  site.owner.username,
  "Site owner and sync username must match"
);
assert.ok(Array.isArray(github.contributions), "Contributions must be an array");
assert.ok(Array.isArray(github.projects), "Projects must be an array");

const contributionIds = validateUniqueItems(
  github.contributions,
  "contribution",
  ["open", "merged", "closed"]
);
const projectIds = validateUniqueItems(github.projects, "project");

Object.keys(curation.contributions || {}).forEach(function knownContribution(id) {
  assert.ok(
    contributionIds.has(id),
    "Curated contribution does not exist in the snapshot: " + id
  );
});

Object.keys(curation.projects || {}).forEach(function knownProject(id) {
  assert.ok(
    projectIds.has(id),
    "Curated project does not exist in the snapshot: " + id
  );
});

[
  "main",
  "attention-list",
  "highlight-list",
  "ledger-rows",
  "project-list"
].forEach(function requiredElement(id) {
  assert.match(
    html,
    new RegExp('id="' + id + '"'),
    "index.html is missing #" + id
  );
});

assert.match(html, /styles\.css/, "index.html must load styles.css");
assert.match(html, /app\.js/, "index.html must load app.js");

console.log(
  "Validated " +
    github.contributions.length +
    " contributions, " +
    github.projects.length +
    " repositories, and the public page contract."
);

async function readJson(relativePath) {
  const contents = await readFile(path.join(ROOT, relativePath), "utf8");
  return JSON.parse(contents);
}

function validateUniqueItems(items, label, allowedStatuses) {
  const ids = new Set();
  const urls = new Set();

  items.forEach(function validateItem(item) {
    assert.ok(item.id, "Every " + label + " needs an id");
    assert.ok(!ids.has(item.id), "Duplicate " + label + " id: " + item.id);
    ids.add(item.id);

    assert.match(
      item.url,
      /^https:\/\/github\.com\//,
      label + " must link to GitHub: " + item.id
    );
    assert.ok(!urls.has(item.url), "Duplicate " + label + " URL: " + item.url);
    urls.add(item.url);

    if (allowedStatuses) {
      assert.ok(
        allowedStatuses.includes(item.status),
        "Invalid status on " + item.id + ": " + item.status
      );
    }
  });

  return ids;
}
