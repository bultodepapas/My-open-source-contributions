import test from "node:test";
import assert from "node:assert/strict";

import {
  canReuseContribution,
  classifyContribution,
  contributionFromSearchItem,
  CONTRIBUTION_FIELDS,
  normalizeRepository,
  repositoryFullName,
  statsFromContribution,
  statsFromPullRequest
} from "../scripts/lib/normalize.mjs";

function searchItem(overrides) {
  return Object.assign(
    {
      repository_url: "https://api.github.com/repos/EdgeTX/edgetx",
      number: 7613,
      title: "fix(simu): force C locale for numeric parsing",
      state: "closed",
      draft: false,
      comments: 3,
      html_url: "https://github.com/EdgeTX/edgetx/pull/7613",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-02T10:00:00Z",
      closed_at: "2026-08-02T10:00:00Z",
      pull_request: {
        url: "https://api.github.com/repos/EdgeTX/edgetx/pulls/7613",
        merged_at: "2026-08-02T10:00:00Z"
      }
    },
    overrides || {}
  );
}

test("conventional commit prefixes map to contribution types", function () {
  assert.equal(classifyContribution("feat(simu): unify harness"), "feature");
  assert.equal(classifyContribution("fix: stop the crash"), "fix");
  assert.equal(classifyContribution("chore!: drop the old path"), "maintenance");
  assert.equal(classifyContribution("Docs: explain the sync"), "documentation");
  assert.equal(classifyContribution("Rework the ledger layout"), "other");
  assert.equal(classifyContribution(""), "other");
});

test("repository names come from the API URL, not from string slicing", function () {
  assert.equal(
    repositoryFullName("https://api.github.com/repos/EdgeTX/edgetx-sdcard"),
    "EdgeTX/edgetx-sdcard"
  );
  assert.throws(function reject() {
    repositoryFullName("https://api.github.com/users/bultodepapas");
  }, /Unrecognised repository URL/);
});

test("a merged pull request is reported as merged", function () {
  const contribution = contributionFromSearchItem(searchItem(), {
    username: "bultodepapas"
  });

  assert.equal(contribution.status, "merged");
  assert.equal(contribution.id, "EdgeTX/edgetx#7613");
  assert.equal(contribution.type, "fix");
  assert.equal(contribution.comments, 3);
});

// This rule used to be asserted against whichever pull requests happened to be
// in the live snapshot, which made an ordinary upstream merge break the build.
test("draft is an open-state modifier, not a replacement for closed status", function () {
  const closedDraft = contributionFromSearchItem(
    searchItem({
      state: "closed",
      draft: true,
      pull_request: { url: "https://example.invalid", merged_at: null }
    }),
    { username: "bultodepapas" }
  );

  assert.equal(closedDraft.status, "closed");
  assert.equal(closedDraft.draft, true);

  const openDraft = contributionFromSearchItem(
    searchItem({
      state: "open",
      draft: true,
      closed_at: null,
      pull_request: { url: "https://example.invalid", merged_at: null }
    }),
    { username: "bultodepapas" }
  );

  assert.equal(openDraft.status, "open");
  assert.equal(openDraft.draft, true);
});

test("work in the owner's own repositories is scoped separately", function () {
  const own = contributionFromSearchItem(
    searchItem({
      repository_url: "https://api.github.com/repos/BultoDePapas/edgetx-GR"
    }),
    { username: "bultodepapas" }
  );
  const upstream = contributionFromSearchItem(searchItem(), {
    username: "bultodepapas"
  });

  assert.equal(own.scope, "own");
  assert.equal(upstream.scope, "open-source");
});

test("unavailable diff counters become null rather than breaking the shape", function () {
  const contribution = contributionFromSearchItem(searchItem(), {
    username: "bultodepapas"
  });

  assert.equal(contribution.additions, null);
  assert.equal(contribution.deletions, null);
  assert.equal(contribution.changedFiles, null);
  assert.equal(contribution.reviewComments, null);
  assert.deepEqual(Object.keys(contribution), CONTRIBUTION_FIELDS);
});

test("diff counters are read from either the API or the previous snapshot", function () {
  assert.deepEqual(
    statsFromPullRequest({
      additions: 10,
      deletions: 2,
      changed_files: 3,
      review_comments: 1
    }),
    { additions: 10, deletions: 2, changedFiles: 3, reviewComments: 1 }
  );

  assert.deepEqual(statsFromPullRequest({}), {
    additions: null,
    deletions: null,
    changedFiles: null,
    reviewComments: null
  });

  assert.deepEqual(
    statsFromContribution({
      additions: 5,
      deletions: 6,
      changedFiles: 7,
      reviewComments: 8
    }),
    { additions: 5, deletions: 6, changedFiles: 7, reviewComments: 8 }
  );

  assert.deepEqual(statsFromContribution(null), {
    additions: null,
    deletions: null,
    changedFiles: null,
    reviewComments: null
  });
});

test("a stored entry is reused only when GitHub reports it untouched", function () {
  const item = searchItem();
  const stored = contributionFromSearchItem(item, {
    username: "bultodepapas",
    stats: { additions: 1, deletions: 1, changedFiles: 1, reviewComments: 0 }
  });

  assert.equal(canReuseContribution(stored, item), true);
  assert.equal(
    canReuseContribution(stored, searchItem({ updated_at: "2026-08-09T00:00:00Z" })),
    false
  );
  assert.equal(canReuseContribution(null, item), false);

  const incomplete = Object.assign({}, stored);
  delete incomplete.reviewComments;
  assert.equal(canReuseContribution(incomplete, item), false);
});

test("repository metadata keeps optional fields explicit", function () {
  const project = normalizeRepository({
    full_name: "bultodepapas/salmandra",
    name: "salmandra",
    html_url: "https://github.com/bultodepapas/salmandra",
    stargazers_count: 4,
    forks_count: 1,
    open_issues_count: 0
  });

  assert.equal(project.homepage, null);
  assert.equal(project.description, null);
  assert.equal(project.language, null);
  assert.deepEqual(project.topics, []);
  assert.equal(project.fork, false);
  assert.equal(project.archived, false);
});
