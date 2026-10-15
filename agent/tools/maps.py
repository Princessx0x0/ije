"""Google Maps Platform calls (ADR 006): Places API (New) and Weather API.

Authenticated with OAuth, never API keys, and billed to GOOGLE_CLOUD_PROJECT.
On Agent Runtime the agent's own Agent Identity is not accepted by Maps
Platform (401), so calls go out as the dedicated ije-maps service account,
which the agent impersonates (IJE_MAPS_SERVICE_ACCOUNT; ADR 006 addendum).
Locally that variable is unset and ADC (your own login) is used.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any

import google.auth
from google.auth import impersonated_credentials
from google.auth.transport.requests import AuthorizedSession

TIMEOUT_S = 15

# Failures are told to the model politely, and logged here with the real cause
# (never the token), so they can be diagnosed from Cloud Logging.
log = logging.getLogger("ije.maps")

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


SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


@lru_cache(maxsize=1)
def _session() -> AuthorizedSession:
    credentials, _ = google.auth.default(scopes=SCOPES)
    maps_sa = os.getenv("IJE_MAPS_SERVICE_ACCOUNT")
    if maps_sa:
        # Short-lived tokens for ije-maps, minted with the agent's identity; no keys.
        credentials = impersonated_credentials.Credentials(
            source_credentials=credentials, target_principal=maps_sa, target_scopes=SCOPES, lifetime=3600
        )
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
        log.warning("Places search did not reach Google: %s: %s", type(e).__name__, e)
        raise MapsError(f"Places search could not be reached ({type(e).__name__}).") from e
    if res.status_code != 200:
        log.warning("Places search returned %s: %s", res.status_code, res.text[:500])
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
        log.warning("Forecast did not reach Google: %s: %s", type(e).__name__, e)
        raise MapsError(f"The forecast could not be reached ({type(e).__name__}).") from e
    if res.status_code != 200:
        log.warning("Forecast returned %s: %s", res.status_code, res.text[:500])
        raise MapsError(f"The forecast failed with status {res.status_code}.")
    return res.json().get("forecastDays", [])
