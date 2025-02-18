import test from "ava";
import sinon from "sinon";
import { SnapMetrics } from "../src/index.js";

let clock: sinon.SinonFakeTimers;
test.before((t) => {
  clock = sinon.useFakeTimers();
});

test.after((t) => {
  clock.restore();
});

test("increments counters correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  sm.increment("api_calls");
  sm.increment("api_calls");
  sm.increment("errors");

  t.deepEqual(sm.getCounters(), {
    "1m": { api_calls: 2, errors: 1 },
  });
});

test("increments by custom values", (t) => {
  const sm = new SnapMetrics(["1m"]);

  sm.increment("bytes", 1024);
  sm.increment("bytes", 512);

  t.deepEqual(sm.getCounters(), {
    "1m": { bytes: 1536 },
  });
});

test("handles multiple time windows for counters", (t) => {
  const sm = new SnapMetrics(["1m", "5m"]);

  sm.increment("api_calls");
  clock.tick(30 * 1000); // Forward 30 seconds
  sm.increment("api_calls");
  clock.tick(31 * 1000); // Forward another 31 seconds

  t.deepEqual(sm.getCounters(), {
    "1m": { api_calls: 1 }, // First increment expired
    "5m": { api_calls: 2 }, // Both increments still valid
  });
});

test("returns empty object for windows with no events", (t) => {
  const sm = new SnapMetrics(["1m"]);

  t.deepEqual(sm.getCounters(), {
    "1m": {},
  });

  sm.increment("api_calls");
  clock.tick(61 * 1000); // Forward 61 seconds

  t.deepEqual(sm.getCounters(), {
    "1m": {}, // All events expired
  });
});

test("handles multiple event types independently", (t) => {
  const sm = new SnapMetrics(["1m"]);

  sm.increment("api_calls");
  sm.increment("errors");
  clock.tick(30 * 1000);
  sm.increment("api_calls");
  sm.increment("bytes", 1024);

  t.deepEqual(sm.getCounters(), {
    "1m": {
      api_calls: 2,
      errors: 1,
      bytes: 1024,
    },
  });
});

test("gets specific counter correctly", (t) => {
  const sm = new SnapMetrics(["1m", "5m"]);

  sm.increment("api_calls");
  sm.increment("api_calls");
  sm.increment("errors");

  t.deepEqual(sm.getCounter("api_calls"), {
    "1m": 2,
    "5m": 2,
  });
  t.deepEqual(sm.getCounter("errors"), {
    "1m": 1,
    "5m": 1,
  });
  t.deepEqual(sm.getCounter("non_existent"), {
    "1m": null,
    "5m": null,
  });
});

test("handles expiration for specific counter", (t) => {
  const sm = new SnapMetrics(["1m", "5m"]);

  sm.increment("api_calls");
  clock.tick(30 * 1000);
  sm.increment("api_calls");
  clock.tick(31 * 1000);

  t.deepEqual(sm.getCounter("api_calls"), {
    "1m": 1, // First increment expired
    "5m": 2, // Both increments still valid
  });
});
