// Integration cover for the deploy staging.
//
// The published set is an explicit list, which is exactly the kind of thing
// that rots quietly. These run the real scripts against a temporary directory
// so a forgotten asset fails here rather than on the live site.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function script(name, args) {
  return run(process.execPath, [path.join(ROOT, "scripts", name)].concat(args), {
    cwd: ROOT
  });
}

async function stagedSite() {
  const directory = await mkdtemp(path.join(tmpdir(), "open-work-index-site-"));
  const target = path.join(directory, "_site");

  await script("stage-site.mjs", [target]);
  return { directory: directory, target: target };
}

test("the staged site carries the page, its assets, and its data", async function (t) {
  const site = await stagedSite();
  t.after(function cleanup() {
    return rm(site.directory, { recursive: true, force: true });
  });

  for (const entry of [
    "index.html",
    "styles.css",
    "app.js",
    ".nojekyll",
    "assets/mark.svg",
    "data/generated/github.json"
  ]) {
    const info = await stat(path.join(site.target, entry));
    assert.ok(info.size > 0, entry + " should be staged and non-empty");
  }
});

test("the staged site does not carry the tooling that builds it", async function (t) {
  const site = await stagedSite();
  t.after(function cleanup() {
    return rm(site.directory, { recursive: true, force: true });
  });

  for (const entry of ["scripts", "tests", "docs", "package.json", ".github"]) {
    await assert.rejects(
      stat(path.join(site.target, entry)),
      entry + " should not be published"
    );
  }
});

test("every file the page references is present in the staged site", async function (t) {
  const site = await stagedSite();
  t.after(function cleanup() {
    return rm(site.directory, { recursive: true, force: true });
  });

  const result = await script("check-site.mjs", [site.target]);

  assert.match(result.stdout, /Checked \d+ local reference\(s\)/);
});

test("a missing asset fails the check instead of shipping a broken page", async function (t) {
  const site = await stagedSite();
  t.after(function cleanup() {
    return rm(site.directory, { recursive: true, force: true });
  });

  await rm(path.join(site.target, "assets"), { recursive: true, force: true });

  await assert.rejects(
    script("check-site.mjs", [site.target]),
    function check(error) {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /assets\/mark\.svg/);
      assert.match(error.stderr, /assets\/social-card\.png/);
      return true;
    }
  );
});

test("staging refuses to overwrite the repository root", async function () {
  await assert.rejects(script("stage-site.mjs", [ROOT]), function check(error) {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Refusing to stage/);
    return true;
  });
});
