#!/bin/bash

# The agent's Python project lives at the repo root.
cd "$(dirname "$0")/../.." || exit 1

uv sync
