import Denque from "denque";
import { throttle } from "throttle-debounce";

export type TimeWindow = `${number}${"s" | "m" | "h"}`; // e.g., "15s", "1m", "2h"

interface WindowData {
  sum: number; // Sum of values within the window
  count: number; // Number of records values
  queue: Denque<{ timestamp: number; value: number }>; // Timestamped values
}

interface SnapMetricsOptions {
  timeWindows?: TimeWindow[]; // Optional, defaults to ["1m", "5m", "15m"].
  removeExpiredRecordsThrottlingMS?: number | false; // Throttle interval in milliseconds or disable throttling.
  debug?: boolean; // Enable or disable debug logging.
}

/**
 * Converts a time window string (e.g., "1m") into milliseconds.
 * @param window Time window string
 * @returns Milliseconds equivalent
 */
function parseTimeWindow(window: TimeWindow): number {
  const match = window.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(`Invalid time window format: ${window}`);
  }

  const [_, value, unit] = match;
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 } as const;
  return parseInt(value!, 10) * multipliers[unit as keyof typeof multipliers];
}

export default class SnapMetrics {
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

      while (
        !window.queue.isEmpty() &&
        now - window.queue.peekFront()!.timestamp > expiryTime
      ) {
        const expired = window.queue.shift()!;
        window.sum -= expired.value;
        window.count--;
      }
    }
  }

  private extractWindowValues<T>(
    extractor: (window: WindowData) => T
  ): Record<TimeWindow, T> {
    return Object.fromEntries(
      Object.entries(this.windows).map(([key, window]) => [
        key,
        extractor(window),
      ])
    );
  }

  /**
   * Records a value into all active time windows.
   * @param value - Value.
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
   * Retrieves the count of values for all time windows.
   * @returns Counts for all time windows.
   */
  getCounts(): Record<TimeWindow, number> {
    if (this.debug) console.log("Calculating counts...");
    this.throttledRemoveExpiredRecords();

    const counts = this.extractWindowValues((window) => window.count);

    if (this.debug)
      console.log("Counts calculated:", JSON.stringify(counts, null, 2));
    return counts;
  }

  /**
   * Retrieves the sum of values for all time windows.
   * @returns Sums for all time windows.
   */
  getSums(): Record<TimeWindow, number> {
    if (this.debug) console.log("Calculating sums...");
    this.throttledRemoveExpiredRecords();

    const sums = this.extractWindowValues((window) => window.sum);

    if (this.debug)
      console.log("Sums calculated:", JSON.stringify(sums, null, 2));
    return sums;
  }

  /**
   * Retrieves the rolling averages for all time windows.
   * @returns Averages for all time windows.
   */
  getAverages(): Record<TimeWindow, number> {
    if (this.debug) console.log("Calculating averages...");
    this.throttledRemoveExpiredRecords();

    const averages = this.extractWindowValues((window) =>
      window.count === 0
        ? 0
        : Math.round((window.sum / window.count) * 100) / 100
    );

    if (this.debug)
      console.log("Averages calculated:", JSON.stringify(averages, null, 2));
    return averages;
  }
}
