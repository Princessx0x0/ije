# Ije evals

Agent behaviour changes need these to pass before any deploy.

## Run

From the repo root:

```bash
uv run python tests/eval/make_dataset.py          # dates relative to today
G=~/.local/share/uv/tools/google-agents-cli/bin/python
$G tests/eval/agents_cli_eval.py eval generate --dataset tests/eval/datasets/ije-trips.json -o artifacts/traces/trips --concurrency 1
$G tests/eval/agents_cli_eval.py eval grade --traces artifacts/traces/trips --config tests/eval/eval_config.yaml
```

Repeat with `ije-holdout.json` only when you think you are done. Results land in
`artifacts/grade_results/` (git-ignored).

- `agents_cli_eval.py` wraps agents-cli because 1.10 seeds session state in a way
  ADK 2.11 refuses. Remove it when agents-cli seeds through `state`.
- `--concurrency 1`: parallel planning runs hit Gemini 429s and agents-cli's
  120 s stream timeout.

## Metrics (`eval_config.yaml`)

- `plan_rules` (code, 0 or 1): what the agent did. Plans need the forecast first and
  an accepted `update_itinerary`; stay requests need accepted `update_stays`; no
  unknown tools, no `unverified` places, no unrequested changes.
- `ije_judge` (Gemini 4 Argon judge on the global endpoint, 1 to 5): the case `reference` is the expected
  behaviour. Caps for false claims, invented data and ignored needs.

**Bar:** `plan_rules` 1 and `ije_judge` >= 4 on every case, core and held out.

## Datasets

- `ije-trips.json`: the cases fixes are made against.
- `ije-holdout.json`: graded last. `gluten_free_peanut_allergy` and `wheelchair_solo`
  have since informed fixes; `shellfish_allergy_group` was added after them. Add a
  fresh held-out case whenever one has been used to drive a fix.
