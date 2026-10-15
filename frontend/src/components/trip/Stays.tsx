import type { StayOption } from "@/lib/schema";

import { safeHref } from "./Itinerary";
import type { PlaceDisplay } from "./usePlaces";

/** Where to stay: real hotels (named live from their place IDs) and an Airbnb search. */
export function Stays({ stays, places }: { stays: StayOption[]; places: Record<string, PlaceDisplay> }) {
  if (stays.length === 0) return null;
  return (
    <section className="ije-stays" aria-labelledby="stays-heading">
      <h2 id="stays-heading" className="ije-day__title">
        Where to stay
      </h2>
      <ul className="ije-stays__list">
        {stays.map((stay, i) => {
          const place = stay.place_id ? places[stay.place_id] : undefined;
          const href = safeHref(stay.deep_link);
          const title = stay.kind === "airbnb" ? "Homes on Airbnb" : place?.name || "Hotel";
          return (
            <li key={stay.place_id ?? `${stay.kind}-${i}`} className="ije-card ije-item">
              <p className="ije-type-overline ije-item__slot">{stay.kind === "airbnb" ? "Homes" : "Hotel"}</p>
              <h3 className="ije-card__title">{title}</h3>
              {place?.address && <p className="ije-caption">{place.address}</p>}
              <p className="ije-item__reason">{stay.reason}</p>
              {href && (
                <a href={href} className="ije-link ije-link--inline ije-caption" target="_blank" rel="noopener noreferrer">
                  {stay.kind === "airbnb" ? "Search Airbnb for your dates" : "Open in Google Maps"}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="ije-caption">Ije does not book stays. Check prices and availability before you book.</p>
    </section>
  );
}
