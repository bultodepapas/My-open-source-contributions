# Maintenance

The goal is a record that remains useful after the novelty wears off. The
routine should take minutes, not become another product to operate.

## Weekly routine

1. Open the site and start with **Still in motion**.
2. Open each pull request that needs attention.
3. Reply, rebase, fix CI, or wait deliberately.
4. When meaningful work lands, add a modest <code>summary</code> and decide
   whether it deserves <code>featured: true</code>.
5. Run <code>npm test</code> and <code>npm run validate -- --strict</code>.

The GitHub workflow refreshes facts each Monday. Use its manual trigger after
an important merge if you want the site updated immediately.

## Contribution curation

The generated ID is the full repository name plus the pull-request number:

~~~json
{
  "contributions": {
    "EdgeTX/edgetx#7613": {
      "featured": true,
      "summary": "Made simulator numeric parsing deterministic across host locales."
    }
  }
}
~~~

Write summaries for people who do not know the codebase. State what changed;
do not claim adoption, performance, or user impact without evidence.

Use <code>hidden: true</code> only to remove noise from the presentation. The
underlying public record remains in <code>data/generated/github.json</code>.

## Status meanings

| Status | Meaning |
| --- | --- |
| Open | GitHub reports the pull request as open |
| Draft | Open, but marked as draft |
| Merged | GitHub reports a merge timestamp |
| Closed | Closed without a merge timestamp |

Merged does not necessarily mean released. Do not describe a contribution as
shipped unless a release, changelog, or other source verifies it.

## Project curation

Owned public repositories are discovered automatically. Forks and archived
repositories are not shown in the independent-project list.

Use curation to make titles understandable:

~~~json
{
  "projects": {
    "bultodepapas/salmandra": {
      "featured": true,
      "summary": "An open, 3D-printed FPV aircraft platform with traceable design decisions."
    }
  }
}
~~~

Set <code>hidden: true</code> for experiments that should remain accessible on
GitHub but do not belong in the public index.

## Local sync

Without a token, GitHub allows a small number of API requests per hour. The
sync only refetches pull requests GitHub reports as changed, so an ordinary run
costs a handful of requests, but a token is still recommended:

~~~powershell
$env:GITHUB_TOKEN = "your-token"
npm run sync
npm run validate
Remove-Item Env:GITHUB_TOKEN
~~~

Add <code>-- --dry-run</code> to see what would change without writing.

The script writes a new <code>generatedAt</code> value only when public facts
change. A scheduled run with no changes produces no noisy commit.

## What the sync refuses to do

The published record is the product, so the sync would rather do nothing than
publish something worse:

- it retries transient failures with backoff instead of aborting;
- it degrades a single unreachable pull request to <code>null</code> counters,
  which the site renders as an em dash, rather than dropping the entry;
- it fails outright if more than a fifth of the pull requests could not be
  refreshed;
- it refuses to write an empty record, or one that lost more than a quarter of
  its contributions or projects, because that is almost always a partial API
  answer rather than deleted work;
- it writes through a temporary file and renames, so a crash cannot leave a
  half-written snapshot behind.

## Validation strictness

<code>npm run validate</code> reports two kinds of problem. Contract errors
always fail. Curation drift — a curated note pointing at work that has fallen
out of the snapshot — is a warning on the publishing path and an error under
<code>--strict</code>, which is what pull requests run. This keeps an upstream
change from taking the site down while still surfacing the editorial work.

## When something breaks

- **The site says data is unavailable:** serve it through HTTP instead of
  opening <code>index.html</code> directly.
- **The sync returns HTTP 403:** the client already retries and reports how
  long the limit needs to reset. If it gives up, provide a token.
- **The run opened a failure issue:** the site is still serving the last good
  snapshot. Read the run summary for which pull requests degraded, then close
  the issue once a later run succeeds.
- **A pull request shows an em dash instead of changed lines:** its counters
  could not be refreshed. The next successful sync restores them.
- **The scheduled workflow stopped:** public-repository schedules can be
  disabled after 60 days without activity; run it manually.
- **The workflow cannot push:** confirm that Actions may write repository
  contents in Settings → Actions → General.
- **Pages does not deploy:** confirm Settings → Pages → Source is GitHub
  Actions.
- **The deploy fails on the reference check:** the page points at a file the
  staging step does not publish. Add it to <code>PUBLISHED</code> in
  <code>scripts/stage-site.mjs</code>; the check exists so this is caught
  before the site ships, not after.

## Verifying the workflows without pushing

Workflow changes are easy to get wrong and expensive to debug through trial
commits. Two tools cover most of it locally:

~~~bash
actionlint                                    # expressions, contexts, shell
act pull_request -W .github/workflows/validate.yml
act workflow_dispatch -W .github/workflows/sync-github.yml -j sync
~~~

Three things cannot be checked this way and only a real run proves them: the
GitHub Pages actions, the <code>git push</code> in the sync job, and the deploy
job's checkout of the branch head, because <code>act</code> supplies no
<code>github.token</code>.

## Privacy check before every curated note

- Is every referenced repository public?
- Does the text name a private client, person, branch, or vulnerability?
- Does it reveal a token, email address, account detail, or unpublished report?
- Is the claim supported by the linked source?

If any answer is uncertain, keep the note out of this public repository.
