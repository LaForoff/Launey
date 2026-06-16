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

            if isComplete || data?.isEmpty != false {
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
}
