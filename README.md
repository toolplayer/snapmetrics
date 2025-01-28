# SnapMetrics

**Author**: ToolPlayer

**License**: MIT

## Overview

SnapMetrics is a lightweight, in-memory metrics tracking library that calculates rolling statistics over configurable time windows. It provides:

- **Rolling Statistics**: Calculate averages, medians, minimums, maximums, standard deviations and percentiles over user-defined time windows (e.g. "15s", "1m", "2h")
- **Flexible Time Windows**: Configure multiple concurrent time windows to track metrics over different durations
- **Performance Measurement**: Built-in utilities to measure and record function execution times, with support for both synchronous and asynchronous functions
- **Efficient Processing**: Uses a circular buffer implementation for memory efficiency, with configurable throttling of expired record cleanup

The library is designed to be lightweight and easy to integrate into any JavaScript/TypeScript application needing real-time performance monitoring and statistical analysis.

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

  Records a value into all active time windows. The value is stored with a timestamp and used for calculating various metrics.

- `recordDuration<T>(fn: () => T | Promise<T>): T | Promise<T>`

  Measures the execution time of a synchronous or asynchronous function and records the duration in all time windows. Returns the result of the executed function. For async functions, returns a Promise that resolves to the function result.

- `getCounts(): Record<TimeWindow, number>`

  Returns the count of values for all time windows. Returns a record mapping each time window to its count of recorded values.

- `getSums(): Record<TimeWindow, number | null>`

  Returns the sum of values for all time windows. Returns a record mapping each time window to the sum of its recorded values. Returns null for empty windows.

- `getAverages(): Record<TimeWindow, number | null>`

  Returns the rolling averages for all time windows. Returns a record mapping each time window to the average (mean) of its recorded values. Returns null for empty windows.

- `getMedians(): Record<TimeWindow, number | null>`

  Returns the middle value for each time window using linear interpolation. For an even number of values, uses linear interpolation between the two middle values. Returns null for empty windows.

- `getPercentiles(percentile: number): Record<TimeWindow, number | null>`

  Returns the value below which the given percentage of observations fall, using Hyndman and Fan type 7 linear interpolation method. Takes a percentile value between 0 and 100. Returns null for empty windows.

- `getMinimums(): Record<TimeWindow, number | null>`

  Returns the smallest value recorded within each time window. Returns null for empty windows.

- `getMaximums(): Record<TimeWindow, number | null>`

  Returns the largest value recorded within each time window. Returns null for empty windows.

- `getStandardDeviations(): Record<TimeWindow, number | null>`

  Returns the standard deviation (square root of variance) for each time window, indicating how spread out values are from their mean. Returns null for empty windows.

- `getMetrics(percentiles: number[] = [90, 95]): Record<TimeWindow, Record<string, number | null>>`

  Returns all metrics for each time window. Returns a record mapping each time window to a record containing all metrics.

## Contribution

Contributions are welcome! Submit issues or pull requests via the GitHub repository.
