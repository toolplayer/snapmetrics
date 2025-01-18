# SnapMetrics

**Author**: ToolPlayer

**License**: MIT

## Overview

SnapMetrics is a lightweight, in-memory data processing library for tracking and analysing real-time metrics. It currently supports calculating rolling averages over user-defined time windows, making it suitable for scenarios like tracking page load time, server response time, or session duration.

## Important Note

This package is **native ESM** and does not provide CommonJS support. Ensure your project is configured to work with ESM modules.

## Features

- Flexible support for custom time windows (e.g., `15s`, `1m`, `2h`).
- Real-time calculations of sums, counts, and averages.
- Lightweight and efficient, with minimal dependencies.

## Installation

Install SnapMetrics via npm:

```
npm install snapmetrics
```

## Usage

### Basic Example

Track request durations in an Express application and expose rolling averages:

```js
import express from "express";
import SnapMetrics from "snapmetrics";

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
  res.send('Hello! <a href="/metrics">See metrics</a>');
});

app.get("/metrics", (req, res) => {
  res.json(sm.getAverages());
});

app.listen(3000, () => {
  console.log("Express app listening on port 3000");
});
```

```json
// http://localhost:3000/metrics
{
  "1m": 2.33,
  "5m": 2.15,
  "15m": 2.53
}
```

### Advanced Example with PM2 Integration

Monitor rolling averages using PM2 metrics:

```js
import io from "@pm2/io";
import SnapMetrics from "snapmetrics";

function setupPm2Metrics() {
  const sm = new SnapMetrics();

  const pm2Metrics = {};
  const initialAverages = sm.getAverages();

  for (const key in initialAverages) {
    pm2Metrics[key] = io.metric({ name: `Response Time (${key})`, unit: "ms" });
  }

  setInterval(() => {
    const updatedAverages = sm.getAverages();

    for (const key in updatedAverages) {
      if (pm2Metrics[key]) {
        pm2Metrics[key].set(updatedAverages[key]);
      }
    }
  }, 1000);
}

// Note: The code to record response times into SnapMetrics is not included here.
// You would need to call `sm.record(value)` with the appropriate response time elsewhere in your application.

setupPm2Metrics();
```

## API Reference

### Constructor

```
new SnapMetrics(timeWindowsOrOptions)
```

The constructor accepts either an array of time windows or a configuration options object:

#### Option 1: Pass an Array of Time Windows

- `timeWindows` _(optional)_:

  Array of time windows, formatted as `<integer><unit>` where unit is `s`, `m`, or `h`.

  Defaults to `["1m", "5m", "15m"]`

#### Option 2: Pass a Configuration Options Object

- `options` _(optional)_:

  An object containing the following properties:

  - `timeWindows` _(optional)_:

    Array of time windows, formatted as `<integer><unit>` where unit is `s`, `m`, or `h`. Defaults to `["1m", "5m", "15m"]`.

  - `removeExpiredRecordsThrottlingMS` _(optional)_:

    Time in milliseconds to throttle the removal of expired records. Must be a non-negative number (>= 0) or `false` to disable throttling entirely. Defaults to `100` ms.

  - `debug` _(optional)_:

    Enables logging for debugging. Defaults to `false`.

### Methods

- `record(value: number): void`

  Records a value into all active time windows.

- `recordDuration(fn: () => T | Promise<T>): T | Promise<T>`

  Measures the execution time of a function and records the duration in all time windows. Returns the result of the executed function.

- `getCounts(): Record<TimeWindow, number>`

  Retrieves the count of values for all time windows.

- `getSums(): Record<TimeWindow, number>`

  Retrieves the sum of values for all time windows.

- `getAverages(): Record<TimeWindow, number>`

  Retrieves the rolling averages for all time windows.

## Contribution

Contributions are welcome! Submit issues or pull requests via the GitHub repository.
