"""Pure rules the agent's tools enforce. No network, no ADK: unit-tested.

Maps terms (ADR 006): only place IDs and Ije's own text may be stored, so
links are built from place IDs and reasons must not repeat place names.
"""

from __future__ import annotations

import ast
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


# Access needs that mean a step-free, wheelchair-usable route matters.
STEP_FREE_NEEDS = {"wheelchair", "step-free", "limited-walking"}


def combined_needs(persona: dict | None, party_needs: dict | None) -> dict[str, list[str]]:
    """The traveller's and the group's needs together, de-duplicated, in order."""
    out: dict[str, list[str]] = {}
    for key in ("dietary", "allergies", "accessibility"):
        seen: list[str] = []
        for source in (persona or {}, party_needs or {}):
            for value in source.get(key) or []:
                if value and value not in seen:
                    seen.append(value)
        out[key] = seen
    return out


def needs_query(kind: str, needs: dict[str, list[str]]) -> str:
    """Words appended to every search so needs are applied, not just remembered."""
    words = []
    if kind == "food":
        words += needs.get("dietary") or []
        words += [f"{a}-free" for a in needs.get("allergies") or []]
    if STEP_FREE_NEEDS & set(needs.get("accessibility") or []):
        words.append("wheelchair accessible")
    return " ".join(words)


# Place types that are a clear clash with an allergy, whatever the search said.
ALLERGY_RISK_TYPES = {
    "shellfish": {"seafood_restaurant", "sushi_restaurant", "oyster_bar_restaurant"},
    "fish": {"seafood_restaurant", "sushi_restaurant", "fish_and_chips_restaurant", "oyster_bar_restaurant"},
}


def allergy_clash(types: list[str] | None, allergies: list[str]) -> str | None:
    """The allergy a place's Google types clash with, if any."""
    for allergy in allergies:
        risky = ALLERGY_RISK_TYPES.get(allergy.strip().lower())
        if risky and risky & set(types or []):
            return allergy
    return None


def call_from_code(code: str, allowed: set[str]) -> tuple[str, dict] | None:
    """Recover a tool call the model wrote as Python, e.g.
    `print(default_api.update_itinerary(items=[...]))`.

    Parses only; never executes. Arguments must be plain literals.
    """
    try:
        node = ast.parse(code.strip(), mode="eval").body
    except SyntaxError:
        return None
    if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "print" and len(node.args) == 1:
        node = node.args[0]
    if not isinstance(node, ast.Call) or node.args:
        return None
    func = node.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
    if name not in allowed:
        return None
    try:
        args = {kw.arg: ast.literal_eval(kw.value) for kw in node.keywords if kw.arg}
    except (ValueError, SyntaxError):
        return None
    return name, args
