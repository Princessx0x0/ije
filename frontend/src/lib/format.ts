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

/** The Weather API forecasts 10 days ahead (today plus 9). */
const FORECAST_WINDOW_DAYS = 10;

/** The day a trip's first day enters the forecast window, or null if it already has. */
export function forecastOpens(startDate: string, today: Date = new Date()): string | null {
  const start = parse(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const firstUncovered = todayUtc + FORECAST_WINDOW_DAYS * 86_400_000;
  if (start.getTime() < firstUncovered) return null;
  return new Date(start.getTime() - (FORECAST_WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
}
