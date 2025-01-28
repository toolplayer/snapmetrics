/**
 * Calculates the average of an array of values
 * @param values Array of values
 * @param sum Optional pre-calculated sum
 * @returns Average value or null if array is empty
 */
export const calculateAverage = (
  values: number[],
  sum?: number
): number | null => {
  if (!values.length) return null;
  const total = sum ?? values.reduce((a, b) => a + b, 0);
  return total / values.length;
};

/**
 * Calculates percentile using Hyndman and Fan type 7 linear interpolation.
 * @param sortedValues Array of sorted values
 * @param percentile Percentile to calculate (0-100)
 * @returns Interpolated percentile value
 */
export const calculatePercentile = (
  sortedValues: number[],
  percentile: number
): number | null => {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0]!;

  const p = percentile / 100;
  const h = (sortedValues.length - 1) * p + 1;
  const hFloor = Math.floor(h);

  if (h === hFloor) {
    return sortedValues[hFloor - 1]!;
  }

  const hCeil = Math.ceil(h);
  const lower = sortedValues[hFloor - 1]!;
  const upper = sortedValues[hCeil - 1]!;

  return lower + (h - hFloor) * (upper - lower);
};

/**
 * Finds the minimum value in an array
 * @param values Array of values
 * @returns Minimum value or null if array is empty
 */
export const calculateMinimum = (values: number[]): number | null =>
  values.length ? Math.min(...values) : null;

/**
 * Finds the maximum value in an array
 * @param values Array of values
 * @returns Maximum value or null if array is empty
 */
export const calculateMaximum = (values: number[]): number | null =>
  values.length ? Math.max(...values) : null;

/**
 * Calculates the standard deviation of an array of values
 * @param values Array of values
 * @param mean Optional pre-calculated mean
 * @returns Standard deviation or null if array is empty
 */
export const calculateStandardDeviation = (
  values: number[],
  mean?: number
): number | null => {
  if (!values.length) return null;
  const avg = mean ?? calculateAverage(values)!;
  const squaredDiffs = values.map((value) => Math.pow(value - avg, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
};
