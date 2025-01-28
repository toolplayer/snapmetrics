/**
 * Converts a time window string (e.g., "1m") into milliseconds.
 * @param window Time window string
 * @returns Milliseconds equivalent
 */
export const parseTimeWindow = (window: string): number => {
  const match = window.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(`Invalid time window format: ${window}`);
  }

  const [_, value, unit] = match;
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 } as const;
  return parseInt(value!, 10) * multipliers[unit as keyof typeof multipliers];
};

/**
 * Swaps the first and second levels of keys in a nested object.
 * @param obj Object with nested key structure to transform
 * @returns Object with first and second level keys swapped
 */
export const swapLevels = <
  K1 extends string | number | symbol,
  K2 extends string | number | symbol,
  V
>(
  obj: Record<K1, Record<K2, V>>
): Record<K2, Record<K1, V>> => {
  const result: Partial<Record<K2, Record<K1, V>>> = {};

  for (const [outerKey, innerObj] of Object.entries(obj)) {
    for (const [innerKey, value] of Object.entries(innerObj as Record<K2, V>)) {
      const newOuterKey = innerKey as K2;
      const newInnerKey = outerKey as K1;

      if (!result[newOuterKey]) {
        result[newOuterKey] = {} as Record<K1, V>;
      }
      result[newOuterKey][newInnerKey] = value as V;
    }
  }

  return result as Record<K2, Record<K1, V>>;
};
