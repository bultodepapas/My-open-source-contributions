// A small, dependency-free GitHub REST client that survives a bad minute.
//
// Node's fetch has no default timeout and no retries, so a single slow socket
// or a transient 502 used to abort the whole sync. Everything here exists to
// bound that risk: per-request timeouts, retries with jittered backoff,
// rate-limit awareness, conditional requests, and Link-header pagination.

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export const DEFAULTS = {
  timeoutMs: 15000,
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  maxRateLimitWaitMs: 60000,
  maxPages: 10
};

export class RequestError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "RequestError";
    this.status = details.status === undefined ? null : details.status;
    this.url = details.url;
    this.attempts = details.attempts;
    this.retryable = Boolean(details.retryable);
  }
}

export function parseLinkHeader(value) {
  const links = {};

  if (!value) {
    return links;
  }

  value.split(",").forEach(function readLink(part) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);

    if (match) {
      links[match[2]] = match[1];
    }
  });

  return links;
}

export function createClient(options) {
  const config = Object.assign({}, DEFAULTS, options || {});
  const token = config.token || "";
  const fetchImpl = config.fetch || globalThis.fetch;
  const sleep = config.sleep || defaultSleep;
  const now = config.now || defaultNow;
  const random = config.random || Math.random;
  const onRetry = config.onRetry || noop;
  const cache = config.cache instanceof Map ? config.cache : new Map();
  const state = { remaining: null, reset: null, requests: 0, retries: 0 };

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": config.apiVersion || "2022-11-28",
    "User-Agent": config.userAgent || "open-work-index-sync"
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  async function request(url, requestOptions) {
    const conditional = Boolean(requestOptions && requestOptions.conditional);
    let lastError = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      let response = null;

      try {
        state.requests += 1;
        response = await fetchImpl(url, {
          headers: buildHeaders(url, conditional),
          signal: AbortSignal.timeout(config.timeoutMs)
        });
      } catch (cause) {
        lastError = new RequestError(
          "Could not reach GitHub (" + describeCause(cause) + ") [" + url + "]",
          { status: null, url: url, attempts: attempt, retryable: true }
        );

        if (attempt >= config.maxAttempts) {
          throw lastError;
        }

        await pause(attempt, null, lastError);
        continue;
      }

      readRateLimit(response.headers);

      const cached = cache.get(url);

      if (response.status === 304 && cached) {
        // The cached next link travels with the body: a 304 carries no Link
        // header of its own, and losing it would silently truncate a
        // multi-page collection.
        return {
          status: 304,
          body: cached.body,
          headers: response.headers,
          fromCache: true,
          next: cached.next || null
        };
      }

      if (response.ok) {
        const body = await response.json();
        const next = parseLinkHeader(response.headers.get("link")).next || null;

        if (conditional) {
          const etag = response.headers.get("etag");

          if (etag) {
            cache.set(url, { etag: etag, body: body, next: next });
          }
        }

        return {
          status: response.status,
          body: body,
          headers: response.headers,
          fromCache: false,
          next: next
        };
      }

      const failure = await describeFailure(response, url, attempt);
      lastError = failure.error;

      if (!failure.retryable || attempt >= config.maxAttempts) {
        throw lastError;
      }

      await pause(attempt, failure.waitMs, lastError);
    }

    throw lastError;
  }

  async function getJson(url, requestOptions) {
    const result = await request(url, requestOptions);
    return result.body;
  }

  // Walks pagination through the documented Link header instead of guessing
  // from page size, which silently truncates whenever GitHub trims a page.
  async function getAllPages(url, pageOptions) {
    const settings = pageOptions || {};
    const collectionKey = settings.collectionKey;
    const maxPages = settings.maxPages || config.maxPages;
    const all = [];
    let next = url;
    let page = 0;

    while (next) {
      page += 1;

      if (page > maxPages) {
        throw new RequestError(
          "Stopped after " +
            maxPages +
            " pages; GitHub Search caps results at 1,000. Narrow the sync query. [" +
            url +
            "]",
          { status: null, url: url, attempts: page, retryable: false }
        );
      }

      const result = await request(next, settings);
      const items = collectionKey ? result.body[collectionKey] : result.body;

      if (!Array.isArray(items)) {
        throw new RequestError(
          "Unexpected paginated response from GitHub [" + next + "]",
          { status: result.status, url: next, attempts: page, retryable: false }
        );
      }

      all.push(...items);
      next = result.next;
    }

    return all;
  }

  function buildHeaders(url, conditional) {
    const cached = conditional ? cache.get(url) : null;

    if (!cached) {
      return headers;
    }

    return Object.assign({}, headers, { "If-None-Match": cached.etag });
  }

  function readRateLimit(responseHeaders) {
    const remaining = responseHeaders.get("x-ratelimit-remaining");
    const reset = responseHeaders.get("x-ratelimit-reset");

    if (remaining !== null) {
      state.remaining = Number(remaining);
    }

    if (reset !== null) {
      state.reset = Number(reset) * 1000;
    }
  }

  async function describeFailure(response, url, attempt) {
    let message = "";

    try {
      const payload = await response.json();
      message = payload && payload.message ? ": " + payload.message : "";
    } catch {
      message = "";
    }

    const rateLimited = isRateLimited(response);
    const waitMs = rateLimited
      ? rateLimitWaitMs(response, now())
      : retryAfterMs(response);
    const waitable = waitMs === null || waitMs <= config.maxRateLimitWaitMs;
    const retryable =
      waitable && (RETRYABLE_STATUS.has(response.status) || rateLimited);

    const hint = rateLimited
      ? token
        ? ". The token's rate limit is exhausted" + resetHint(waitMs) + "."
        : ". The anonymous rate limit is exhausted" +
          resetHint(waitMs) +
          "; retry with GITHUB_TOKEN set."
      : "";

    return {
      retryable: retryable,
      waitMs: waitMs,
      error: new RequestError(
        "GitHub API request failed (" +
          response.status +
          ")" +
          message +
          hint +
          " [" +
          url +
          "]",
        {
          status: response.status,
          url: url,
          attempts: attempt,
          retryable: retryable
        }
      )
    };
  }

  function isRateLimited(response) {
    if (response.status !== 403 && response.status !== 429) {
      return false;
    }

    return (
      response.headers.get("x-ratelimit-remaining") === "0" ||
      response.headers.get("retry-after") !== null
    );
  }

  function rateLimitWaitMs(response, currentTime) {
    const retryAfter = retryAfterMs(response);

    if (retryAfter !== null) {
      return retryAfter;
    }

    const reset = response.headers.get("x-ratelimit-reset");

    if (reset === null) {
      return null;
    }

    return Math.max(0, Number(reset) * 1000 - currentTime);
  }

  function retryAfterMs(response) {
    const retryAfter = response.headers.get("retry-after");

    if (retryAfter === null) {
      return null;
    }

    const seconds = Number(retryAfter);
    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
  }

  async function pause(attempt, waitMs, error) {
    const delay = waitMs === null || waitMs === undefined
      ? backoffMs(attempt)
      : Math.min(waitMs, config.maxRateLimitWaitMs);

    state.retries += 1;
    onRetry({ attempt: attempt, delayMs: delay, error: error });
    await sleep(delay);
  }

  function backoffMs(attempt) {
    const exponential = config.baseDelayMs * Math.pow(2, attempt - 1);
    const capped = Math.min(exponential, config.maxDelayMs);
    return Math.round(capped * (0.7 + random() * 0.6));
  }

  return {
    request: request,
    getJson: getJson,
    getAllPages: getAllPages,
    stats: function stats() {
      return Object.assign({}, state);
    }
  };
}

function resetHint(waitMs) {
  if (waitMs === null || waitMs === undefined) {
    return "";
  }

  return " (resets in " + Math.ceil(waitMs / 1000) + "s)";
}

function describeCause(cause) {
  if (cause && cause.name === "TimeoutError") {
    return "request timed out";
  }

  if (cause && cause.name === "AbortError") {
    return "request aborted";
  }

  return cause instanceof Error ? cause.message : String(cause);
}

function defaultSleep(ms) {
  return new Promise(function wait(resolve) {
    setTimeout(resolve, ms);
  });
}

function defaultNow() {
  return Date.now();
}

function noop() {}
