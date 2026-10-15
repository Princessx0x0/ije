"""Google Maps Platform calls (ADR 006): Places API (New) and Weather API.

Authenticated with the runtime identity's OAuth token (Agent Identity on Agent
Runtime, ADC locally), billed to GOOGLE_CLOUD_PROJECT. No API keys.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import google.auth
from google.auth.transport.requests import AuthorizedSession

TIMEOUT_S = 15

# Only what the agent needs to choose well. Each field affects the price tier.
PLACE_FIELDS = ",".join(
    f"places.{f}"
    for f in (
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "types",
        "rating",
        "userRatingCount",
        "priceLevel",
        "accessibilityOptions",
        "servesVegetarianFood",
        "regularOpeningHours.weekdayDescriptions",
    )
)


class MapsError(Exception):
    """A Maps Platform call failed. The message is safe to show the model."""


@lru_cache(maxsize=1)
def _session() -> AuthorizedSession:
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return AuthorizedSession(credentials)


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    return {"X-Goog-User-Project": os.environ["GOOGLE_CLOUD_PROJECT"], **(extra or {})}


def text_search(
    query: str,
    *,
    near: tuple[float, float] | None = None,
    included_type: str | None = None,
    page_size: int = 8,
    field_mask: str = PLACE_FIELDS,
) -> list[dict[str, Any]]:
    body: dict[str, Any] = {"textQuery": query, "pageSize": page_size}
    if near:
        body["locationBias"] = {
            "circle": {"center": {"latitude": near[0], "longitude": near[1]}, "radius": 20000.0}
        }
    if included_type:
        body["includedType"] = included_type
    try:
        res = _session().post(
            "https://places.googleapis.com/v1/places:searchText",
            headers=_headers({"X-Goog-FieldMask": field_mask}),
            json=body,
            timeout=TIMEOUT_S,
        )
    except Exception as e:
        raise MapsError(f"Places search could not be reached ({type(e).__name__}).") from e
    if res.status_code != 200:
        raise MapsError(f"Places search failed with status {res.status_code}.")
    return res.json().get("places", [])


def daily_forecast(lat: float, lng: float, days: int) -> list[dict[str, Any]]:
    try:
        res = _session().get(
            "https://weather.googleapis.com/v1/forecast/days:lookup",
            headers=_headers(),
            params={"location.latitude": lat, "location.longitude": lng, "days": days, "pageSize": days},
            timeout=TIMEOUT_S,
        )
    except Exception as e:
        raise MapsError(f"The forecast could not be reached ({type(e).__name__}).") from e
    if res.status_code != 200:
        raise MapsError(f"The forecast failed with status {res.status_code}.")
    return res.json().get("forecastDays", [])
