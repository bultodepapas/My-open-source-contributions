// Copies the publishable site into a staging directory.
//
// The deploy uploads this directory instead of the repository root, so the
// published site carries the page and its data, not the tooling that builds
// them. PUBLISHED is the single place that list lives; check-site.mjs then
// proves nothing the page references was left behind.

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PUBLISHED = [
  ".nojekyll",
  "index.html",
  "styles.css",
  "app.js",
  "assets",
  "data"
];

const target = path.resolve(process.argv[2] || path.join(ROOT, "_site"));

if (target === ROOT) {
  console.error("Refusing to stage the site over the repository root.");
  process.exitCode = 1;
} else {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  for (const entry of PUBLISHED) {
    await cp(path.join(ROOT, entry), path.join(target, entry), {
      recursive: true
    });
  }

  console.log(
    "Staged " +
      PUBLISHED.length +
      " path(s) into " +
      (path.relative(process.cwd(), target) || ".")
  );
}
