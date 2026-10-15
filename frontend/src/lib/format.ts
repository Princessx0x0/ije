/** Dates are YYYY-MM-DD and mean a calendar day, so format them in UTC. */
const parse = (d: string) => new Date(`${d}T00:00:00Z`);

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatDates(start: string, end: string): string {
  const a = parse(start);
  const b = parse(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "Dates not set";
  return start === end ? DATE.format(a) : DATE.formatRange(a, b);
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "Tuesday 1 April" for a day heading on the itinerary. */
export function formatDay(day: string): string {
  const d = parse(day);
  return Number.isNaN(d.getTime()) ? day : DAY.format(d);
}

/** Budget in minor units, e.g. 180000 GBP to "£1,800". */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}
