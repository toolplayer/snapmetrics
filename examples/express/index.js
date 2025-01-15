import { performance } from "perf_hooks";
import express from "express";
import SnapMetrics from "../../dist/index.js";

const app = express();
const sm = new SnapMetrics();

app.use((req, res, next) => {
  const startTime = performance.now();
  res.on("finish", () => {
    const duration = performance.now() - startTime;
    sm.record(duration);
  });
  next();
});

app.get("/", (req, res) => {
  res.send("Hello! <a href=\"/metrics\">See metrics</a>");
});

app.get("/metrics", (req, res) => {
  res.json(sm.getAverages());
});

app.listen(3000, () => {
  console.log(`Express app listening on port 3000`);
});
