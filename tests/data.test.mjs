// Contract tests for the published snapshot.
//
// These assert invariants that must hold for *any* snapshot. Rules about how a
// particular pull request is shaped belong in normalize.test.mjs, against
// fixtures: asserting them here made an ordinary upstream merge break the build.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { CONTRIBUTION_FIELDS } from "../scripts/lib/normalize.mjs";

const github = JSON.parse(
  await readFile(new URL("../data/generated/github.json", import.meta.url), "utf8")
);
const curation = JSON.parse(
  await readFile(new URL("../data/curation.json", import.meta.url), "utf8")
);

test("the generated snapshot has stable, unique pull-request identifiers", function () {
  const ids = github.contributions.map(function id(item) {
    return item.id;
  });

  assert.equal(new Set(ids).size, ids.length);

  github.contributions.forEach(function contribution(item) {
    assert.match(item.id, /^[^/]+\/[^#]+#[0-9]+$/);
    assert.match(item.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+$/);
  });
});

test("machine facts and human curation stay in separate files", function () {
  github.contributions.forEach(function generatedItem(item) {
    assert.equal("featured" in item, false);
    assert.equal("summary" in item, false);
    assert.equal("nextAction" in item, false);
  });

  assert.ok(Object.keys(curation.contributions).length > 0);
});

test("only public GitHub URLs are published", function () {
  github.projects.forEach(function project(item) {
    assert.match(item.url, /^https:\/\/github\.com\//);
  });
});

test("every contribution carries the full published shape", function () {
  github.contributions.forEach(function contribution(item) {
    assert.deepEqual(
      Object.keys(item),
      CONTRIBUTION_FIELDS,
      "Unexpected shape on " + item.id
    );
  });
});

test("status, draft, and timestamps stay internally consistent", function () {
  github.contributions.forEach(function contribution(item) {
    assert.ok(
      ["open", "merged", "closed"].includes(item.status),
      "Invalid status on " + item.id + ": " + item.status
    );
    assert.equal(typeof item.draft, "boolean", "draft must be a boolean on " + item.id);

    if (item.mergedAt) {
      assert.equal(item.status, "merged", item.id + " has a merge date but is not merged");
    }

    if (item.status === "open") {
      assert.equal(item.mergedAt, null, item.id + " is open but has a merge date");
    } else {
      assert.ok(item.closedAt, item.id + " is not open but has no closing date");
    }
  });
});

// A degraded sync publishes null counters rather than a wrong number. The site
// renders those as "—", so null is a supported value, but a string never is.
test("diff counters are numbers or explicitly unknown", function () {
  github.contributions.forEach(function contribution(item) {
    ["additions", "deletions", "changedFiles", "reviewComments"].forEach(
      function counter(field) {
        const value = item[field];
        assert.ok(
          value === null || typeof value === "number",
          item.id + " has a non-numeric " + field + ": " + value
        );
      }
    );
  });
});
