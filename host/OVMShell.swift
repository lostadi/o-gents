import Darwin
import Foundation
import Virtualization

private func prepareGuestNetworkShare(bundleURL: URL, identity: String, sourceRootfs: String? = nil, distributionMode: String = "auto", runtimeOnly: Bool = false) throws -> (networkShare: URL?, profilePath: String) {
    var roots = [bundleURL.deletingLastPathComponent().deletingLastPathComponent()]
    if let configured = ProcessInfo.processInfo.environment["CLAUDE_VM_ROOT"] {
        roots.insert(URL(fileURLWithPath: configured, isDirectory: true), at: 0)
    }
    var ancestor = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent()
    for _ in 0..<4 {
        roots.append(ancestor)
        ancestor.deleteLastPathComponent()
    }
    guard let helper = roots.map({ $0.appendingPathComponent("bin/ovm-network") })
        .first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
        throw NSError(domain: "OVMNetwork", code: 66, userInfo: [NSLocalizedDescriptionKey:
            "Cannot find bin/ovm-network for guest runtime preparation. Use the OVM launcher from its installed checkout."])
    }
    let process = Process()
    let output = Pipe()
    let finished = DispatchSemaphore(value: 0)
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["node", helper.path, "prepare", identity, "--bundle", bundleURL.path, "--distribution", distributionMode]
        + (sourceRootfs.map { ["--image", $0] } ?? [])
        + (runtimeOnly ? ["--runtime-only"] : [])
    process.standardOutput = output
    // Upgrades can print many build lines. Inherit stderr so progress drains
    // while this synchronous prelaunch helper is running.
    process.standardError = FileHandle.standardError
    process.terminationHandler = { _ in finished.signal() }
    try process.run()
    if finished.wait(timeout: .now() + 5_430) == .timedOut {
        process.terminate()
        if finished.wait(timeout: .now() + 2) == .timedOut {
            Darwin.kill(process.processIdentifier, SIGKILL)
            _ = finished.wait(timeout: .now() + 2)
        }
        throw NSError(domain: "OVMNetwork", code: 75, userInfo: [NSLocalizedDescriptionKey: "Guest preparation exceeded its 90-minute upgrade deadline"])
    }
    let data = output.fileHandleForReading.readDataToEndOfFile()
    guard process.terminationStatus == 0 else {
        throw NSError(domain: "OVMNetwork", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: "Guest preparation failed; see the helper error above."])
    }
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          object["runtimePrepared"] as? Bool == true,
          let profile = object["runtimeProfilePath"] as? String, profile.hasPrefix("/") else {
        throw NSError(domain: "OVMNetwork", code: 65, userInfo: [NSLocalizedDescriptionKey: "Guest preparation returned no verified runtime profile"])
    }
    if runtimeOnly { return (nil, profile) }
    guard let share = object["networkShare"] as? String, share.hasPrefix("/") else {
        throw NSError(domain: "OVMNetwork", code: 65, userInfo: [NSLocalizedDescriptionKey: "Guest network preparation returned no absolute networkShare"])
    }
    return (URL(fileURLWithPath: share, isDirectory: true), profile)
}


private var originalTermios = termios()
private var terminalConfigured = false

private func requiredURL(
    flag: String,
    environment: String,
    isDirectory: Bool = false
) -> URL {
    let arguments = CommandLine.arguments
    if let index = arguments.firstIndex(of: flag), index + 1 < arguments.count {
        return URL(fileURLWithPath: arguments[index + 1], isDirectory: isDirectory)
    }
    if let value = ProcessInfo.processInfo.environment[environment], !value.isEmpty {
        return URL(fileURLWithPath: value, isDirectory: isDirectory)
    }
    fputs("missing \(flag) PATH (or \(environment))\n", stderr)
    Darwin.exit(64)
}

private func restoreTerminal() {
    if terminalConfigured {
        tcsetattr(STDIN_FILENO, TCSANOW, &originalTermios)
        terminalConfigured = false
    }
}

private final class ShellController: NSObject, VZVirtualMachineDelegate {
    // Retain strong reference so the VM is not deallocated by ARC while running
    var vm: VZVirtualMachine?

    func guestDidStop(_ virtualMachine: VZVirtualMachine) {
        restoreTerminal()
        Darwin.exit(0)
    }

    func virtualMachine(_ virtualMachine: VZVirtualMachine, didStopWithError error: Error) {
        restoreTerminal()
        fputs("\n[ovm-shell] Virtual machine stopped with error: \(error.localizedDescription)\n", stderr)
        Darwin.exit(1)
    }
}

@main
private enum Main {
    static let controller = ShellController()
    static let queue = DispatchQueue(label: "local.lee.ovm.shell")

    static func main() {
        let bundleURL = requiredURL(flag: "--bundle", environment: "OVM_BUNDLE", isDirectory: true)
        let smolURL = requiredURL(flag: "--smol", environment: "OVM_SMOL")
        let shareURL = requiredURL(flag: "--share", environment: "OVM_SHARE", isDirectory: true)
        let arguments = CommandLine.arguments
        let provisioning = arguments.contains("--provision")
        func optionalValue(_ flag: String) -> String? {
            guard let index = arguments.firstIndex(of: flag) else { return nil }
            guard index + 1 < arguments.count, !arguments[index + 1].hasPrefix("--") else {
                fputs("\(flag) requires a value\n", stderr)
                Darwin.exit(64)
            }
            return arguments[index + 1]
        }
        let networkMode = optionalValue("--network") ?? (provisioning ? "nat" : ProcessInfo.processInfo.environment["OVM_NETWORK_MODE"] ?? "nat")
        guard ["nat", "isolated"].contains(networkMode) else {
            fputs("--network must be nat or isolated\n", stderr)
            Darwin.exit(64)
        }
        let distributionMode = optionalValue("--distribution") ?? ProcessInfo.processInfo.environment["OVM_DISTRIBUTION_MODE"] ?? "auto"
        guard ["auto", "local", "required"].contains(distributionMode) else {
            fputs("--distribution must be auto, local, or required\n", stderr)
            Darwin.exit(64)
        }
        var networkShareURL = optionalValue("--network-share").map { URL(fileURLWithPath: $0, isDirectory: true) }
        if !provisioning {
            do {
                let prepared = try prepareGuestNetworkShare(bundleURL: bundleURL, identity: "bundle:\(bundleURL.resolvingSymlinksInPath().path)", distributionMode: distributionMode, runtimeOnly: networkMode == "isolated" || networkShareURL != nil)
                networkShareURL = networkShareURL ?? prepared.networkShare
            } catch {
                fputs("Guest network setup failed: \(error.localizedDescription)\n", stderr)
                Darwin.exit(1)
            }
        }
        let exportShareURL = optionalValue("--export-share").map { URL(fileURLWithPath: $0, isDirectory: true) }

        signal(SIGINT, SIG_IGN)
        signal(SIGTERM, SIG_IGN)
        atexit {
            restoreTerminal()
        }

        if isatty(STDIN_FILENO) != 0 {
            tcgetattr(STDIN_FILENO, &originalTermios)
            var raw = originalTermios
            cfmakeraw(&raw)
            tcsetattr(STDIN_FILENO, TCSANOW, &raw)
            terminalConfigured = true
        }

        queue.async {
            do {
                guard VZVirtualMachine.isSupported else {
                    restoreTerminal()
                    fputs("Apple Virtualization is not supported on this host\n", stderr)
                    Darwin.exit(1)
                }

                let configuration = VZVirtualMachineConfiguration()
                configuration.cpuCount = 4
                configuration.memorySize = 4 * 1024 * 1024 * 1024

                let identifierData = try Data(contentsOf: bundleURL.appendingPathComponent("machineIdentifier"))
                guard let identifier = VZGenericMachineIdentifier(dataRepresentation: identifierData) else {
                    restoreTerminal()
                    fputs("invalid machineIdentifier\n", stderr)
                    Darwin.exit(1)
                }
                let platform = VZGenericPlatformConfiguration()
                platform.machineIdentifier = identifier
                configuration.platform = platform

                let bootLoader = VZLinuxBootLoader(kernelURL: bundleURL.appendingPathComponent("vmlinuz"))
                bootLoader.initialRamdiskURL = bundleURL.appendingPathComponent("initrd")
                bootLoader.commandLine = "root=LABEL=cloudimg-rootfs rw console=hvc0 panic=1 init=/bin/bash quiet ovm.network=\(networkMode) ovm.distribution=\(distributionMode) ovm.network_index=0 ovm.provision=\(provisioning ? 1 : 0) --login"
                configuration.bootLoader = bootLoader

                func writableNVMe(_ name: String) throws -> VZNVMExpressControllerDeviceConfiguration {
                    let attachment = try VZDiskImageStorageDeviceAttachment(
                        url: bundleURL.appendingPathComponent(name),
                        readOnly: false,
                        cachingMode: .cached,
                        synchronizationMode: .fsync
                    )
                    return VZNVMExpressControllerDeviceConfiguration(attachment: attachment)
                }
                let smolAttachment = try VZDiskImageStorageDeviceAttachment(url: smolURL, readOnly: true)
                configuration.storageDevices = [
                    try writableNVMe("rootfs.img"),
                    try writableNVMe("sessiondata.img"),
                    VZVirtioBlockDeviceConfiguration(attachment: smolAttachment),
                ]

                configuration.entropyDevices = [VZVirtioEntropyDeviceConfiguration()]
                configuration.memoryBalloonDevices = [VZVirtioTraditionalMemoryBalloonDeviceConfiguration()]
                configuration.socketDevices = [VZVirtioSocketDeviceConfiguration()]

                if networkMode == "nat" {
                    let networkConfig = VZVirtioNetworkDeviceConfiguration()
                    networkConfig.attachment = VZNATNetworkDeviceAttachment()
                    networkConfig.macAddress = VZMACAddress.randomLocallyAdministered()
                    configuration.networkDevices = [networkConfig]
                }

                let fileSystem = VZVirtioFileSystemDeviceConfiguration(tag: "claudeshared")
                let sharedDirectory = VZSharedDirectory(url: shareURL, readOnly: true)
                fileSystem.share = VZSingleDirectoryShare(directory: sharedDirectory)
                configuration.directorySharingDevices = [fileSystem]
                if let networkShareURL {
                    var isDirectory: ObjCBool = false
                    guard FileManager.default.fileExists(atPath: networkShareURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
                        throw NSError(domain: "OVMShell", code: 66, userInfo: [NSLocalizedDescriptionKey: "network configuration share is not a directory: \(networkShareURL.path)"])
                    }
                    let configShare = VZVirtioFileSystemDeviceConfiguration(tag: "ovmconfig")
                    configShare.share = VZSingleDirectoryShare(directory: VZSharedDirectory(url: networkShareURL, readOnly: true))
                    configuration.directorySharingDevices.append(configShare)
                }
                if let exportShareURL {
                    var isDirectory: ObjCBool = false
                    guard FileManager.default.fileExists(atPath: exportShareURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
                        throw NSError(domain: "OVMShell", code: 66, userInfo: [NSLocalizedDescriptionKey: "export share is not a directory: \(exportShareURL.path)"])
                    }
                    // Provisioning exports are the only explicitly requested
                    // writable host share. The normal shared directory stays RO.
                    let exportShare = VZVirtioFileSystemDeviceConfiguration(tag: "ovmexport")
                    exportShare.share = VZSingleDirectoryShare(directory: VZSharedDirectory(url: exportShareURL, readOnly: false))
                    configuration.directorySharingDevices.append(exportShare)
                }

                let serialAttachment = VZFileHandleSerialPortAttachment(
                    fileHandleForReading: FileHandle.standardInput,
                    fileHandleForWriting: FileHandle.standardOutput
                )
                let console = VZVirtioConsoleDeviceConfiguration()
                let port0 = VZVirtioConsolePortConfiguration()
                port0.name = "console"
                port0.isConsole = true
                port0.attachment = serialAttachment
                console.ports[0] = port0
                configuration.consoleDevices = [console]

                try configuration.validate()

                let vm = VZVirtualMachine(configuration: configuration, queue: queue)
                vm.delegate = controller
                controller.vm = vm

                vm.start { result in
                    switch result {
                    case .success:
                        break
                    case .failure(let error):
                        restoreTerminal()
                        fputs("\nFailed to start VM: \(error.localizedDescription)\n", stderr)
                        Darwin.exit(1)
                    }
                }
            } catch {
                restoreTerminal()
                fputs("Configuration error: \(error.localizedDescription)\n", stderr)
                Darwin.exit(1)
            }
        }

        dispatchMain()
    }
}
