import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { createDefaultAgent } from "@/agent";
import { handle } from "hono/vercel";

// CopilotKit Intelligence is deliberately not used (ADR 004).
// Conversation state lives in Agent Platform Sessions on Agent Runtime.
//
// The runtime also sends usage telemetry to CopilotKit by default. ADR 004
// allows no third party unless an ADR approves it, so it is switched off here,
// in code, before the runtime is constructed (the flag is read at call time).
process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";

const runtime = new CopilotRuntime({
  agents: {
    default: createDefaultAgent(),
  },
  runner: new InMemoryAgentRunner(),
});

const app = createCopilotEndpoint({
  runtime,
  basePath: "/api/copilotkit",
});

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
