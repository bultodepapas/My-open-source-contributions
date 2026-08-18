// Snapshot assembly, safety guards, and durable writes.
//
// The published record is the product. A sync that half-worked must never be
// allowed to overwrite a good snapshot with a worse one, and a crash mid-write
// must never leave a truncated file behind.

import { rename, writeFile } from "node:fs/promises";

export const DEFAULT_MAX_DROP_RATIO = 0.25;

export function buildSnapshot(input) {
  const core = {
    version: 1,
    source: input.source,
    profile: input.profile,
    contributions: input.contributions,
    projects: input.projects
  };

  const previous = input.previous;
  const unchanged = Boolean(previous) && sameCore(previous, core);

  return {
    version: core.version,
    generatedAt:
      unchanged && previous.generatedAt ? previous.generatedAt : input.timestamp,
    source: core.source,
    profile: core.profile,
    contributions: core.contributions,
    projects: core.projects
  };
}

export function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2) + "\n";
}

export function sameCore(previous, core) {
  const previousCore = {
    version: previous.version,
    source: previous.source,
    profile: previous.profile,
    contributions: previous.contributions,
    projects: previous.projects
  };

  return JSON.stringify(previousCore) === JSON.stringify(core);
}

// Refuses obviously broken results: an empty record, or a sudden collapse that
// almost always means a partial API answer rather than deleted work.
export function assessSnapshot(options) {
  const previous = options.previous;
  const next = options.next;
  const maxDropRatio =
    options.maxDropRatio === undefined
      ? DEFAULT_MAX_DROP_RATIO
      : options.maxDropRatio;
  const reasons = [];

  if (!previous) {
    return { safe: true, reasons: reasons };
  }

  ["contributions", "projects"].forEach(function checkCollection(key) {
    const before = countOf(previous[key]);
    const after = countOf(next[key]);

    if (before === 0) {
      return;
    }

    if (after === 0) {
      reasons.push(
        "the new snapshot has no " +
          key +
          " while the published one has " +
          before
      );
      return;
    }

    const dropped = before - after;

    if (dropped > 0 && dropped / before > maxDropRatio) {
      reasons.push(
        key +
          " fell from " +
          before +
          " to " +
          after +
          ", more than the " +
          Math.round(maxDropRatio * 100) +
          "% guard allows"
      );
    }
  });

  return { safe: reasons.length === 0, reasons: reasons };
}

// Write to a sibling temporary file and rename over the target, so readers
// only ever observe a complete snapshot.
export async function writeSnapshotAtomically(targetPath, contents) {
  const temporaryPath = targetPath + ".tmp";

  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, targetPath);
}

function countOf(value) {
  return Array.isArray(value) ? value.length : 0;
}
