import test from "ava";
import { SnapMetrics } from "../src/index.js";

test("records duration (sync)", async (t) => {
  const sm = new SnapMetrics();
  const result = sm.recordDuration(() => {
    for (let i = 0; i < 1e6; i++) {}
    return "sync result";
  });

  t.is(result, "sync result");
  const average = sm.getAverages()["1m"];
  t.true(average !== null && average > 0);
});

test("records duration (async)", async (t) => {
  const sm = new SnapMetrics();
  const resultPromise = sm.recordDuration(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return "async result";
  });
  const result = await resultPromise;

  t.true(resultPromise instanceof Promise);
  t.is(result, "async result");
  const average = sm.getAverages()["1m"];
  t.true(average !== null && average >= 200);
});
