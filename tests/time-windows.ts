import test from "ava";
import sinon from "sinon";
import SnapMetrics from "../src/index.js";

let clock: sinon.SinonFakeTimers;
test.before((t) => {
  clock = sinon.useFakeTimers();
});

test.after((t) => {
  clock.restore();
});

test("initialises with correct time windows", (t) => {
  const sm = new SnapMetrics(["10m", "30m", "1h"]);
  t.deepEqual(sm.getCounts(), {
    "10m": 0,
    "30m": 0,
    "1h": 0,
  });
  t.deepEqual(sm.getSums(), {
    "10m": 0,
    "30m": 0,
    "1h": 0,
  });
  t.deepEqual(sm.getAverages(), {
    "10m": 0,
    "30m": 0,
    "1h": 0,
  });
});

test("calculates correctly for multiple logs within the window", (t) => {
  const sm = new SnapMetrics(["1m"]);

  sm.record(100);
  sm.record(200);

  t.deepEqual(sm.getCounts(), {
    "1m": 2,
  });
  t.deepEqual(sm.getSums(), {
    "1m": 100 + 200,
  });
  t.deepEqual(sm.getAverages(), {
    "1m": (100 + 200) / 2,
  });
});

test("removes expired logs correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  sm.record(100);
  clock.tick(30 * 1000); // Forward 30 seconds
  sm.record(200);
  clock.tick(31 * 1000); // Forward another 31 seconds

  t.deepEqual(sm.getCounts(), {
    "1m": 1, // 100 is now expired
  });
  t.deepEqual(sm.getSums(), {
    "1m": 200, // 100 is now expired
  });
  t.deepEqual(sm.getAverages(), {
    "1m": 200, // 100 is now expired
  });
});

test("handles multiple time windows independently", (t) => {
  const sm = new SnapMetrics(["1m", "5m"]);

  sm.record(100);
  clock.tick(30 * 1000); // Forward 30 seconds
  sm.record(200);
  clock.tick(31 * 1000); // Forward another 31 seconds

  t.deepEqual(sm.getCounts(), {
    "1m": 1,
    "5m": 2,
  });
  t.deepEqual(sm.getSums(), {
    "1m": 200,
    "5m": 100 + 200,
  });
  t.deepEqual(sm.getAverages(), {
    "1m": 200,
    "5m": (100 + 200) / 2,
  });
});

test("returns 0 for empty windows", (t) => {
  const sm = new SnapMetrics(["1m", "5m"]);

  t.deepEqual(sm.getCounts(), {
    "1m": 0,
    "5m": 0,
  });
  t.deepEqual(sm.getSums(), {
    "1m": 0,
    "5m": 0,
  });
  t.deepEqual(sm.getAverages(), {
    "1m": 0,
    "5m": 0,
  });

  sm.record(100);
  clock.tick(61 * 1000); // Forward 61 seconds

  t.deepEqual(sm.getCounts(), {
    "1m": 0, // All logs are expired
    "5m": 1,
  });
  t.deepEqual(sm.getSums(), {
    "1m": 0, // All logs are expired
    "5m": 100,
  });
  t.deepEqual(sm.getAverages(), {
    "1m": 0, // All logs are expired
    "5m": 100,
  });
});

test("handles very short time windows", (t) => {
  const sm = new SnapMetrics(["1s"]);

  sm.record(100);
  clock.tick(500); // Forward 0.5 seconds
  sm.record(200);

  t.deepEqual(sm.getCounts(), {
    "1s": 2,
  });
  t.deepEqual(sm.getSums(), {
    "1s": 100 + 200,
  });
  t.deepEqual(sm.getAverages(), {
    "1s": (100 + 200) / 2,
  });

  clock.tick(501); // Forward another 0.5 seconds

  t.deepEqual(sm.getCounts(), {
    "1s": 1, // 100 is now expired
  });
  t.deepEqual(sm.getSums(), {
    "1s": 200, // 100 is now expired
  });
  t.deepEqual(sm.getAverages(), {
    "1s": 200, // 100 is now expired
  });
});

test("throws an error for invalid time windows", (t) => {
  const error1 = t.throws(() => new SnapMetrics(["10x" as "10s"]));
  t.is(error1.message, "Invalid time window format: 10x");

  const error2 = t.throws(() => new SnapMetrics(["1d" as "1s"]));
  t.is(error2.message, "Invalid time window format: 1d");
});

test("handles no logs gracefully", (t) => {
  const sm = new SnapMetrics(["1m", "5m"]);
  t.deepEqual(sm.getCounts(), {
    "1m": 0,
    "5m": 0,
  });
  t.deepEqual(sm.getSums(), {
    "1m": 0,
    "5m": 0,
  });
  t.deepEqual(sm.getAverages(), {
    "1m": 0,
    "5m": 0,
  });
});

test.serial(
  "uses default throttled behaviour when removeExpiredRecordsThrottlingMS is not provided",
  (t) => {
    const sm = new SnapMetrics();
    const removeExpiredRecordsSpy = sinon.spy(
      sm,
      "removeExpiredRecords" as any
    );

    sm.record(100);
    sm.record(200);
    sm.getCounts();

    // Advance the clock by 100ms, which should trigger removeExpiredRecords via getCounts.
    clock.tick(100);

    sm.getAverages();
    clock.tick(60); // Advance the clock by 60ms (no throttled action expected yet).
    sm.record(300);

    // Advance the clock by 40ms, completing the throttling period,
    // which should trigger removeExpiredRecords via the record call.
    clock.tick(40);

    t.is(removeExpiredRecordsSpy.callCount, 2);
  }
);

test.serial(
  "uses unthrottled behaviour when removeExpiredRecordsThrottlingMS is false",
  (t) => {
    const sm = new SnapMetrics({ removeExpiredRecordsThrottlingMS: false });
    const removeExpiredRecordsSpy = sinon.spy(
      sm,
      "removeExpiredRecords" as any
    );

    sm.record(100);
    sm.record(200);
    sm.getCounts();

    clock.tick(100);

    sm.getAverages();

    clock.tick(60);

    sm.record(300);

    clock.tick(40);

    t.is(removeExpiredRecordsSpy.callCount, 5);
  }
);
