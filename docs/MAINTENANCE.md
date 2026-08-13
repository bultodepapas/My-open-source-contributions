# Maintenance

The goal is a record that remains useful after the novelty wears off. The
routine should take minutes, not become another product to operate.

## Weekly routine

1. Open the site and start with **Still in motion**.
2. Open each pull request that needs attention.
3. Reply, rebase, fix CI, or wait deliberately.
4. When meaningful work lands, add a modest <code>summary</code> and decide
   whether it deserves <code>featured: true</code>.
5. Run <code>npm test</code> and <code>npm run validate</code>.

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
current history fits, but a token is recommended:

~~~powershell
$env:GITHUB_TOKEN = "your-token"
npm run sync
npm run validate
Remove-Item Env:GITHUB_TOKEN
~~~

The script writes a new <code>generatedAt</code> value only when public facts
change. A scheduled run with no changes produces no noisy commit.

## When something breaks

- **The site says data is unavailable:** serve it through HTTP instead of
  opening <code>index.html</code> directly.
- **The sync returns HTTP 403:** check the API rate limit and provide a token.
- **The scheduled workflow stopped:** public-repository schedules can be
  disabled after 60 days without activity; run it manually.
- **The workflow cannot push:** confirm that Actions may write repository
  contents in Settings → Actions → General.
- **Pages does not deploy:** confirm Settings → Pages → Source is GitHub
  Actions.

## Privacy check before every curated note

- Is every referenced repository public?
- Does the text name a private client, person, branch, or vulnerability?
- Does it reveal a token, email address, account detail, or unpublished report?
- Is the claim supported by the linked source?

If any answer is uncertain, keep the note out of this public repository.
