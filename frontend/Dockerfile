# Ije frontend for Cloud Run (scripts/deploy-frontend.sh builds it with Cloud Build).
# No secrets in the image: only the public NEXT_PUBLIC_FIREBASE_* web config,
# written to .env.production by the deploy script. The agent is NOT in this
# image; it runs on Agent Runtime (ADR 003) and is reached via /api/adk.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: postinstall sets up the local Python agent, not needed here.
RUN npm ci --ignore-scripts

FROM node:22-slim AS build
WORKDIR /app
# No telemetry to Vercel or CopilotKit (no third parties without an ADR).
ENV NEXT_TELEMETRY_DISABLED=1 COPILOTKIT_TELEMETRY_DISABLED=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 COPILOTKIT_TELEMETRY_DISABLED=true \
    PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
