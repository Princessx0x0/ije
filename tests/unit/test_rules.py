"""Code tests for the itinerary and Maps-terms rules (agent/tools/rules.py)."""

from datetime import date
from urllib.parse import parse_qs, urlparse

from agent.tools import rules


def _items(day: str, slots=("morning", "afternoon", "evening"), food=True):
    out = [{"day": day, "slot": s, "category": "sight"} for s in slots]
    if food and out:
        out[0]["category"] = "food"
    return out


def test_full_coverage_has_no_problems():
    items = _items("2027-04-01") + _items("2027-04-02")
    assert rules.coverage_problems(items, date(2027, 4, 1), date(2027, 4, 2)) == []


def test_missing_day_and_slots_are_named():
    items = _items("2027-04-01", slots=("morning",))
    problems = rules.coverage_problems(items, date(2027, 4, 1), date(2027, 4, 2))
    assert "2027-04-01 has no afternoon, evening item" in problems
    assert any(p.startswith("2027-04-02 has no morning, afternoon, evening") for p in problems)


def test_a_day_without_food_is_a_problem():
    problems = rules.coverage_problems(_items("2027-04-01", food=False), date(2027, 4, 1), date(2027, 4, 1))
    assert problems == ["2027-04-01 has no food item (add a place to eat)"]


def test_reason_naming_the_place_is_caught_case_insensitively():
    assert rules.reason_names_place("Lunch at time out market lisboa, buzzing", "Time Out Market Lisboa")
    assert not rules.reason_names_place("A buzzing food hall for your first lunch", "Time Out Market Lisboa")
    assert not rules.reason_names_place("Anything", None)


def test_maps_url_is_built_from_the_place_id_only():
    url = urlparse(rules.maps_url("ChIJabc"))
    assert url.netloc == "www.google.com"
    assert parse_qs(url.query)["query_place_id"] == ["ChIJabc"]


def test_airbnb_link_is_a_fixed_template():
    url = urlparse(rules.airbnb_search_url("São Paulo", date(2027, 4, 1), date(2027, 4, 4), 2))
    assert url.netloc == "www.airbnb.com"
    assert url.path == "/s/S%C3%A3o%20Paulo/homes"
    assert parse_qs(url.query) == {"checkin": ["2027-04-01"], "checkout": ["2027-04-04"], "adults": ["2"]}


def test_forecast_window():
    today = date(2026, 10, 15)
    assert rules.forecast_available_from(date(2026, 10, 24), today) is None  # day 10 of the window
    assert rules.forecast_available_from(date(2026, 10, 25), today) == date(2026, 10, 16)
    assert rules.forecast_available_from(date(2026, 12, 1), today) == date(2026, 11, 22)


def test_condition_mapping():
    assert rules.condition_for("CLEAR") == "sunny"
    assert rules.condition_for("MOSTLY_CLOUDY") == "cloudy"
    assert rules.condition_for("LIGHT_RAIN_SHOWERS") == "rainy"
    assert rules.condition_for("RAIN_AND_SNOW") == "snowy"
    assert rules.condition_for("SCATTERED_THUNDERSTORMS") == "rainy"
    assert rules.condition_for(None) == "mixed"
