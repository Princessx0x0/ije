"""`plan_rules`: deterministic checks on what the agent DID (its tool calls).

Score 1 (pass) or 0 (fail), with the reason. The judge metric covers wording;
this one cannot be talked round.
"""

ALLOWED_TOOLS = {"get_forecast", "search_places", "update_itinerary", "update_stays"}


def _parts(instance):
    for turn in (instance.get("agent_data") or {}).get("turns") or []:
        for event in turn.get("events") or []:
            if event.get("author") == "user":
                continue
            for part in (event.get("content") or {}).get("parts") or []:
                yield part


def _calls(instance):
    """(kind, name, payload) in order: kind is "call" or "response"."""
    for part in _parts(instance):
        call = part.get("function_call") or part.get("functionCall")
        if call:
            yield "call", call.get("name"), call.get("args") or {}
        resp = part.get("function_response") or part.get("functionResponse")
        if resp:
            yield "response", resp.get("name"), resp.get("response") or {}


def _prompt_text(instance):
    """The user's message: the case prompt, or the first user event when state was seeded."""
    prompt = instance.get("prompt") or {}
    parts = prompt.get("parts") if isinstance(prompt, dict) else None
    if not parts:
        for turn in (instance.get("agent_data") or {}).get("turns") or []:
            for event in turn.get("events") or []:
                if event.get("author") == "user" and event.get("content"):
                    parts = event["content"].get("parts")
                    break
            if parts:
                break
    if parts:
        return " ".join(p.get("text") or "" for p in parts)
    return str(prompt)


def evaluate(instance):
    steps = list(_calls(instance))
    names = [name for kind, name, _ in steps if kind == "call"]

    unknown = sorted({n for n in names if n not in ALLOWED_TOOLS})
    if unknown:
        return {"score": 0, "explanation": f"Called tools that do not exist: {unknown}"}
    if any("unverified" in str(payload) for kind, name, payload in steps if kind == "call"):
        return {"score": 0, "explanation": "Used an unverified place_id."}

    def succeeded(tool):
        return [i for i, (k, n, p) in enumerate(steps) if k == "response" and n == tool and p.get("status") == "success"]

    text = _prompt_text(instance).lower()
    if "plan my trip" in text:
        saved = succeeded("update_itinerary")
        if not saved:
            return {"score": 0, "explanation": "Asked to plan, but no itinerary was accepted by update_itinerary."}
        forecast_first = any(k == "call" and n == "get_forecast" for k, n, _ in steps[: saved[0]])
        if not forecast_first:
            return {"score": 0, "explanation": "Planned without checking the forecast first."}
        return {"score": 1, "explanation": "Forecast checked, then a full itinerary was accepted."}

    if "stay" in text or "hotel" in text:
        if not succeeded("update_stays"):
            return {"score": 0, "explanation": "Asked where to stay, but no stays were accepted by update_stays."}
        return {"score": 1, "explanation": "Real lodging saved through update_stays."}

    writes = [n for n in names if n in ("update_itinerary", "update_stays")]
    if writes:
        return {"score": 0, "explanation": f"Changed the trip when not asked: {writes}"}
    return {"score": 1, "explanation": "No unrequested changes."}
