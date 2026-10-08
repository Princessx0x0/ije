import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { createDefaultAgent } from "@/agent";
import { handle } from "hono/vercel";

// CopilotKit Intelligence is deliberately not used (ADR 004).
// Conversation state lives in Agent Platform Sessions on Agent Runtime.
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
