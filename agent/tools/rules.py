"""Pure rules the agent's tools enforce. No network, no ADK: unit-tested.

Maps terms (ADR 006): only place IDs and Ije's own text may be stored, so
links are built from place IDs and reasons must not repeat place names.
"""

from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import quote, urlencode

SLOTS = ("morning", "afternoon", "evening")

# The Weather API's daily forecast covers today plus the next 9 days.
FORECAST_WINDOW_DAYS = 10


def maps_url(place_id: str) -> str:
    """A Google Maps link for a place, built from its storable ID alone."""
    # `query` is required by the Maps URLs API but `query_place_id` wins.
    return "https://www.google.com/maps/search/?" + urlencode(
        {"api": "1", "query": "place", "query_place_id": place_id}
    )


def airbnb_search_url(destination: str, start: date, end: date, adults: int) -> str:
    """Airbnb search for the trip, from a fixed template. Never model-written."""
    return f"https://www.airbnb.com/s/{quote(destination.strip())}/homes?" + urlencode(
        {"checkin": start.isoformat(), "checkout": end.isoformat(), "adults": adults}
    )


def trip_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def coverage_problems(items: list[dict], start: date, end: date) -> list[str]:
    """Every day needs a morning, afternoon and evening, and at least one food pick."""
    problems = []
    for day in trip_days(start, end):
        on_day = [i for i in items if str(i.get("day")) == day.isoformat()]
        missing = [s for s in SLOTS if not any(i.get("slot") == s for i in on_day)]
        if missing:
            problems.append(f"{day.isoformat()} has no {', '.join(missing)} item")
        if not any(i.get("category") == "food" for i in on_day):
            problems.append(f"{day.isoformat()} has no food item (add a place to eat)")
    return problems


def reason_names_place(reason: str, name: str | None) -> bool:
    """True if a reason repeats the place's name (names must not be stored)."""
    if not name or len(name.strip()) < 4:
        return False
    return name.strip().casefold() in reason.casefold()


def forecast_available_from(start: date, today: date) -> date | None:
    """None if the trip start is inside the forecast window, else the first day it will be."""
    first_uncovered = today + timedelta(days=FORECAST_WINDOW_DAYS)
    if start < first_uncovered:
        return None
    return start - timedelta(days=FORECAST_WINDOW_DAYS - 1)


_CONDITIONS = {
    "sunny": ("CLEAR", "MOSTLY_CLEAR", "WINDY"),
    "cloudy": ("PARTLY_CLOUDY", "MOSTLY_CLOUDY", "CLOUDY"),
    "rainy": ("RAIN", "SHOWER", "THUNDER", "DRIZZLE"),
    "snowy": ("SNOW", "HAIL", "SLEET", "BLIZZARD", "FLURRIES"),
}


def condition_for(weather_type: str | None) -> str:
    """Map a Weather API condition type onto the schema's five conditions."""
    t = (weather_type or "").upper()
    for condition in ("snowy", "rainy"):  # check precipitation first: "RAIN_AND_SNOW" is snowy
        if any(k in t for k in _CONDITIONS[condition]):
            return condition
    for condition in ("sunny", "cloudy"):
        if t in _CONDITIONS[condition]:
            return condition
    return "mixed"
