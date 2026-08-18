# Open Work Index

A public, verifiable record of my open-source pull requests, independent
projects, and work that is still waiting for a response.

> Six months of ChatGPT Pro, paid forward through open source.

[Open the live index](https://bultodepapas.github.io/My-open-source-contributions/)
·
[View my GitHub profile](https://github.com/bultodepapas)

## Why this exists

OpenAI gave me six months of ChatGPT Pro. I wanted my thank-you to be useful
and concrete: build things, contribute fixes and features upstream, document
the work, and keep the evidence public.

This repository also solves a practical problem. Pull requests are spread
across many organizations and personal projects are easy to lose in a profile
grid. The Open Work Index gives me one calm place to see:

- what is open and may need attention;
- what was merged, closed, or is still in review;
- which open-source projects I have supported;
- which independent projects I am building;
- the original source for every claim.

This is an independent personal initiative. It is not affiliated with or
endorsed by OpenAI.

## What is here

The project is intentionally small: static HTML, CSS, browser JavaScript, JSON,
and GitHub Actions. There is no framework, database, account system, analytics,
or package dependency.

~~~text
Public GitHub API ───────→ data/generated/github.json
                                      │
Human curation ──────────→ data/curation.json
                                      │
Site identity and copy ──→ data/site.json
                                      │
                                      ▼
                         static GitHub Pages site
~~~

Automation owns facts such as state, dates, and changed-line totals. I own the
summaries, featured selections, and meaning. The generated file never
overwrites human curation.

## Repository map

| Path | Purpose |
| --- | --- |
| <code>index.html</code> | Semantic page structure |
| <code>styles.css</code> | Editorial visual system and responsive layout |
| <code>app.js</code> | Data rendering, filters, motion, and interaction |
| <code>data/site.json</code> | Name, repository links, gratitude statement |
| <code>data/curation.json</code> | Human summaries, featured work, visibility |
| <code>data/generated/github.json</code> | Machine-owned public GitHub facts |
| <code>scripts/sync-github.mjs</code> | Dependency-free GitHub sync |
| <code>scripts/lib/http.mjs</code> | Retrying, rate-limit-aware GitHub client |
| <code>scripts/lib/normalize.mjs</code> | Pure rules that shape the public record |
| <code>scripts/lib/snapshot.mjs</code> | Snapshot assembly, safety guards, atomic write |
| <code>scripts/validate.mjs</code> | Public-data and page-contract checks |
| <code>scripts/stage-site.mjs</code> | Copies only the publishable site into <code>_site</code> |
| <code>scripts/check-site.mjs</code> | Fails if the page references a file that is not published |
| <code>tests/</code> | Unit tests for the sync rules, contract tests for the snapshot |
| <code>.github/workflows</code> | Validation, weekly sync, and Pages deploy |

## Local preview

Node.js 20 or newer is required for sync and validation. The site itself has
no build step.

From the repository root:

~~~powershell
npm test
npm run validate
npm run serve
~~~

To inspect exactly what the deploy would publish:

~~~powershell
npm run stage
npm run check:site -- _site
~~~

Then open <http://localhost:8000>. A local web server is required because the
browser loads the JSON files with <code>fetch</code>.

## Keep the record current

The scheduled workflow runs every Monday at 13:17 UTC (08:17 in Bogotá). It:

1. searches GitHub for public pull requests authored by
   <code>@bultodepapas</code>;
2. refreshes only the pull requests GitHub reports as changed;
3. validates the result;
4. commits only when meaningful public metadata changed;
5. deploys the same snapshot to GitHub Pages.

It can also be run manually from the Actions tab.

Sync and deploy are separate jobs. A failed sync never blocks publishing: the
site keeps serving the last snapshot that was committed, and a failure issue is
opened so the problem does not pass unnoticed. To preview a sync without
writing anything:

~~~powershell
npm run sync -- --dry-run
~~~

To refresh locally, use a GitHub token for a higher API rate limit:

~~~powershell
$env:GITHUB_TOKEN = "your-token"
npm run sync
Remove-Item Env:GITHUB_TOKEN
~~~

Do not commit the token. The sync only writes public metadata and explicitly
excludes private repositories.

## Curate the story

Edit <code>data/curation.json</code>, not the generated snapshot. Use the exact
pull-request ID or repository name as the key.

Supported contribution fields:

- <code>featured</code>: include the item in Selected Contributions;
- <code>summary</code>: explain the change in plain English;
- <code>hidden</code>: omit an irrelevant public item from the site;

Supported project fields:

- <code>featured</code>;
- <code>summary</code>;
- <code>hidden</code>.

See [Maintenance](docs/MAINTENANCE.md) for the complete routine.

## Publish with GitHub Pages

After the first push:

1. open repository Settings → Pages;
2. set Source to GitHub Actions;
3. run the Deploy Pages workflow, or push to <code>main</code>.

The page is expected at:
<https://bultodepapas.github.io/My-open-source-contributions/>.

The workflows use the current official major releases for
<code>actions/checkout</code>, <code>actions/setup-node</code>, and the Pages
actions. For a public personal repository this keeps the configuration easy to
read. If the project later accepts untrusted contributions, pin third-party
actions to full commit SHAs as an additional supply-chain safeguard.

Scheduled workflows in inactive public repositories may be disabled by GitHub
after 60 days. The manual workflow trigger remains the recovery path.

## Design and architecture

The research, alternatives, sources, and visual thesis are recorded in
[Design and architecture decisions](docs/DECISIONS.md).

The short version: this is a public ledger with a portfolio-quality front
door, not a generic developer dashboard. It favors traceable work and useful
status over streaks, vanity scores, and decorative charts.

## Privacy

Everything committed here is public and versioned. Never add private
repository URLs, client names, embargoed security reports, email addresses,
screenshots containing account details, or notes that should remain private.
Hiding a record in the interface does not make its JSON private.

## License

No license has been selected yet. Until the repository owner deliberately adds
one, standard copyright rules apply.

## Acknowledgements

Thank you to OpenAI for the gift, and to every maintainer who reads, reviews,
tests, improves, merges, or declines one of my contributions. Both outcomes
teach me something.
