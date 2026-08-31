const SEOUL_TIME_ZONE = "Asia/Seoul";

/** Return a stable YYYY-MM-DD value in the dashboard's operating timezone. */
export function seoulDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isCurrentSeoulDate(value: string | null | undefined): boolean {
  return Boolean(value && value === seoulDate());
}
