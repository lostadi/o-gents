# VMAgents

**Autonomous agents with a VM of their own.**

A **gent** is an autonomous agent with its own persistent Linux VM, local model,
and portable state; a team contains multiple **gents**.
Use `gent` for daily commands. The older `ovm` command and nested forms such as
`ovm agent list` remain compatible aliases. Technical `OVM_*` settings, guest
paths, and the `.ovm` capsule format retain their existing names.

VMAgents runs Ollama-backed gents in private, persistent ARM64 Linux VMs. Everyday
commands keep local work available, add trusted compatible VM hosts when useful,
and save gents with their files, history and model weights. The separate
OpenCode/MCP path can inspect, boot, read the console, run a bounded diagnostic,
and stop a private copy of Claude Desktop's VM. Ollama does not launch MCP servers directly. OpenCode hosts this MCP; the default
transaction mode preserves the bounded start-operation-stop route through
`@vm_operator`. An opt-in process-lifetime mode can instead warm one VM per MCP
controller and reuse it until that controller exits.

Gent tasks and VM chat select Apple's public `Virtualization.framework` on
Apple Silicon macOS, or QEMU on Linux and other supported Macs. Both engines
boot the same prepared ARM64 guest filesystem. The Apple runner is a clean
Swift executable; neither VM engine loads Claude's private native add-ons or
depends on Electron or AppKit. The optional Node capability broker loads two
separately qualified add-ons only inside disposable subprocesses. The separate
normal run/MCP route remains Apple-only.

The repository contains the source, signed Apple Silicon launchers, checksums,
compatibility profile, Ostadix and OpenCode integration templates, installer,
and tests. It deliberately excludes Claude's VM bundle and helper image. Each
fresh Apple setup must obtain those private inputs from a locally installed
copy of Claude Desktop, and accepts only the reviewed hashes in
[`compatibility/claude-desktop.json`](compatibility/claude-desktop.json).
QEMU hosts use a transferred verified guest or an imported private capsule;
fresh guest provisioning still requires Apple Silicon.

Optional private research may be present locally under `research/decoded-claude/`,
including recovered pseudo-C and a native API atlas. That research and
`examples/verified_neuro_decompilations.jsonl` are excluded from the product
repository and npm package; a fresh clone does not include them.

VMAgents can now use qualified copies of `claude-native-binding.node` and
`computer_use.node` through an isolated capability broker. The active gent
swarm pairs each local Ollama session with a private persistent VM,
delivers typed peer messages between pockets, and permits bounded child-pocket
spawning. See [`docs/agent-pockets.md`](docs/agent-pockets.md).

## Start here: no JavaScript or TypeScript compilation

The application is JavaScript (`src/*.mjs`) executed directly by Node.js 26+.
The `bin/gent` launcher runs the appropriate modules. `index.ts` is a standalone
TypeScript demo, not the application entrypoint. No `tsc` or `npm run build`
step is needed. See [the step-by-step setup and run guide](docs/getting-started.md).
The [complete command reference](docs/command-reference.md) includes every VMAgents
command group, aliases, options, portable-gent workflows, and advanced limits.

The default local model is **huihui-ai/Huihui-Spark-X2.5-4B-abliterated**, using
[okenk's Q4_K_M GGUF conversion](https://huggingface.co/okenk/Huihui-Spark-X2.5-4B-abliterated-GGUF)
and the Ollama alias `huihui-spark-vm:32k`. The alias sets a 32768-token default;
swarm requests use 8192 tokens unless `OVM_SWARM_CONTEXT` overrides that value.
Spark inference was verified with Ollama server 0.35.0. Server 0.33.2 rejected
its `spark2_5` architecture, so downloaded weights alone do not establish that
the running engine can load it. Check the server, rather than only the CLI,
with `curl -fsS http://127.0.0.1:11434/api/version`.

```zsh
./bin/gent setup
gent check
gent chat
# Leave the chat with /bye, then run a task:
gent task "Run uname -m in your VM, then report its output"
# Request a team explicitly:
gent task "Your task" --agents 3
gent chat --resume GENT_ID             # Continue the same VM and conversation
gent chat --text "Explain JavaScript"   # Plain conversation without execution
```

`gent chat` now opens one persistent VM-enabled gent. Each message continues its
files and history; `/status` prints its saved ID, `/help` lists controls, and
`/bye` exits. A quoted message performs one turn and exits. Chat replies wait
for the user without declaring mission completion. `--vm` remains an alias for
this default route; `--text` selects the plain model route. Task/chat options
work before or after the quoted request.

`gent task` starts one gent and prints live progress and captured guest output
as commands complete. Results are also saved in the task transcript. `--agents N` requests a
team capped at N; optional `--max-agents N` permits additional child gents.
The advanced `gent swarm` command retains its existing defaults. The `check`
command reports model availability, task prerequisites, and the separate
normal VM startup policy, including disk and memory limits. It also reads the
prepared guest profile and network configuration without booting a VM.

`--backend auto|apple|qemu` selects the task/chat VM engine; `auto` is the
default. When resuming a capsule without Apple helper inputs, auto selects
QEMU even on Apple Silicon. Explicit incompatible choices report an error.
An explicit flag overrides `OVM_VM_BACKEND`. QEMU needs Node 26+,
`qemu-system-aarch64`, `mke2fs` (e2fsprogs), `python3`, `lsof`, and a prepared
ARM64 guest. Run `gent check --backend qemu` to inspect the checkout's QEMU
prerequisites, or `gent chat --backend qemu` to select it on this Mac.
Cross-architecture QEMU uses slower TCG software emulation. See
[backend selection and setup](docs/getting-started.md#choose-the-vm-engine).

On Apple Silicon, the first `gent setup` installs Ostadix, its MCP server, and the
major language runtimes inside a staged Linux guest. This automated build can take tens of
minutes; progress and log paths are printed. The prepared image is published
only after its runtime checks pass, with the previous root disk retained.
Later setup runs reuse the current verified profile. Use `gent guests status`
to read its receipt, or `gent guests check` to boot a fresh copy and rerun the
checks. These guest tools are distinct from the JavaScript host launcher,
which needs no compilation.

VMAgents is the Node/VM host application. Ostadix is one bundled guest capability;
basic `gent` use does not require a host Ostadix installation. The optional host
`.O` examples and native-node passthrough have their own Ostadix prerequisites.

Use `--source guest:/absolute/path` to select the input explicitly. A new family
inspects that guest path before reasoning and records a scoped source fact.
A missing file in one VM does not establish absence on the host or another VM;
host history is not read implicitly. For example:

```zsh
gent task --source guest:/root/.bash_history "Inspect this guest history, preserve actual records, and report missing input without inventing commands or timestamps"
gent task --local "Plan a loopback-only connectivity diagnostic; do not run a scan"
```

## Simple control over distributed execution

```zsh
gent mode auto                         # Default: local first, connected hosts add capacity
gent mode local                        # Stay here, with ordinary internet access
gent mode required                     # Require a remote VM controller and shared mesh
gent mode auto                         # Restore automatic fallback
gent peers                             # Connected hosts and current availability
gent peers --discover                  # Also list Tailscale machines, without enrolling them
gent connect ustad@OTHER_MACHINE --name laptop
gent task "Your task" --on laptop       # Explicit remote destination
gent task "Your task" --local           # One local invocation
gent disconnect laptop                 # Remove future placement on this host
```

Prepare the destination and establish SSH access before connecting: Apple
Silicon hosts can run `gent setup`; Linux/QEMU hosts need the QEMU tools and a
transferred verified guest. Both need Node 26+ and rsync. For a nonstandard
installation, add `--path /absolute/path/to/vma-gents`; use
`--node /absolute/path/to/node` when Node 26+ is installed privately.
Connect verifies the remote
controller and enrolls it in the shared network over SSH; it preserves the
remote machine's previous network. It shares network signing authority with
that trusted controller. Disconnect removes placement configuration, but does
not revoke previously issued credentials.

Modes are saved across invocations. Automatic placement keeps local work and
its files available when distribution cannot be arranged. Local mode retains
NAT, all prepared runtimes, persistence, and local teams. Required mode and
`--on NAME` report an unavailable destination instead of silently changing it.
For direct shell and normal MCP launches, required mode requires the mesh;
those commands do not relocate the normal VM.

All communicating pockets and descendants in a family stay on one controller.
Independent families may use different hosts. Model inference and enabled
native host actions stay on the initiating machine. Remote rounds create local
stopped-disk checkpoints. If a dispatched command's result becomes uncertain,
VMAgents saves it and `gent resume ID` queries the original operation; it never
blindly replays that command locally. Existing local families stay with their
files unless explicitly exported/imported on another host.

Gents can also publish actual guest files for peers to inspect. Publications
carry their SHA-256 digest and producer/round provenance, and appear in peers'
VMs through the read-only `/ovm/artifacts` share. The handoff budget is 256 KiB
per file, 64 blobs and 2 MiB per family. Reports and completion claims wait for
newly requested evidence to be observed. A VM command and
publication in one decision are split into execution followed by a queued
publication after success; the command is not repeated. Requests and hypotheses
can be sent alongside work as unverified intent. Reports about newly requested
work are retained for review and revision, never automatically sent as proven.
A finish requires at least one explicit predicate against observed evidence,
with all attached predicates passing. Those checks do not establish the whole
mission's semantic correctness; an interactive reply simply waits for the user.
Canonical quoted exit codes such as `"0"` are normalized to numbers with a
recorded repair; the actual observation must still satisfy the assertion.
See [file handoff and evidence](docs/agent-pockets.md#hand-an-actual-file-to-another-pocket).

## Portable saved gents

```zsh
gent list
gent show GENT_ID
gent resume GENT_ID --mission "Continue the work"
gent clone GENT_ID my-copy
gent export GENT_ID ~/my-agent.ovm
# On an already compatible VMAgents host:
gent import ~/my-agent.ovm my-imported-agent
gent resume my-imported-agent --local
```

Replace `GENT_ID` with a saved ID; stop the gent before cloning or exporting.
A `.ovm` capsule always includes the complete model weights, guest files, boot
inputs, and history. Import creates a distinct instance while preserving its
lineage. The destination needs VMAgents, Node 26+, a model-compatible Ollama server,
and either Apple Silicon macOS or the QEMU tools on Linux/macOS. The capsule
supplies its matching guest base and boot inputs; it does not transfer running
VM memory or convert the ARM64 guest to another architecture. It retains
private guest disk contents; keep it private. Controller CA
credentials and host native add-ons are not included. See the
[setup guide](docs/getting-started.md#save-copy-and-continue-a-gent) and
[gent-pocket guide](docs/agent-pockets.md).
Use `gent import FILE.ovm ID --private-model` to retain all weights with the
gent without publishing another copy into the host's Ollama store. This does
not start or qualify an inference server. The [private-model server commands](docs/agent-capsule-format.md#run-an-imported-private-model)
show how to start its weights on a separate local port and resume the gent.

## Guest networking

Normal VMs, interactive shells, fleets, and gent descendants default to NAT
network access. Automatic mode adds the shared Nebula peer network when it can
initialize; unavailable optional mesh services leave the local runtime usable.
Mesh-enabled guests get distinct network and native `o-node` keys. `ovm-peer list`, `ovm-peer pair PEER`, and
`ovm-peer run PEER FILE.O` run inside the guest. See
[guest tools and everyday commands](docs/getting-started.md#setup-and-guest-tools)
and [multi-host network setup](docs/networking.md). A peer must be running to
accept a connection. Use `gent task "Your task" --isolated` to explicitly disable
networking for a task and its descendants.

Gent guests can launch through either supported backend. Network enrollment
does not install QEMU or prepare a guest image. Linux systems can also
participate as separately configured Nebula/native `o-node` endpoints.

`npm start` or `bun run start` opens `gent chat` when standard input is a
terminal. With piped input and no arguments, it preserves the stdio MCP
endpoint for existing clients. Use `npm run chat` to explicitly choose chat
or `npm run mcp` for the MCP server. When configuring an MCP client, prefer
the direct `bin/claude-vm-mcp` executable to keep package-manager banners out
of protocol output. The installed `gent chat` shortcut works from any directory.

## Current capability

```text
OpenCode + ollama/q3.8:latest
             |
             | foreground delegation
             v
 @vm_operator + Huihui Spark 32K
             |
             | MCP over stdio
             v
       src/server.mjs
             |
             | private JSONL lifecycle protocol
             v
      host/ClaudeVZRunner
             |
             | Apple Virtualization.framework + framed Cowork RPC
             v
   vm/claudevm.bundle (private copy only)
```

The Swift runner uses direct Linux boot with a provenance-pinned `vmlinuz` and `initrd`, two writable NVMe-backed clone disks, Claude's small helper image as a read-only Virtio block device, entropy, memory ballooning, two bounded console drains, and a vsock listener on port 51234. It retains the private blackhole NIC required by Cowork and adds a separate NAT NIC for ordinary guest traffic. The dedicated project share and per-guest network configuration are mounted read-only. Explicit isolated mode disables the NAT/peer route.

In the normal two-NIC guest, bootstrap obtains a fresh DHCP lease for the NAT
interface and installs `0.0.0.0/1` and `128.0.0.0/1` routes through its router.
These keep ordinary IPv4 traffic on NAT if Cowork later installs its private
default gateway. The connected Cowork link and narrower Nebula overlay route
remain intact. Bootstrap verifies the selected internet route and records the
root guest's route evidence in `/run/ovm/network.json`.

`vsock_connected` proves transport connectivity only. Application readiness
requires the ordered `staticIPAssignment` and `hostProxyConfig` frames to drain,
an inbound `coworkd` `ready` event, and a successful internal prepared-runtime
check. That fixed check runs through the guest RPC as its ordinary unprivileged
user: it checks the verified installation and executable Ostadix tools, waits
for the protected per-boot `ovm.guest-ready/v2` receipt written by the root
service to match this guest's identity and selected mode. Runtime readiness and
mesh readiness are separate. Automatic/local mode can run with `meshReady:
false`; required mode also demands the assigned overlay and native peer listener.
Only a matching bootstrap receipt and successful process exit set `guestReady`.
Runtime failure or timeout prevents the user's command and enters the existing
cleanup path. A terminal required-mesh failure is refused immediately. The public diagnostic allowlist is unchanged.
The internal wait is bounded at 90 seconds, with a 95-second native deadline;
the default startup policy allows 120 seconds and CLI/MCP examples allow
180 seconds for the complete request and cleanup.
Cowork's user namespace can display system file owners as an unmapped UID.
The check requires the marker and its real parent directory to share the
protected owner of `/run` and the verified installation record, with no group
or other write bits and no write access for the command user. It does not
interpret the unmapped UID itself as proof of root ownership.
The ordinary Cowork diagnostic process has its own network view; its socket
list is recorded for diagnosis but is not used to infer the root guest's peer
availability. The prepared VM's root service owns the shared peer network.

Status exposes `coworkReady`, `guestBootstrapReady`, `distributionMode`,
`meshReady`, and `networkFallbackReason` separately. This startup barrier
establishes local guest readiness; a remote peer still must be online and
reachable for a peer operation to succeed.

The October 4 distribution validation passed five real local/fallback/required
boots, including DNS, HTTPS, Ostadix execution and persistence; normal MCP local
mode and normal MCP mesh mode with external peer execution also passed. The
updated base and existing witness each passed 47 runtime/MCP checks. Receipts
and retained-backup paths are in
`runtime/distribution-live-20261004-1791116914171/validation.json`. This local
validation does not establish a second Apple Silicon VM host's readiness.

## Performance-only process lifetime

Set `CLAUDE_VM_LIFETIME=process` for an individual MCP controller to start one
VM asynchronously when the MCP connects, wait once for application-level
`guestReady`, and reuse the same runner, lease, vsock connection, and guest
state for subsequent `cycle` or `exec_cycle` calls. Model calls cannot invoke
the normal stop tool in this mode. MCP stdin EOF, `SIGINT`, or `SIGTERM` owns the
single bounded shutdown and lease release. The default remains `transaction`,
so existing Ostadix and direct smoke commands retain start-operation-stop
semantics.

This mode changes lifetime only. It does not change the selected model, context,
Ollama settings, policy file, program allowlist, output limits, network, host
share, devices, USB surface, code signature, or entitlements. Its normative
performance and non-interference gates are in
[`docs/claude-vm-performance-contract.tex`](docs/claude-vm-performance-contract.tex).

## Communicating gent pockets

`gent swarm` is the intelligent controller. `gent fleet` remains the raw parallel
microVM command primitive used underneath it.

```zsh
# Inspect availability without booting or calling Ollama
gent swarm --spec examples/pocket-swarm.json --dry-run

# Run three local gents, each paired with a persistent private VM
gent swarm \
  --mission "build a parser and have a separate pocket reproduce its tests" \
  --agents 3 --rounds 4

# Inspect the recovered native providers
gent native probe
gent native call host.frontmostApp '[]'
```

The default pockets are scout, builder, and auditor. Each pocket may run one VM
program, perform up to two enabled native observations, send bounded messages,
spawn a bounded child, or finish during a round. Local Ollama performs inference
on the host; Linux effects remain in the pocket's VM rootfs. Pocket manifests,
messages, observations, and rootfs images live under `vm/pockets/`.

Native keyboard, pointer, window, and application actions are present in the
catalog but disabled unless the owner starts VMAgents with
`OVM_NATIVE_ALLOW_ACT=1`. Changed addon hashes are refused unless separately
qualified or explicitly allowed with `OVM_NATIVE_ALLOW_UNQUALIFIED=1`.

The local process-lifetime mode is implemented but deliberately **not enabled
in the main OpenCode registration**. A live unchanged-q3.8 coexistence probe
kept the model at context 262144 but reduced host free-memory headroom to 12%,
below the unchanged 35% requirement. Enabling that combination would therefore
be counterproductive despite eliminating repeated VM boots.

## Safety boundary

The following limits describe the Apple normal run/MCP route. Gent tasks use
their selected backend and the separate [pocket protocol](docs/agent-pockets.md).

- Claude's original bundle is selected by `CLAUDE_VM_SOURCE_BUNDLE` or the
  standard per-user Claude Desktop location, verified against the compatibility
  profile, and never passed to the VM runner.
- The working bundle lives under this project's private `vm` directory. Every critical clone file must be a regular, non-symlink file with an inode distinct from the corresponding source file.
- The clone was created with APFS copy-on-write semantics. Once booted, writes are private to the clone and consume additional physical blocks.
- An atomically published lease prevents two MCP hosts from opening the same writable clone disks.
- Startup refuses while either source disks or clone disks are open.
- First start generated a distinct generic machine identifier and a locally administered unicast MAC for the clone.
- Kernel, initrd, and rootfs origin identifiers must match, and kernel/initrd SHA-256 values are pinned in `.direct-boot-manifest-v1.json`.
- The baseline is 4 GiB RAM and 4 vCPU, matching Claude's observed working profile.
- Startup requires at least 35% host free-memory headroom, preventing a VM boot beside the resident 262K-context Qwen runner.
- Guest vsock transport must appear within 30 seconds. Failed startup then enters the same bounded stop/escalation path as an explicit stop.
- Networking defaults to NAT for internet/LAN access. Automatic mode attempts an
  encrypted Nebula network shared with other enrolled guests and can retain the
  local runtime if optional mesh setup fails. The normal Cowork runner
  uses a separate blackhole NIC for its private control route. Select
  `--network isolated` or `OVM_NETWORK_MODE=isolated` to disable external and
  peer networking. The everyday task command also accepts `--isolated`.
- The project `share/` directory is read-only under tag `claudeshared`.
  Connected guests also receive a read-only `ovmconfig` share containing their
  own network identity and public peer directory. The host CA private key is
  excluded. Native `o-node` keys are generated separately inside each guest.
  Host `/` and home are not mounted. Automated provisioning may explicitly
  attach a dedicated writable export directory under `ovmexport` to return
  runtime archives and verification receipts.
- The share root is mode `0500`; preflight rejects group/world access,
  owner-writability, symlinks, and special files before launch.
- Graceful guest shutdown has a 15-second deadline, followed by Virtualization.framework's destructive stop. Uncertain cleanup retains the lease and fails closed.
- Console capture is bounded to 64 KiB per stream inside the runner. The MCP
  returns an 8 KiB tail by default and permits at most 64 KiB, preventing a
  console read from becoming a model-sized prompt.
- Guest execution is a direct argv call, never shell text. A code-level immutable
  ceiling permits only exact tuples for `uname`, `id`, `python3 --version`, and
  `git --version`; the owner policy file can only remove tuples or lower limits.
  The caller cannot set cwd, environment, stdin, mounts, paths, credentials,
  domains, network policy, or output limits. Aggregate output is capped at 32 KiB
  and returned as explicitly untrusted guest text.
- Lee's Qwen gent is denied direct console/start/cycle/exec/stop operations.
  The `@vm_operator` may invoke only status and the single-call lifecycle or
  execution transactions, so cleanup is not delegated to another model turn.

Do not redistribute Claude's disk image, guest software, or helper image. This is a private interoperability experiment.

## Requirements

- Node.js 26 or newer and npm.
- A model-compatible Ollama server on the machine performing inference.
- For Apple VM execution and fresh guest provisioning: Apple Silicon macOS 14+
  and Claude Desktop inputs matching the checked compatibility profile.
- For QEMU task/chat execution: Linux or macOS, `qemu-system-aarch64`, `mke2fs`
  (e2fsprogs), `python3`, `lsof`, and a transferred verified prepared ARM64 guest
  or imported capsule. QEMU uses TCG across architectures; it is slower than
  native hardware acceleration. Fresh QEMU guest provisioning is not implemented.
- For remote controllers: existing trusted SSH access and rsync. Allow space
  for the guest base, private pocket copies and stopped-disk checkpoints;
  filesystems without reflinks may allocate a full copy for each.
- Xcode Command Line Tools only when rebuilding the Swift launchers.
- Internet access and at least 10 GiB host free space for initial guest setup;
  the normal VM/MCP route retains its separate 20 GiB startup requirement.
- Guest setup obtains a pinned Ostadix source snapshot and builds inside the
  guest. A host Ostadix install is only needed for the optional host `.O`
  entrypoints. `gent guests setup --source /path/to/OSTADIX` selects a clean local
  source checkout explicitly.

## Install on another Mac

With access to the private `lostadi/vma-gents` repository, clone it to any physical
path. The scripts derive the project root
from their own location, so the checkout does not need Lee's username or
directory layout.

```zsh
git clone git@github.com:lostadi/vma-gents.git
cd vma-gents
./bin/gent setup
npm test
gent check
```

Setup installs missing private inputs, prepares and verifies the guest image,
then starts the shared network. Existing bundles are preserved rather than
cloned again; guest updates use a staged image with a backup of the previous
root disk. The component scripts below are useful for explicit input overrides.

`install-prebuilt.zsh` verifies the three committed ARM64 launchers, installs
them into `host/`, copies and verifies the private helper image, re-signs the
launchers locally, and creates CLI links in `~/.local/bin`. Override its inputs
when they are stored elsewhere:

`install-native-capabilities.zsh` finds the two qualified decoded native
add-ons in an extracted Claude tree or installed Claude Desktop, verifies their
cataloged hashes, and copies them into the ignored `host/native-root/` store.
VMAgents then uses this stable private copy instead of depending on the original
extraction directory. Override discovery with `OVM_CLAUDE_EXTRACTED_ROOT`.

```zsh
CLAUDE_VM_SMOL_SOURCE=/absolute/path/to/smol-bin.arm64.img \
OVM_INSTALL_BIN="$HOME/.local/bin" \
./scripts/install-prebuilt.zsh

CLAUDE_VM_SOURCE_BUNDLE=/absolute/path/to/claudevm.bundle \
./scripts/clone-bundle.zsh
```

If Claude Desktop has replaced either private input, setup exits with the
expected and actual identity. That release needs a new joint compatibility
qualification before its hashes should be accepted.

To build all native launchers from the included Swift source instead of using
the prebuilt files:

```zsh
CLAUDE_VM_SMOL_SOURCE=/absolute/path/to/reviewed/smol-bin.arm64.img \
./scripts/build-swift-runner.zsh
```

The direct runner probe, using paths relative to the checkout, is:

```zsh
project_root=$PWD
./host/ClaudeVZRunner --support-only
./host/ClaudeVZRunner --probe \
  --bundle "$project_root/vm/claudevm.bundle" \
  --smol "$project_root/host/smol-bin.arm64.img" \
  --share "$project_root/share" \
  --memory-gb 4 --cpu-count 4 --network isolated
```

## Repository layout

- `bin/`: relocatable `gent` and MCP entrypoints.
- `host/`: Swift sources and local private build outputs.
- `host/native-root/`: ignored, hash-qualified private native capability store.
- `prebuilt/macos-arm64/`: checksummed ARM64 launchers safe to place in Git.
- `compatibility/`: reviewed private-input identity, without the inputs.
- `capabilities/`: decoded native API names, access classes, evidence, and hashes.
- `integrations/`: optional Ostadix and OpenCode templates.
- `research/decoded-claude/`: optional private local research, excluded from the
  product repository and npm package.
- `scripts/`: clone, install, build, and live verification commands.
- `vm/`: ignored private bundle clone created on each Mac.
- `vm/pockets/`: ignored private gent manifests and persistent VM rootfs images.

The raw `ovm-shell` and `ovm-swarm` binaries accept `--bundle`, `--smol`, and
`--share` paths (or corresponding `OVM_*` variables). Normal use should go
through `gent shell` and `gent fleet`, which supply the checkout-relative paths.

## Build and verify

After either installation path:

```zsh
npm test

./host/ClaudeVZRunner --support-only
gent probe
gent status

```

If the separate private research corpus is available locally, its optional
Ostadix verification is `npm run research:verify`. It is not a fresh-clone setup
or product test requirement.

When Ollama is idle and the Qwen runner has been unloaded, the destructive
start/status/console/stop integration check is:

```zsh
node ./scripts/live-smoke.mjs
```

The script keeps one MCP controller alive for the whole cycle and always asks
that same controller to stop the VM in `finally`.

The Ostadix-native entrypoints perform the compound MCP transactions and
independently check source identity, runner, disk handles, and controller lease:

```zsh
o open vm
o open vm-exec
```

The execution-specific direct harness is `node ./scripts/exec-smoke.mjs`. It
runs exactly `/usr/bin/uname -m`, requires application-level guest readiness,
checks the 32 KiB receipt, and verifies stopped/unlocked cleanup.

The process-lifetime performance harness is:

```zsh
CLAUDE_VM_WARM_OPERATIONS=20 node ./scripts/persistent-smoke.mjs
```

It verifies one warm-up, constant runner and lease identity, repeated resident
allowlisted execution, and cleanup after the MCP controller closes. It never
enables the mode globally.

The build pins the exact inspected helper-image SHA-256, creates an arm64 macOS 14+ executable, and ad-hoc signs it with only `com.apple.security.virtualization`.

## MCP tools

- `claude_vm_status`: verify isolation and report host headroom, the controller lease, and lifecycle state.
- `claude_vm_start`: run fail-closed preflight checks and start the clone.
- `claude_vm_console`: read the bounded `hvc0` daemon or `hvc1` kernel console tail.
- `claude_vm_cycle`: in transaction mode, start, inspect, capture a bounded
  console tail, stop, and verify the final stopped/unlocked state. In process
  mode, reuse the resident VM and defer normal cleanup to controller exit.
  Handled failures and cancellation enter cleanup; power loss and process
  SIGKILL are not atomic.
- `claude_vm_exec_cycle`: boot the private clone, wait for application-level
  guest readiness, run one immutable-allowlist argv tuple, return bounded
  untrusted stdout/stderr, then either perform same-call cleanup in transaction
  mode or retain the verified resident runner in process mode.
- `claude_vm_stop`: request a graceful stop and apply the bounded forced-stop fallback if needed.

There is deliberately no arbitrary `exec`, shell, persistent-process, or
network tool. `exec_cycle` is the bounded diagnostic capability described above.

## Validation status

The current automated suite passed **315/315 tests with no skips**:
`runtime/qemu-portability-20261004/npm-test-final.log`.

The QEMU portability tests on this Mac passed. The same guest disk moved
QEMU → Apple → QEMU and retained both backend-written files. A parent and child
QEMU guest exchanged a live peer request and native `o-node` calculation
returning 42: `runtime/qemu-portability-20261004/backends-live.json`.
A separate scripted action-flow test used five real QEMU executions, delivered
typed messages and verified an exact 221-byte, seven-line read-only artifact:
`runtime/qemu-portability-20261004/projection-live.json`. These used local HVF;
they do not establish remote Linux/TCG execution or model reasoning quality.

The x86_64 Linux rack separately booted the transferred ARM64 guest with QEMU
TCG and passed Ostadix execution, guest Node and native Ostadix MCP smoke checks.
A second boot read its preserved marker; both guests stopped cleanly. The first
boot/command/shutdown took 117.9 s, including 20.0 s of guest execution; the
second took 96.4 s. Initial disk cloning took about 108 s separately. Evidence:
`runtime/qemu-portability-20261004/rack-boot.json`. This used isolated networking.

An actual SSH controller run from this Mac to the x86_64 Linux rack passed two
ARM64 QEMU TCG rounds. The first admission acknowledgement was deliberately
lost; recovery resumed the original dispatch without repeating its persistent
write. The second boot observed that write exactly once. The family advanced
from generation 0 through 1 to 2, both guests stopped, and both immutable
checkpoint payloads were released only after durable local completion and
acknowledgement. The live remote disk was retained and closed. The two checkpoint
transfers took 60.1 s and 57.4 s in this run. An initial rsync path-quoting defect
interrupted checkpointing; after its fix, the saved dispatch recovered without
VM replay. Evidence:
`runtime/qemu-portability-20261004/rack-controller-cc74c698-78cd-44a8-9b11-b77eea59fd98/controller-live.json`.

Native Ostadix execution between guests on the Mac and the rack also passed a
subsequent test with updated pairing helpers installed in the two test guests.
The Mac guest at `10.87.1.23` executed a native operation on the rack guest at
`10.87.2.2`, received value 42, and verified a nested reverse native call using a
unique marker containing 42. The initiating guest stopped cleanly after 50.4 s;
the receiver also returned exit 0 and stopped. Evidence:
`runtime/qemu-portability-20261004/cross-host-local-live-v2.result.json` and
`cross-host-rack-live-v2.result.json` beside it. The earlier reciprocal-pairing
authentication/read failure remains recorded in `cross-host-local-live.result.json`.

The exact tested pairing helpers are now published in the local built-in guest
image, which passed all 47 runtime checks including native Ostadix MCP. The
published recipe is
`4edd16d2ae012b3b73c54a25fb3ff424931a24905e1ad0103f12773bec0ec51d`:
`runtime/qemu-portability-20261004/pairing-image-refresh.json` records publication.
The refreshed Rack base is also published, with the root disk, kernel, initrd
and prepared profile hashes verified in
`runtime/qemu-portability-20261004/rack-pairing-image-publication.json`.
A fresh guest from that base then passed both pairing-helper hash checks,
reported `aarch64`, executed Ostadix hello (`[number] 2`), and passed native
Ostadix MCP smoke with 21 tools. It exited 0 and stopped after 110.4 s:
`runtime/qemu-portability-20261004/rack-pairing-base-boot-v2.json`. The first
harness used the wrong service path; that failure remains in
`rack-pairing-base-boot.json` beside it. This final base check used isolated
networking; the earlier two-guest test supplies the native peer-execution proof.

After verification, the owned Rack cold-boot and controller test disks were
explicitly removed to reclaim space, after confirming they were closed and had
no open handles. Receipts, logs, remote dispatch metadata and the local controller
checkpoint remain. That test cleanup is separate from normal checkpoint release,
which preserves the live family disk. The fresh-base test disk and redundant
old Rack base copy were also removed after closed-disk checks, with the local
APFS rollback retained:
`runtime/qemu-portability-20261004/rack-pairing-fixture-cleanup.json`. That cleanup
left about 28.24 GB free; future admission still depends on available resources.

The focused QEMU protocol/lifecycle suite passed **39/39 tests with no skips**
on both this Mac and the Linux rack. The rack result is
`runtime/qemu-portability-20261004/rack-qemu-tests.log`; those tests use dummy
processes rather than booting a VM. A real local QEMU deadline test returned
exit 124 and a subsequent boot read its preserved partial write:
`runtime/qemu-portability-20261004/deadline-live.json`.

Actual Spark inference installed Nmap and scanned guest loopback ports 22, 80,
and 443; all three were closed. The initial four-round invocation stalled on a
quoted exit-code assertion. After the normalization fix, one resumed reasoning
round passed four assertions against the saved observation without rerunning
the VM command. A stray period from the prompt became an unresolved target;
Nmap reported exactly one IP scanned. This establishes a bounded loopback
diagnostic, not a network map: `runtime/qemu-portability-20261004/loopback-live.json`.
A fresh 6.5 GiB capsule export included all selected Spark weights:
`runtime/qemu-portability-20261004/capsule-export.json` records the private
`spark-agent.ovm` archive. It was transferred to the x86_64 Debian Mini and
imported with full weights in a private model store, restored source history and
a new instance identity:
`runtime/qemu-portability-20261004/debianmini-capsule-import.json`.
On that Core 2 Duo Mini, the imported weights, byte-identical source history,
offline Spark inference and imported VM persistence all passed. A new user/network
namespace contained only loopback throughout. Private Ollama 0.35.0 CPU inference
answered the bounded arithmetic prompt with `4` in 129.4 s, including 63.6 s
loading the model, and its owned process group stopped cleanly. The existing
imported guest then booted under QEMU TCG without an extra root-disk clone, read
the exact retained marker, executed Ostadix hello (`[number] 2`) and reported
`aarch64`. Boot/command/shutdown took 129.3 s; the guest stopped, released its
lease and preserved the original source history. This establishes those offline
operations on this physical Linux host, not general model reasoning quality or
performance on every machine. Evidence:
`runtime/qemu-portability-20261004/debianmini-offline-proof/evidence.json`.

The pre-QEMU automated suite passed **227/227 tests, with no skips**:
`runtime/distribution-final-20261004/unit-final.log`. `ovm check --json` reported
all chat/task prerequisites ready and no normal-route blockers. Package dry-run
contained 145 files with no private runtime leaks, and prebuilt checksums and
signatures passed. No test VMs remained active at that check.

Actual default chat created/read `CHAT_VM_PERSISTED`, reported guest Node
`v22.23.3`, and replied in round six. A separate resumed invocation appended
`SECOND_CHAT_TURN`, read both lines and replied in round nine. It remained
waiting for the user rather than completed; one early failed capture was
retained and recovered. Evidence: `runtime/distribution-final-20261004/chat-live.json`.

The deterministic action-flow test used two real VMs and five executions. It
verified queued publication, immediate unverified requests, reviewed reports,
scoped source absence, and an exact read-only seven-line artifact. It took
12.926 seconds and did not test model reasoning. Evidence:
`runtime/distribution-final-20261004/projection-live.json`.

The same-Mac controller test recovered a lost acknowledgement, checked immutable
checkpoints, and observed the original persistent write exactly once. In that
trial, Homebrew rsync 3.5.1 transferred the later checkpoint in 70.4 seconds,
compared with 598.8 seconds for the earlier system-rsync transfer; these are
local observations, not a cross-network benchmark. Evidence:
`runtime/distribution-final-20261004/controller-live.json`.

A 6.96 GB capsule included complete weights and restored private model inference,
byte-identical original history, a new instance identity, and isolated guest
execution of the retained proof file, Ostadix hello and `aarch64`. Earlier
agent turns repeated reads and reached their limits. A later review finished
using those saved results; a harness requiring another fresh command in that
review-only invocation failed. The payload restoration is verified across the
sequence, not a new boot in the final review. This was on the same physical Mac:
`runtime/distribution-final-20261004/capsule-proof.json`.

The current distribution-mode validation is
`runtime/distribution-live-20261004-1791116914171/validation.json`. It records
five real local/fallback/required boots, preserved files, Ostadix execution,
DNS/HTTPS, normal MCP local readiness, and normal MCP mesh readiness with an
external VM's peer execution. All those VMs stopped and released their disks
and leases. Guest base/witness checks passed 47/47 after the recipe refresh.
The Mac-to-Linux SSH controller proof above establishes cross-machine placement.
Placement on a second Apple Silicon Mac remains untested because the MacBook
Air was unavailable.

The previously observed model and network results below remain useful evidence
for their specific runs; their automated-suite counts predate this change.

The prepared Linux ARM64 guest image and an upgraded existing pocket each
passed **47/47 runtime checks**, including real backend programs, native tools,
the reference interpreters, and the guest MCP round trip. Two simultaneously
running local VMs executed Ostadix programs on one another over Nebula using
native authenticated peer execution. A child VM preserved an inherited file,
received its own overlay/native identity, and executed a program on its parent.
All workers in those peer tests reported bootstrap exit 0, command exit 0,
no error, and a stopped state. Before the distribution changes, the full automated
suite passed **120/120 tests**;
the complete output is saved in `runtime/guest-provision-20261004/unit-final.log`.

A final one-agent Spark task used the prepared guest, printed its installation
report with `verified: true` and `OVM_SPARK_READY`, and finished after observing
the output in round two. Guest bootstrap and command exits were 0, with no
worker error and a stopped guest. Its receipt is
`runtime/spark-prepared-final-20261004/swarm-mutnyuhr/swarm.json`.

A fresh `ovm guests check --json` run passed all 47 runtime checks again.
Cross-host Nebula traffic also passed in both directions: the Mac's ARM64 guest
reached a TCP endpoint on the Linux Rack, and the Rack read the guest's
peer-enrollment identity endpoint. Those checks use the existing Tailscale
underlay and cover a Mac guest plus a Linux endpoint; a second Mac's guest
launcher was not exercised.

Separately, the guest paired with Rack's native `o-node` over the existing
Tailscale route and executed an Ostadix program there. The successful operation
receipt returned `ostadix-rack x86_64`; the guest exited cleanly and stopped.
Evidence: `runtime/guest-provision-20261004/rack-execution.json`.

The normal VM/MCP route also passed with the default 20 GiB disk minimum and
120-second startup budget: `uname -m` returned `aarch64`, exit 0; Cowork,
prepared-runtime, and overall readiness were all true. Cleanup verified a
stopped runner and released lease. The final preflight recorded about 25.96 GiB
free disk and 70% free-memory headroom. Evidence:
`runtime/guest-provision-20261004/mcp-exec-default-final.json`.

A separate witness VM then executed native Ostadix code on the resident normal
VM at `10.87.1.9`. Its successful operation receipt returned
`NORMAL_MCP_PEER_OK aarch64`, resolved `example.com`, and reported HTTPS status
200. Root route snapshots showed internet and lighthouse traffic initially
selecting Cowork's `172.16.10.1` gateway; after the fix, both selected the NAT
gateway `192.168.64.1` on `enp0s2`, with the private connected route preserved.
The witness stopped cleanly, and closing the resident controller left no runner,
open VM disks, or lease. Evidence:
`runtime/guest-provision-20261004/normal-peer-final.json`.

The earlier routing/DHCP base refresh and witness upgrade each passed all 47
runtime checks with recipe
`4a9967efe5d248228ce2444d9913ba75b69ad2dbd276e7c1d2e55635ba972032`;
`runtime/guest-refresh-20261004/latest.json` records that runtime archive and
retained backups. The newer local pairing-helper image and its 47/47 result are
recorded above in `pairing-image-refresh.json`.

The published profile is `vm/claudevm.bundle/.ovm-guest-v1.json`; the migration,
reciprocal-peer, and child receipts are under
`runtime/guest-provision-20261004/`. See
[the current evidence table](docs/getting-started.md#prepared-guest-and-network-verification-2026-10-04)
for exact paths. These private runtime artifacts are excluded from the public
launcher package. `npm test` is restricted to `test/*.test.mjs`, so saved manual
live-test scripts are not executed by the automated suite.

### Earlier validation

The historical tests below predate the prepared guest environment and default
NAT/peer network. Their isolation observations describe those test runs.
`ovm guests status` reports the installed profile's saved runtime evidence;
`ovm guests check` reruns those checks in a fresh guest. Runtime checks and
network configuration status do not establish live peer connectivity or
arbitrary application success.

- Swift arm64 build: passed.
- Code signature and virtualization entitlement: passed.
- Apple Virtualization support probe: `true`.
- Full VM configuration validation: passed at 4 GiB, 4 vCPU, isolated blackhole
  networking, and the dedicated read-only `claudeshared` directory.
- Node tests: 43/43 passed, covering single-call cancellation/cleanup, lease
  races, source-alias and `lsof`
  failure rejection, identity transactions, direct-boot provenance,
  share confinement, serialization, immutable execution policy ceilings,
  output/correlation limits, cancellation cleanup, process-lifetime reuse and
  idempotent shutdown, and signed Swift support.
- Process-lifetime live test on 2026-09-01: one runner reached `guestReady` in
  3.551 seconds, retained one lease across 20 `uname -m` executions, recorded
  0.274-second median and 0.373-second p95 operation latency, and controller
  close removed the runner, clone-disk handles, and lease in 0.744 seconds.
- Unchanged-Qwen coexistence probe on 2026-09-01: q3.8 remained manifest
  `d7fc42486103` at context 262144 and completed its fixed cold probe, but host
  free-memory headroom fell to 12%. This fails the performance contract, so the
  main OpenCode registration remains in transaction mode.
- Clean Swift lifecycle test on 2026-08-27: passed in 4.6 seconds while Jan Nano
  remained loaded. The ARM64 Linux kernel reached systemd, `coworkd` connected
  to host vsock port 51234, and mounted `claudeshared` once as `root only,
  nosymfollow`. Status reported `running`, and the same MCP controller then
  stopped the VM with exit code 0, no process escalation, no remaining disk
  handles, and its lease released.
- Model-driven fail-closed lifecycle: the constrained `vm_operator` called
  exactly status, one `claude_vm_cycle`, then returned final text. The cycle
  started the VM, bounded the console to 4096 bytes, stopped with runner exit
  code 0, released the lease, and returned `completed: true` plus final
  `running: false` in one tool result.
- Ostadix entrypoint: literal `o open vm` passed in 5.8 seconds and independently
  reported no runner, no clone-disk handles, no lease, and unchanged source
  identity hashes after the cycle.
- Live allowlisted execution: `o open vm-exec` passed on 2026-08-27. The
  Ostadix-owned receipt reported `guest_ready: true`, `network_mode: isolated`,
  `/usr/bin/uname -m` output `aarch64`, exit code 0, 8 captured bytes under the
  32 KiB limit, unchanged source identity, and both server and independent host
  cleanup verified with no runner, disk handle, lease, or unexpected controller.
- Model-driven allowlisted execution: OpenCode session
  `ses_fbbc0ced4ffeg190Pws0dz4kF9` used `ollama/jan-nano-vm:32k` and exactly
  `claude_vm_status -> claude_vm_exec_cycle -> final`. The tool input was
  `uname`, `[-m]`, 10 seconds; the result matched the Ostadix receipt and the
  operator exited 0 without calling any raw lifecycle tool.
- Claude's source machine-ID, MAC, and EFI hashes were identical before and
  after the live test. The writable clone retained its distinct identity.

The successful vsock connection alone remains transport evidence; the separate
`guest_ready` and correlated spawn/output/exit receipt provide the narrower
application-execution evidence above. The 262K-context Qwen runner cannot satisfy
the 35% startup-headroom gate on this 64 GiB M1 Max, so Lee's primary agent is
denied direct `claude_vm_start`. Invoke the foreground `@vm_operator` subagent;
its local model is instructed and permissioned to perform the whole
transaction and stop the VM before Qwen loads again. A persistent VM beside
Qwen remains disabled in the active OpenCode configuration because the measured
local candidate failed the post-load memory gate. In that historical test,
`jan-nano-vm:32k` was a metadata-only local
tag over the same Jan Nano weight blob; it capped that bounded agent's runtime
context at 32768 without duplicating model weights or changing the primary
Qwen model. Live Ollama state confirmed the alias at 32768 context and about
5.28 GB of GPU-resident allocation during the model-driven test.

Those Jan Nano measurements are historical evidence, not measurements of the
current Huihui Spark default. Requalify model-driven VM transactions after a
model change.

An earlier private-addon prototype reached `Linux VM started successfully`, then crashed in Claude's Electron-specific shutdown hook because `NSApp` was absent. That backend has been retired from the active MCP rather than patched around another private lifecycle assumption.
