import Denque from "denque";
import { throttle } from "throttle-debounce";
import {
  calculateAverage,
  calculatePercentile,
  calculateMinimum,
  calculateMaximum,
  calculateStandardDeviation,
} from "./stats.js";
import { parseTimeWindow, swapLevels } from "./utils.js";

export type TimeWindow = `${number}${"s" | "m" | "h"}`; // e.g., "15s", "1m", "2h"

interface WindowData {
  sum: number; // Sum of values within the window
  count: number; // Number of records values
  queue: Denque<{ timestamp: number; value: number }>; // Timestamped values
  sortedValues?: number[]; // Optional cache of sorted values
}

interface SnapMetricsOptions {
  timeWindows?: TimeWindow[]; // Optional, defaults to ["1m", "5m", "15m"].
  removeExpiredRecordsThrottlingMS?: number | false; // Throttle interval in milliseconds or disable throttling.
  debug?: boolean; // Enable or disable debug logging.
}

interface ValueResult {
  values: number[];
  isSorted: boolean;
}

enum SortRequirement {
  SORTED = "sorted", // Must be sorted (median, percentiles)
  PREFER_SORTED = "prefer_sorted", // Prefer sorted if available (min, max)
  UNSORTED = "unsorted", // Must not be sorted (when raw values needed)
  ANY = "any", // Don't care about sorting (avg, std dev)
}

export class SnapMetrics {
  private windows: Record<TimeWindow, WindowData>;
  private timeWindowDurations: Record<TimeWindow, number>;
  private debug: boolean;
  private throttledRemoveExpiredRecords = () => this.removeExpiredRecords();

  /**
   * Constructs an instance of the class.
   *
   * @param timeWindowsOrOptions - Either an array of time windows or a configuration options object:
   *                               - If an array is provided, it is treated as `timeWindows`, formatted as `<integer><unit>`
   *                                 where unit is `s`, `m`, or `h`. Defaults to ["1m", "5m", "15m"].
   *                               - If an object is provided, it may contain the following options:
   *                                 - `timeWindows` (Array<string>): Array of time windows, formatted as `<integer><unit>`.
   *                                   Defaults to ["1m", "5m", "15m"].
   *                                 - `removeExpiredRecordsThrottlingMS` (number | false): Time in milliseconds to throttle
   *                                   the removal of expired records. Must be a non-negative number (>= 0) or `false` to
   *                                   disable throttling. Defaults to `100` ms.
   *                                 - `debug` (boolean): Enables logging for debugging. Defaults to `false`.
   * @example
   * const metrics = new SnapMetrics({ timeWindows: ["1m", "5m", "15m"], removeExpiredRecordsThrottlingMS: 100, debug: true });
   */
  constructor(timeWindowsOrOptions?: TimeWindow[] | SnapMetricsOptions) {
    let timeWindows: TimeWindow[];
    let options: SnapMetricsOptions;

    // Check if the argument is an array (timeWindows) or an options object.
    if (Array.isArray(timeWindowsOrOptions)) {
      timeWindows = timeWindowsOrOptions; // User passed an array of time windows.
      options = {}; // Default options.
    } else {
      options = timeWindowsOrOptions || {}; // User passed an options object or nothing.
      timeWindows = options.timeWindows || ["1m", "5m", "15m"]; // Default time windows.
    }

    const {
      removeExpiredRecordsThrottlingMS = 100, // Default throttling interval.
      debug = false, // Default debug setting.
    } = options;

    this.debug = debug;

    this.timeWindowDurations = Object.fromEntries(
      timeWindows.map((key) => [key, parseTimeWindow(key)])
    ) as Record<TimeWindow, number>;

    this.windows = Object.fromEntries(
      timeWindows.map((key) => [key, { sum: 0, count: 0, queue: new Denque() }])
    ) as Record<TimeWindow, WindowData>;

    if (removeExpiredRecordsThrottlingMS !== false) {
      this.throttledRemoveExpiredRecords = throttle(
        removeExpiredRecordsThrottlingMS,
        () => this.removeExpiredRecords()
      );
    }
  }

  /**
   * Removes expired records from all time windows.
   */
  private removeExpiredRecords() {
    const now = performance.now();

    for (const [key, window] of Object.entries(this.windows)) {
      const expiryTime = this.timeWindowDurations[key as TimeWindow]!;
      let expired = false;

      while (
        !window.queue.isEmpty() &&
        now - window.queue.peekFront()!.timestamp > expiryTime
      ) {
        const expiredValue = window.queue.shift()!;
        window.sum -= expiredValue.value;
        window.count--;
        expired = true;
      }

      if (expired) {
        delete window.sortedValues; // Invalidate cached sorted values if any records expired
      }
    }
  }

  /**
   * Maps a function over all time windows and returns the results.
   * @param mapper Function that transforms a window's data into a result
   * @returns Record mapping each time window to its transformed value
   */
  private mapWindows<T>(
    mapper: (window: WindowData, key: TimeWindow) => T
  ): Record<TimeWindow, T> {
    return Object.fromEntries(
      Object.entries(this.windows).map(([key, window]) => [
        key,
        mapper(window, key as TimeWindow),
      ])
    );
  }

  /**
   * Gets values from a window, optionally sorted, with efficient caching.
   * @param windowKey - The time window key
   * @param sortRequirement - Optional sorting requirement, defaults to ANY
   * @returns Object containing values array and isSorted flag, or null if window doesn't exist
   */
  private getValues(
    windowKey: TimeWindow,
    sortRequirement: SortRequirement = SortRequirement.ANY
  ): ValueResult | null {
    const window = this.windows[windowKey];
    if (!window) {
      return null;
    }
    if (window.count === 0) {
      return { values: [], isSorted: true };
    }

    if (
      window.sortedValues &&
      window.sortedValues.length === window.queue.length
    ) {
      // Return cached sorted values unless UNSORTED is specifically required
      if (sortRequirement !== SortRequirement.UNSORTED) {
        return { values: window.sortedValues, isSorted: true };
      }
    }

    const values = window.queue.toArray().map((v) => v.value);

    switch (sortRequirement) {
      case SortRequirement.SORTED:
        const sortedValues = values.sort((a, b) => a - b);
        window.sortedValues = sortedValues;
        return { values: sortedValues, isSorted: true };

      case SortRequirement.PREFER_SORTED:
        return { values, isSorted: false };

      case SortRequirement.UNSORTED:
        return { values, isSorted: false };

      case SortRequirement.ANY:
        return { values, isSorted: false };
    }
  }

  /**
   * Records a value into all active time windows.
   * @param value - Value.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1); // Records a value of 1 into all active time windows
   */
  record(value: number): void {
    if (this.debug) console.log(`Recording value: ${value}`);
    const timestamp = performance.now();

    for (const window of Object.values(this.windows)) {
      window.queue.push({ timestamp, value });
      window.sum += value;
      window.count++;
    }

    this.throttledRemoveExpiredRecords();

    if (this.debug)
      console.log("Updated windows:", JSON.stringify(this.windows, null, 2));
  }

  /**
   * Measures the execution time of a synchronous or asynchronous function and records the duration in all time windows.
   *
   * @template T The return type of the provided function.
   * @param fn The function to be executed, which can be synchronous or return a Promise for asynchronous execution.
   * @returns The result of the executed function. If the function returns a Promise, the result will also be a Promise.
   * @example
   * const metrics = new SnapMetrics();
   * const result = metrics.recordDuration(() => {
   *   // Your function logic here
   *   return someValue;
   * });
   */
  recordDuration<T>(fn: () => T | Promise<T>): T | Promise<T> {
    const startTime = performance.now();

    const result = fn();

    if (result instanceof Promise) {
      return result.then((value) => {
        this.record(performance.now() - startTime);
        return value;
      });
    } else {
      this.record(performance.now() - startTime);
      return result;
    }
  }

  /**
   * Returns the count of values for all time windows.
   * @returns Record mapping each time window to its count of recorded values.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.getCounts(); // { "1m": 2, "5m": 2, "15m": 2 }
   */
  getCounts(): Record<TimeWindow, number> {
    if (this.debug) console.log("Calculating counts...");
    this.throttledRemoveExpiredRecords();

    const counts = this.mapWindows((window) => window.count);

    if (this.debug)
      console.log("Counts calculated:", JSON.stringify(counts, null, 2));
    return counts;
  }

  /**
   * Returns the sum of values for all time windows.
   * @returns Record mapping each time window to its sum value. Returns null for empty windows.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.getSums(); // { "1m": 3, "5m": 3, "15m": 3 }
   *
   * // Empty window returns null
   * const emptyMetrics = new SnapMetrics();
   * emptyMetrics.getSums(); // { "1m": null, "5m": null, "15m": null }
   */
  getSums(): Record<TimeWindow, number | null> {
    if (this.debug) console.log("Calculating sums...");
    this.throttledRemoveExpiredRecords();

    const sums = this.mapWindows((window) =>
      window.count === 0 ? null : window.sum
    );

    if (this.debug)
      console.log("Sums calculated:", JSON.stringify(sums, null, 2));
    return sums;
  }

  /**
   * Returns the rolling averages for all time windows.
   * @returns Record mapping each time window to its average value. Returns null for empty windows.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.getAverages(); // { "1m": 1.5, "5m": 1.5, "15m": 1.5 }
   *
   * // Empty window returns null
   * const emptyMetrics = new SnapMetrics();
   * emptyMetrics.getAverages(); // { "1m": null, "5m": null, "15m": null }
   */
  getAverages(): Record<TimeWindow, number | null> {
    if (this.debug) console.log("Calculating averages...");
    this.throttledRemoveExpiredRecords();

    const averages = this.mapWindows((window, key) => {
      if (window.count === 0) return null;
      const { values } = this.getValues(key as TimeWindow)!;
      return calculateAverage(values, window.sum);
    });

    if (this.debug)
      console.log("Averages calculated:", JSON.stringify(averages, null, 2));
    return averages;
  }

  /**
   * Returns the middle value for each time window using linear interpolation.
   * @description For an even number of values, uses linear interpolation between the two middle values.
   * @returns Record mapping each time window to its median value. Returns null for empty windows.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.record(3);
   * metrics.getMedians(); // { "1m": 2, "5m": 2, "15m": 2 }
   */
  getMedians(): Record<TimeWindow, number | null> {
    if (this.debug) console.log("Calculating medians...");
    this.throttledRemoveExpiredRecords();

    const medians = this.mapWindows((window, key) => {
      if (window.count === 0) return null;
      const { values } = this.getValues(
        key as TimeWindow,
        SortRequirement.SORTED
      )!;
      return calculatePercentile(values, 50);
    });

    if (this.debug)
      console.log("Medians calculated:", JSON.stringify(medians, null, 2));
    return medians;
  }

  /**
   * Returns the value below which the given percentage of observations fall.
   * @param percentile The percentile to calculate (0-100). For example, 95 for 95th percentile.
   * @description Uses Hyndman and Fan type 7 linear interpolation method for accurate results.
   * @returns Record mapping each time window to its percentile value. Returns null for empty windows.
   * @throws {Error} If percentile is not between 0 and 100.
   * @example
   * const metrics = new SnapMetrics();
   * // Record some response times...
   * metrics.getPercentiles(95); // Get 95th percentile response times
   */
  getPercentiles(percentile: number): Record<TimeWindow, number | null> {
    if (percentile < 0 || percentile > 100) {
      throw new Error("Percentile must be between 0 and 100");
    }
    if (this.debug) console.log("Calculating percentiles...");
    this.throttledRemoveExpiredRecords();

    const percentiles = this.mapWindows((window, key) => {
      if (window.count === 0) return null;
      const { values } = this.getValues(
        key as TimeWindow,
        SortRequirement.SORTED
      )!;
      return calculatePercentile(values, percentile);
    });

    if (this.debug)
      console.log(
        "Percentiles calculated:",
        JSON.stringify(percentiles, null, 2)
      );
    return percentiles;
  }

  /**
   * Returns the smallest value recorded within each time window.
   * @returns Record mapping each time window to its minimum value. Returns null for empty windows.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.getMinimums(); // { "1m": 1, "5m": 1, "15m": 1 }
   */
  getMinimums(): Record<TimeWindow, number | null> {
    if (this.debug) console.log("Calculating minimums...");
    this.throttledRemoveExpiredRecords();

    const minimums = this.mapWindows((window, key) => {
      if (window.count === 0) return null;
      const { values, isSorted } = this.getValues(
        key as TimeWindow,
        SortRequirement.PREFER_SORTED
      )!;
      return isSorted ? values[0]! : calculateMinimum(values);
    });

    if (this.debug)
      console.log("Minimums calculated:", JSON.stringify(minimums, null, 2));
    return minimums;
  }

  /**
   * Returns the largest value recorded within each time window.
   * @returns Record mapping each time window to its maximum value. Returns null for empty windows.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.getMaximums(); // { "1m": 2, "5m": 2, "15m": 2 }
   */
  getMaximums(): Record<TimeWindow, number | null> {
    if (this.debug) console.log("Calculating maximums...");
    this.throttledRemoveExpiredRecords();

    const maximums = this.mapWindows((window, key) => {
      if (window.count === 0) return null;
      const { values, isSorted } = this.getValues(
        key as TimeWindow,
        SortRequirement.PREFER_SORTED
      )!;
      return isSorted ? values[values.length - 1]! : calculateMaximum(values);
    });

    if (this.debug)
      console.log("Maximums calculated:", JSON.stringify(maximums, null, 2));
    return maximums;
  }

  /**
   * Returns the standard deviation (square root of variance) for each time window.
   * @description Indicates how spread out values are from their mean.
   * @returns Record mapping each time window to its standard deviation. Returns null for empty windows.
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(2);
   * metrics.record(4);
   * metrics.record(6);
   * metrics.getStandardDeviations(); // { "1m": 1.63, "5m": 1.63, "15m": 1.63 }
   */
  getStandardDeviations(): Record<TimeWindow, number | null> {
    if (this.debug) console.log("Calculating standard deviations...");
    this.throttledRemoveExpiredRecords();

    const stdDevs = this.mapWindows((window, key) => {
      if (window.count === 0) return null;
      const { values } = this.getValues(key as TimeWindow)!;
      const mean = window.sum / window.count;
      return calculateStandardDeviation(values, mean);
    });

    if (this.debug)
      console.log(
        "Standard deviations calculated:",
        JSON.stringify(stdDevs, null, 2)
      );
    return stdDevs;
  }

  /**
   * Returns all metrics for each time window.
   * @param options Configuration options
   * @param options.percentiles Array of percentiles to calculate (0-100). Defaults to [90, 95].
   * @returns Record mapping each time window to its metrics:
   * - count: Number of values in the window
   * - sum: Sum of all values
   * - average: Mean value
   * - median: 50th percentile
   * - percentile{N}: Nth percentile values for each requested percentile
   * - minimum: Smallest value
   * - maximum: Largest value
   * - standardDeviation: Standard deviation from mean
   * @example
   * const metrics = new SnapMetrics();
   * metrics.record(1);
   * metrics.record(2);
   * metrics.record(3);
   *
   * metrics.getMetrics();
   * // Returns:
   * // {
   * //   "1m": {
   * //     count: 3,
   * //     sum: 6,
   * //     average: 2,
   * //     median: 2,
   * //     percentile90: 2.8,
   * //     percentile95: 2.9,
   * //     minimum: 1,
   * //     maximum: 3,
   * //     standardDeviation: 0.816
   * //   }
   * // }
   */
  getMetrics(
    { percentiles = [90, 95] }: { percentiles?: number[] } = {
      percentiles: [90, 95],
    }
  ): Record<TimeWindow, Record<string, number | null>> {
    if (this.debug) console.log("Calculating metrics...");

    const metrics = {
      count: this.getCounts(),
      sum: this.getSums(),
      average: this.getAverages(),
      median: this.getMedians(),
      ...Object.fromEntries(
        percentiles.map((p) => [`percentile${p}`, this.getPercentiles(p)])
      ),
      minimum: this.getMinimums(),
      maximum: this.getMaximums(),
      standardDeviation: this.getStandardDeviations(),
    };

    // Transform structure from metric-first to window-first
    const transformedMetrics = swapLevels(metrics);

    if (this.debug)
      console.log(
        "Metrics calculated:",
        JSON.stringify(transformedMetrics, null, 2)
      );
    return transformedMetrics;
  }
}
