import test from "node:test";
import assert from "node:assert/strict";

import { createClient, parseLinkHeader, RequestError } from "../scripts/lib/http.mjs";

function jsonResponse(body, init) {
  return new Response(JSON.stringify(body), Object.assign({ status: 200 }, init));
}

// A fetch stand-in that replays a queue of responses and records the requests
// it was asked to make.
function stubFetch(queue) {
  const calls = [];

  async function fetchImpl(url, options) {
    calls.push({ url: url, headers: Object.assign({}, options.headers) });
    const next = queue.shift();

    if (typeof next === "function") {
      return next();
    }

    return next;
  }

  fetchImpl.calls = calls;
  return fetchImpl;
}

function testClient(queue, overrides) {
  const delays = [];
  const client = createClient(
    Object.assign(
      {
        fetch: stubFetch(queue),
        sleep: async function record(ms) {
          delays.push(ms);
        },
        now: function fixedNow() {
          return 1000000;
        },
        random: function noJitter() {
          return 0.5;
        }
      },
      overrides || {}
    )
  );

  client.delays = delays;
  return client;
}

test("link headers drive pagination", function () {
  const links = parseLinkHeader(
    '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"'
  );

  assert.equal(links.next, "https://api.github.com/x?page=2");
  assert.equal(links.last, "https://api.github.com/x?page=5");
  assert.deepEqual(parseLinkHeader(null), {});
  assert.deepEqual(parseLinkHeader(""), {});
});

test("a transient server error is retried instead of aborting the sync", async function () {
  const client = testClient([
    jsonResponse({ message: "Bad gateway" }, { status: 502 }),
    jsonResponse({ login: "bultodepapas" })
  ]);

  const body = await client.getJson("https://api.github.com/users/bultodepapas");

  assert.equal(body.login, "bultodepapas");
  assert.equal(client.stats().retries, 1);
  assert.equal(client.delays.length, 1);
});

test("an unreachable API is retried and then reported clearly", async function () {
  const client = testClient([
    function fail() {
      throw new TypeError("fetch failed");
    },
    function fail() {
      throw new TypeError("fetch failed");
    },
    jsonResponse({ login: "bultodepapas" })
  ]);

  const body = await client.getJson("https://api.github.com/users/bultodepapas");

  assert.equal(body.login, "bultodepapas");
  assert.equal(client.stats().retries, 2);
});

test("retries are bounded", async function () {
  const client = testClient(
    [
      jsonResponse({ message: "boom" }, { status: 503 }),
      jsonResponse({ message: "boom" }, { status: 503 })
    ],
    { maxAttempts: 2 }
  );

  await assert.rejects(
    client.getJson("https://api.github.com/users/bultodepapas"),
    function check(error) {
      assert.ok(error instanceof RequestError);
      assert.equal(error.status, 503);
      assert.equal(error.attempts, 2);
      return true;
    }
  );
});

test("a missing resource is not retried", async function () {
  const client = testClient([jsonResponse({ message: "Not Found" }, { status: 404 })]);

  await assert.rejects(
    client.getJson("https://api.github.com/repos/gone/gone/pulls/1"),
    function check(error) {
      assert.equal(error.status, 404);
      assert.equal(error.retryable, false);
      return true;
    }
  );
  assert.equal(client.delays.length, 0);
});

test("a short rate-limit pause is honoured", async function () {
  const client = testClient([
    jsonResponse(
      { message: "You have exceeded a secondary rate limit." },
      { status: 403, headers: { "retry-after": "2", "x-ratelimit-remaining": "0" } }
    ),
    jsonResponse({ login: "bultodepapas" })
  ]);

  const body = await client.getJson("https://api.github.com/users/bultodepapas");

  assert.equal(body.login, "bultodepapas");
  assert.deepEqual(client.delays, [2000]);
});

// Waiting out a full hour would hang the job, so an exhausted budget must fail
// fast with an actionable message rather than sleep.
test("an exhausted hourly budget fails fast with guidance", async function () {
  const client = testClient([
    jsonResponse(
      { message: "API rate limit exceeded" },
      {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(1000000 / 1000 + 1800)
        }
      }
    )
  ]);

  await assert.rejects(
    client.getJson("https://api.github.com/users/bultodepapas"),
    function check(error) {
      assert.equal(error.retryable, false);
      assert.match(error.message, /rate limit is exhausted/);
      assert.match(error.message, /GITHUB_TOKEN/);
      return true;
    }
  );
  assert.equal(client.delays.length, 0);
});

test("pagination follows the next link until it stops", async function () {
  const client = testClient([
    jsonResponse([{ id: 1 }, { id: 2 }], {
      headers: { link: '<https://api.github.com/x?page=2>; rel="next"' }
    }),
    jsonResponse([{ id: 3 }])
  ]);

  const all = await client.getAllPages("https://api.github.com/x?page=1");

  assert.deepEqual(
    all.map(function id(item) {
      return item.id;
    }),
    [1, 2, 3]
  );
});

test("pagination refuses to run away", async function () {
  const client = testClient(
    [
      jsonResponse([{ id: 1 }], {
        headers: { link: '<https://api.github.com/x?page=2>; rel="next"' }
      }),
      jsonResponse([{ id: 2 }], {
        headers: { link: '<https://api.github.com/x?page=3>; rel="next"' }
      })
    ],
    { maxPages: 2 }
  );

  await assert.rejects(
    client.getAllPages("https://api.github.com/x?page=1"),
    /Narrow the sync query/
  );
});

test("an unexpected payload shape is reported, not silently accepted", async function () {
  const client = testClient([jsonResponse({ message: "surprise" })]);

  await assert.rejects(
    client.getAllPages("https://api.github.com/x", { collectionKey: "items" }),
    /Unexpected paginated response/
  );
});

// A 304 carries no Link header, so the cached entry has to remember where the
// next page was or the second run silently returns a truncated collection.
test("a cached first page still leads to the second page", async function () {
  const queue = [
    jsonResponse([{ id: 1 }], {
      headers: {
        etag: 'W/"page1"',
        link: '<https://api.github.com/x?page=2>; rel="next"'
      }
    }),
    jsonResponse([{ id: 2 }], { headers: { etag: 'W/"page2"' } }),
    new Response(null, { status: 304 }),
    new Response(null, { status: 304 })
  ];
  const client = testClient(queue);

  const first = await client.getAllPages("https://api.github.com/x?page=1", {
    conditional: true
  });
  const second = await client.getAllPages("https://api.github.com/x?page=1", {
    conditional: true
  });

  assert.deepEqual(first, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(second, first);
});

test("conditional requests reuse the cached body on 304", async function () {
  const client = testClient([
    jsonResponse({ login: "bultodepapas" }, { headers: { etag: 'W/"abc"' } }),
    new Response(null, { status: 304 })
  ]);

  const first = await client.getJson("https://api.github.com/users/bultodepapas", {
    conditional: true
  });
  const second = await client.getJson("https://api.github.com/users/bultodepapas", {
    conditional: true
  });

  assert.deepEqual(first, second);
});
