"""Build the Ije eval datasets with dates relative to today.

The forecast only reaches 10 days ahead, so fixed dates would quietly turn
"near" trips into "far" ones. Run before every eval:

    uv run python tests/eval/make_dataset.py
    agents-cli eval run --dataset tests/eval/datasets/ije-trips.json --config tests/eval/eval_config.yaml

ije-holdout.json is kept out of the fix loop and graded only at the end.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).parent / "datasets"
TODAY = date.today()


def persona(**kw):
    return {"dietary": [], "allergies": [], "accessibility": [], "interests": [], "preferred_currency": "GBP", **kw}


def trip(trip_id, destination, start_in, days, travellers, group_type, budget_gbp, **kw):
    start = TODAY + timedelta(days=start_in)
    return {
        "trip_id": trip_id,
        "destination": destination,
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=days - 1)).isoformat(),
        "budget_total": {"amount_minor": budget_gbp * 100, "currency": "GBP"},
        "base_place_id": None,
        "items": [],
        "stay_options": [],
        "travellers": travellers,
        "group_type": group_type,
        "party_needs": {"dietary": [], "allergies": [], "accessibility": []},
        **kw,
    }


def case(case_id, text, state, expected):
    return {
        "eval_case_id": case_id,
        "agent_data": {
            "turns": [
                {
                    "turn_index": 0,
                    "events": [
                        {
                            "author": "user",
                            "content": {"role": "user", "parts": [{"text": text}]},
                            "state_delta": state,
                        }
                    ],
                }
            ]
        },
        # The judge reads this as the expected behaviour, not an exact answer.
        "reference": {"response": {"role": "model", "parts": [{"text": expected}]}},
    }


VIBE = {"energy": 3, "local_vs_tourist": 3, "refinement": 3}

CORE = [
    case(
        "near_trip_full_days",
        "Plan my trip.",
        {
            "persona": persona(interests=["art", "food"]),
            "vibe": {"energy": 2, "local_vs_tourist": 2, "refinement": 3},
            "trip": trip("eval-1", "Lisbon", 4, 3, 2, "couple", 1500),
        },
        "Checks the forecast (it is within 10 days) and plans all 3 days with a morning, afternoon and "
        "evening item and food every day, leaning local and unhurried, using searched places. Any weather "
        "mentioned matches the forecast tool output.",
    ),
    case(
        "family_halal_step_free",
        "Plan my trip.",
        {
            "persona": persona(interests=["history", "food"], dietary=["halal"]),
            "vibe": VIBE,
            "trip": trip(
                "eval-2", "Istanbul", 40, 3, 4, "family", 2400,
                party_needs={"dietary": ["halal"], "allergies": [], "accessibility": ["step-free"]},
            ),
        },
        "Plans all 3 days. Every food pick is halal (searched as halal). Picks suit a family and step-free "
        "access, preferring places with a wheelchair accessible entrance, and says plainly if step-free "
        "access could not be confirmed. The forecast is unavailable, so no temperatures or conditions are stated.",
    ),
    case(
        "far_trip_no_invented_weather",
        "Plan my trip. What will the weather be like?",
        {
            "persona": persona(interests=["nature", "culture"], dietary=["vegan"]),
            "vibe": {"energy": 3, "local_vs_tourist": 2, "refinement": 2},
            "trip": trip("eval-3", "Kyoto", 60, 2, 1, "solo", 900),
        },
        "Plans both days with vegan food picks. Says the forecast is not available yet and when it will be. "
        "Does not state any temperature or weather condition for the trip dates.",
    ),
    case(
        "hotel_suggestions",
        "Can you suggest somewhere to stay? Mid-range, near the old town.",
        {
            "persona": persona(interests=["history"]),
            "vibe": VIBE,
            "trip": trip("eval-4", "Edinburgh", 30, 3, 2, "couple", 1200),
        },
        "Searches for lodging and saves up to 3 real hotels with update_stays, suited to a mid-range budget. "
        "Does not invent hotel names, prices or availability, and does not claim to book anything.",
    ),
    case(
        "out_of_scope_booking",
        "Book us flights from London and reserve the restaurants.",
        {
            "persona": persona(),
            "vibe": VIBE,
            "trip": trip("eval-5", "Rome", 20, 2, 2, "couple", 1000),
        },
        "Says clearly that it cannot book flights or reserve restaurants, without pretending to, and offers "
        "what it can do instead (plan the days, suggest places). Does not invent booking confirmations.",
    ),
]

HOLDOUT = [
    case(
        "gluten_free_peanut_allergy",
        "Plan my trip.",
        {
            "persona": persona(interests=["food", "shopping"], dietary=["gluten-free"], allergies=["peanuts"]),
            "vibe": {"energy": 4, "local_vs_tourist": 3, "refinement": 4},
            "trip": trip("eval-6", "Paris", 6, 2, 2, "friends", 1600),
        },
        "Plans both days with every food pick suited to gluten-free needs and a peanut allergy, and tells the "
        "traveller to confirm allergens with each restaurant. Uses the forecast. Fairly busy, fairly upscale.",
    ),
    case(
        "wheelchair_solo",
        "Plan my trip.",
        {
            "persona": persona(interests=["art", "nature"], accessibility=["wheelchair"]),
            "vibe": {"energy": 1, "local_vs_tourist": 4, "refinement": 3},
            "trip": trip("eval-7", "Barcelona", 25, 2, 1, "solo", 800),
        },
        "Plans both days at a slow pace, choosing places with a wheelchair accessible entrance where known, "
        "and says when accessibility could not be confirmed. Leans towards well known sights.",
    ),
    # Added after gluten_free_peanut_allergy exposed an allergy gap (that case
    # then fed a fix, so it is no longer independent; this one has not).
    case(
        "shellfish_allergy_group",
        "Plan my trip.",
        {
            "persona": persona(interests=["nightlife", "food"]),
            "vibe": {"energy": 5, "local_vs_tourist": 1, "refinement": 2},
            "trip": trip(
                "eval-8", "Porto", 35, 2, 5, "friends", 2000,
                party_needs={"dietary": [], "allergies": ["shellfish"], "accessibility": []},
            ),
        },
        "Plans both busy days with local, casual picks and nightlife in the evenings. A friend's shellfish "
        "allergy shapes every food pick (searched for, not just mentioned), no place is called allergy-safe, "
        "and the group is told to confirm allergens. Forecast unavailable, so no weather stated, with the date.",
    ),
]


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, cases in (("ije-trips.json", CORE), ("ije-holdout.json", HOLDOUT)):
        (OUT / name).write_text(json.dumps({"eval_cases": cases}, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {OUT / name} ({len(cases)} cases)")
