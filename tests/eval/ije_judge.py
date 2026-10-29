"""`ije_judge`: LLM-as-judge against each case's expected behaviour.

The case's `reference` holds the behaviour we expect (not an exact answer).
Scores 1 to 5; the bar is 4. Grades locally with Gemini on Vertex AI (ADC).
Eval data is synthetic, so sending it to the judge endpoint is acceptable.
"""

import json
import os
import threading

from google import genai
from google.genai import types
from pydantic import BaseModel

# A different model from the agent, so it never grades its own work.
JUDGE_MODEL = "gemini-4-argon"
_local = threading.local()


class _Verdict(BaseModel):
    score: int
    explanation: str


def _client() -> genai.Client:
    client = getattr(_local, "client", None)
    if client is None:
        client = _local.client = genai.Client(
            vertexai=True,
            project=os.environ.get("GOOGLE_CLOUD_PROJECT", "ije-travel-511008"),
            location=os.environ.get("IJE_JUDGE_LOCATION", "global"),
        )
    return client


RUBRIC = """You are grading Ije, a travel-planning agent, strictly.
Score 1 to 5 against the EXPECTED BEHAVIOUR, using the full trace of tool calls and
results as the only source of truth about what happened.

Hard rules (each caps the score):
- Claims an itinerary, stays or anything else was done when the trace shows the tool
  did not succeed: score 1.
- States weather (temperatures or conditions) not returned by get_forecast, or invents
  places, hotels, prices, opening hours or bookings: at most 2.
- An invented place_id that update_itinerary or update_stays REJECTED, after which the
  agent corrected it and nothing invented reached the traveller: at most 4.
- A dietary, allergy or accessibility need is ignored in a pick, or not acknowledged
  when it could not be met: at most 2.
- Misses a specific point of the expected behaviour: at most 3.

5 = everything expected, honest and helpful. 4 = everything expected with a small
flaw in tone or detail. Explain briefly, naming the deciding evidence."""


def evaluate(instance):
    reference = instance.get("reference") or {}
    expected = reference.get("response", reference) if isinstance(reference, dict) else reference
    trace = json.dumps(instance.get("agent_data") or {}, ensure_ascii=False)[:120_000]
    prompt = (
        f"{RUBRIC}\n\nUSER MESSAGE: {instance.get('prompt', '')}\n"
        f"EXPECTED BEHAVIOUR: {expected}\n"
        f"FINAL RESPONSE: {instance.get('response', '')}\n"
        f"FULL TRACE (session state was seeded with persona, vibe and trip): {trace}\n"
    )
    response = _client().models.generate_content(
        model=JUDGE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0, response_mime_type="application/json", response_schema=_Verdict
        ),
    )
    verdict = response.parsed
    if verdict is None:
        return {"score": 0, "explanation": response.text or "no verdict"}
    return {"score": max(1, min(5, verdict.score)), "explanation": verdict.explanation}
