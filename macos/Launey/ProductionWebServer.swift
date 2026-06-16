//
//  ProductionWebServer.swift
//  Launey
//

import Foundation
import Network

final class ProductionWebServer {
    private struct AppSettings: Codable {
        let appearanceTheme: String
        let backgroundBlur: Int
        let backgroundDim: Int
        let checkUpdatesOnOpen: Bool
        let weatherLocation: String
        let background: Background

        struct Background: Codable {
            let type: String
        }

        static let `default` = AppSettings(
            appearanceTheme: "system",
            backgroundBlur: 0,
            backgroundDim: 0,
            checkUpdatesOnOpen: true,
            weatherLocation: "Russia, Moscow",
            background: Background(type: "default")
        )
    }

    private let port: UInt16
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "designby4roff.launey.production-server")

    init(port: UInt16) {
        self.port = port
    }

    func start() throws {
        let webRoot = try resolveWebRoot()
        let listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
        listener.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection, webRoot: webRoot)
        }
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("[ProductionServer] Listening on http://localhost:\(self.port)")
                print("[ProductionServer] Serving frontend from \(webRoot.path)")
            case .failed(let error):
                print("[ProductionServer] Listener failed: \(error)")
            default:
                break
            }
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func handleConnection(_ connection: NWConnection, webRoot: URL) {
        connection.start(queue: queue)
        receiveRequest(on: connection) { [weak self] requestData in
            guard let self else {
                connection.cancel()
                return
            }

            let response = self.buildResponse(for: requestData, webRoot: webRoot)
            connection.send(content: response, completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func receiveRequest(on connection: NWConnection, completion: @escaping (Data) -> Void) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { data, _, _, _ in
            completion(data ?? Data())
        }
    }

    private func buildResponse(for requestData: Data, webRoot: URL) -> Data {
        guard let request = String(data: requestData, encoding: .utf8),
              let requestLine = request.split(separator: "\r\n", maxSplits: 1).first
        else {
            return makeTextResponse(status: 400, reason: "Bad Request", body: "Bad Request")
        }

        let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
        guard parts.count >= 2 else {
            return makeTextResponse(status: 400, reason: "Bad Request", body: "Bad Request")
        }

        let method = String(parts[0])
        let rawPath = String(parts[1])

        guard method == "GET" else {
            return makeJSONResponse(
                status: 405,
                reason: "Method Not Allowed",
                body: ["error": "Method Not Allowed"]
            )
        }

        guard let requestedPath = sanitizePath(rawPath) else {
            return makeTextResponse(status: 400, reason: "Bad Request", body: "Bad Request")
        }

        if requestedPath.hasPrefix("/api/") {
            if requestedPath == "/api/settings" {
                return makeSettingsResponse()
            }

            return makeJSONResponse(
                status: 501,
                reason: "Not Implemented",
                body: ["error": "Production API is not implemented yet"]
            )
        }

        if let fileURL = resolveStaticFile(for: requestedPath, webRoot: webRoot) {
            return makeFileResponse(fileURL: fileURL)
        }

        return makeTextResponse(status: 404, reason: "Not Found", body: "Not Found")
    }

    private func makeSettingsResponse() -> Data {
        do {
            let settings = try loadSettings()
            let payload = try JSONEncoder().encode(settings)
            return makeResponse(
                status: 200,
                reason: "OK",
                headers: [
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Length": "\(payload.count)",
                    "Cache-Control": "no-cache",
                ],
                body: payload
            )
        } catch {
            print("[ProductionServer] Failed to load settings: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to load settings"]
            )
        }
    }

    private func resolveStaticFile(for requestedPath: String, webRoot: URL) -> URL? {
        let indexURL = webRoot.appendingPathComponent("index.html")

        if requestedPath == "/" {
            return indexURL
        }

        let relativePath = String(requestedPath.dropFirst())
        let candidateURL = webRoot.appendingPathComponent(relativePath)
        if fileExists(at: candidateURL) {
            return candidateURL
        }

        return indexURL
    }

    private func makeFileResponse(fileURL: URL) -> Data {
        guard let body = try? Data(contentsOf: fileURL) else {
            return makeTextResponse(status: 500, reason: "Internal Server Error", body: "Internal Server Error")
        }

        return makeResponse(
            status: 200,
            reason: "OK",
            headers: [
                "Content-Type": mimeType(for: fileURL.pathExtension),
                "Content-Length": "\(body.count)",
                "Cache-Control": "no-cache",
            ],
            body: body
        )
    }

    private func makeJSONResponse(status: Int, reason: String, body: [String: String]) -> Data {
        let payload = (try? JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted])) ?? Data()
        return makeResponse(
            status: status,
            reason: reason,
            headers: [
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": "\(payload.count)",
                "Cache-Control": "no-cache",
            ],
            body: payload
        )
    }

    private func makeTextResponse(status: Int, reason: String, body: String) -> Data {
        let payload = Data(body.utf8)
        return makeResponse(
            status: status,
            reason: reason,
            headers: [
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Length": "\(payload.count)",
                "Cache-Control": "no-cache",
            ],
            body: payload
        )
    }

    private func makeResponse(status: Int, reason: String, headers: [String: String], body: Data) -> Data {
        var response = "HTTP/1.1 \(status) \(reason)\r\n"
        for (header, value) in headers {
            response += "\(header): \(value)\r\n"
        }
        response += "Connection: close\r\n\r\n"

        var data = Data(response.utf8)
        data.append(body)
        return data
    }

    private func resolveWebRoot() throws -> URL {
        let fileManager = FileManager.default

        if let resourcesURL = Bundle.main.resourceURL {
            let bundledWebURL = resourcesURL.appendingPathComponent("web", isDirectory: true)
            if fileManager.fileExists(atPath: bundledWebURL.path) {
                return bundledWebURL
            }
        }

        let fallbackWebURL = URL(fileURLWithPath: "/Users/neketosa/Launey/launey-web/dist", isDirectory: true)
        if fileManager.fileExists(atPath: fallbackWebURL.path) {
            return fallbackWebURL
        }

        throw NSError(
            domain: "Launey.ProductionWebServer",
            code: 1,
            userInfo: [
                NSLocalizedDescriptionKey: "Missing production web root at Resources/web and fallback dist path."
            ]
        )
    }

    private func loadSettings() throws -> AppSettings {
        let fileManager = FileManager.default
        let dataDirectory = try resolveSettingsDirectory()
        let settingsURL = dataDirectory.appendingPathComponent("settings.json")

        if !fileManager.fileExists(atPath: settingsURL.path) {
            try writeDefaultSettings(to: settingsURL)
            return .default
        }

        do {
            let data = try Data(contentsOf: settingsURL)
            let settings = try JSONDecoder().decode(AppSettings.self, from: data)
            return settings
        } catch {
            print("[ProductionServer] Settings file is invalid, restoring defaults at \(settingsURL.path)")
            try writeDefaultSettings(to: settingsURL)
            return .default
        }
    }

    private func resolveSettingsDirectory() throws -> URL {
        guard let applicationSupportURL = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw NSError(
                domain: "Launey.ProductionWebServer",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Unable to resolve Application Support directory."]
            )
        }

        let dataDirectory = applicationSupportURL
            .appendingPathComponent("Launey", isDirectory: true)
            .appendingPathComponent("data", isDirectory: true)

        try FileManager.default.createDirectory(
            at: dataDirectory,
            withIntermediateDirectories: true
        )

        return dataDirectory
    }

    private func writeDefaultSettings(to settingsURL: URL) throws {
        let payload = try JSONEncoder().encode(AppSettings.default)
        try payload.write(to: settingsURL, options: .atomic)
    }

    private func fileExists(at url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path) && !url.hasDirectoryPath
    }

    private func sanitizePath(_ rawPath: String) -> String? {
        guard let components = URLComponents(string: rawPath) else {
            return nil
        }

        let path = components.path.isEmpty ? "/" : components.path

        if path.contains("..") || path.contains("\\") || path.contains("\0") {
            return nil
        }

        return path
    }

    private func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html":
            return "text/html; charset=utf-8"
        case "js", "mjs":
            return "text/javascript; charset=utf-8"
        case "css":
            return "text/css; charset=utf-8"
        case "json":
            return "application/json; charset=utf-8"
        case "svg":
            return "image/svg+xml"
        case "png":
            return "image/png"
        case "jpg", "jpeg":
            return "image/jpeg"
        case "webp":
            return "image/webp"
        case "ico":
            return "image/x-icon"
        default:
            return "application/octet-stream"
        }
    }
}
