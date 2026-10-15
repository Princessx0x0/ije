@echo off
REM The agent is a package at the repo root (pyproject.toml there).
cd /d "%~dp0\..\.." || exit /b 1

uv run python -m agent.main
