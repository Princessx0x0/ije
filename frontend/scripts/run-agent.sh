#!/bin/bash

# The agent is a package at the repo root (pyproject.toml there).
cd "$(dirname "$0")/../.." || exit 1

uv run python -m agent.main
