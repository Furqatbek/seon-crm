export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** ?a=1&a=2 arrives as an array: take the first value of every key. */
export function firstValues(
  params: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}
