FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY agent/ ./agent/

RUN useradd --create-home appuser
USER appuser

ENV PORT=8080
# AG-UI serving with Firebase identity (ADR 005). Never ADK's api_server.
CMD ["/app/.venv/bin/python", "-m", "agent.main"]
