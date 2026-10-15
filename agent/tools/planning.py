"""The agent's tools. Each returns {"status": ..., ...}; on error, a message the
model can act on or pass on honestly. Nothing here invents data: places,
stays and weather come from Google Maps Platform (ADR 006) or not at all.

Run-scoped facts live in `temp:` session state, which ADK never persists:
coordinates (Maps terms allow at most 30 days) and the places seen this run.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from google.adk.tools import ToolContext
from pydantic import ValidationError

from ..schema import StayOption, Trip, Weather
from . import maps, rules

SEEN = "temp:seen_places"  # place_id -> {"name", "kind"}
DESTINATION = "temp:destination"  # {"lat", "lng"}

Kind = Literal["sight", "food", "activity", "shopping", "nightlife", "lodging"]

_INCLUDED_TYPE = {"food": "restaurant", "lodging": "lodging"}


def _trip(tool_context: ToolContext) -> dict | None:
    trip = tool_context.state.get("trip")
    return trip if isinstance(trip, dict) and trip.get("destination") else None


def _destination(tool_context: ToolContext, trip: dict) -> tuple[float, float]:
    """The destination's centre, resolved once per run."""
    cached = tool_context.state.get(DESTINATION)
    if cached:
        return cached["lat"], cached["lng"]
    found = maps.text_search(trip["destination"], page_size=1, field_mask="places.id,places.location")
    if not found:
        raise maps.MapsError(f"Could not find {trip['destination']} on Google Maps.")
    loc = found[0]["location"]
    tool_context.state[DESTINATION] = {"lat": loc["latitude"], "lng": loc["longitude"]}
    return loc["latitude"], loc["longitude"]


def search_places(tool_context: ToolContext, query: str, kind: Kind) -> dict[str, Any]:
    """Find real places near the trip's destination on Google Maps.

    Use this for every place you put in the itinerary or suggest as a stay.
    Include needs in the query when they matter, for example
    "halal restaurant", "step-free museum", "quiet vegetarian cafe".

    Args:
        query: What to look for, without the city name (it is added for you).
        kind: "sight", "food", "activity", "shopping", "nightlife" or "lodging".

    Returns:
        Up to 8 places, each with place_id, name, address, rating, rating_count,
        price_level, types, wheelchair_accessible_entrance,
        serves_vegetarian_food and opening_hours where Google Maps knows them.
    """
    trip = _trip(tool_context)
    if not trip:
        return {"status": "error", "message": "No trip yet. Ask the user to fill in the trip form."}
    try:
        near = _destination(tool_context, trip)
        found = maps.text_search(
            f"{query} in {trip['destination']}", near=near, included_type=_INCLUDED_TYPE.get(kind)
        )
    except maps.MapsError as e:
        return {"status": "error", "message": f"{e} Tell the user plainly; do not guess places."}

    seen = dict(tool_context.state.get(SEEN) or {})
    places = []
    for p in found:
        name = (p.get("displayName") or {}).get("text")
        seen[p["id"]] = {"name": name, "kind": kind}
        access = p.get("accessibilityOptions") or {}
        places.append(
            {
                "place_id": p["id"],
                "name": name,
                "address": p.get("formattedAddress"),
                "rating": p.get("rating"),
                "rating_count": p.get("userRatingCount"),
                "price_level": p.get("priceLevel"),
                "types": (p.get("types") or [])[:4],
                "wheelchair_accessible_entrance": access.get("wheelchairAccessibleEntrance"),
                "serves_vegetarian_food": p.get("servesVegetarianFood"),
                "opening_hours": (p.get("regularOpeningHours") or {}).get("weekdayDescriptions"),
            }
        )
    tool_context.state[SEEN] = seen
    if not places:
        return {"status": "success", "places": [], "message": "Nothing found. Try a broader query."}
    return {"status": "success", "places": places}


def get_forecast(tool_context: ToolContext) -> dict[str, Any]:
    """Get the real daily weather forecast for the trip's dates.

    Call this before planning. The forecast only reaches 10 days ahead: for
    trips further out it tells you when it will be available. Never state
    temperatures or conditions that this tool did not return.

    Returns:
        status "success" with days [{day, condition, temp_c}] for the trip days
        inside the forecast window, or status "unavailable" with available_from.
    """
    trip = _trip(tool_context)
    if not trip:
        return {"status": "error", "message": "No trip yet. Ask the user to fill in the trip form."}
    start, end = date.fromisoformat(trip["start_date"]), date.fromisoformat(trip["end_date"])
    today = datetime.now(timezone.utc).date()
    available_from = rules.forecast_available_from(start, today)
    if available_from:
        return {
            "status": "unavailable",
            "available_from": available_from.isoformat(),
            "message": "Too far ahead for a forecast. Plan with a sensible indoor and outdoor mix for "
            "the season, and do not give temperatures or conditions.",
        }
    try:
        lat, lng = _destination(tool_context, trip)
        horizon = min(rules.FORECAST_WINDOW_DAYS, (end - today).days + 1)
        raw = maps.daily_forecast(lat, lng, horizon)
    except maps.MapsError as e:
        return {"status": "error", "message": f"{e} Say the forecast is unavailable; do not guess."}

    days = []
    for d in raw:
        dd = d.get("displayDate") or {}
        day = date(dd["year"], dd["month"], dd["day"])
        if start <= day <= end:
            days.append(
                {
                    "day": day.isoformat(),
                    "condition": rules.condition_for(
                        ((d.get("daytimeForecast") or {}).get("weatherCondition") or {}).get("type")
                    ),
                    "temp_c": round((d.get("maxTemperature") or {}).get("degrees", 0)),
                }
            )
    weather = Weather.model_validate(
        {"mode": "forecast", "fetched_at": datetime.now(timezone.utc), "days": days}
    ).model_dump(mode="json")
    tool_context.state["trip"] = {**trip, "weather": weather}
    covered = f"{len(days)} of {len(rules.trip_days(start, end))} trip days"
    return {"status": "success", "days": days, "message": f"Forecast covers {covered}."}


def update_itinerary(tool_context: ToolContext, items: list[dict]) -> dict[str, Any]:
    """Replace the trip's itinerary with a new, COMPLETE list of items.

    Rules, checked here (fix and call again if rejected):
    - Every day from start_date to end_date has a morning, afternoon and evening item.
    - Every day has at least one "food" item.
    - Every place_id came from search_places (or is already in the itinerary).
    - A reason explains why the pick fits this traveller and never repeats the
      place's name (the app shows names itself).

    Args:
        items: Every item for the trip. Each needs: item_id (str), place_id (str),
            day (YYYY-MM-DD), slot ("morning" | "afternoon" | "evening"),
            category ("sight" | "activity" | "food" | "shopping" | "nightlife"),
            pick_type ("local" | "tourist"), reason (str, max 200 chars).
            source_url is set for you (the place's Google Maps link).

    Returns:
        A status dict. On error, the message lists exactly what to fix.
    """
    trip = _trip(tool_context)
    if not trip:
        return {"status": "error", "message": "No trip yet. Ask the user to fill in the trip form."}

    seen = tool_context.state.get(SEEN) or {}
    known = set(seen) | {i.get("place_id") for i in trip.get("items") or []}
    problems = []
    for item in items:
        pid = item.get("place_id")
        if not pid or pid not in known:
            problems.append(f"item {item.get('item_id')}: place_id {pid!r} did not come from search_places")
            continue
        name = (seen.get(pid) or {}).get("name")
        if rules.reason_names_place(str(item.get("reason", "")), name):
            problems.append(f"item {item.get('item_id')}: the reason repeats the place name; describe the fit instead")
        item["source_url"] = rules.maps_url(pid)

    start, end = date.fromisoformat(trip["start_date"]), date.fromisoformat(trip["end_date"])
    problems += rules.coverage_problems(items, start, end)
    if problems:
        return {"status": "error", "message": "Itinerary rejected. Fix all of these and call again: " + "; ".join(problems)}

    try:
        validated = Trip.model_validate({**trip, "items": items})
    except ValidationError as e:
        return {"status": "error", "message": f"Itinerary rejected, fix and retry: {e}"}
    tool_context.state["trip"] = validated.model_dump(mode="json")
    return {"status": "success", "message": f"Itinerary saved: {len(items)} items over {len(rules.trip_days(start, end))} days."}


def update_stays(tool_context: ToolContext, hotels: list[dict], include_airbnb: bool) -> dict[str, Any]:
    """Set the stay suggestions for the trip. Only call this when asked about where to stay.

    Args:
        hotels: Up to 3 hotels, each {"place_id": from search_places with kind
            "lodging", "reason": why it suits this traveller, without its name}.
        include_airbnb: Also offer an Airbnb search for the trip's dates.

    Returns:
        A status dict. On error, the message lists what to fix.
    """
    trip = _trip(tool_context)
    if not trip:
        return {"status": "error", "message": "No trip yet. Ask the user to fill in the trip form."}
    seen = tool_context.state.get(SEEN) or {}
    known = {s.get("place_id") for s in trip.get("stay_options") or [] if s.get("place_id")}
    problems, options = [], []
    for h in hotels[:3]:
        pid, reason = h.get("place_id"), str(h.get("reason", ""))
        info = seen.get(pid) or {}
        if pid not in known and info.get("kind") != "lodging":
            problems.append(f"{pid!r} did not come from search_places with kind 'lodging'")
            continue
        if rules.reason_names_place(reason, info.get("name")):
            problems.append(f"the reason for {pid} repeats the hotel's name")
            continue
        options.append({"kind": "hotel", "name": "", "place_id": pid, "deep_link": rules.maps_url(pid), "reason": reason})
    if problems:
        return {"status": "error", "message": "Stays rejected: " + "; ".join(problems)}
    if include_airbnb:
        options.append(
            {
                "kind": "airbnb",
                "name": "",
                "place_id": None,
                "deep_link": rules.airbnb_search_url(
                    trip["destination"],
                    date.fromisoformat(trip["start_date"]),
                    date.fromisoformat(trip["end_date"]),
                    int(trip.get("travellers") or 1),
                ),
                "reason": "Homes for your dates, if you prefer a kitchen and more space.",
            }
        )
    try:
        stays = [StayOption.model_validate(o).model_dump(mode="json") for o in options]
    except ValidationError as e:
        return {"status": "error", "message": f"Stays rejected, fix and retry: {e}"}
    tool_context.state["trip"] = {**trip, "stay_options": stays}
    return {"status": "success", "message": f"{len(stays)} stay options saved."}
