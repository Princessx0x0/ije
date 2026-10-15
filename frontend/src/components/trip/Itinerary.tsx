import { formatDay } from "@/lib/format";
import { SLOTS, type ItineraryItem } from "@/lib/schema";

const CATEGORY_LABELS: Record<ItineraryItem["category"], string> = {
  sight: "Sight",
  activity: "Activity",
  food: "Food and drink",
  shopping: "Shopping",
  nightlife: "Night out",
};

/** Sources are model-written URLs: only ever link http(s), and show the site name. */
function sourceLink(url: string): { href: string; site: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { href: u.href, site: u.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

/** Day by day cards, each with its slot, reason and named source. */
export function Itinerary({ items }: { items: ItineraryItem[] }) {
  const days = [...new Set(items.map((i) => i.day))].sort();

  return (
    <div className="ije-itinerary">
      {days.map((day) => {
        const dayItems = items
          .filter((i) => i.day === day)
          .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
        return (
          <section key={day} className="ije-day" aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="ije-day__title">
              {formatDay(day)}
            </h2>
            <ol className="ije-day__items">
              {dayItems.map((item) => {
                const source = sourceLink(item.source_url);
                return (
                  <li key={item.item_id} className="ije-card ije-item">
                    <p className="ije-type-overline ije-item__slot">{item.slot}</p>
                    <p className="ije-item__reason">{item.reason}</p>
                    <div className="ije-item__meta">
                      <span className={item.pick_type === "local" ? "ije-badge ije-badge--local" : "ije-badge"}>
                        {item.pick_type === "local" ? "Local pick" : "Well known"}
                      </span>
                      <span className="ije-caption">{CATEGORY_LABELS[item.category]}</span>
                      {source && (
                        <span className="ije-caption">
                          Source:{" "}
                          <a
                            href={source.href}
                            className="ije-link ije-link--inline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.site}
                          </a>
                        </span>
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
