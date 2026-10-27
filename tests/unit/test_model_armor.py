"""Model Armor (ADR 009): every Gemini call carries the template, blocks get a plain reply."""

import importlib
import sys
from types import SimpleNamespace

import pytest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

TEMPLATE = "projects/ije-travel-511008/locations/us/templates/ije-guardrails"


def _load_agent(monkeypatch, **env):
    for key in ("IJE_MODEL_ARMOR_TEMPLATE", "AGENT_ENGINE_ID"):
        monkeypatch.delenv(key, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    sys.modules.pop("agent.agent", None)
    return importlib.import_module("agent.agent")


def _context(agent):
    return SimpleNamespace(agent_name=agent.AGENT_NAME, _invocation_context=SimpleNamespace(end_invocation=False))


def test_every_call_carries_the_template(monkeypatch):
    agent = _load_agent(monkeypatch, IJE_MODEL_ARMOR_TEMPLATE=TEMPLATE)
    armor = agent.root_agent.generate_content_config.model_armor_config
    assert armor.prompt_template_name == TEMPLATE
    assert armor.response_template_name == TEMPLATE


def test_agent_runtime_refuses_to_start_without_a_template(monkeypatch):
    with pytest.raises(RuntimeError, match="IJE_MODEL_ARMOR_TEMPLATE"):
        _load_agent(monkeypatch, AGENT_ENGINE_ID="2768957581710852096")


def test_a_blocked_prompt_gets_a_plain_reply_and_ends_the_turn(monkeypatch):
    agent = _load_agent(monkeypatch, IJE_MODEL_ARMOR_TEMPLATE=TEMPLATE)
    ctx = _context(agent)
    blocked = LlmResponse(error_code=types.BlockedReason.MODEL_ARMOR, error_message="Blocked by template")

    reply = agent.after_model(ctx, blocked)

    assert reply.content.parts[0].text == agent.BLOCKED_REPLY
    assert ctx._invocation_context.end_invocation is True


def test_other_errors_pass_through(monkeypatch):
    agent = _load_agent(monkeypatch, IJE_MODEL_ARMOR_TEMPLATE=TEMPLATE)
    ctx = _context(agent)
    assert agent.after_model(ctx, LlmResponse(error_code="RESOURCE_EXHAUSTED")) is None
    assert ctx._invocation_context.end_invocation is False
