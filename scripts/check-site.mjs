// Verifies that every local file the page asks for is actually publishable.
//
// The deploy stages an explicit set of files rather than the whole repository.
// That is easy to get wrong later — add an asset, forget the stage list, ship a
// broken page — so this resolves every reference the site makes and fails when
// one of them would 404. Run it against the staged directory, not the repo.

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.argv[2] || ROOT);
const SOURCES = ["index.html", "app.js", "styles.css"];

const html = await readFile(path.join(root, "index.html"), "utf8");
const base = findBaseUrl(html);
const references = new Set();

for (const source of SOURCES) {
  const contents = await readFile(path.join(root, source), "utf8");

  collectReferences(contents).forEach(function add(reference) {
    const local = toLocalPath(reference, base);

    if (local) {
      references.add(local);
    }
  });
}

const missing = [];

for (const reference of [...references].sort()) {
  const target = path.join(root, reference);

  if (!target.startsWith(root + path.sep)) {
    missing.push(reference + " (escapes the published root)");
    continue;
  }

  try {
    await access(target);
  } catch {
    missing.push(reference);
  }
}

if (missing.length > 0) {
  console.error(
    "The site references " + missing.length + " file(s) that are not published:"
  );
  missing.forEach(function show(reference) {
    console.error("  - " + reference);
  });
  console.error("Checked against " + root);
  process.exitCode = 1;
} else {
  console.log(
    "Checked " +
      references.size +
      " local reference(s) in " +
      (path.relative(process.cwd(), root) || ".")
  );
}

function findBaseUrl(contents) {
  const match = contents.match(
    /<meta\s+property="og:url"\s+content="([^"]+)"/s
  );

  return match ? match[1].replace(/\/$/, "") : null;
}

function collectReferences(contents) {
  const found = [];
  const attribute = /(?:href|src|content)="([^"]+)"/g;
  const cssUrl = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  const relative = /"(\.\/[^"]+)"/g;

  [attribute, cssUrl, relative].forEach(function scan(pattern) {
    let match = pattern.exec(contents);

    while (match !== null) {
      found.push(match[1]);
      match = pattern.exec(contents);
    }
  });

  return found;
}

function toLocalPath(reference, base) {
  const value = reference.trim();

  if (
    value === "" ||
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("//")
  ) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    if (!base || !value.startsWith(base + "/")) {
      return null;
    }

    return stripQuery(value.slice(base.length + 1)) || null;
  }

  // Only genuine file references matter; prose that happens to sit in a meta
  // description is not a path.
  if (!/^\.?\.?\//.test(value) && !/^[\w.-]+\.[\w]{2,5}$/.test(value)) {
    return null;
  }

  return stripQuery(value.replace(/^\.\//, "")) || null;
}

function stripQuery(value) {
  return value.split("?")[0].split("#")[0];
}
