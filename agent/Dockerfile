FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY main.py schema.py ./

RUN useradd --create-home appuser
USER appuser

ENV PORT=8080
CMD ["/app/.venv/bin/python", "main.py"]
