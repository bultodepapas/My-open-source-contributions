// Refreshes the machine-owned half of the public record.
//
// Design notes worth keeping in mind before changing this file:
//
//   * Search already returns every human-meaningful field. A per-pull-request
//     request is only needed for the diff counters, so unchanged work is never
//     fetched twice.
//   * A single failing pull request degrades that one entry. It does not
//     abort the sync, because a stale counter is better than no published
//     record at all.
//   * Nothing is written unless the result survives the safety guards.

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "./lib/http.mjs";
import {
  canReuseContribution,
  contributionFromSearchItem,
  normalizeProfile,
  normalizeRepository,
  sortByCreated,
  sortByPushed,
  statsFromContribution,
  statsFromPullRequest,
  UNKNOWN_STATS
} from "./lib/normalize.mjs";
import {
  assessSnapshot,
  buildSnapshot,
  serializeSnapshot,
  writeSnapshotAtomically
} from "./lib/snapshot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT, "data", "generated", "github.json");
const USERNAME = process.env.GITHUB_USERNAME || "bultodepapas";
const TOKEN = process.env.GITHUB_TOKEN || "";
const API_ROOT = "https://api.github.com";
const SEARCH_QUERY = "is:pr author:" + USERNAME;
const MAX_DEGRADED_RATIO = 0.2;

main().catch(function reportFailure(error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));

  console.log("Syncing public GitHub work for @" + USERNAME + "…");

  if (!TOKEN) {
    console.warn(
      "No GITHUB_TOKEN set; using the anonymous rate limit of 60 requests per hour."
    );
  }

  const client = createClient({
    token: TOKEN,
    onRetry: function announceRetry(attempt) {
      console.warn(
        "  retrying after " +
          attempt.delayMs +
          "ms (attempt " +
          attempt.attempt +
          "): " +
          attempt.error.message
      );
    }
  });

  const previous = await readPreviousSnapshot();
  const previousById = indexById(previous ? previous.contributions : []);

  const searchUrl =
    API_ROOT +
    "/search/issues?q=" +
    encodeURIComponent(SEARCH_QUERY) +
    "&advanced_search=true&sort=created&order=desc&per_page=100";
  const repositoriesUrl =
    API_ROOT +
    "/users/" +
    encodeURIComponent(USERNAME) +
    "/repos?type=owner&sort=updated&per_page=100";

  // These three answers define the shape of the record. If any of them cannot
  // be trusted there is nothing safe to publish, so failures here are fatal.
  const [profile, searchItems, repositories] = await Promise.all([
    client.getJson(API_ROOT + "/users/" + encodeURIComponent(USERNAME), {
      conditional: true
    }),
    client.getAllPages(searchUrl, { collectionKey: "items", conditional: true }),
    client.getAllPages(repositoriesUrl, { conditional: true })
  ]);

  const tally = { reused: 0, fetched: 0, degraded: 0 };
  const degraded = [];

  const contributions = (
    await mapWithConcurrency(
      searchItems,
      TOKEN ? 8 : 3,
      async function resolveContribution(item) {
        const id = contributionKey(item);
        const known = previousById.get(id) || null;

        if (canReuseContribution(known, item)) {
          tally.reused += 1;
          return known;
        }

        try {
          const pullRequest = await client.getJson(item.pull_request.url);
          tally.fetched += 1;

          return contributionFromSearchItem(item, {
            username: USERNAME,
            stats: statsFromPullRequest(pullRequest)
          });
        } catch (error) {
          tally.degraded += 1;
          degraded.push(id + " (" + error.message + ")");

          // The pull request is still public and still real; only its diff
          // counters are unavailable. Keep whatever was already published.
          return contributionFromSearchItem(item, {
            username: USERNAME,
            stats: known ? statsFromContribution(known) : UNKNOWN_STATS
          });
        }
      }
    )
  ).sort(sortByCreated);

  if (degraded.length > 0) {
    console.warn(
      "Could not refresh " + degraded.length + " pull request(s):"
    );
    degraded.forEach(function report(entry) {
      console.warn("  - " + entry);
    });
  }

  if (
    searchItems.length > 0 &&
    tally.degraded / searchItems.length > MAX_DEGRADED_RATIO
  ) {
    throw new Error(
      "Refusing to publish: " +
        tally.degraded +
        " of " +
        searchItems.length +
        " pull requests could not be refreshed, which is above the " +
        Math.round(MAX_DEGRADED_RATIO * 100) +
        "% tolerance."
    );
  }

  const projects = repositories
    .filter(function publicRepository(repository) {
      return repository.private !== true;
    })
    .map(normalizeRepository)
    .sort(sortByPushed);

  const next = buildSnapshot({
    previous: previous,
    timestamp: new Date().toISOString(),
    source: {
      provider: "GitHub",
      username: USERNAME,
      query: SEARCH_QUERY
    },
    profile: normalizeProfile(profile),
    contributions: contributions,
    projects: projects
  });

  const verdict = assessSnapshot({ previous: previous, next: next });

  if (!verdict.safe) {
    throw new Error(
      "Refusing to publish an implausible snapshot: " +
        verdict.reasons.join("; ") +
        ". The published record was left untouched."
    );
  }

  const output = serializeSnapshot(next);
  const previousOutput = previous ? serializeSnapshot(previous) : "";
  const changed = output !== previousOutput;
  const relativePath = path.relative(ROOT, OUTPUT_PATH);

  if (!changed) {
    console.log("No public metadata changed.");
  } else if (options.dryRun) {
    console.log("Dry run: " + relativePath + " would change but was not written.");
  } else {
    await writeSnapshotAtomically(OUTPUT_PATH, output);
    console.log(
      "Updated " +
        relativePath +
        " with " +
        contributions.length +
        " pull requests and " +
        projects.length +
        " repositories."
    );
  }

  await reportSummary({
    changed: changed,
    dryRun: options.dryRun,
    contributions: contributions.length,
    projects: projects.length,
    tally: tally,
    degraded: degraded,
    stats: client.stats()
  });
}

function parseArguments(argv) {
  return {
    dryRun: argv.includes("--dry-run") || process.env.SYNC_DRY_RUN === "1"
  };
}

function contributionKey(item) {
  const match = String(item.repository_url).match(/\/repos\/([^/]+\/[^/]+)$/);
  return (match ? match[1] : item.repository_url) + "#" + item.number;
}

function indexById(contributions) {
  const index = new Map();

  (contributions || []).forEach(function add(contribution) {
    index.set(contribution.id, contribution);
  });

  return index;
}

async function readPreviousSnapshot() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

// Leaves a short trace in the workflow run so a quiet weekly job stays
// legible without opening the raw log.
async function reportSummary(result) {
  const outcome = result.dryRun
    ? "dry run"
    : result.changed
      ? "snapshot updated"
      : "no change";
  const lines = [
    "### GitHub sync",
    "",
    "- Outcome: **" + outcome + "**",
    "- Pull requests: " +
      result.contributions +
      " (" +
      result.tally.reused +
      " reused, " +
      result.tally.fetched +
      " refetched, " +
      result.tally.degraded +
      " degraded)",
    "- Repositories: " + result.projects,
    "- API requests: " +
      result.stats.requests +
      " (" +
      result.stats.retries +
      " retries)",
    "- Rate limit remaining: " +
      (result.stats.remaining === null ? "unknown" : result.stats.remaining)
  ];

  if (result.degraded.length > 0) {
    lines.push("", "Degraded entries:", "");
    result.degraded.forEach(function add(entry) {
      lines.push("- " + entry);
    });
  }

  console.log(
    "Requests: " +
      result.stats.requests +
      ", retries: " +
      result.stats.retries +
      ", reused: " +
      result.tally.reused +
      ", refetched: " +
      result.tally.fetched +
      ", degraded: " +
      result.tally.degraded +
      "."
  );

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (summaryPath) {
    await appendFile(summaryPath, lines.join("\n") + "\n", "utf8");
  }
}
