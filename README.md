# o-gents

**An agent with a VM of its own. Each one is a gent.**

o-gents gives local agents a persistent Linux environment in which to work.
A gent can write files, run programs, inspect the results, and continue from
where it stopped. Several gents can work together, pass actual artifacts, and
rerun each other's code in separate VMs.

Ostadix is part of the execution path. Its nested language blocks let a gent
keep work in a single `.O` program with explicit checks. The controller asks
Ostadix to check the source, binds execution to that source and its native
execution intent, and keeps the result. Another gent can read that record and
reproduce the checks in its own VM.

The point is to give small local models a better working environment: persistent
state, executable work, useful feedback, and a way to check each other. This is
an experimental implementation. It does not establish that a weak model becomes
a strong one, and a passing output check is only as useful as the check itself.

## Run it

Fresh setup currently requires **Apple Silicon, macOS 14+, Node.js 26+, npm,
and a running Ollama server with its CLI on PATH**. It also needs compatible
local Claude Desktop VM inputs. Those private inputs are not in this repository;
the accepted versions are recorded in
[`compatibility/claude-desktop.json`](compatibility/claude-desktop.json).

With access to this private repository:

```sh
git clone git@github.com:lostadi/o-gents.git
cd o-gents
./bin/gent setup
./bin/gent check
./bin/gent chat
```

Setup installs the application dependencies and default model, prepares a
private guest with Ostadix and language runtimes, and sets up the guest network.
The first guest build can take tens of minutes. Later runs reuse its verified
profile. Setup does not install Node or Ollama for you.

The application runs directly from `src/*.mjs`; there is no JavaScript or
TypeScript compilation step. `index.ts` is a separate demo.

Setup creates the `gent` shortcut in `~/.local/bin`. If that directory is not
already on your PATH, add it to your shell configuration:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Until then, use `./bin/gent` from the checkout. The examples below use `gent`.

## Give a gent work

```sh
gent chat
gent task "Run uname -m in your VM, then report its output" --local
gent task "Build a parser and have another gent check it" --agents 3 --local
```

Chat keeps the same VM and conversation between messages. `/status` shows the
saved ID, `/help` lists the controls, and `/bye` exits. A quoted message runs one
chat turn and exits:

```sh
gent chat "Write a short Python program, run it, and show me the result" --local
gent chat --resume GENT_ID
gent chat --text "Explain this idea"
```

`--text` is conversation without VM execution. Normal chat can execute commands.
Inference runs through Ollama on the initiating host; the model is not running
inside every guest. Each gent has its own VM disk and history. Task VMs default
to 768 MiB RAM and one vCPU each; model memory is additional.

`npm start` or `bun run start` opens chat when run in a terminal. For an MCP
client, use `bin/claude-vm-mcp` directly; piped startup without arguments retains
the stdio MCP interface.

A task starts one gent, with room to create a second for peer review.
`--agents 3` starts three and sets the total cap to three. Use `--max-agents N`
to choose a different cap. The default task budget is four reasoning rounds;
`--rounds N` changes it. Reaching the budget saves the task without declaring it
complete. Continue with `gent resume GENT_ID --rounds 8`.

Commands print progress, captured guest output, and the saved state path.
`gent check` inspects prerequisites; it does not boot a VM or run the model.
It also checks the separate diagnostic/MCP route, whose stricter memory policy
can be blocked while task/chat prerequisites are available.

The default model is `huihui-spark-vm:32k`, built from the local
Huihui-Spark-X2.5-4B Q4_K_M weights. The alias has a 32K context default, while
swarm requests use 8K unless `OVM_SWARM_CONTEXT` is set. Use `--model NAME`
for another installed Ollama model. The running Ollama server must support the
model architecture; downloaded weights alone are not enough.

## How gents check each other

The code path is:

```text
write .O source + output checks
    -> native source check and execution-intent inspection
    -> run that source in the producer's VM
    -> retain source, checks, output, and execution receipt
    -> a different gent reads the receipt
    -> rerun the same source and checks in the reviewer's VM
    -> allow the producer to finish once review and completion checks pass
```

A successful structured Ostadix run publishes the exact source and original
check contract automatically. A reviewer uses its artifact ID; it cannot swap
in different source or weaken the checks through the review action. Self-review
is rejected. A later failed review blocks completion again.

| Status | Meaning |
| --- | --- |
| `static-check-passed` | Native parsing and intent inspection passed. The submitted program has not run; skipped backend syntax checks remain unchecked. |
| `checks-passed` | Execution succeeded and every declared output check passed. |
| `peer-verified` | A different gent reran that source and those checks in its own VM and they passed. |

The peer requirement applies to published **structured Ostadix programs**.
Ordinary shell exploration, plain file publication, and chat do not automatically
receive the same verification. Two gents using the same model can still make the
same mistake. These receipts establish the recorded checks, not general program
correctness or the truth of every sentence in a final report.

Try the two-gent example from the checkout:

```sh
gent swarm --spec examples/ostadix-peer-review.json --local --dry-run
gent swarm --spec examples/ostadix-peer-review.json --local
```

This asks a builder to check and run a small program, and a checker to read and
rerun it. The real command uses Ollama and actual VMs. It is a model-driven task,
so it may need more rounds or correction; it is not a guaranteed demonstration
of autonomous completion. The [Ostadix control guide](docs/ostadix-agent-control.md)
documents the action payloads, evidence IDs, limits, failures, and resume behavior.

## Keep, copy, or move a gent

```sh
gent list
gent show GENT_ID
gent resume GENT_ID --mission "Continue the work" --local
gent clone GENT_ID my-copy
gent export GENT_ID ~/my-gent.ovm
gent import ~/my-gent.ovm my-imported-gent
gent resume my-imported-gent --local
```

Use an ID from `gent list`. Stop active work before cloning or exporting.
A `.ovm` capsule contains the saved history, guest disks, matching boot inputs,
and full model weights. Import creates a new instance and keeps the original
lineage. It saves stopped disks, not running VM memory.

The receiving host still needs o-gents, Node, a compatible Ollama server, and a
supported VM engine. Imported weights do not by themselves prove that inference
can start. `gent import FILE.ovm ID --private-model` keeps those weights with the
gent without also installing them in the host model store.

Capsules contain private guest contents and private boot inputs. Keep them
private. Allow space for the archive and imported disks; on filesystems without
reflinks, copies can require their full size. See the
[capsule format and model-serving guide](docs/agent-capsule-format.md).

## Local and remote execution

By default, local execution uses Apple's `Virtualization.framework` on Apple Silicon.
Task/chat also have a QEMU backend for Linux and macOS:

```sh
gent task "Run uname -m and report its output" --backend apple --local
gent check --backend qemu
gent chat --backend qemu --local
```

QEMU needs `qemu-system-aarch64`, `mke2fs`, `python3`, `lsof`, and an already
prepared ARM64 guest or an imported capsule. Fresh guest provisioning still
requires Apple Silicon. Cross-architecture QEMU uses slower software emulation.
The [setup guide](docs/getting-started.md#choose-the-vm-engine) covers the details.

Gents have NAT networking by default. `--local` keeps VM execution on this
machine and retains internet access; `--isolated` disables guest networking.
Automatic mode can add the shared Nebula network and use compatible connected
controllers when local capacity is low.

```sh
gent mode local
gent mode auto
gent peers
gent connect USER@HOST --name second-host
gent task "Your task" --on second-host
gent disconnect second-host
```

Prepare the other host and SSH access before connecting. It needs Node 26+,
rsync, o-gents, and the matching VM prerequisites. `--path /path/to/o-gents`
selects a nonstandard checkout. Connecting enrolls a trusted controller and
shares network signing authority; disconnecting removes placement but does not
revoke credentials already issued.

A communicating family stays on one controller. Independent families can use
different hosts. Inference stays on the initiating host. `--on NAME` and
`gent mode required` fail when the required destination is unavailable.
Automatic mode can keep work local. An uncertain dispatched operation is retained
for reconciliation on resume; it is not blindly replayed on another machine.
See [networking](docs/networking.md) and [gent pockets](docs/agent-pockets.md).

## What is in the repository

- `bin/` and `src/`: CLI, controller, model client, persistence, and VM adapters.
- `host/` and `prebuilt/`: Swift source and checksummed Apple Silicon launchers.
- `guest/`: guest provisioning, networking, and runtime integration.
- `examples/` and `docs/`: task specifications and the detailed interfaces.
- `integrations/`: optional Ostadix and OpenCode/MCP entrypoints.

Private VM images, saved gents under `vm/pockets/`, model weights, credentials,
and private native add-ons are excluded from Git. Fresh setup obtains compatible
private inputs locally. This repository alone is not a complete bootable guest.
Host Ostadix is optional for normal gent use; the structured execution path uses
Ostadix inside the guest.

The older `ovm` CLI, `OVM_*` settings, internal schemas, and `.ovm` format retain
their names for compatibility. The separate Apple-only `gent run`/MCP route
provides bounded diagnostics. Its lifecycle, readiness conditions, and resource
policy are documented in [Apple VM runner and MCP](docs/apple-mcp-runner.md).
Optional native host observations and actions use a separate capability broker;
keyboard, pointer, and application actions require explicit opt-in.

## Documentation and current verification

- [Getting started](docs/getting-started.md): installation, guest tools, and daily use.
- [Command reference](docs/command-reference.md): flags, aliases, and advanced commands.
- [Ostadix actions and peer review](docs/ostadix-agent-control.md): exact execution and review contracts.
- [Manual verification, October 4, 2026](docs/manual-verification-2026-10-04.md): commands exercised live, observed results, and paths that remain unverified.

The manual record distinguishes VM/controller behavior from model behavior.
It is not a claim that every platform, remote host, or possible task has passed.
