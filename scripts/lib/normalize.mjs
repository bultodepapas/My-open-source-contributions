// Pure shaping of public GitHub facts. No network, no filesystem, no clock.
//
// Everything here is deliberately testable in isolation: these are the rules
// that decide what the public record says, so they deserve unit tests rather
// than assertions against whatever the live API happened to return today.

export const CONTRIBUTION_FIELDS = [
  "id",
  "kind",
  "role",
  "scope",
  "repository",
  "number",
  "title",
  "type",
  "status",
  "draft",
  "url",
  "createdAt",
  "updatedAt",
  "closedAt",
  "mergedAt",
  "additions",
  "deletions",
  "changedFiles",
  "comments",
  "reviewComments"
];

export const STAT_FIELDS = [
  "additions",
  "deletions",
  "changedFiles",
  "reviewComments"
];

export const UNKNOWN_STATS = {
  additions: null,
  deletions: null,
  changedFiles: null,
  reviewComments: null
};

const CONTRIBUTION_TYPES = {
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

export function classifyContribution(title) {
  const match = String(title).match(/^([a-z]+)(?:\([^)]+\))?[!:]/i);
  const prefix = match ? match[1].toLowerCase() : "";

  return CONTRIBUTION_TYPES[prefix] || "other";
}

export function repositoryFullName(repositoryUrl) {
  const match = String(repositoryUrl).match(/\/repos\/([^/]+\/[^/]+)$/);

  if (!match) {
    throw new Error("Unrecognised repository URL: " + repositoryUrl);
  }

  return match[1];
}

export function contributionId(item) {
  return repositoryFullName(item.repository_url) + "#" + item.number;
}

// Search results already carry every human-meaningful field. Only the diff
// counters below require a second request per pull request, which is why they
// arrive separately and are allowed to be unknown.
export function contributionFromSearchItem(item, options) {
  const settings = options || {};
  const username = settings.username || "";
  const stats = Object.assign({}, UNKNOWN_STATS, settings.stats || {});
  const repository = repositoryFullName(item.repository_url);
  const owner = repository.split("/")[0];
  const pullRequest = item.pull_request || {};
  const mergedAt = pullRequest.merged_at || null;

  return {
    id: repository + "#" + item.number,
    kind: "pull-request",
    role: "author",
    scope:
      owner.toLowerCase() === username.toLowerCase() ? "own" : "open-source",
    repository: repository,
    number: item.number,
    title: item.title,
    type: classifyContribution(item.title),
    status: mergedAt ? "merged" : item.state,
    draft: Boolean(item.draft),
    url: item.html_url,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    closedAt: item.closed_at,
    mergedAt: mergedAt,
    additions: stats.additions,
    deletions: stats.deletions,
    changedFiles: stats.changedFiles,
    comments: item.comments,
    reviewComments: stats.reviewComments
  };
}

export function statsFromPullRequest(pullRequest) {
  return {
    additions: numberOrNull(pullRequest.additions),
    deletions: numberOrNull(pullRequest.deletions),
    changedFiles: numberOrNull(pullRequest.changed_files),
    reviewComments: numberOrNull(pullRequest.review_comments)
  };
}

export function statsFromContribution(contribution) {
  if (!contribution) {
    return Object.assign({}, UNKNOWN_STATS);
  }

  return {
    additions: numberOrNull(contribution.additions),
    deletions: numberOrNull(contribution.deletions),
    changedFiles: numberOrNull(contribution.changedFiles),
    reviewComments: numberOrNull(contribution.reviewComments)
  };
}

export function hasKnownStats(contribution) {
  const stats = statsFromContribution(contribution);

  return STAT_FIELDS.every(function known(field) {
    return typeof stats[field] === "number";
  });
}

// A previous entry may be reused verbatim only when GitHub reports the pull
// request as untouched and the stored entry already has the current shape.
export function canReuseContribution(previous, item) {
  if (!previous || !item) {
    return false;
  }

  if (previous.updatedAt !== item.updated_at) {
    return false;
  }

  return CONTRIBUTION_FIELDS.every(function present(field) {
    return field in previous;
  });
}

export function normalizeRepository(repository) {
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
}

export function normalizeProfile(profile) {
  return {
    login: profile.login,
    name: profile.name,
    bio: profile.bio,
    location: profile.location,
    url: profile.html_url,
    avatarUrl: profile.avatar_url,
    publicRepositories: profile.public_repos,
    followers: profile.followers,
    createdAt: profile.created_at
  };
}

export function sortByCreated(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

export function sortByPushed(a, b) {
  return new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0);
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
