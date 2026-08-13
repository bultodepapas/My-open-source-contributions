import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("draft is an open-state modifier, not a replacement for closed status", function () {
  const closedDraft = github.contributions.find(function findClosedDraft(item) {
    return item.draft && item.status === "closed";
  });

  assert.ok(closedDraft, "The current snapshot should keep the closed draft fixture");
  assert.equal(closedDraft.status, "closed");
});
