// Proves, against the installed @copilotkit/core and @ag-ui/client, that a token
// set in onAgentRunStarted reaches the agent as forwardedProps.firebaseIdToken,
// and that HttpAgent serialises it into the request body sent to /api/adk.
//
// Run: node scripts/verify-forwarded-props.mjs   (no network; fetch is captured)
import { CopilotKitCore } from "@copilotkit/core";
import { HttpAgent } from "@ag-ui/client";
import { EMPTY } from "rxjs";
import assert from "node:assert/strict";

// 1. Browser side: CopilotKitCore with a stale token in properties.
let seenInput;
class CaptureAgent extends HttpAgent {
  run(input) {
    seenInput = input;
    return EMPTY;
  }
}
const core = new CopilotKitCore({ properties: { firebaseIdToken: "stale-token" } });
core.subscribe({
  onAgentRunStarted: async () => {
    await new Promise((r) => setTimeout(r, 20)); // getIdToken() is async
    core.setProperties({ ...core.properties, firebaseIdToken: "fresh-token" });
  },
});
const agent = new CaptureAgent({ url: "http://unused/api/adk", agentId: "default" });
await core.runAgent({ agent }).catch(() => {});
assert.equal(seenInput?.forwardedProps?.firebaseIdToken, "fresh-token");
console.log("ok  core.runAgent sends the token set in onAgentRunStarted:", seenInput.forwardedProps);

// 2. Server side: HttpAgent puts forwardedProps in the POST body.
let body;
const http = new HttpAgent({
  url: "http://127.0.0.1:3000/api/adk",
  fetch: async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } });
  },
});
await http.runAgent({ forwardedProps: { firebaseIdToken: "fresh-token" } }).catch(() => {});
assert.equal(body?.forwardedProps?.firebaseIdToken, "fresh-token");
console.log("ok  HttpAgent request body carries forwardedProps.firebaseIdToken");

// 3. The middle hop: the same runtime setup as app/api/copilotkit/route.ts
//    receives the browser's run request and calls the /api/adk HttpAgent.
const { CopilotRuntime, createCopilotEndpoint, InMemoryAgentRunner } = await import("@copilotkit/runtime/v2");
let adkBody;
const adkAgent = new HttpAgent({
  url: "http://127.0.0.1:3000/api/adk",
  fetch: async (_url, init) => {
    adkBody = JSON.parse(init.body);
    const sse = [
      { type: "RUN_STARTED", threadId: adkBody.threadId, runId: adkBody.runId },
      { type: "RUN_FINISHED", threadId: adkBody.threadId, runId: adkBody.runId },
    ]
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join("");
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
  },
});
const app = createCopilotEndpoint({
  runtime: new CopilotRuntime({ agents: { default: adkAgent }, runner: new InMemoryAgentRunner() }),
  basePath: "/api/copilotkit",
});
const res = await app.fetch(
  new Request("http://localhost/api/copilotkit/agent/default/run", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      threadId: "t1",
      runId: "r1",
      messages: [{ id: "m1", role: "user", content: "hi" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: { firebaseIdToken: "fresh-token" },
    }),
  }),
);
await res.text(); // drain the stream so the run completes
assert.equal(res.status, 200);
assert.equal(adkBody?.forwardedProps?.firebaseIdToken, "fresh-token");
console.log("ok  /api/copilotkit runtime forwards forwardedProps to the /api/adk request unchanged");
