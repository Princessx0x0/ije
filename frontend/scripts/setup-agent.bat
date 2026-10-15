@echo off
REM The agent's Python project lives at the repo root.
cd /d "%~dp0\..\.." || exit /b 1

uv sync
