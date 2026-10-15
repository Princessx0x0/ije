import { formatDay } from "@/lib/format";
import { SLOTS, type DayWeather, type ItineraryItem } from "@/lib/schema";

import type { PlaceDisplay } from "./usePlaces";

const CATEGORY_LABELS: Record<ItineraryItem["category"], string> = {
  sight: "Sight",
  activity: "Activity",
  food: "Food and drink",
  shopping: "Shopping",
  nightlife: "Night out",
};

const CONDITION_LABELS: Record<DayWeather["condition"], string> = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  rainy: "Rain likely",
  snowy: "Snow likely",
  mixed: "Mixed",
};

/** Links come from the agent's tools (built from place IDs); still only ever link http(s). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Day by day cards: the place (named live), why it fits, and where it is on Google Maps. */
export function Itinerary({
  items,
  places,
  weather,
}: {
  items: ItineraryItem[];
  places: Record<string, PlaceDisplay>;
  weather: DayWeather[];
}) {
  const days = [...new Set(items.map((i) => i.day))].sort();

  return (
    <div className="ije-itinerary">
      {days.map((day) => {
        const dayItems = items
          .filter((i) => i.day === day)
          .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
        const forecast = weather.find((w) => w.day === day);
        return (
          <section key={day} className="ije-day" aria-labelledby={`day-${day}`}>
            <div className="ije-day__head">
              <h2 id={`day-${day}`} className="ije-day__title">
                {formatDay(day)}
              </h2>
              {forecast && (
                <p className="ije-badge ije-badge--calm">
                  {CONDITION_LABELS[forecast.condition]}, {forecast.temp_c}°C
                </p>
              )}
            </div>
            <ol className="ije-day__items">
              {dayItems.map((item) => {
                const place = places[item.place_id];
                const href = safeHref(item.source_url);
                return (
                  <li key={item.item_id} className="ije-card ije-item">
                    <p className="ije-type-overline ije-item__slot">{item.slot}</p>
                    {place?.name && <h3 className="ije-card__title">{place.name}</h3>}
                    <p className="ije-item__reason">{item.reason}</p>
                    <div className="ije-item__meta">
                      <span className={item.pick_type === "local" ? "ije-badge ije-badge--local" : "ije-badge"}>
                        {item.pick_type === "local" ? "Local pick" : "Well known"}
                      </span>
                      <span className="ije-caption">{CATEGORY_LABELS[item.category]}</span>
                      {href && (
                        <a href={href} className="ije-link ije-link--inline ije-caption" target="_blank" rel="noopener noreferrer">
                          Open in Google Maps
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
