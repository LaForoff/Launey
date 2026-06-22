//
//  ProductionWebServer.swift
//  Launey
//

import Foundation
import Network

final class ProductionWebServer {
    private static let allowedIconExtensions: Set<String> = [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "svg",
        "ico",
    ]

    private struct AppSettings: Codable {
        let appearanceTheme: String
        let backgroundBlur: Int
        let backgroundDim: Int
        let checkUpdatesOnOpen: Bool
        let weatherLocation: String
        let background: Background
        let syncMeta: SyncMeta

        struct Background: Codable {
            let type: String
            let value: String?
            let fileName: String?
        }

        struct SyncMeta: Codable {
            let lastExportAt: String?
            let lastImportAt: String?
        }

        static let `default` = AppSettings(
            appearanceTheme: "system",
            backgroundBlur: 0,
            backgroundDim: 0,
            checkUpdatesOnOpen: true,
            weatherLocation: "",
            background: Background(type: "default", value: nil, fileName: nil),
            syncMeta: SyncMeta(lastExportAt: nil, lastImportAt: nil)
        )
    }

    private struct HTTPRequest {
        let method: String
        let path: String
        let headers: [String: String]
        let body: Data
    }

    private final class DownloadResultBox: @unchecked Sendable {
        private let lock = NSLock()
        private var result: Result<(Data, URLResponse), Error>?

        func store(_ result: Result<(Data, URLResponse), Error>) {
            lock.lock()
            self.result = result
            lock.unlock()
        }

        func load() -> Result<(Data, URLResponse), Error>? {
            lock.lock()
            defer { lock.unlock() }
            return result
        }
    }

    private enum IconCacheError: Error {
        case invalidJSON
        case invalidPayload
        case unsupportedType
        case downloadFailed
    }

    private enum ExportError: Error {
        case invalidJSON
        case invalidPayload
    }

    private enum ImportError: Error {
        case invalidJSON
        case invalidPayload
    }

    private struct RestoredIcon {
        let fileURL: URL
        let data: Data
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
        receiveRequest(on: connection, accumulated: Data()) { [weak self] requestData in
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

    private func receiveRequest(
        on connection: NWConnection,
        accumulated: Data,
        completion: @escaping (Data) -> Void
    ) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { data, _, isComplete, error in
            if error != nil {
                completion(accumulated)
                return
            }

            var nextData = accumulated
            if let data {
                nextData.append(data)
            }

            if isComplete || self.isCompleteHTTPRequest(nextData) || data?.isEmpty != false {
                completion(nextData)
                return
            }

            self.receiveRequest(on: connection, accumulated: nextData, completion: completion)
        }
    }

    private func buildResponse(for requestData: Data, webRoot: URL) -> Data {
        guard let request = parseRequest(from: requestData) else {
            return makeTextResponse(status: 400, reason: "Bad Request", body: "Bad Request")
        }

        guard let requestedPath = sanitizePath(request.path) else {
            return makeTextResponse(status: 400, reason: "Bad Request", body: "Bad Request")
        }

        if requestedPath.hasPrefix("/api/") {
            if requestedPath == "/api/import" {
                guard request.method == "POST" else {
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }

                return makeImportResponse(body: request.body)
            }

            if requestedPath == "/api/export" {
                guard request.method == "POST" else {
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }

                return makeExportResponse(body: request.body)
            }

            if requestedPath == "/api/cache-icon" {
                guard request.method == "POST" else {
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }

                return makeCacheIconResponse(
                    body: request.body,
                    requestKey: "iconUrl",
                    responseKey: "localIcon",
                    includeOK: true
                )
            }

            if requestedPath == "/api/icons/cache-remote" {
                guard request.method == "POST" else {
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }

                return makeCacheIconResponse(
                    body: request.body,
                    requestKey: "url",
                    responseKey: "path",
                    includeOK: false
                )
            }

            if requestedPath == "/api/icons" {
                switch request.method {
                case "POST":
                    return makeUploadIconResponse(body: request.body, headers: request.headers)
                case "DELETE":
                    return makeDeleteIconResponse(body: request.body)
                default:
                    return makeJSONResponse(
                        status: 501,
                        reason: "Not Implemented",
                        body: ["error": "Production API is not implemented yet"]
                    )
                }
            }

            if requestedPath == "/api/settings" {
                switch request.method {
                case "GET":
                    return makeSettingsResponse()
                case "POST":
                    return makeSaveSettingsResponse(body: request.body)
                default:
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }
            }

            return makeJSONResponse(
                status: 501,
                reason: "Not Implemented",
                body: ["error": "Production API is not implemented yet"]
            )
        }

        if requestedPath.hasPrefix("/user-icons/") {
            guard request.method == "GET" else {
                return makeJSONResponse(
                    status: 405,
                    reason: "Method Not Allowed",
                    body: ["error": "Method Not Allowed"]
                )
            }

            return makeRuntimeFileResponse(
                requestedPath: requestedPath,
                urlPrefix: "/user-icons/",
                directoryResolver: resolveUserIconsDirectory
            )
        }

        if requestedPath.hasPrefix("/icon-cache/") {
            guard request.method == "GET" else {
                return makeJSONResponse(
                    status: 405,
                    reason: "Method Not Allowed",
                    body: ["error": "Method Not Allowed"]
                )
            }

            return makeRuntimeFileResponse(
                requestedPath: requestedPath,
                urlPrefix: "/icon-cache/",
                directoryResolver: resolveIconCacheDirectory
            )
        }

        guard request.method == "GET" else {
            return makeJSONResponse(
                status: 405,
                reason: "Method Not Allowed",
                body: ["error": "Method Not Allowed"]
            )
        }

        if let fileURL = resolveStaticFile(for: requestedPath, webRoot: webRoot) {
            return makeFileResponse(fileURL: fileURL)
        }

        return makeTextResponse(status: 404, reason: "Not Found", body: "Not Found")
    }

    private func makeImportResponse(body: Data) -> Data {
        do {
            let imported = try parseImport(from: body)

            for icon in imported.icons {
                try FileManager.default.createDirectory(
                    at: icon.fileURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try icon.data.write(to: icon.fileURL, options: .atomic)
            }

            let settingsURL = try resolveSettingsFileURL()
            try writeSettings(imported.settings, to: settingsURL)
            let settingsJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(imported.settings))

            return makeJSONObjectResponse(
                status: 200,
                reason: "OK",
                object: [
                    "ok": true,
                    "spaces": imported.spaces,
                    "activeSpaceId": imported.activeSpaceId,
                    "settings": settingsJSON,
                    "restoredIcons": imported.icons.count,
                    "warnings": imported.warnings,
                ]
            )
        } catch ImportError.invalidJSON {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid JSON body"]
            )
        } catch ImportError.invalidPayload {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid import payload"]
            )
        } catch {
            print("[ProductionServer] Failed to import data: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to import data"]
            )
        }
    }

    private func makeExportResponse(body: Data) -> Data {
        do {
            let export = try buildExport(from: body)
            var payload = try JSONSerialization.data(withJSONObject: export, options: [.prettyPrinted])
            payload.append(Data("\n".utf8))

            let date = DateFormatter.launeyExportDate.string(from: Date())
            let fileName = "launey-export-\(date).launeyexport"

            return makeResponse(
                status: 200,
                reason: "OK",
                headers: [
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Disposition": "attachment; filename=\"\(fileName)\"",
                    "Content-Length": "\(payload.count)",
                    "Cache-Control": "no-cache",
                ],
                body: payload
            )
        } catch ExportError.invalidJSON {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid JSON body"]
            )
        } catch ExportError.invalidPayload {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid export payload"]
            )
        } catch {
            print("[ProductionServer] Failed to export data: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to export data"]
            )
        }
    }

    private func makeCacheIconResponse(
        body: Data,
        requestKey: String,
        responseKey: String,
        includeOK: Bool
    ) -> Data {
        do {
            let source = try parseIconSource(from: body, key: requestKey)
            let cachedPath = try cacheIcon(from: source)

            var response: [String: Any] = [responseKey: cachedPath]
            if includeOK {
                response["ok"] = true
            }

            return makeJSONObjectResponse(status: 200, reason: "OK", object: response)
        } catch IconCacheError.invalidJSON {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid JSON body"]
            )
        } catch IconCacheError.invalidPayload {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid icon URL"]
            )
        } catch IconCacheError.unsupportedType {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Unsupported icon type"]
            )
        } catch {
            print("[ProductionServer] Failed to cache icon: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to cache icon"]
            )
        }
    }

    private func makeUploadIconResponse(body: Data, headers: [String: String]) -> Data {
        guard !body.isEmpty else {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Empty file"]
            )
        }

        guard let extensionName = resolveIconExtension(
            fileNameHeader: headers["x-file-name"],
            contentTypeHeader: headers["content-type"]
        ) else {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Unsupported icon type"]
            )
        }

        let fileName = "icon-\(UUID().uuidString.lowercased()).\(extensionName)"

        do {
            let directoryURL = try resolveUserIconsDirectory()
            let fileURL = directoryURL.appendingPathComponent(fileName)
            try body.write(to: fileURL, options: .atomic)

            return makeJSONResponse(
                status: 200,
                reason: "OK",
                body: ["path": "/user-icons/\(fileName)"]
            )
        } catch {
            print("[ProductionServer] Failed to save icon: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to save icon"]
            )
        }
    }

    private func makeDeleteIconResponse(body: Data) -> Data {
        do {
            let requestedPath = try parseDeleteIconPath(from: body)
            let directoryURL = try resolveUserIconsDirectory()

            guard let fileURL = resolveRuntimeFileURL(
                requestedPath: requestedPath,
                urlPrefix: "/user-icons/",
                directoryURL: directoryURL
            ) else {
                if isPotentiallyValidRuntimePath(requestedPath, urlPrefix: "/user-icons/") {
                    return makeTextResponse(status: 404, reason: "Not Found", body: "Not Found")
                }

                return makeJSONResponse(
                    status: 400,
                    reason: "Bad Request",
                    body: ["error": "Invalid icon path"]
                )
            }

            do {
                try FileManager.default.removeItem(at: fileURL)
                return makeJSONObjectResponse(
                    status: 200,
                    reason: "OK",
                    object: ["ok": true]
                )
            } catch {
                print("[ProductionServer] Failed to delete icon: \(error)")
                return makeJSONResponse(
                    status: 500,
                    reason: "Internal Server Error",
                    body: ["error": "Failed to delete icon"]
                )
            }
        } catch {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid icon path"]
            )
        }
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

    private func makeSaveSettingsResponse(body: Data) -> Data {
        do {
            let settings = try sanitizeSettings(from: body)
            let settingsURL = try resolveSettingsFileURL()
            try writeSettings(settings, to: settingsURL)

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
        } catch let error as SettingsError {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": error.localizedDescription]
            )
        } catch {
            print("[ProductionServer] Failed to save settings: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to save settings"]
            )
        }
    }

    private func makeRuntimeFileResponse(
        requestedPath: String,
        urlPrefix: String,
        directoryResolver: () throws -> URL
    ) -> Data {
        do {
            let directoryURL = try directoryResolver()
            guard let fileURL = resolveRuntimeFileURL(
                requestedPath: requestedPath,
                urlPrefix: urlPrefix,
                directoryURL: directoryURL
            ) else {
                return makeTextResponse(status: 404, reason: "Not Found", body: "Not Found")
            }

            return makeFileResponse(fileURL: fileURL)
        } catch {
            print("[ProductionServer] Failed to serve runtime file: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": "Failed to read runtime file"]
            )
        }
    }

    private func parseRequest(from data: Data) -> HTTPRequest? {
        guard let separatorRange = data.range(of: Data("\r\n\r\n".utf8)) else {
            return nil
        }

        let headerData = data[..<separatorRange.lowerBound]
        let bodyStart = separatorRange.upperBound
        let body = bodyStart < data.endIndex ? Data(data[bodyStart...]) : Data()

        guard let headerString = String(data: headerData, encoding: .utf8),
              let requestLine = headerString.split(separator: "\r\n", maxSplits: 1).first
        else {
            return nil
        }

        let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
        guard parts.count >= 2 else {
            return nil
        }

        var headers: [String: String] = [:]
        let headerLines = headerString.split(separator: "\r\n", omittingEmptySubsequences: false).dropFirst()
        for line in headerLines {
            guard let separatorIndex = line.firstIndex(of: ":") else {
                continue
            }

            let name = line[..<separatorIndex]
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            let value = line[line.index(after: separatorIndex)...]
                .trimmingCharacters(in: .whitespacesAndNewlines)
            headers[name] = value
        }

        return HTTPRequest(
            method: String(parts[0]),
            path: String(parts[1]),
            headers: headers,
            body: body
        )
    }

    private func isCompleteHTTPRequest(_ data: Data) -> Bool {
        let separator = Data("\r\n\r\n".utf8)
        guard let separatorRange = data.range(of: separator) else {
            return false
        }

        let headerData = data[..<separatorRange.lowerBound]
        guard let headerString = String(data: headerData, encoding: .utf8) else {
            return false
        }

        let contentLength = headerString
            .split(separator: "\r\n")
            .first { $0.lowercased().hasPrefix("content-length:") }
            .flatMap { line -> Int? in
                guard let separatorIndex = line.firstIndex(of: ":") else {
                    return nil
                }
                return Int(line[line.index(after: separatorIndex)...].trimmingCharacters(in: .whitespaces))
            } ?? 0

        return data.count >= separatorRange.upperBound + contentLength
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
        makeJSONObjectResponse(status: status, reason: reason, object: body)
    }

    private func makeJSONObjectResponse(status: Int, reason: String, object: Any) -> Data {
        let payload = (try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted])) ?? Data()
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
        let settingsURL = try resolveSettingsFileURL()

        if !fileManager.fileExists(atPath: settingsURL.path) {
            try writeDefaultSettings(to: settingsURL)
            return .default
        }

        do {
            let data = try Data(contentsOf: settingsURL)
            let settings = try sanitizeSettings(from: data)
            try writeSettings(settings, to: settingsURL)
            return settings
        } catch {
            print("[ProductionServer] Settings file is invalid, restoring defaults at \(settingsURL.path)")
            try writeDefaultSettings(to: settingsURL)
            return .default
        }
    }

    private func resolveSettingsDirectory() throws -> URL {
        let dataDirectory = try resolveLauneyApplicationSupportDirectory()
            .appendingPathComponent("data", isDirectory: true)

        try FileManager.default.createDirectory(
            at: dataDirectory,
            withIntermediateDirectories: true
        )

        return dataDirectory
    }

    private func resolveSettingsFileURL() throws -> URL {
        try resolveSettingsDirectory().appendingPathComponent("settings.json")
    }

    private func resolveUserIconsDirectory() throws -> URL {
        let directory = try resolveLauneyApplicationSupportDirectory()
            .appendingPathComponent("user-icons", isDirectory: true)

        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )

        return directory
    }

    private func resolveIconCacheDirectory() throws -> URL {
        let directory = try resolveLauneyApplicationSupportDirectory()
            .appendingPathComponent("icon-cache", isDirectory: true)

        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )

        return directory
    }

    private func resolveLauneyApplicationSupportDirectory() throws -> URL {
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

        let directory = applicationSupportURL
            .appendingPathComponent("Launey", isDirectory: true)

        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )

        return directory
    }

    private func writeDefaultSettings(to settingsURL: URL) throws {
        try writeSettings(.default, to: settingsURL)
    }

    private func writeSettings(_ settings: AppSettings, to settingsURL: URL) throws {
        let payload = try JSONEncoder().encode(settings)
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

    private func resolveRuntimeFileURL(
        requestedPath: String,
        urlPrefix: String,
        directoryURL: URL
    ) -> URL? {
        guard let relativePath = validatedRuntimeRelativePath(
            requestedPath: requestedPath,
            urlPrefix: urlPrefix
        ) else {
            return nil
        }

        let candidateURL = directoryURL.appendingPathComponent(relativePath)
        let standardizedDirectory = directoryURL.standardizedFileURL.path
        let standardizedCandidate = candidateURL.standardizedFileURL.path

        guard standardizedCandidate.hasPrefix(standardizedDirectory + "/") else {
            return nil
        }

        return fileExists(at: candidateURL) ? candidateURL : nil
    }

    private func isPotentiallyValidRuntimePath(_ requestedPath: String, urlPrefix: String) -> Bool {
        validatedRuntimeRelativePath(requestedPath: requestedPath, urlPrefix: urlPrefix) != nil
    }

    private func validatedRuntimeRelativePath(
        requestedPath: String,
        urlPrefix: String
    ) -> String? {
        guard requestedPath.hasPrefix(urlPrefix) else {
            return nil
        }

        let relativePath = String(requestedPath.dropFirst(urlPrefix.count))
        guard !relativePath.isEmpty else {
            return nil
        }

        if relativePath.hasPrefix("/") || relativePath.contains("..") || relativePath.contains("\\") {
            return nil
        }

        return relativePath
    }

    private func parseDeleteIconPath(from body: Data) throws -> String {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: body)
        } catch {
            throw SettingsError.invalidJSON
        }

        guard let payload = object as? [String: Any],
              let path = payload["path"] as? String else {
            throw SettingsError.invalidPayload
        }

        return path
    }

    private func buildExport(from body: Data) throws -> [String: Any] {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: body)
        } catch {
            throw ExportError.invalidJSON
        }

        guard let payload = object as? [String: Any],
              let rawSpaces = payload["spaces"] as? [Any],
              let rawSettings = payload["settings"] as? [String: Any] else {
            throw ExportError.invalidPayload
        }

        let settingsData = try JSONSerialization.data(withJSONObject: rawSettings)
        let settings: AppSettings
        do {
            settings = try sanitizeSettings(from: settingsData)
        } catch {
            throw ExportError.invalidPayload
        }

        var warnings: [String] = []
        var localIconPaths = Set<String>()
        let spaces = sanitizeExportSpaces(
            rawSpaces,
            warnings: &warnings,
            localIconPaths: &localIconPaths
        )

        let activeSpaceId = (payload["activeSpaceId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedActiveSpaceId = activeSpaceId?.isEmpty == false
            ? activeSpaceId!
            : (spaces.first?["id"] as? String ?? "main")

        let settingsJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(settings))
        let iconAssets = readIconAssets(paths: localIconPaths, warnings: &warnings)

        var export: [String: Any] = [
            "version": 1,
            "app": "Launey",
            "exportedAt": ISO8601DateFormatter.launeyExport.string(from: Date()),
            "settings": settingsJSON,
            "spaces": spaces,
            "activeSpaceId": resolvedActiveSpaceId,
            "assets": ["icons": iconAssets],
        ]

        if !warnings.isEmpty {
            export["warnings"] = warnings
        }

        return export
    }

    private func parseImport(from body: Data) throws -> (
        spaces: [[String: Any]],
        activeSpaceId: String,
        settings: AppSettings,
        icons: [RestoredIcon],
        warnings: [String]
    ) {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: body)
        } catch {
            throw ImportError.invalidJSON
        }

        guard let request = object as? [String: Any],
              let file = request["file"] as? [String: Any],
              file["app"] as? String == "Launey",
              file["version"] is NSNumber,
              let rawSpaces = file["spaces"] as? [Any],
              let activeSpaceId = file["activeSpaceId"] as? String,
              !activeSpaceId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let rawSettings = file["settings"] as? [String: Any] else {
            throw ImportError.invalidPayload
        }

        let settingsData: Data
        do {
            settingsData = try JSONSerialization.data(withJSONObject: rawSettings)
        } catch {
            throw ImportError.invalidPayload
        }

        let settings: AppSettings
        do {
            settings = try sanitizeSettings(from: settingsData)
        } catch {
            throw ImportError.invalidPayload
        }

        let spaces = sanitizeImportedSpaces(rawSpaces)
        let icons = try parseImportedIcons(file["assets"])
        let warnings = (file["warnings"] as? [Any])?
            .compactMap { $0 as? String } ?? []

        return (
            spaces: spaces,
            activeSpaceId: activeSpaceId,
            settings: settings,
            icons: icons,
            warnings: warnings
        )
    }

    private func sanitizeImportedSpaces(_ values: [Any]) -> [[String: Any]] {
        values.compactMap { value in
            guard let payload = value as? [String: Any],
                  let id = payload["id"] as? String,
                  let title = payload["title"] as? String,
                  let rawItems = payload["items"] as? [Any] else {
                return nil
            }

            let items = rawItems.compactMap(sanitizeImportedItem)
            var space: [String: Any] = [
                "id": id,
                "title": title,
                "items": items,
            ]

            if let background = payload["background"] as? [String: Any] {
                space["background"] = background
            }

            return space
        }
    }

    private func sanitizeImportedItem(_ value: Any) -> [String: Any]? {
        guard let payload = value as? [String: Any],
              let type = payload["type"] as? String,
              let id = payload["id"] as? String,
              let title = payload["title"] as? String else {
            return nil
        }

        if type == "url" {
            guard let url = payload["url"] as? String else {
                return nil
            }

            var item: [String: Any] = [
                "type": "url",
                "id": id,
                "title": title,
                "url": url,
                "icon": payload["icon"] as? String ?? "",
                "addFrame": payload["addFrame"] as? Bool ?? true,
            ]

            if let customization = sanitizeIconCustomization(payload["iconCustomization"]) {
                item["iconCustomization"] = customization
            }
            if let restoreOrigin = sanitizeRestoreOrigin(payload["restoreOrigin"]) {
                item["restoreOrigin"] = restoreOrigin
            }
            return item
        }

        if type == "folder", let rawItems = payload["items"] as? [Any] {
            let items = rawItems.compactMap { value -> [String: Any]? in
                guard let item = sanitizeImportedItem(value),
                      item["type"] as? String == "url" else {
                    return nil
                }
                return item
            }

            return [
                "type": "folder",
                "id": id,
                "title": title,
                "icon": payload["icon"] as? String ?? "",
                "items": items,
            ]
        }

        return nil
    }

    private func parseImportedIcons(_ assetsValue: Any?) throws -> [RestoredIcon] {
        guard let assetsValue else {
            return []
        }
        guard let assets = assetsValue as? [String: Any] else {
            throw ImportError.invalidPayload
        }
        guard let iconsValue = assets["icons"] else {
            return []
        }
        guard let icons = iconsValue as? [String: Any] else {
            throw ImportError.invalidPayload
        }

        return try icons.map { path, value in
            guard let payload = value as? [String: Any],
                  payload["mimeType"] is String,
                  let encodedData = payload["data"] as? String,
                  let data = Data(base64Encoded: encodedData) else {
                throw ImportError.invalidPayload
            }

            let fileURL = try importDestinationURL(for: path)
            return RestoredIcon(fileURL: fileURL, data: data)
        }
    }

    private func importDestinationURL(for path: String) throws -> URL {
        let directoryURL: URL
        let prefix: String

        if path.hasPrefix("/user-icons/") {
            directoryURL = try resolveUserIconsDirectory()
            prefix = "/user-icons/"
        } else if path.hasPrefix("/icon-cache/") {
            directoryURL = try resolveIconCacheDirectory()
            prefix = "/icon-cache/"
        } else {
            throw ImportError.invalidPayload
        }

        guard let relativePath = validatedRuntimeRelativePath(
            requestedPath: path,
            urlPrefix: prefix
        ) else {
            throw ImportError.invalidPayload
        }

        let candidateURL = directoryURL.appendingPathComponent(relativePath).standardizedFileURL
        let resolvedDirectory = directoryURL.resolvingSymlinksInPath().standardizedFileURL.path
        let resolvedCandidate = candidateURL.resolvingSymlinksInPath().standardizedFileURL.path

        guard resolvedCandidate.hasPrefix(resolvedDirectory + "/") else {
            throw ImportError.invalidPayload
        }

        return candidateURL
    }

    private func sanitizeExportSpaces(
        _ values: [Any],
        warnings: inout [String],
        localIconPaths: inout Set<String>
    ) -> [[String: Any]] {
        values.compactMap { value in
            guard let payload = value as? [String: Any],
                  let id = payload["id"] as? String,
                  let title = payload["title"] as? String,
                  let rawItems = payload["items"] as? [Any] else {
                return nil
            }

            let items = rawItems.compactMap {
                sanitizeExportItem(
                    $0,
                    warnings: &warnings,
                    localIconPaths: &localIconPaths
                )
            }

            var space: [String: Any] = [
                "id": id,
                "title": title,
                "items": items,
            ]

            if let background = payload["background"] as? [String: Any] {
                space["background"] = background
            }

            return space
        }
    }

    private func sanitizeExportItem(
        _ value: Any,
        warnings: inout [String],
        localIconPaths: inout Set<String>
    ) -> [String: Any]? {
        guard let payload = value as? [String: Any],
              let type = payload["type"] as? String,
              let id = payload["id"] as? String,
              let title = payload["title"] as? String else {
            return nil
        }

        if type == "url" {
            guard let url = payload["url"] as? String else {
                return nil
            }

            let icon = normalizeExportIcon(
                payload["icon"] as? String ?? "",
                warnings: &warnings,
                localIconPaths: &localIconPaths
            )
            var item: [String: Any] = [
                "type": "url",
                "id": id,
                "title": title,
                "url": url,
                "icon": icon,
                "addFrame": payload["addFrame"] as? Bool ?? true,
            ]

            if let customization = sanitizeIconCustomization(payload["iconCustomization"]) {
                item["iconCustomization"] = customization
            }

            if let restoreOrigin = sanitizeRestoreOrigin(payload["restoreOrigin"]) {
                item["restoreOrigin"] = restoreOrigin
            }

            return item
        }

        if type == "folder", let rawItems = payload["items"] as? [Any] {
            let icon = normalizeExportIcon(
                payload["icon"] as? String ?? "",
                warnings: &warnings,
                localIconPaths: &localIconPaths
            )
            let items = rawItems.compactMap { rawItem -> [String: Any]? in
                guard let item = sanitizeExportItem(
                    rawItem,
                    warnings: &warnings,
                    localIconPaths: &localIconPaths
                ), item["type"] as? String == "url" else {
                    return nil
                }
                return item
            }

            return [
                "type": "folder",
                "id": id,
                "title": title,
                "icon": icon,
                "items": items,
            ]
        }

        return nil
    }

    private func normalizeExportIcon(
        _ value: String,
        warnings: inout [String],
        localIconPaths: inout Set<String>
    ) -> String {
        let icon = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !icon.isEmpty, !icon.hasPrefix("blob:") else {
            return ""
        }

        if icon.hasPrefix("/user-icons/") || icon.hasPrefix("/icon-cache/") {
            localIconPaths.insert(icon)
            return icon
        }

        if icon.hasPrefix("http://") || icon.hasPrefix("https://") || icon.hasPrefix("data:image/") {
            do {
                let cachedPath = try cacheIcon(from: icon)
                localIconPaths.insert(cachedPath)
                return cachedPath
            } catch {
                warnings.append("Не удалось закешировать remote icon: \(icon)")
            }
        }

        return icon
    }

    private func readIconAssets(
        paths: Set<String>,
        warnings: inout [String]
    ) -> [String: Any] {
        var assets: [String: Any] = [:]

        for path in paths.sorted() {
            do {
                let directoryURL: URL
                let prefix: String
                if path.hasPrefix("/user-icons/") {
                    directoryURL = try resolveUserIconsDirectory()
                    prefix = "/user-icons/"
                } else if path.hasPrefix("/icon-cache/") {
                    directoryURL = try resolveIconCacheDirectory()
                    prefix = "/icon-cache/"
                } else {
                    continue
                }

                guard let fileURL = resolveRuntimeFileURL(
                    requestedPath: path,
                    urlPrefix: prefix,
                    directoryURL: directoryURL
                ) else {
                    warnings.append("Файл иконки не найден: \(path)")
                    continue
                }

                let data = try Data(contentsOf: fileURL)
                assets[path] = [
                    "mimeType": mimeType(for: fileURL.pathExtension),
                    "data": data.base64EncodedString(),
                ]
            } catch {
                warnings.append("Не удалось прочитать иконку: \(path)")
            }
        }

        return assets
    }

    private func sanitizeRestoreOrigin(_ value: Any?) -> [String: Any]? {
        guard let payload = value as? [String: Any],
              let spaceId = payload["spaceId"] as? String,
              let tileIndex = payload["tileIndex"] as? NSNumber else {
            return nil
        }

        return ["spaceId": spaceId, "tileIndex": tileIndex.intValue]
    }

    private func sanitizeIconCustomization(_ value: Any?) -> [String: Any]? {
        guard let payload = value as? [String: Any],
              let scale = payload["scale"] as? NSNumber,
              let hasBackground = payload["hasBackground"] as? Bool,
              let backgroundColor = payload["backgroundColor"] as? String else {
            return nil
        }

        let color = backgroundColor.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil
            ? backgroundColor
            : "#00FFF4"
        let volumePlacement = payload["volumePlacement"] as? String

        return [
            "scale": min(120, max(50, scale.doubleValue)),
            "hasBackground": hasBackground,
            "backgroundColor": color,
            "volumeAlpha": clampedNumber(payload["volumeAlpha"], min: 0, max: 100, fallback: 40),
            "volumePlacement": volumePlacement == "below" ? "below" : "above",
            "edgeAlpha": clampedNumber(payload["edgeAlpha"], min: 0, max: 100, fallback: 100),
            "edgeThickness": roundedNumber(payload["edgeThickness"], min: 0, max: 3, fallback: 2),
        ]
    }

    private func clampedNumber(_ value: Any?, min minimum: Double, max maximum: Double, fallback: Double) -> Double {
        guard let number = value as? NSNumber else {
            return fallback
        }
        return min(maximum, max(minimum, number.doubleValue))
    }

    private func roundedNumber(_ value: Any?, min minimum: Double, max maximum: Double, fallback: Double) -> Double {
        let number = clampedNumber(value, min: minimum, max: maximum, fallback: fallback)
        return (number * 10).rounded() / 10
    }

    private func parseIconSource(from body: Data, key: String) throws -> String {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: body)
        } catch {
            throw IconCacheError.invalidJSON
        }

        guard let payload = object as? [String: Any],
              let source = payload[key] as? String,
              !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw IconCacheError.invalidPayload
        }

        return source.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func cacheIcon(from source: String) throws -> String {
        let icon: (data: Data, extensionName: String)

        if source.hasPrefix("data:image/") {
            icon = try decodeDataIcon(source)
        } else {
            guard let url = URL(string: source),
                  let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else {
                throw IconCacheError.invalidPayload
            }

            icon = try downloadRemoteIcon(from: url)
        }

        let directoryURL = try resolveIconCacheDirectory()
        let fileName = "icon-\(UUID().uuidString.lowercased()).\(icon.extensionName)"
        let fileURL = directoryURL.appendingPathComponent(fileName)
        try icon.data.write(to: fileURL, options: .atomic)
        return "/icon-cache/\(fileName)"
    }

    private func decodeDataIcon(_ source: String) throws -> (data: Data, extensionName: String) {
        guard let commaIndex = source.firstIndex(of: ",") else {
            throw IconCacheError.invalidPayload
        }

        let metadata = String(source[..<commaIndex])
        guard metadata.lowercased().hasSuffix(";base64") else {
            throw IconCacheError.invalidPayload
        }

        let contentType = metadata
            .dropFirst("data:".count)
            .split(separator: ";", maxSplits: 1)
            .first
            .map(String.init)

        guard let extensionName = resolveIconExtension(contentTypeHeader: contentType),
              let data = Data(base64Encoded: String(source[source.index(after: commaIndex)...]), options: .ignoreUnknownCharacters),
              !data.isEmpty else {
            throw IconCacheError.unsupportedType
        }

        return (data, extensionName)
    }

    private func downloadRemoteIcon(from url: URL) throws -> (data: Data, extensionName: String) {
        let semaphore = DispatchSemaphore(value: 0)
        let resultBox = DownloadResultBox()

        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            defer { semaphore.signal() }

            if let error {
                resultBox.store(.failure(error))
                return
            }

            guard let data, let response else {
                resultBox.store(.failure(IconCacheError.downloadFailed))
                return
            }

            resultBox.store(.success((data, response)))
        }
        task.resume()
        semaphore.wait()

        guard let result = resultBox.load() else {
            throw IconCacheError.downloadFailed
        }

        let (data, response) = try result.get()
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode),
              !data.isEmpty else {
            throw IconCacheError.downloadFailed
        }

        guard let finalScheme = httpResponse.url?.scheme?.lowercased(),
              finalScheme == "http" || finalScheme == "https" else {
            throw IconCacheError.invalidPayload
        }

        guard let extensionName = resolveIconExtension(contentTypeHeader: httpResponse.value(forHTTPHeaderField: "Content-Type")) else {
            throw IconCacheError.unsupportedType
        }

        return (data, extensionName)
    }

    private func resolveIconExtension(
        fileNameHeader: String?,
        contentTypeHeader: String?
    ) -> String? {
        if let fileNameHeader,
           let decodedName = fileNameHeader.removingPercentEncoding {
            let fileExtension = URL(fileURLWithPath: decodedName).pathExtension.lowercased()
            if Self.allowedIconExtensions.contains(fileExtension) {
                return fileExtension
            }
        }

        guard let contentTypeHeader else {
            return nil
        }

        let contentType = contentTypeHeader
            .split(separator: ";", maxSplits: 1)
            .first?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        switch contentType {
        case "image/png":
            return "png"
        case "image/jpeg":
            return "jpg"
        case "image/webp":
            return "webp"
        case "image/svg+xml":
            return "svg"
        case "image/x-icon", "image/vnd.microsoft.icon":
            return "ico"
        default:
            return nil
        }
    }

    private func resolveIconExtension(contentTypeHeader: String?) -> String? {
        resolveIconExtension(fileNameHeader: nil, contentTypeHeader: contentTypeHeader)
    }

    private enum SettingsError: LocalizedError {
        case invalidJSON
        case invalidPayload

        var errorDescription: String? {
            switch self {
            case .invalidJSON:
                return "Invalid JSON body"
            case .invalidPayload:
                return "Invalid settings payload"
            }
        }
    }

    private func sanitizeSettings(from data: Data) throws -> AppSettings {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: data)
        } catch {
            throw SettingsError.invalidJSON
        }

        guard let payload = object as? [String: Any] else {
            throw SettingsError.invalidPayload
        }

        let rawWeatherLocation = (payload["weatherLocation"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedWeatherLocation: String
        if let rawWeatherLocation, !rawWeatherLocation.isEmpty {
            normalizedWeatherLocation = rawWeatherLocation.caseInsensitiveCompare("Russia, Moscow") == .orderedSame
                ? ""
                : rawWeatherLocation
        } else {
            normalizedWeatherLocation = AppSettings.default.weatherLocation
        }

        return AppSettings(
            appearanceTheme: sanitizeAppearanceTheme(payload["appearanceTheme"]),
            backgroundBlur: clampSetting(payload["backgroundBlur"]),
            backgroundDim: clampSetting(payload["backgroundDim"]),
            checkUpdatesOnOpen: sanitizeCheckUpdatesOnOpen(payload["checkUpdatesOnOpen"]),
            weatherLocation: normalizedWeatherLocation,
            background: sanitizeBackground(payload["background"]),
            syncMeta: sanitizeSyncMeta(payload["syncMeta"])
        )
    }

    private func sanitizeAppearanceTheme(_ value: Any?) -> String {
        guard let value = value as? String else {
            return AppSettings.default.appearanceTheme
        }

        switch value {
        case "light", "dark", "system":
            return value
        default:
            return AppSettings.default.appearanceTheme
        }
    }

    private func clampSetting(_ value: Any?) -> Int {
        let number: Double?
        if let value = value as? NSNumber {
            number = value.doubleValue
        } else {
            number = nil
        }

        guard let number, !number.isNaN else {
            return 0
        }

        return max(0, min(100, Int(number.rounded())))
    }

    private func sanitizeCheckUpdatesOnOpen(_ value: Any?) -> Bool {
        (value as? Bool) ?? AppSettings.default.checkUpdatesOnOpen
    }

    private func sanitizeBackground(_ value: Any?) -> AppSettings.Background {
        guard let payload = value as? [String: Any] else {
            return AppSettings.default.background
        }

        let type = (payload["type"] as? String) ?? "default"
        let backgroundValue = (payload["value"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if type == "default" {
            return AppSettings.Background(type: "default", value: nil, fileName: nil)
        }

        let supportedTypes = ["image-url", "video-url", "local-image", "local-video"]
        guard supportedTypes.contains(type), !backgroundValue.isEmpty else {
            return AppSettings.default.background
        }

        if type == "local-image" || type == "local-video" {
            let fileName = (payload["fileName"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return AppSettings.Background(
                type: type,
                value: backgroundValue,
                fileName: (fileName?.isEmpty == false) ? fileName : nil
            )
        }

        return AppSettings.Background(type: type, value: backgroundValue, fileName: nil)
    }

    private func sanitizeSyncMeta(_ value: Any?) -> AppSettings.SyncMeta {
        guard let payload = value as? [String: Any] else {
            return AppSettings.default.syncMeta
        }

        return AppSettings.SyncMeta(
            lastExportAt: sanitizeISODate(payload["lastExportAt"]),
            lastImportAt: sanitizeISODate(payload["lastImportAt"])
        )
    }

    private func sanitizeISODate(_ value: Any?) -> String? {
        guard let stringValue = value as? String else {
            return nil
        }

        let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let parsed = ISO8601DateFormatter().date(from: trimmed) ?? DateFormatter.launeyFallback.date(from: trimmed)
        guard let parsed else {
            return nil
        }

        return ISO8601DateFormatter().string(from: parsed)
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

private extension DateFormatter {
    static let launeyFallback: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX"
        return formatter
    }()

    static let launeyExportDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private extension ISO8601DateFormatter {
    static let launeyExport: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
