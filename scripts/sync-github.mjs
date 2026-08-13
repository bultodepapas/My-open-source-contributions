import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT, "data", "generated", "github.json");
const USERNAME = process.env.GITHUB_USERNAME || "bultodepapas";
const TOKEN = process.env.GITHUB_TOKEN || "";
const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";
const SEARCH_QUERY = "is:pr author:" + USERNAME;

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": "open-work-index-sync"
};

if (TOKEN) {
  headers.Authorization = "Bearer " + TOKEN;
}

main().catch(function reportFailure(error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  console.log("Syncing public GitHub work for @" + USERNAME + "…");

  const searchUrl =
    API_ROOT +
    "/search/issues?q=" +
    encodeURIComponent(SEARCH_QUERY) +
    "&sort=created&order=desc&per_page=100";
  const repositoriesUrl =
    API_ROOT +
    "/users/" +
    encodeURIComponent(USERNAME) +
    "/repos?type=owner&sort=updated&per_page=100";

  const [profile, searchItems, repositories] = await Promise.all([
    getJson(API_ROOT + "/users/" + encodeURIComponent(USERNAME)),
    getAllPages(searchUrl, "items"),
    getAllPages(repositoriesUrl)
  ]);

  const pullRequests = await mapWithConcurrency(
    searchItems,
    TOKEN ? 8 : 3,
    async function loadPullRequest(item) {
      return getJson(item.pull_request.url);
    }
  );

  const contributions = pullRequests
    .map(function normalizePullRequest(pullRequest) {
      const repository = pullRequest.base.repo.full_name;
      const owner = pullRequest.base.repo.owner.login;

      return {
        id: repository + "#" + pullRequest.number,
        kind: "pull-request",
        role: "author",
        scope:
          owner.toLowerCase() === USERNAME.toLowerCase()
            ? "own"
            : "open-source",
        repository: repository,
        number: pullRequest.number,
        title: pullRequest.title,
        type: classifyContribution(pullRequest.title),
        status: pullRequest.merged_at ? "merged" : pullRequest.state,
        draft: Boolean(pullRequest.draft),
        url: pullRequest.html_url,
        createdAt: pullRequest.created_at,
        updatedAt: pullRequest.updated_at,
        closedAt: pullRequest.closed_at,
        mergedAt: pullRequest.merged_at,
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
        changedFiles: pullRequest.changed_files,
        comments: pullRequest.comments,
        reviewComments: pullRequest.review_comments
      };
    })
    .sort(sortByCreated);

  const projects = repositories
    .filter(function publicRepository(repository) {
      return repository.private !== true;
    })
    .map(function normalizeRepository(repository) {
      return {
        id: repository.full_name,
        name: repository.name,
        fullName: repository.full_name,
        url: repository.html_url,
        homepage: repository.homepage || null,
        description: repository.description || null,
        language: repository.language || null,
        topics: repository.topics || [],
        fork: Boolean(repository.fork),
        archived: Boolean(repository.archived),
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        openIssues: repository.open_issues_count,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at
      };
    })
    .sort(sortByPushed);

  const nextCore = {
    version: 1,
    source: {
      provider: "GitHub",
      username: USERNAME,
      query: SEARCH_QUERY
    },
    profile: {
      login: profile.login,
      name: profile.name,
      bio: profile.bio,
      location: profile.location,
      url: profile.html_url,
      avatarUrl: profile.avatar_url,
      publicRepositories: profile.public_repos,
      followers: profile.followers,
      createdAt: profile.created_at
    },
    contributions: contributions,
    projects: projects
  };

  const previous = await readPreviousSnapshot();
  const unchanged = previous && sameCore(previous, nextCore);
  const next = Object.assign(
    {
      version: nextCore.version,
      generatedAt:
        unchanged && previous.generatedAt
          ? previous.generatedAt
          : new Date().toISOString()
    },
    {
      source: nextCore.source,
      profile: nextCore.profile,
      contributions: nextCore.contributions,
      projects: nextCore.projects
    }
  );

  const output = JSON.stringify(next, null, 2) + "\n";
  const previousOutput = previous
    ? JSON.stringify(previous, null, 2) + "\n"
    : "";

  if (output === previousOutput) {
    console.log("No public metadata changed.");
    return;
  }

  await writeFile(OUTPUT_PATH, output, "utf8");
  console.log(
    "Updated " +
      path.relative(ROOT, OUTPUT_PATH) +
      " with " +
      contributions.length +
      " pull requests and " +
      projects.length +
      " repositories."
  );
}

async function getJson(url) {
  const response = await fetch(url, { headers: headers });

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    let details = "";

    try {
      const payload = await response.json();
      details = payload.message ? ": " + payload.message : "";
    } catch {
      details = "";
    }

    throw new Error(
      "GitHub API request failed (" +
        response.status +
        ")" +
        details +
        (remaining === "0"
          ? ". The rate limit is exhausted; retry with GITHUB_TOKEN set."
          : "") +
        " [" +
        url +
        "]"
    );
  }

  return response.json();
}

async function getAllPages(baseUrl, collectionKey) {
  const all = [];
  let page = 1;

  while (true) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const payload = await getJson(baseUrl + separator + "page=" + page);
    const items = collectionKey ? payload[collectionKey] : payload;

    if (!Array.isArray(items)) {
      throw new Error("Unexpected paginated response from GitHub.");
    }

    all.push(...items);

    if (items.length < 100) {
      return all;
    }

    page += 1;

    if (page > 10) {
      throw new Error(
        "GitHub Search returns at most 1,000 results. Narrow the sync query."
      );
    }
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

async function readPreviousSnapshot() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function sameCore(previous, nextCore) {
  const previousCore = {
    version: previous.version,
    source: previous.source,
    profile: previous.profile,
    contributions: previous.contributions,
    projects: previous.projects
  };

  return JSON.stringify(previousCore) === JSON.stringify(nextCore);
}

function classifyContribution(title) {
  const match = String(title).match(/^([a-z]+)(?:\([^)]+\))?[!:]/i);
  const prefix = match ? match[1].toLowerCase() : "";
  const types = {
    feat: "feature",
    feature: "feature",
    fix: "fix",
    docs: "documentation",
    doc: "documentation",
    refactor: "refactor",
    test: "test",
    perf: "performance",
    chore: "maintenance",
    build: "build",
    ci: "ci",
    style: "style"
  };

  return types[prefix] || "other";
}

function sortByCreated(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function sortByPushed(a, b) {
  return new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0);
}
