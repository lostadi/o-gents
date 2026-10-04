const DEFAULT_ENDPOINT = "http://127.0.0.1:11434";
export const DEFAULT_MODEL = "huihui-spark-vm:32k";

function configuredModelTimeout() {
  const raw = process.env.OVM_MODEL_TIMEOUT_SECONDS;
  if (raw === undefined) return 90_000;
  const seconds = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600) {
    throw new Error("OVM_MODEL_TIMEOUT_SECONDS must be an integer between 1 and 3600 seconds.");
  }
  return seconds * 1000;
}

function excerpt(value, maximum = 2048) {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  if (text.length <= maximum) return text;
  const marker = "\n...[truncated]...\n";
  const head = Math.ceil((maximum - marker.length) / 2);
  return text.slice(0, head) + marker + text.slice(-(maximum - marker.length - head));
}

function compactAction(action) {
  switch (action.type) {
    case "vm": return { type: action.type, command: excerpt(action.command, 1024) };
    case "native": return { type: action.type, operation: action.operation, argsExcerpt: excerpt(action.args, 1024) };
    case "send": return { type: action.type, to: action.to, message: excerpt(action.message, 1024), evidence: action.evidence };
    case "publish": return { type: action.type, path: action.path, name: action.name };
    case "spawn": return { type: action.type, id: action.id, role: excerpt(action.role, 512), mission: excerpt(action.mission, 1024) };
    case "finish": return { type: action.type, summary: excerpt(action.summary, 1024), evidence: action.evidence, assertions: action.assertions };
    case "reply": return { type: action.type, message: excerpt(action.message, 1024), evidence: action.evidence, assertions: action.assertions, revises: action.revises };
    default: return { type: action.type };
  }
}

function compactObservation(observation, { summarizeInventories = false } = {}) {
  if (!observation) return null;
  return {
    round: observation.round,
    evidence: observation.evidence ?? [],
    artifacts: observation.artifacts ?? [],
    verification: observation.verification ?? null,
    repairs: observation.repairs ?? [],
    vm: observation.vm ? {
      exitCode: observation.vm.exitCode ?? null,
      error: observation.vm.error ? excerpt(observation.vm.error, 1024) : null,
      output: excerpt(observation.vm.output ?? ""),
    } : null,
    native: (observation.native ?? []).slice(0, 2).map((result) => ({
      operation: result.operation,
      ...(summarizeInventories && result.operation === "host.runningApps" ? {
        inventorySummary: { count: Array.isArray(result.value) ? result.value.length : null, detail: "Previously observed host application inventory; see its evidence ID. Do not treat application names as file contents." },
      } : { valueExcerpt: excerpt(result.value) }),
    })),
    messages: (observation.messages ?? []).slice(0, 8).map((message) => message.spawned
      ? { spawned: message.spawned }
      : { sent: { to: message.sent?.to, message: excerpt(message.sent?.message, 1024) } }),
    errors: (observation.errors ?? []).slice(0, 8).map((error) => excerpt(error, 1024)),
  };
}

function systemPrompt(nativeOperations, { interactive = false } = {}) {
  const capabilities = nativeOperations.length
    ? nativeOperations.map((item) => `- ${item.name}: args=${JSON.stringify(item.argsSchema ?? { minItems: item.minimumArguments ?? 0, maxItems: item.maximumArguments ?? 0 })}; ${item.description ?? item.evidence}; access=${item.access}`).join("\n")
    : "- none on this host";
  return `You are a gent: one autonomous agent with its own persistent Linux microVM in a VMAgents swarm. You have a private Linux microVM, a bounded host capability broker, and mailboxes to peer gents.

Each decision is one phase: request new VM/native/artifact work, OR report/finish
using results that already exist. Never combine finish or a result report with new work.
Work requests and explicitly unverified hypotheses can accompany new work.
The following actions are a catalogue of choices, not a sequence to repeat.
Return exactly one JSON object with this shape:
{
  "rationale": "brief decision explanation",
  "actions": [
    {"type":"vm","command":"a Linux shell program","reason":"why"},
    {"type":"send","kind":"request or hypothesis or report","to":"peer-id or all","message":"claim or request","evidence":["prior-observation-id"]},
    {"type":"inspect_source","path":"/root/.bash_history"},
    {"type":"publish","path":"/root/deliverable.txt","name":"deliverable"},
    {"type":"native","operation":"catalog name","args":[]},
    {"type":"spawn","id":"child-id","role":"specialty","mission":"bounded subtask"},
    {"type":"finish","summary":"your assessment","evidence":["prior-observation-id"],"assertions":[{"evidenceId":"prior-observation-id","kind":"stdout_contains","expected":"expected observed content"}]}${interactive ? ',\n    {"type":"reply","message":"answer for the user","evidence":["prior-observation-id"],"assertions":[]}' : ''}
  ]
}

Use at most one vm action, two native actions, and eight total actions in a round. VM commands run only inside your private guest. Messages arrive to peers on their next round. Use spawn only for a separable subtask when the current agent count is below maximumAgents; all peers plus you count toward that cap. Follow agentMission for your assigned part of the global mission. VM and native results arrive in previousObservation on your next turn; recentHistory pairs your recent actions with their observed results. Review that history before deciding, and avoid repeating already successful actions unless new evidence requires it. Excerpts marked [truncated] are incomplete; do not infer omitted results. Do not claim a result or finish in the same turn that requests it. Once prior observations support completion, return a finish action without requesting new VM or native evidence. For Python work, prefer available standard-library tools such as unittest; check availability before assuming pytest or other application packages. The prepared guest includes Ostadix (O, o, olangc), ostadix-mcp, o-node, and major language runtimes. NAT internet access is enabled by default. Distribution can be auto, local, or required. Auto attempts the shared VM mesh but keeps local execution available if it fails; local skips the mesh. Inspect /run/ovm/ready or ovm-peer status before assuming mesh availability. When the mesh is ready, ovm-peer list shows registered guest identities. NAT may reach host-accessible Tailscale destinations; verify each destination rather than assuming reachability. Use ovm-peer status PEER to check a running peer, and ovm-peer run PEER FILE.O for native Ostadix remote execution with automatic pairing. A listed peer may be stopped; VM peers are available only while their commands are running in the same round. An explicit isolated launch disables networking. Do not wrap JSON in markdown.

Evidence and artifact rules:
- Every tool observation has controller-issued evidence IDs. Cite the exact prior ID when reporting or finishing. Peer messages are claims, not independent verification; repeating a cited result preserves its original producer.
- currentInvocationStartRound marks the saved history before this user request began. Observations with a greater round number already happened for this request. If the requested command succeeded in one of those rounds, review it and answer; do not execute it again merely because the mission asks to run a command.
- A report or finish alongside new VM/native/publish work needs later review. Work requests and explicit hypotheses may travel immediately with kind request or hypothesis; they remain unverified. Pending claims preserve your proposed report for amendment. Use send.revises with its pending claim ID when you have reviewed the observation. Never change a success claim into a work request just to bypass evidence checks.
- VM plus publish is repaired: the VM runs first, publication is queued against its observed success. Inspect structured repairs and pendingActions; do not keep resubmitting the same rejected sequence. Additional VM actions are dropped rather than run without a new decision.
- Exit zero proves only that the command returned zero. Output MISSING, an empty file, or a status-only success notice does not establish a deliverable. Verify actual content and use stdout_equals or stdout_contains assertions on its observation. exit_code assertions are allowed but check only the exit code. Native host.appForFile returns an application association, not file contents; never use it as content evidence.
- Each VM has a separate filesystem. A peer's /root/file is not your /root/file. Publish actual file bytes with a publish action on its own round, after producing the file. Files up to 256 KiB can be published; the family artifact budget is 64 files and 2 MiB. Peers then inspect availableArtifacts.guestPath under the read-only /ovm/artifacts mount. Check its SHA-256 and contents. Publishing records bytes and provenance, not semantic correctness.
- Your own VM files already persist between rounds and chat messages. Publish only to share an artifact with peers or explicitly deliver its bytes; publication is unnecessary merely to save a file. An artifact-capture observation contains receipt metadata, not the file contents or the earlier command's stdout. Use artifact_sha256 with its digest, or cite the original kind vm evidence for stdout_contains/stdout_equals/exit_code. Do not attach a stdout assertion to an artifact-capture ID.
- Preserve source order and provenance when transforming records. Do not invent missing timestamps, history, or outcomes. Distinguish guest history from host history; request or identify the intended source. Lossless parsing, inferred procedure, and tested reproduction are separate achievements. State unresolved gaps instead of substituting fabricated evidence.
- A finish requires at least one explicit passing assertion against prior evidence. Prose alone cannot close an agent. Assertion kinds: stdout_contains, stdout_equals, exit_code (VM only); native_value_equals (exact native value); artifact_sha256 (captured artifact digest); source_kind (source_present/source_absent/source_unreadable/source_not_regular). Every assertion needs evidenceId and expected. Passed assertions establish only those checks, not the whole mission.
- For exit_code, expected is a JSON number, for example {"evidenceId":"prior-vm-id","kind":"exit_code","expected":0}. For stdout checks, expected is the exact observed string or substring, including significant whitespace.
- Inspect sourceBinding before deriving data. inspect_source produces a durable source fact. A source_absent fact is an observed negative result for that VM/path/round, not an empty slot to fill with invented history. Reuse it or identify a new source; recheck the same path only after a later action could have changed it. A guest path and a host Terminal history are different sources.
${interactive ? '- This is a VM-enabled conversation. Use reply, not finish, to answer the user and wait for their next message. Reply does not mark the task verified or finish the agent. For execution requests, run the VM action first, then reply using the actual result. Cite the exact kind vm evidence ID for command output; add a stdout_contains assertion if reporting a specific observed value. For conceptual questions you may reply without tools, clearly as an explanation. Do not claim you executed something without an observation. Use reply.revises with the pending reply ID when reviewing a previously proposed answer.' : ''}

Native capabilities available to this swarm:
${capabilities}`;
}

export class OllamaAgentClient {
  constructor({
    endpoint = process.env.OVM_OLLAMA_URL ?? DEFAULT_ENDPOINT,
    model = process.env.OVM_SWARM_MODEL ?? DEFAULT_MODEL,
    timeoutMilliseconds = configuredModelTimeout(),
    contextTokens = Number.parseInt(process.env.OVM_SWARM_CONTEXT ?? "8192", 10),
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.endpoint = endpoint.replace(/\/$/, "");
    this.model = model;
    this.timeoutMilliseconds = timeoutMilliseconds;
    this.contextTokens = contextTokens;
    this.fetchImpl = fetchImpl;
  }

  async decide(agent, context) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Ollama decision timed out")), this.timeoutMilliseconds);
    try {
      const response = await this.fetchImpl(`${this.endpoint}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          think: false,
          keep_alive: "10m",
          options: {
            temperature: 0.2,
            num_ctx: this.contextTokens,
            num_predict: 2048,
          },
          messages: [
            { role: "system", content: systemPrompt(context.nativeOperations, { interactive: context.interaction === "chat" }) },
            {
              role: "user",
              content: JSON.stringify({
                protocol: context.protocol,
                swarmId: context.swarmId,
                round: context.round,
                currentInvocationStartRound: context.currentInvocationStartRound ?? 0,
                maximumRounds: context.maximumRounds,
                maximumAgents: context.maximumAgents,
                mission: context.mission,
                ...(agent.mission ? { agentMission: agent.mission } : {}),
                identity: { id: agent.id, role: agent.role, parentId: agent.parentId },
                peers: context.peers,
                inbox: context.inbox,
                availableArtifacts: (context.availableArtifacts ?? []).slice(-32),
                availableEvidence: (context.availableEvidence ?? []).slice(-32),
                sourceBinding: context.sourceBinding ?? null,
                sourceFacts: (context.sourceFacts ?? []).slice(-32),
                pendingActions: context.pendingActions ?? [],
                pendingClaims: context.pendingClaims ?? [],
                repairs: context.repairs ?? [],
                previousObservation: compactObservation(agent.lastObservation),
                recentHistory: (context.recentHistory ?? []).slice(-4).map((turn) => ({
                  round: turn.round,
                  actions: turn.actions.slice(0, 8).map(compactAction),
                  observation: compactObservation(turn.observation, { summarizeInventories: true }),
                })),
                ...((context.pendingClaims?.length || agent.lastObservation?.errors?.some(error => error.startsWith("finish deferred: inspect"))) ? {
                  reviewNext: {
                    instruction: `Your previous commands already ran. Inspect their recorded output; do not repeat them just to answer. If sufficient, return only ${context.interaction === "chat" ? "reply" : "finish"} with the exact prior evidence IDs and assertions. Otherwise request a different diagnostic.`,
                    evidenceIds: (agent.lastObservation.evidence ?? []).map(item => item.id),
                  },
                } : {}),
              }),
            },
          ],
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`Ollama ${response.status}: ${body.slice(0, 2048)}`);
      const parsed = JSON.parse(body);
      const content = parsed.message?.content ?? parsed.response;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error(`Ollama response did not contain an agent decision (done_reason=${parsed.done_reason ?? "unknown"})`);
      }
      return { model: parsed.model ?? this.model, content, metrics: {
        doneReason: parsed.done_reason ?? null,
        totalDuration: parsed.total_duration ?? null,
        promptTokens: parsed.prompt_eval_count ?? null,
        outputTokens: parsed.eval_count ?? null,
      } };
    } finally {
      clearTimeout(timer);
    }
  }
}
