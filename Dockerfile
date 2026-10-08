FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY agent/pyproject.toml agent/uv.lock ./
RUN uv sync --frozen --no-dev

COPY agent/*.py ./

RUN useradd --create-home appuser
USER appuser

ENV PORT=8080
CMD ["/app/.venv/bin/python", "main.py"]
