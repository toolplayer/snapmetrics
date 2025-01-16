export type TimeWindow = `${number}${"s" | "m" | "h"}`;
interface SnapMetricsOptions {
    timeWindows?: TimeWindow[];
    removeExpiredRecordsThrottlingMS?: number | false;
    debug?: boolean;
}
export default class SnapMetrics {
    private windows;
    private timeWindowDurations;
    private debug;
    private throttledRemoveExpiredRecords;
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
    constructor(timeWindowsOrOptions?: TimeWindow[] | SnapMetricsOptions);
    /**
     * Removes expired records from the time windows.
     */
    private removeExpiredRecords;
    private extractWindowValues;
    /**
     * Records a value into all active time windows.
     * @param value - Value.
     */
    record(value: number): void;
    /**
     * Measures the execution time of a synchronous or asynchronous function and records the duration.
     *
     * @template T The return type of the provided function.
     * @param fn The function to be executed, which can be synchronous or return a Promise for asynchronous execution.
     * @returns The result of the executed function. If the function returns a Promise, the result will also be a Promise.
     */
    recordDuration<T>(fn: () => T | Promise<T>): T | Promise<T>;
    /**
     * Retrieves the current count of values for all time windows.
     * @returns Counts for all time windows.
     */
    getCounts(): Record<TimeWindow, number>;
    /**
     * Retrieves the current sum of values for all time windows.
     * @returns Sums for all time windows.
     */
    getSums(): Record<TimeWindow, number>;
    /**
     * Retrieves the current rolling averages for all time windows.
     * @returns Averages for all time windows.
     */
    getAverages(): Record<TimeWindow, number>;
}
export {};
