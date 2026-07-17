export function toIso(value: unknown): string {
  const date = parseDate(value);
  return date ? date.toISOString() : new Date().toISOString();
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const seconds =
      ("_seconds" in value && (value as { _seconds: number })._seconds) ||
      ("seconds" in value && (value as { seconds: number }).seconds);
    if (typeof seconds === "number") return new Date(seconds * 1000);
  }
  return null;
}

export function formatDate(
  value: unknown,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", options).format(date);
}
