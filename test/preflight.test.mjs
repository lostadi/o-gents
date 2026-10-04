import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, open, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CLAUDE_SOURCE_BUNDLE,
  bundleOpenPids,
  ensurePrivateIdentity,
  verifyDirectBootArtifacts,
  verifyBundle,
  verifyShareDirectory,
  verifyPreparedRootfsSize,
} from "../src/preflight.mjs";

test("an enlarged guest disk requires a verified preparation receipt for its exact sizes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ovm-prepared-"));
  const file = path.join(directory, ".ovm-guest-v1.json");
  const sourceSize = 10 * 1024 ** 3;
  const size = 24 * 1024 ** 3;
  const receipt = { schema: "ovm.prepared-guest/v1", verified: true,
    sourceCommit: "a".repeat(40), sourceArchiveSha256: "b".repeat(64),
    recipeSha256: "c".repeat(64), rootfsSizeBytes: size, sourceRootfsSizeBytes: sourceSize };
  try {
    await assert.rejects(() => verifyPreparedRootfsSize(directory, size, sourceSize), /ENOENT/);
    await writeFile(file, JSON.stringify(receipt), { mode: 0o600 });
    assert.deepEqual(await verifyPreparedRootfsSize(directory, size, sourceSize), receipt);
    await assert.rejects(() => verifyPreparedRootfsSize(directory, size + 512, sourceSize), /preparation receipt/);
    await writeFile(file, JSON.stringify({ ...receipt, verified: false }));
    await assert.rejects(() => verifyPreparedRootfsSize(directory, size, sourceSize), /preparation receipt/);
    await writeFile(file, JSON.stringify(receipt));
    await chmod(file, 0o666);
    await assert.rejects(() => verifyPreparedRootfsSize(directory, size, sourceSize), /owner-controlled/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("bundle verifier rejects a disk symlink into Claude's original", async () => {
  const privateRoot = await mkdtemp(path.join(os.tmpdir(), "claude-vm-alias-"));
  const clone = path.join(privateRoot, "claudevm.bundle");
  await mkdir(clone);
  await symlink(path.join(CLAUDE_SOURCE_BUNDLE, "rootfs.img"), path.join(clone, "rootfs.img"));
  try {
    await assert.rejects(
      () => verifyBundle(clone, CLAUDE_SOURCE_BUNDLE, privateRoot),
      /symbolic link/,
    );
  } finally {
    await rm(privateRoot, { recursive: true, force: true });
  }
});

test("clone open-file probe reports this process", async () => {
  const clone = await mkdtemp(path.join(os.tmpdir(), "claude-vm-open-"));
  await Promise.all(["rootfs.img", "sessiondata.img", "efivars.fd"].map((name) =>
    writeFile(path.join(clone, name), "probe")));
  const handle = await open(path.join(clone, "rootfs.img"), "r");
  try {
    assert.ok((await bundleOpenPids(clone)).includes(process.pid));
  } finally {
    await handle.close();
    await rm(clone, { recursive: true, force: true });
  }
});

test("clone open-file probe rejects lsof path errors", async () => {
  const missing = path.join(os.tmpdir(), `claude-vm-missing-${process.pid}-${Date.now()}`);
  await assert.rejects(() => bundleOpenPids(missing));
});

test("private identity initialization is repeatable and marker-checked", async () => {
  const clone = await mkdtemp(path.join(os.tmpdir(), "claude-vm-identity-"));
  await Promise.all([
    writeFile(path.join(clone, "rootfs.img"), "root"),
    writeFile(path.join(clone, "sessiondata.img"), "session"),
    writeFile(path.join(clone, "efivars.fd"), "efi"),
    writeFile(path.join(clone, "machineIdentifier"), "placeholder"),
    writeFile(path.join(clone, "gvisorMacAddress"), "fe:ba:88:eb:e0:d7"),
  ]);
  try {
    assert.equal(await ensurePrivateIdentity(clone), true);
    assert.equal(await ensurePrivateIdentity(clone), false);
  } finally {
    await rm(clone, { recursive: true, force: true });
  }
});

test("direct-boot provenance pins the kernel, initrd, and rootfs origin", async () => {
  const clone = await mkdtemp(path.join(os.tmpdir(), "claude-vm-boot-"));
  const origin = "a".repeat(40);
  const kernel = Buffer.from("private kernel fixture");
  const initrd = Buffer.from("private initrd fixture");
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  await Promise.all([
    writeFile(path.join(clone, "vmlinuz"), kernel),
    writeFile(path.join(clone, "initrd"), initrd),
    ...[".rootfs.img.origin", ".vmlinuz.origin", ".initrd.origin"]
      .map((name) => writeFile(path.join(clone, name), origin)),
    writeFile(path.join(clone, ".direct-boot-manifest-v1.json"), JSON.stringify({
      version: 1,
      rootfsOrigin: origin,
      vmlinuzSha256: digest(kernel),
      initrdSha256: digest(initrd),
    })),
  ]);
  try {
    assert.deepEqual(await verifyDirectBootArtifacts(clone), {
      rootfsOrigin: origin,
      vmlinuzSha256: digest(kernel),
      initrdSha256: digest(initrd),
    });
    await writeFile(path.join(clone, "initrd"), "tampered");
    await assert.rejects(() => verifyDirectBootArtifacts(clone), /pinned SHA-256/);
    await writeFile(path.join(clone, "initrd"), initrd);
    await rm(path.join(clone, ".initrd.origin"));
    await symlink(".rootfs.img.origin", path.join(clone, ".initrd.origin"));
    await assert.rejects(() => verifyDirectBootArtifacts(clone), /provenance is not a regular file/);
  } finally {
    await rm(clone, { recursive: true, force: true });
  }
});

test("host share is owner-only, project-confined, and symlink-free", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "claude-vm-share-project-"));
  const share = path.join(projectRoot, "share");
  const outside = await mkdtemp(path.join(os.tmpdir(), "claude-vm-share-outside-"));
  await mkdir(share, { mode: 0o700 });
  await writeFile(path.join(share, "README.txt"), "safe fixture\n");
  await chmod(share, 0o500);
  try {
    assert.deepEqual(await verifyShareDirectory(share, projectRoot), {
      path: await realpath(share),
      readOnly: true,
      tag: "claudeshared",
    });
    await chmod(share, 0o555);
    await assert.rejects(() => verifyShareDirectory(share, projectRoot), /group or world/);
    await chmod(share, 0o700);
    await assert.rejects(() => verifyShareDirectory(share, projectRoot), /owner-nonwritable/);
    await chmod(share, 0o700);
    await symlink("/Users", path.join(share, "escape"));
    await chmod(share, 0o500);
    await assert.rejects(() => verifyShareDirectory(share, projectRoot), /symbolic links/);
    await assert.rejects(() => verifyShareDirectory(outside, projectRoot), /inside the MCP project/);
  } finally {
    await chmod(share, 0o700).catch(() => {});
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
