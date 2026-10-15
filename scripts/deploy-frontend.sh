#!/usr/bin/env bash
# Deploy the Ije frontend to Cloud Run. Run from the repo root.
# Builds frontend/Dockerfile with Cloud Build. Public ingress (ADR 005): identity
# is enforced in the app; the agent on Agent Runtime stays IAM-only.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=ije-travel-511008
REGION=us-central1
SERVICE=ije-frontend
SA=ije-frontend@$PROJECT.iam.gserviceaccount.com
AGENT_RUNTIME_URL="https://us-central1-aiplatform.googleapis.com/reasoningEngines/v1/projects/788712976210/locations/us-central1/reasoningEngines/2768957581710852096/api"

# Only the public Firebase web config goes into the build; never the rest of .env.
grep '^NEXT_PUBLIC_FIREBASE_' frontend/.env > frontend/.env.production
trap 'rm -f frontend/.env.production' EXIT
for key in API_KEY AUTH_DOMAIN PROJECT_ID APP_ID; do
  grep -q "^NEXT_PUBLIC_FIREBASE_${key}=." frontend/.env.production || { echo "Missing NEXT_PUBLIC_FIREBASE_${key} in frontend/.env"; exit 1; }
done

gcloud run deploy "$SERVICE" \
  --source frontend \
  --project "$PROJECT" --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --set-env-vars "AGENT_RUNTIME_URL=$AGENT_RUNTIME_URL,GOOGLE_CLOUD_PROJECT=$PROJECT,COPILOTKIT_TELEMETRY_DISABLED=true,NEXT_TELEMETRY_DISABLED=1" \
  --quiet
