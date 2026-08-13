const DATA_PATHS = {
  site: "./data/site.json",
  curation: "./data/curation.json",
  github: "./data/generated/github.json"
};

const state = {
  contributions: [],
  projects: [],
  filters: {
    status: "all",
    scope: "all",
    query: ""
  },
  showAllProjects: false
};

let revealObserver;

init();

async function init() {
  setupRevealObserver();
  setupScrollMeter();
  setupLedgerControls();
  setupProjectToggle();
  document.querySelector("#footer-year").textContent = String(new Date().getFullYear());

  try {
    const [site, curation, github] = await Promise.all([
      fetchJson(DATA_PATHS.site),
      fetchJson(DATA_PATHS.curation),
      fetchJson(DATA_PATHS.github)
    ]);

    hydrateSiteCopy(site);
    state.contributions = mergeCuration(
      github.contributions || [],
      curation.contributions || {}
    );
    state.projects = mergeCuration(
      github.projects || [],
      curation.projects || {}
    );

    renderStats(state.contributions);
    renderOrbit(state.contributions);
    renderFreshness(github.generatedAt);
    renderAttention(state.contributions);
    renderHighlights(state.contributions);
    renderLedger();
    renderProjects();
    observeReveals();
  } catch (error) {
    console.error(error);
    renderDataError();
  }
}

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error("Unable to load " + path + " (" + response.status + ")");
  }

  return response.json();
}

function mergeCuration(items, curationById) {
  return items
    .map(function mergeItem(item) {
      return Object.assign({}, item, curationById[item.id] || {});
    })
    .filter(function visibleItem(item) {
      return item.hidden !== true;
    });
}

function hydrateSiteCopy(site) {
  setText("#hero-eyebrow", site.hero && site.hero.eyebrow);
  setText("#hero-statement", site.hero && site.hero.statement);
  setText("#hero-copy", site.hero && site.hero.copy);
  setText("#gratitude-copy", site.gratitude && site.gratitude.copy);
}

function setText(selector, value) {
  const target = document.querySelector(selector);

  if (target && value) {
    target.textContent = value;
  }
}

function renderStats(items) {
  const merged = items.filter(function isMerged(item) {
    return item.status === "merged";
  }).length;
  const open = items.filter(function isOpen(item) {
    return item.status === "open";
  }).length;
  const supported = new Set(
    items
      .filter(function isExternal(item) {
        return item.scope === "open-source";
      })
      .map(function repositoryName(item) {
        return item.repository;
      })
  ).size;

  const stats = {
    total: items.length,
    merged: merged,
    open: open,
    supported: supported
  };

  Object.entries(stats).forEach(function updateStat(entry) {
    const target = document.querySelector('[data-stat="' + entry[0] + '"]');

    if (target) {
      animateNumber(target, entry[1]);
    }
  });
}

function animateNumber(target, value) {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    value === 0
  ) {
    target.textContent = String(value);
    return;
  }

  const duration = 700;
  const start = performance.now();

  function frame(now) {
    const elapsed = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    target.textContent = String(Math.round(value * eased));

    if (elapsed < 1) {
      window.requestAnimationFrame(frame);
    }
  }

  window.requestAnimationFrame(frame);
}

function renderOrbit(items) {
  const svg = document.querySelector("#contribution-orbit");

  if (!svg) {
    return;
  }

  svg.replaceChildren();

  appendSvg(svg, "circle", {
    class: "orbit-ring",
    cx: "280",
    cy: "280",
    r: "205"
  });
  appendSvg(svg, "circle", {
    class: "orbit-ring",
    cx: "280",
    cy: "280",
    r: "246"
  });
  appendSvg(svg, "circle", {
    class: "orbit-ring orbit-ring--accent",
    cx: "280",
    cy: "280",
    r: "226"
  });

  const visibleItems = items.slice(0, 40);
  const total = Math.max(visibleItems.length, 1);

  visibleItems.forEach(function addNode(item, index) {
    const angle = ((index / total) * Math.PI * 2) - Math.PI / 2;
    const radius = index % 3 === 0 ? 246 : 205;
    const x = 280 + Math.cos(angle) * radius;
    const y = 280 + Math.sin(angle) * radius;

    appendSvg(svg, "line", {
      class: "orbit-spoke",
      x1: "280",
      y1: "280",
      x2: x.toFixed(2),
      y2: y.toFixed(2)
    });
    appendSvg(svg, "circle", {
      class: "orbit-node orbit-node--" + item.status,
      cx: x.toFixed(2),
      cy: y.toFixed(2),
      r: item.status === "open" ? "9" : "7",
      style: "animation-delay:" + (index * 35) + "ms"
    });
  });

  appendSvg(svg, "circle", {
    cx: "280",
    cy: "280",
    r: "116",
    fill: "#f2efe6",
    stroke: "rgba(17,18,15,.22)"
  });

  const totalText = appendSvg(svg, "text", {
    class: "orbit-total",
    x: "280",
    y: "294"
  });
  totalText.textContent = String(items.length);

  const label = appendSvg(svg, "text", {
    class: "orbit-label",
    x: "280",
    y: "332"
  });
  label.textContent = "Pull requests";
}

function appendSvg(parent, tag, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);

  Object.entries(attributes).forEach(function setAttribute(entry) {
    node.setAttribute(entry[0], entry[1]);
  });

  parent.appendChild(node);
  return node;
}

function renderFreshness(generatedAt) {
  const freshness = document.querySelector("#data-freshness");

  if (!freshness) {
    return;
  }

  freshness.textContent = generatedAt
    ? "Snapshot updated " + formatDate(generatedAt)
    : "Waiting for the first GitHub sync";
}

function renderAttention(items) {
  const target = document.querySelector("#attention-list");
  const summary = document.querySelector("#open-summary");
  const openItems = items
    .filter(function isOpen(item) {
      return item.status === "open";
    })
    .sort(sortByUpdated)
    .slice(0, 6);

  target.replaceChildren();

  const repositoryCount = new Set(
    openItems.map(function repositoryName(item) {
      return item.repository;
    })
  ).size;

  summary.textContent =
    pluralize(openItems.length, "pull request") +
    " open across " +
    pluralize(repositoryCount, "repository") +
    ".";

  if (openItems.length === 0) {
    target.appendChild(
      createElement("p", "empty-line", "Nothing is waiting right now.")
    );
    return;
  }

  openItems.forEach(function renderAttentionItem(item) {
    const link = createElement("a", "attention-item");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";

    const badge = createStatusBadge(item);
    const titleWrap = createElement("div");
    const title = createElement("h3", "", cleanTitle(item.title));
    const repository = createElement(
      "p",
      "attention-item__repo",
      item.repository + " #" + item.number
    );
    titleWrap.append(title, repository);

    const age = createElement(
      "span",
      "attention-item__age",
      "Updated " + relativeDate(item.updatedAt)
    );
    const arrow = createElement("span", "row-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    const newTab = createElement(
      "span",
      "sr-only",
      " Opens the pull request in a new tab."
    );

    link.append(badge, titleWrap, age, arrow, newTab);
    target.appendChild(link);
  });
}

function renderHighlights(items) {
  const target = document.querySelector("#highlight-list");
  const featured = items
    .filter(function isFeatured(item) {
      return item.featured === true;
    })
    .sort(sortByCreated)
    .slice(0, 4);
  const fallback = items
    .filter(function isMerged(item) {
      return item.status === "merged";
    })
    .sort(sortByCreated)
    .slice(0, 4);
  const selected = featured.length > 0 ? featured : fallback;

  target.replaceChildren();

  selected.forEach(function renderHighlight(item, index) {
    const article = createElement("article", "highlight-item reveal");
    const number = createElement(
      "span",
      "highlight-item__number",
      String(index + 1).padStart(2, "0")
    );
    const meta = createElement("div", "highlight-item__meta");
    meta.append(
      createElement("span", "", item.repository),
      createStatusBadge(item)
    );

    const title = createElement("h3", "", cleanTitle(item.title));
    const summary = createElement(
      "p",
      "",
      item.summary || defaultSummary(item)
    );
    const link = createElement("a", "text-link", "Inspect the pull request ");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.appendChild(createElement("span", "", "↗"));

    article.append(number, meta, title, summary, link);
    target.appendChild(article);
  });
}

function renderLedger() {
  const target = document.querySelector("#ledger-rows");
  const count = document.querySelector("#ledger-count");
  const empty = document.querySelector("#ledger-empty");
  const query = state.filters.query.trim().toLowerCase();
  const filtered = state.contributions
    .filter(function statusMatches(item) {
      return state.filters.status === "all" || item.status === state.filters.status;
    })
    .filter(function scopeMatches(item) {
      return state.filters.scope === "all" || item.scope === state.filters.scope;
    })
    .filter(function queryMatches(item) {
      if (!query) {
        return true;
      }

      return [
        item.title,
        item.repository,
        item.type,
        item.summary
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort(sortByCreated);

  target.replaceChildren();
  count.textContent =
    pluralize(filtered.length, "record") +
    " shown of " +
    state.contributions.length;
  empty.hidden = filtered.length !== 0;

  filtered.forEach(function renderLedgerItem(item) {
    const row = createElement("div", "ledger-row");
    row.setAttribute("role", "row");

    const statusCell = createElement("span");
    statusCell.setAttribute("role", "cell");
    statusCell.appendChild(createStatusBadge(item));

    const titleCell = createElement("span");
    titleCell.setAttribute("role", "cell");
    titleCell.append(
      createElement("span", "ledger-row__title", cleanTitle(item.title)),
      createElement("span", "ledger-row__type", titleCase(item.type))
    );

    const repository = createElement(
      "span",
      "ledger-row__repo",
      item.repository + " #" + item.number
    );
    repository.setAttribute("role", "cell");

    const date = createElement(
      "span",
      "ledger-row__date",
      formatDate(item.createdAt, true)
    );
    date.setAttribute("role", "cell");

    const change = createElement(
      "span",
      "ledger-row__change",
      formatChange(item)
    );
    change.setAttribute("role", "cell");

    const link = createElement("a", "ledger-row__link");
    link.setAttribute("role", "cell");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.setAttribute(
      "aria-label",
      item.title + " in " + item.repository + ", opens in a new tab"
    );
    const arrow = createElement("span", "row-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    link.appendChild(arrow);

    row.append(statusCell, titleCell, repository, date, change, link);
    target.appendChild(row);
  });
}

function renderProjects() {
  const target = document.querySelector("#project-list");
  const toggle = document.querySelector("#show-all-projects");
  const projects = state.projects
    .filter(function isOwned(item) {
      return item.fork !== true;
    })
    .sort(function projectOrder(a, b) {
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return a.featured ? -1 : 1;
      }

      return new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0);
    });
  const visible = state.showAllProjects ? projects : projects.slice(0, 5);

  target.replaceChildren();

  visible.forEach(function renderProject(project) {
    const link = createElement("a", "project-item reveal");
    link.href = project.url;
    link.target = "_blank";
    link.rel = "noreferrer";

    const title = createElement("h3", "", project.name);
    const description = createElement(
      "p",
      "",
      project.summary || project.description || "Documentation in progress."
    );
    const language = createElement(
      "span",
      "project-item__language",
      project.language || "Mixed"
    );
    const arrow = createElement("span", "row-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    const newTab = createElement(
      "span",
      "sr-only",
      " Opens the repository in a new tab."
    );

    link.append(title, description, language, arrow, newTab);
    target.appendChild(link);
  });

  toggle.hidden = projects.length <= 5;
  toggle.firstChild.textContent = state.showAllProjects
    ? "Show selected projects "
    : "Show all " + projects.length + " projects ";
  toggle.setAttribute("aria-expanded", String(state.showAllProjects));
  observeReveals();
}

function createStatusBadge(item) {
  const value = item.draft && item.status === "open" ? "draft" : item.status;
  return createElement(
    "span",
    "status status--" + value,
    titleCase(value)
  );
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function cleanTitle(title) {
  return String(title || "Untitled contribution")
    .replace(/^[a-z]+(?:\([^)]+\))?[!:]\s*/i, "")
    .replace(/\s*\(#[0-9]+\)\s*$/, "")
    .trim();
}

function defaultSummary(item) {
  const kind = titleCase(item.type);
  return (
    kind +
    " contributed to " +
    item.repository +
    ". Open the original pull request for the full context and review history."
  );
}

function formatChange(item) {
  if (
    typeof item.additions !== "number" ||
    typeof item.deletions !== "number"
  ) {
    return "—";
  }

  return "+" + item.additions + " / −" + item.deletions;
}

function formatDate(value, short) {
  if (!value) {
    return "—";
  }

  const options = short
    ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" };

  return new Intl.DateTimeFormat("en-US", options).format(new Date(value));
}

function relativeDate(value) {
  if (!value) {
    return "recently";
  }

  const now = new Date();
  const then = new Date(value);
  const difference = Math.max(
    0,
    Math.floor((now.getTime() - then.getTime()) / 86400000)
  );

  if (difference === 0) {
    return "today";
  }

  if (difference === 1) {
    return "yesterday";
  }

  if (difference < 14) {
    return difference + " days ago";
  }

  return formatDate(value, true);
}

function pluralize(count, noun) {
  const plural =
    noun === "repository" ? "repositories" : noun + (count === 1 ? "" : "s");
  return count + " " + (count === 1 ? noun : plural);
}

function titleCase(value) {
  const text = String(value || "other").replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sortByCreated(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function sortByUpdated(a, b) {
  return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
}

function setupLedgerControls() {
  const search = document.querySelector("#ledger-search");
  const scope = document.querySelector("#scope-filter");
  const buttons = Array.from(document.querySelectorAll("[data-status]"));
  const params = new URLSearchParams(window.location.search);
  const initialStatus = params.get("status");
  const initialScope = params.get("scope");
  const initialQuery = params.get("q");
  const allowedStatuses = ["all", "open", "merged", "closed"];
  const allowedScopes = ["all", "open-source", "own"];

  if (allowedStatuses.includes(initialStatus)) {
    state.filters.status = initialStatus;
  }

  if (allowedScopes.includes(initialScope)) {
    state.filters.scope = initialScope;
  }

  if (initialQuery) {
    state.filters.query = initialQuery;
    search.value = initialQuery;
  }

  scope.value = state.filters.scope;
  updateStatusButtons(buttons);

  search.addEventListener("input", function onSearch(event) {
    state.filters.query = event.target.value;
    updateFilterUrl();
    renderLedger();
  });

  scope.addEventListener("change", function onScope(event) {
    state.filters.scope = event.target.value;
    updateFilterUrl();
    renderLedger();
  });

  buttons.forEach(function bindStatus(button) {
    button.addEventListener("click", function onStatusClick() {
      state.filters.status = button.dataset.status;
      updateStatusButtons(buttons);
      updateFilterUrl();
      renderLedger();
    });
  });
}

function updateStatusButtons(buttons) {
  buttons.forEach(function updateButton(button) {
    const active = button.dataset.status === state.filters.status;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateFilterUrl() {
  const params = new URLSearchParams();

  if (state.filters.status !== "all") {
    params.set("status", state.filters.status);
  }

  if (state.filters.scope !== "all") {
    params.set("scope", state.filters.scope);
  }

  if (state.filters.query.trim()) {
    params.set("q", state.filters.query.trim());
  }

  const query = params.toString();
  const nextUrl =
    window.location.pathname +
    (query ? "?" + query : "") +
    window.location.hash;
  window.history.replaceState({}, "", nextUrl);
}

function setupProjectToggle() {
  const toggle = document.querySelector("#show-all-projects");

  toggle.addEventListener("click", function toggleProjects() {
    state.showAllProjects = !state.showAllProjects;
    renderProjects();
  });
}

function setupScrollMeter() {
  const fill = document.querySelector("#scroll-meter-fill");
  let scheduled = false;

  function update() {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    const progress = available > 0 ? window.scrollY / available : 0;
    fill.style.transform = "scaleX(" + Math.min(1, Math.max(0, progress)) + ")";
    scheduled = false;
  }

  window.addEventListener(
    "scroll",
    function onScroll() {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(update);
      }
    },
    { passive: true }
  );

  update();
}

function setupRevealObserver() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach(function show(element) {
      element.classList.add("is-visible");
    });
    return;
  }

  revealObserver = new IntersectionObserver(
    function onIntersect(entries) {
      entries.forEach(function reveal(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.08
    }
  );

  observeReveals();
}

function observeReveals() {
  const items = document.querySelectorAll(".reveal:not([data-reveal-bound])");

  items.forEach(function observe(item) {
    item.dataset.revealBound = "true";

    if (revealObserver) {
      revealObserver.observe(item);
    } else {
      item.classList.add("is-visible");
    }
  });
}

function renderDataError() {
  document.querySelectorAll(".reveal").forEach(function show(element) {
    element.classList.add("is-visible");
  });

  const banner = createElement(
    "div",
    "error-banner",
    "The public data could not be loaded. Run the site through a local web server or inspect the repository files directly."
  );
  banner.setAttribute("role", "alert");
  document.body.appendChild(banner);

  const attention = document.querySelector("#attention-list");
  attention.replaceChildren(
    createElement("p", "empty-line", "Contribution data is temporarily unavailable.")
  );
  document.querySelector("#open-summary").textContent = "Data unavailable";
  document.querySelector("#ledger-count").textContent = "Data unavailable";
  document.querySelector("#ledger-empty").hidden = false;
}
