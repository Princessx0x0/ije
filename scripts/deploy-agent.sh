#!/usr/bin/env bash
# Deploy the Ije agent to Agent Runtime. Run from the repo root.
# Gemini is called through the US multi-region (ADR 009, replacing ADR 007); the runtime,
# sessions and Firestore stay in us-central1.
# Every Gemini call is screened by the ije-guardrails Model Armor template
# (ADR 009); the agent refuses to start without it.
# Token binding is opted out for now (ADR 008): firebase-admin and the Maps
# tools send plain bearer tokens. Remove once they call over mTLS.
# GOOGLE_API_USE_CLIENT_CERTIFICATE=false: Agent Runtime has a client certificate,
# so the SDKs switch to *.mtls.googleapis.com, but the us multi-region has no mTLS
# host (aiplatform.us.rep.mtls.googleapis.com does not resolve; ADR 009).
# GOOGLE_API_USE_MTLS_ENDPOINT=never is not enough: google-genai's async
# google-auth transport ignores it.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=ije-travel-511008
REGION=us-central1
ENGINE_ID=2768957581710852096
MODEL_ARMOR_TEMPLATE=projects/$PROJECT/locations/us/templates/ije-guardrails

# The local venv contains symlinks outside the project, which the packager
# rejects. Agent Runtime builds its own environment from the Dockerfile.
rm -rf .venv agent/.venv

agents-cli deploy -d agent_runtime \
  --project "$PROJECT" --region "$REGION" --agent-identity \
  --service-name ije \
  --update-env-vars "GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=$PROJECT,FIREBASE_PROJECT_ID=$PROJECT,IJE_MAPS_SERVICE_ACCOUNT=ije-maps@$PROJECT.iam.gserviceaccount.com,GOOGLE_CLOUD_LOCATION=us,GOOGLE_API_ENABLE_RUNTIME_BOUND_TOKEN=false,GOOGLE_API_USE_CLIENT_CERTIFICATE=false,AGENT_ENGINE_ID=$ENGINE_ID,AGENT_ENGINE_LOCATION=$REGION,IJE_MODEL_ARMOR_TEMPLATE=$MODEL_ARMOR_TEMPLATE" \
  --no-confirm-project --no-wait

# Restore the local environment for development.
uv sync
echo "Deploy started. Check with:"
echo "  agents-cli deploy --status -d agent_runtime --project $PROJECT --region $REGION --no-confirm-project"
