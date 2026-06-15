//
//  ServerManager.swift
//  Launey
//

import Foundation

@MainActor
final class ServerManager {
    static let shared = ServerManager()

    private let launchCommand = """
    cd /Users/neketosa/Launey/launey-web && npm run dev
    """
    private let retryDelay: Duration = .milliseconds(500)
    private let maximumAttempts = 60

    private var serverProcess: Process?
    private var startupTask: Task<Bool, Never>?
    private var standardOutputPipe: Pipe?
    private var standardErrorPipe: Pipe?

    private init() {}

    func ensureServerIsRunning() async -> Bool {
        if let startupTask {
            return await startupTask.value
        }

        let task = Task { @MainActor in
            await checkAndStartServerIfNeeded()
        }
        startupTask = task

        let isReady = await task.value
        startupTask = nil
        return isReady
    }

    private func checkAndStartServerIfNeeded() async -> Bool {
        if await isServerAvailable() {
            print("[Launey] Server is already available at \(BrowserManager.applicationURL.absoluteString)")
            return true
        }

        guard startServer() else {
            return false
        }

        for attempt in 1...maximumAttempts {
            if await isServerAvailable() {
                print("[Launey] Server became available after \(attempt) check(s)")
                return true
            }

            if let serverProcess, !serverProcess.isRunning {
                print(
                    "[Launey] Server process exited before startup completed. "
                    + "Exit status: \(serverProcess.terminationStatus)"
                )
                return false
            }

            try? await ContinuousClock().sleep(for: retryDelay)
        }

        print(
            "[Launey] Server did not become available at "
            + "\(BrowserManager.applicationURL.absoluteString) after "
            + "\(maximumAttempts) attempts"
        )
        return false
    }

    private func startServer() -> Bool {
        if serverProcess?.isRunning == true {
            print("[Launey] Server process is already running; waiting for port 4242")
            return true
        }

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        configureLogging(for: outputPipe, prefix: "[Vite]")
        configureLogging(for: errorPipe, prefix: "[Vite error]")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", launchCommand]
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        do {
            print("[Launey] Starting server with: /bin/zsh -lc \"\(launchCommand)\"")
            try process.run()

            serverProcess = process
            standardOutputPipe = outputPipe
            standardErrorPipe = errorPipe
            return true
        } catch {
            outputPipe.fileHandleForReading.readabilityHandler = nil
            errorPipe.fileHandleForReading.readabilityHandler = nil
            print("[Launey] Failed to launch server: \(error.localizedDescription)")
            print("[Launey] Launch error details: \(String(reflecting: error))")
            return false
        }
    }

    private func configureLogging(for pipe: Pipe, prefix: String) {
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let output = String(data: data, encoding: .utf8) else {
                return
            }

            for line in output.split(whereSeparator: \.isNewline) {
                print("\(prefix) \(line)")
            }
        }
    }

    private func isServerAvailable() async -> Bool {
        var request = URLRequest(url: BrowserManager.applicationURL)
        request.httpMethod = "GET"
        request.timeoutInterval = 1
        request.cachePolicy = .reloadIgnoringLocalCacheData

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return response is HTTPURLResponse
        } catch {
            return false
        }
    }
}
