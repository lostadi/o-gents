# Source preview verification — November 17, 2026

This review covers o-gents source at `090169b` and the documentation and dependency
updates prepared for this preview. The package version remains `0.5.0`.
Checks ran on x86_64 Linux with Node.js 26.12.0. No private VM state was copied
from an existing installation.

OpenAI Codex prepared these updates and ran the checks listed below. A separate
Codex agent reviewed the source and documentation. This records an automated
review; it does not record human sign-off.

## Checks run

| Check | Observed result |
| --- | --- |
| `npm ci` | Installed the pinned dependencies successfully. |
| `npm audit --omit=dev` | Reported zero known vulnerabilities after the dependency updates. This is the audit result on the review date. |
| `npm test` | 374 tests: 363 passed, 2 failed, 9 skipped. The failures use macOS system tools unavailable at their required paths on Linux. |
| Setup and CLI help | `./setup.sh --help`, `gent help`, `gent help --all`, and help for `chat`, `task`, `resume`, `guests`, and `connect` all exited 0. |
| Peer-review example | `gent swarm --spec examples/ostadix-peer-review.json --local --dry-run` exited 0 without inference or VM execution. |
| Documentation links | Relative Markdown targets in the tracked documentation exist. |
| Installer syntax | `zsh -n scripts/*.zsh` passed. |
| Prebuilt launcher checksums | All three SHA-256 checks matched `prebuilt/macos-arm64/SHA256SUMS`. Code signatures were not checked on Linux. |
| Package contents | The package dry-run excluded VM images, saved gents, model weights, private research inputs, and credentials. |

The test run used `umask 022` and removed group/other write permission from
`policy.json` in the local checkout. The policy loader deliberately refuses a
group-writable policy file; Git preserves executable bits but does not preserve
that permission setting. On a checkout created with a shared-write umask, use
`chmod go-w policy.json` before running the diagnostic MCP route or its tests.

The two failing tests are in `test/preflight.test.mjs`:

- The open-file probe invokes `/usr/sbin/lsof`, the macOS path.
- Private VM identity initialization invokes `/usr/bin/plutil`, a macOS tool.

These failures remain visible in the full suite. Nine tests were skipped because
their platform or optional-tool prerequisites were unavailable. This run does
not establish a passing macOS suite.

## Dependency changes

The MCP SDK is pinned to `1.32.2` and Zod to `4.6.7`. Compatible transitive updates
address the audit findings in `@hono/node-server`, `body-parser`, `fast-uri`,
`hono`, `ip-address`, `proxy-addr`, and `qs`. The npm and Bun lockfiles describe
the same updated dependency set. The Node requirement remains 26 or newer.

## Runtime limits

Fresh guest setup, an Apple Virtualization boot, QEMU guest execution, live
Ollama inference, and remote placement were not rerun for this preview. The
[October live verification](manual-verification-2026-10-04.md) and
[setup review](setup-verification-2026-10-05.md) remain dated historical records.
Their private evidence paths belong to the original installations.

Fresh provisioning still needs compatible local Claude Desktop VM inputs and
Ostadix source from `lostadi/OSTADIX`. A Linux host needs a verified prepared
ARM64 guest or an imported capsule. See the
[setup guide](getting-started.md) for those requirements.
