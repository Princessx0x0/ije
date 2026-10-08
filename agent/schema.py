"""Ije v1 state schema.

Storage tags live in each Field's metadata, so governance checks can read them later:
  stored  -> Firestore, persists across sessions
  session -> ADK session state only, gone when the session ends
  derived -> computed from other fields, never stored
  sensitive=True -> needs GDPR care (health-related data)

No model has a user_id field on purpose: the backend takes it from the verified
Firebase token, never from the client or the LLM.
"""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl, model_validator


def tag(storage: str, sensitive: bool = False) -> dict:
    return {"storage": storage, "sensitive": sensitive}


Currency = Literal["GBP", "USD", "EUR"]  # ISO 4217


class Money(BaseModel):
    amount_minor: int = Field(
        ge=0, json_schema_extra=tag("stored"))  # 180000 = £1,800.00
    currency: Currency = Field(json_schema_extra=tag("stored"))


# ---------- Persona: who is travelling, reused across trips ----------

class Persona(BaseModel):
    dietary: list[Literal["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free"]] = Field(
        # empty = no restrictions
        default_factory=list, json_schema_extra=tag("stored", sensitive=True))
    allergies: list[str] = Field(
        default_factory=list, json_schema_extra=tag("stored", sensitive=True))
    accessibility: list[Literal["wheelchair", "step-free", "limited-walking", "visual", "hearing"]] = Field(
        default_factory=list, json_schema_extra=tag("stored", sensitive=True))
    interests: list[Literal["culture", "history", "food", "nature", "adventure",
                            "relaxation", "shopping", "nightlife", "art"]] = Field(
        default_factory=list, json_schema_extra=tag("stored"))
    preferred_currency: Currency = Field(json_schema_extra=tag("stored"))


# ---------- Vibe: how this trip should feel (the sliders) ----------

class Vibe(BaseModel):
    energy: int = Field(ge=1, le=5, json_schema_extra=tag(
        "stored"))            # 1 slow, 5 packed
    local_vs_tourist: int = Field(
        ge=1, le=5, json_schema_extra=tag("stored"))  # 1 local, 5 tourist
    refinement: int = Field(ge=1, le=5, json_schema_extra=tag(
        "stored"))        # was "Style": 1 casual, 5 upscale


# ---------- Weather: what it is, and how much to trust it ----------

class DayWeather(BaseModel):
    day: date
    condition: Literal["sunny", "cloudy", "rainy", "snowy", "mixed"]
    temp_c: int


class Weather(BaseModel):
    mode: Literal["forecast", "seasonal"] = Field(
        json_schema_extra=tag("derived"))
    # refresh when trip enters forecast window
    fetched_at: datetime = Field(json_schema_extra=tag("derived"))
    days: list[DayWeather] = Field(json_schema_extra=tag("derived"))


# ---------- Itinerary ----------

class ItineraryItem(BaseModel):
    # stable ID for drag/edit/delete
    item_id: str = Field(json_schema_extra=tag("stored"))
    # Places ID only; details re-fetched (Maps terms)
    place_id: str = Field(json_schema_extra=tag("stored"))
    day: date = Field(json_schema_extra=tag("stored"))
    slot: Literal["morning", "afternoon", "evening"] = Field(
        json_schema_extra=tag("stored"))
    category: Literal["sight", "activity", "food", "shopping", "nightlife"] = Field(
        json_schema_extra=tag("stored"))
    pick_type: Literal["local", "tourist"] = Field(
        json_schema_extra=tag("stored"))  # the card badge
    reason: str = Field(min_length=1, max_length=200,
                        json_schema_extra=tag("stored"))
    # must be on the allowlist (checked in a callback)
    source_url: HttpUrl = Field(json_schema_extra=tag("stored"))


class StayOption(BaseModel):
    kind: Literal["hotel", "airbnb"] = Field(json_schema_extra=tag("stored"))
    name: str = Field(json_schema_extra=tag("stored"))
    place_id: Optional[str] = Field(default=None, json_schema_extra=tag(
        "stored"))  # hotels from Places; Airbnb has none
    deep_link: HttpUrl = Field(json_schema_extra=tag(
        "stored"))  # Booking.com / Airbnb search URL
    reason: str = Field(min_length=1, max_length=200,
                        json_schema_extra=tag("stored"))


class PartyNeeds(BaseModel):
    """Combined needs of everyone on this trip. Not stored per person (data minimisation)."""
    dietary: list[Literal["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free"]] = Field(
        default_factory=list, json_schema_extra=tag("stored", sensitive=True))
    allergies: list[str] = Field(
        default_factory=list, json_schema_extra=tag("stored", sensitive=True))
    accessibility: list[Literal["wheelchair", "step-free", "limited-walking", "visual", "hearing"]] = Field(
        default_factory=list, json_schema_extra=tag("stored", sensitive=True))


class Trip(BaseModel):
    trip_id: str = Field(json_schema_extra=tag("stored"))
    destination: str = Field(json_schema_extra=tag("stored"))
    start_date: date = Field(json_schema_extra=tag("stored"))
    end_date: date = Field(json_schema_extra=tag("stored"))
    # total for the group, not per person
    budget_total: Money = Field(json_schema_extra=tag("stored"))
    base_place_id: Optional[str] = Field(
        # None until they pick a stay
        default=None, json_schema_extra=tag("stored"))
    weather: Optional[Weather] = Field(
        default=None, json_schema_extra=tag("derived"))
    items: list[ItineraryItem] = Field(
        default_factory=list, json_schema_extra=tag("stored"))
    stay_options: list[StayOption] = Field(
        default_factory=list, json_schema_extra=tag("stored"))
    travellers: int = Field(ge=1, le=20, json_schema_extra=tag("stored"))
    group_type: Literal["solo", "couple", "family", "friends", "business"] = Field(
        json_schema_extra=tag("stored"))
    party_needs: PartyNeeds = Field(
        default_factory=PartyNeeds, json_schema_extra=tag("stored", sensitive=True))

    @model_validator(mode="after")
    def trip_is_consistent(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.group_type == "solo" and self.travellers != 1:
            raise ValueError("solo trips must have exactly 1 traveller")
        if self.group_type == "couple" and self.travellers != 2:
            raise ValueError("couple trips must have exactly 2 travellers")
        for item in self.items:
            if not (self.start_date <= item.day <= self.end_date):
                raise ValueError(
                    f"item {item.item_id} falls outside the trip dates")
        return self


# ---------- Derived values: computed, never stored ----------

def budget_style(trip: Trip, persona: Persona) -> Literal["budget", "mid-range", "luxury"]:
    """Per-person, per-day spend decides the style. Thresholds are placeholders to tune."""
    days = (trip.end_date - trip.start_date).days + 1
    per_person_day = trip.budget_total.amount_minor / 100 / trip.travellers / days
    if per_person_day < 80:
        return "budget"
    if per_person_day < 200:
        return "mid-range"
    return "luxury"


# ---------- The shared state the agent and UI both read ----------

class IjeState(BaseModel):
    persona: Persona
    vibe: Vibe
    trip: Trip
