import { HttpAgent } from "@ag-ui/client";

/**
 * CopilotKit always talks to this app's own /api/adk proxy route, which adds
 * Google credentials server-side and forwards to the agent (local or Agent
 * Runtime). See src/app/api/adk/route.ts.
 */
export function createDefaultAgent(): HttpAgent {
  const port = process.env.PORT ?? "3000";
  return new HttpAgent({
    url: `http://127.0.0.1:${port}/api/adk`,
  });
}
