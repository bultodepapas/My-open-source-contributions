import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assessSnapshot,
  buildSnapshot,
  serializeSnapshot,
  writeSnapshotAtomically
} from "../scripts/lib/snapshot.mjs";

function snapshotInput(overrides) {
  return Object.assign(
    {
      previous: null,
      timestamp: "2026-08-18T00:00:00.000Z",
      source: { provider: "GitHub", username: "bultodepapas", query: "is:pr" },
      profile: { login: "bultodepapas" },
      contributions: [{ id: "a/b#1" }],
      projects: [{ id: "a/b" }]
    },
    overrides || {}
  );
}

test("the generated timestamp only moves when public facts move", function () {
  const first = buildSnapshot(snapshotInput());
  const unchanged = buildSnapshot(
    snapshotInput({ previous: first, timestamp: "2026-09-01T00:00:00.000Z" })
  );

  assert.equal(unchanged.generatedAt, first.generatedAt);

  const changed = buildSnapshot(
    snapshotInput({
      previous: first,
      timestamp: "2026-09-01T00:00:00.000Z",
      contributions: [{ id: "a/b#1" }, { id: "a/b#2" }]
    })
  );

  assert.equal(changed.generatedAt, "2026-09-01T00:00:00.000Z");
});

test("a first run is always allowed to publish", function () {
  const verdict = assessSnapshot({
    previous: null,
    next: { contributions: [], projects: [] }
  });

  assert.equal(verdict.safe, true);
});

test("an emptied record is refused", function () {
  const verdict = assessSnapshot({
    previous: { contributions: [{ id: "a" }], projects: [{ id: "b" }] },
    next: { contributions: [], projects: [{ id: "b" }] }
  });

  assert.equal(verdict.safe, false);
  assert.match(verdict.reasons.join(" "), /no contributions/);
});

test("a sudden collapse is refused but ordinary movement is not", function () {
  const previous = {
    contributions: Array.from({ length: 20 }, function id(_, index) {
      return { id: "a/b#" + index };
    }),
    projects: []
  };

  const collapsed = assessSnapshot({
    previous: previous,
    next: { contributions: previous.contributions.slice(0, 10), projects: [] }
  });
  assert.equal(collapsed.safe, false);

  const trimmed = assessSnapshot({
    previous: previous,
    next: { contributions: previous.contributions.slice(0, 18), projects: [] }
  });
  assert.equal(trimmed.safe, true);

  const grown = assessSnapshot({
    previous: previous,
    next: {
      contributions: previous.contributions.concat([{ id: "a/b#99" }]),
      projects: []
    }
  });
  assert.equal(grown.safe, true);
});

test("the snapshot is written whole or not at all", async function () {
  const directory = await mkdtemp(path.join(tmpdir(), "open-work-index-"));
  const target = path.join(directory, "github.json");
  const contents = serializeSnapshot(buildSnapshot(snapshotInput()));

  await writeSnapshotAtomically(target, contents);

  assert.equal(await readFile(target, "utf8"), contents);
  assert.deepEqual(await readdir(directory), ["github.json"]);
});

test("the serialized form ends with a newline so diffs stay clean", function () {
  const output = serializeSnapshot(buildSnapshot(snapshotInput()));

  assert.ok(output.endsWith("\n"));
  assert.equal(JSON.parse(output).version, 1);
});
