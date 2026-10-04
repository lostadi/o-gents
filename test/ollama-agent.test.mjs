import test from "node:test";
import assert from "node:assert/strict";
import { OllamaAgentClient } from "../src/ollama-agent.mjs";

function preserveTimeoutEnvironment(t) {
  const previous = process.env.OVM_MODEL_TIMEOUT_SECONDS;
  t.after(() => {
    if (previous === undefined) delete process.env.OVM_MODEL_TIMEOUT_SECONDS;
    else process.env.OVM_MODEL_TIMEOUT_SECONDS = previous;
  });
}

test("model timeout defaults to 90 seconds and accepts a bounded slow-host override", t => {
  preserveTimeoutEnvironment(t);
  delete process.env.OVM_MODEL_TIMEOUT_SECONDS;
  assert.equal(new OllamaAgentClient().timeoutMilliseconds, 90_000);
  for (const seconds of [1, 300, 3600]) {
    process.env.OVM_MODEL_TIMEOUT_SECONDS = String(seconds);
    assert.equal(new OllamaAgentClient().timeoutMilliseconds, seconds * 1000);
  }
});

test("invalid model timeout settings fail before any inference dispatch", t => {
  preserveTimeoutEnvironment(t);
  let calls = 0;
  for (const raw of ["", "0", "-1", "1.5", "1e2", " 90", "90s", "3601", "Infinity", "99999999999999999999"]) {
    process.env.OVM_MODEL_TIMEOUT_SECONDS = raw;
    assert.throws(() => new OllamaAgentClient({ fetchImpl: async () => { calls++; } }), /OVM_MODEL_TIMEOUT_SECONDS.*1 and 3600/);
  }
  assert.equal(calls, 0);
});

test("explicit constructor timeout retains precedence and aborts its pending request", async t => {
  preserveTimeoutEnvironment(t);
  process.env.OVM_MODEL_TIMEOUT_SECONDS = "invalid-but-overridden";
  let calls = 0;
  const client = new OllamaAgentClient({
    timeoutMilliseconds: 10,
    fetchImpl: async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
  });
  assert.equal(client.timeoutMilliseconds, 10);
  await assert.rejects(client.decide({ id: "scout", role: "observe" }, { nativeOperations: [] }), /Ollama decision timed out/);
  assert.equal(calls, 1);
});

test("Ollama pocket requests disable hidden thinking and retain completion metadata", async () => {
  let request;
  const client = new OllamaAgentClient({
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({
        model: "tiny-local",
        done_reason: "stop",
        message: { content: '{"rationale":"ok","actions":[]}' },
        eval_count: 12,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await client.decide({ id: "scout", role: "observe", parentId: null, lastObservation: {
    round: 1, errors: ["failure: " + "x".repeat(5000) + ":end"],
  } }, {
    protocol: "ovm.agent-pocket/v1",
    swarmId: "test",
    round: 1,
    maximumRounds: 2,
    mission: "test",
    peers: [],
    inbox: [],
    nativeOperations: [],
  });
  assert.equal(request.think, false);
  assert.equal(request.format, "json");
  assert.equal(result.metrics.doneReason, "stop");
  assert.equal(result.metrics.outputTokens, 12);
  const context = JSON.parse(request.messages[1].content);
  assert.equal(context.previousObservation.errors[0].length, 1024);
  assert.match(context.previousObservation.errors[0], /^failure: .*\n\.\.\.\[truncated\]\.\.\.\n.*:end$/);
});
