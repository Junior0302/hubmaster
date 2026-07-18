/** Stable key for unordered user pairs (friends / DMs). */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}
