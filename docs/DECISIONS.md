# Design and architecture decisions

Research completed on August 13, 2026.

## Product direction

The useful shape is not a generic developer portfolio. It is a hybrid of:

- a public proof-of-work archive;
- a calm operational inbox for open pull requests;
- a curated changelog that explains a few important outcomes;
- an index of independent projects.

GitHub recommends a concise introduction and a small selection of highlighted
work on a developer profile. That supports a strong front door followed by the
complete record:
[Using your profile to enhance your resume](https://docs.github.com/en/account-and-profile/tutorials/using-your-github-profile-to-enhance-your-resume).

The exact source remains essential. GitHub's official filters support author,
state, draft, review, CI, and merge queries:
[Filtering and searching issues and pull requests](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests).

## Inspiration reviewed

- [OSCT](https://osct.onrender.com/) combines an inbox, history, analytics,
  and milestones. The useful lesson is to foreground items that need
  attention, not to reproduce every metric.
- [GitShow](https://gitshow.dev/) clearly separates owned repositories from
  contributions to other projects and always links to the evidence.
- [InstaZDLL](https://instazdll.dev/) makes external contributions scannable
  by showing type, stack, status, repository, and exact pull request.
- [Aasish Raj](https://www.aasishraj.com/) pairs a human title with repository,
  contribution type, status, and source links.
- [Linear Changelog](https://linear.app/changelog/page/1) gives a few changes
  editorial weight while keeping the long tail compact.
- [Developer Portfolios](https://github.com/emmabostian/developer-portfolios)
  is a broad, community-maintained reference set for presentation patterns.

The result borrows principles, not layouts: one dominant first impression,
plain-language contribution titles, restrained status colors, and a dense
ledger below.

## Options considered

| Option | Strength | Cost | Decision |
| --- | --- | --- | --- |
| README only | Durable and nearly maintenance-free | Weak filtering and visual hierarchy | Keep a strong README, but not as the whole product |
| Fully dynamic dashboard | Live data and richer analytics | Authentication, caching, rate limits, more failure modes | Too heavy for the current need |
| GitHub Project only | Excellent board, table, and roadmap views | Less portable, weaker public story, extra auth for automation | Optional future operating view |
| Static site + repo data + sync | Public, portable, filterable, low maintenance | A small amount of JavaScript and workflow code | Chosen |

GitHub Pages supports deploying static files through a custom Actions workflow:
[Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Scheduled Actions run from the default branch and may be delayed at busy
times. Public-repository schedules are disabled after 60 days without
activity:
[Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## Why the repository is the source of truth

A versioned public record is portable, reviewable, and auditable. GitHub's API
provides remote facts, but it should never overwrite human meaning.

The ownership boundary is:

| Human-owned | Machine-owned |
| --- | --- |
| Summary | Remote title |
| Featured selection | Open, merged, or closed state |
| Visibility in the site | Created, updated, closed, and merged dates |
| Next action and review date | Additions, deletions, and file count |
| Interpretation | Repository metadata |

GitHub Projects offers table, board, roadmap, filters, and custom fields:
[About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects).
It remains a useful optional view if the ledger becomes operationally complex.
It is not the initial source of truth because automation for a user Project
requires credentials beyond the repository's standard token:
[Automating Projects using Actions](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions).

## Visual thesis

**Mood:** an editorial field notebook crossed with a precise operations
ledger.

**Material:** warm paper, deep ink, one electric violet accent, thin rules,
large old-style serif typography, and compact utility labels.

**Energy:** grateful and active, without looking promotional.

The first viewport acts as a poster. Later sections become progressively more
operational: open work, selected proof, the full ledger, and owned projects.
Cards are avoided unless the content is itself a discrete interaction.

## Interaction thesis

1. Pull requests enter as a small orbit of real status-colored nodes.
2. Sections reveal with restrained vertical motion and fully respect reduced
   motion preferences.
3. Filters change the ledger immediately and preserve their state in the URL.
4. Rows move only enough to clarify that the original evidence is clickable.

## Metrics deliberately avoided

- contribution streaks;
- a success score;
- ranking repositories by stars;
- presenting changed-line totals as impact;
- implying that merged means released.

The site includes changed-line totals only as quiet scope context. The primary
unit is a reviewable contribution linked to its source.

## Privacy and attribution

GitHub's contribution graph is useful but not a complete inventory:
[Profile contributions reference](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference).

This project only syncs public API data. Curation remains conservative:

- no private repository details;
- no client or embargoed security information;
- no claim of sponsorship or endorsement;
- no impact claim without evidence;
- no ambiguity between a personal project and an upstream contribution.
