import test from "ava";
import SnapMetrics from "../src/index.ts";

test("calculates median correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  // Odd number of values
  [1, 3, 2].forEach((v) => sm.record(v));
  t.deepEqual(sm.getMedians(), { "1m": 2 });

  // Even number of values (should interpolate between middle values)
  sm.record(4);
  t.deepEqual(sm.getMedians(), { "1m": (2 + 3) / 2 });
});

test("calculates percentiles correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  Array.from({ length: 10 }, (_, i) => i + 1).forEach((v) => sm.record(v));

  t.deepEqual(sm.getPercentiles(0), { "1m": 1 }); // 0th percentile
  t.deepEqual(sm.getPercentiles(10), { "1m": 1.9 }); // 10th percentile
  t.deepEqual(sm.getPercentiles(50), { "1m": 5.5 }); // 50th percentile
  t.deepEqual(sm.getPercentiles(90), { "1m": 9.1 }); // 90th percentile
  t.deepEqual(sm.getPercentiles(100), { "1m": 10 }); // 100th percentile
});

test("throws error for invalid percentiles", (t) => {
  const sm = new SnapMetrics(["1m"]);

  const error1 = t.throws(() => sm.getPercentiles(-1));
  t.is(error1.message, "Percentile must be between 0 and 100");

  const error2 = t.throws(() => sm.getPercentiles(101));
  t.is(error2.message, "Percentile must be between 0 and 100");
});

test("calculates minimum values correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  [5, 3, 8, 1, 4].forEach((v) => sm.record(v));
  t.deepEqual(sm.getMinimums(), { "1m": 1 });
});

test("calculates maximum values correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  [5, 3, 8, 1, 4].forEach((v) => sm.record(v));
  t.deepEqual(sm.getMaximums(), { "1m": 8 });
});

test("calculates standard deviation correctly", (t) => {
  const sm = new SnapMetrics(["1m"]);

  // Values: 2, 4, 6
  // Mean = 4
  // Variance = ((2-4)^2 + (4-4)^2 + (6-4)^2) / 3 = 8/3
  // Std Dev = sqrt(8/3) ≈ 1.6330
  [2, 4, 6].forEach((v) => sm.record(v));

  const stdDevs = sm.getStandardDeviations();
  t.is(Math.round(stdDevs["1m"]! * 10_000) / 10_000, 1.633);
});

test("handles empty windows for all stats", (t) => {
  const sm = new SnapMetrics(["1m"]);

  t.deepEqual(sm.getSums(), { "1m": null });
  t.deepEqual(sm.getAverages(), { "1m": null });
  t.deepEqual(sm.getMedians(), { "1m": null });
  t.deepEqual(sm.getPercentiles(90), { "1m": null });
  t.deepEqual(sm.getMinimums(), { "1m": null });
  t.deepEqual(sm.getMaximums(), { "1m": null });
  t.deepEqual(sm.getStandardDeviations(), { "1m": null });
  t.deepEqual(sm.getMetrics(), {
    "1m": {
      count: 0,
      sum: null,
      average: null,
      median: null,
      percentile90: null,
      percentile95: null,
      minimum: null,
      maximum: null,
      standardDeviation: null,
    },
  });
});

test("handles multiple time windows for all stats", (t) => {
  const sm = new SnapMetrics(["1m"]);

  [1, 2, 3, 4, 5].forEach((v) => sm.record(v));

  t.deepEqual(sm.getSums(), { "1m": 15 });
  t.deepEqual(sm.getAverages(), { "1m": 3 });
  t.deepEqual(sm.getMedians(), { "1m": 3 });
  t.deepEqual(sm.getPercentiles(50), { "1m": 3 });
  t.deepEqual(sm.getMinimums(), { "1m": 1 });
  t.deepEqual(sm.getMaximums(), { "1m": 5 });

  // Standard deviation for 1-5 = sqrt(2) ≈ 1.4142
  // t.is(Math.round(sm.getStandardDeviations()["1m"]! * 10_000) / 10_000, 1.4142);
  t.deepEqual(sm.getStandardDeviations(), { "1m": Math.sqrt(2) });
  t.deepEqual(sm.getMetrics(), {
    "1m": {
      count: 5,
      sum: 15,
      average: 3,
      median: 3,
      percentile90: 4.6,
      percentile95: 4.8,
      minimum: 1,
      maximum: 5,
      standardDeviation: Math.sqrt(2),
    },
  });
});

test("maintains accuracy with large numbers", (t) => {
  const sm = new SnapMetrics(["1m"]);

  [1000000, 2000000, 3000000].forEach((v) => sm.record(v));

  t.deepEqual(sm.getMedians(), { "1m": 2000000 });
  t.deepEqual(sm.getMinimums(), { "1m": 1000000 });
  t.deepEqual(sm.getMaximums(), { "1m": 3000000 });
  t.deepEqual(sm.getPercentiles(50), { "1m": 2000000 });
});

test("getMetrics returns all stats", (t) => {
  const sm = new SnapMetrics(["1m"]);

  [1, 2, 3, 4, 5].forEach((v) => sm.record(v));
  const metrics = sm.getMetrics({ percentiles: [90, 95, 99] });

  t.deepEqual(metrics, {
    "1m": {
      count: 5,
      sum: 15,
      average: 3,
      median: 3,
      percentile90: 4.6,
      percentile95: 4.8,
      percentile99: 4.96,
      minimum: 1,
      maximum: 5,
      standardDeviation: Math.sqrt(2),
    },
  });
});
