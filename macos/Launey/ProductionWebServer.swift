//
//  ProductionWebServer.swift
//  Launey
//

import Foundation
import Darwin
import Network

final class ProductionWebServer {
    private static let appStoreCountries = ["us", "ru", "gb", "tr", "de", "fr", "pl", "kz"]
    private static let minimumAppStoreRelevanceScore = 40
    private static let appStoreUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
    private static let siteIconsCacheTTL: TimeInterval = 30 * 60
    private static let maximumSiteHTMLBytes = 2 * 1024 * 1024
    private static let maximumSiteManifestBytes = 512 * 1024

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

    private struct AppStoreSearchPayload: Decodable {
        let results: [AppStoreSearchResult]?
    }

    private struct AppStoreSearchResult: Decodable {
        let trackName: String?
        let sellerName: String?
        let bundleId: String?
        let trackViewUrl: String?
    }

    private struct AppStoreResolvedIcon {
        let title: String
        let appURL: String
        let iconURL: String
        let country: String
        let matchedName: String
        let score: Int

        var json: [String: Any] {
            [
                "title": title,
                "appUrl": appURL,
                "iconUrl": iconURL,
                "country": country,
                "matchedName": matchedName,
                "score": score,
            ]
        }
    }

    private struct SiteIconCandidate {
        let id: String
        let type: String
        let url: String
        let previewURL: String
        let source: String
        let score: Int

        var json: [String: Any] {
            [
                "id": id,
                "type": type,
                "url": url,
                "previewUrl": previewURL,
                "source": source,
                "score": score,
            ]
        }
    }

    private struct SiteIconsCacheEntry {
        let expiresAt: Date
        let payload: [String: Any]
    }

    private struct SiteManifestPayload: Decodable {
        let icons: [SiteManifestIcon]?
    }

    private struct SiteManifestIcon: Decodable {
        let src: String?
        let sizes: String?
        let type: String?
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

    private enum AppStoreIconError: Error {
        case invalidSearchURL
        case invalidAppURL
        case networkFailed
        case invalidResponse
    }

    private enum SiteIconsError: Error {
        case invalidURL
        case unsafeURL
        case networkFailed
        case responseTooLarge
    }

    private final class SecureRedirectDelegate: NSObject, URLSessionTaskDelegate {
        private let validator: (URL) -> Bool

        init(validator: @escaping (URL) -> Bool) {
            self.validator = validator
        }

        func urlSession(
            _ session: URLSession,
            task: URLSessionTask,
            willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest,
            completionHandler: @escaping (URLRequest?) -> Void
        ) {
            guard let url = request.url, validator(url) else {
                completionHandler(nil)
                return
            }

            completionHandler(request)
        }
    }

    private struct RestoredIcon {
        let fileURL: URL
        let data: Data
    }

    private let port: UInt16
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "designby4roff.launey.production-server")
    private var siteIconsCache: [String: SiteIconsCacheEntry] = [:]

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
            if requestedPath == "/api/app-store-icon" {
                guard request.method == "GET" else {
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }

                return makeAppStoreIconResponse(requestPath: request.path)
            }

            if requestedPath == "/api/site-icons" {
                guard request.method == "GET" else {
                    return makeJSONResponse(
                        status: 405,
                        reason: "Method Not Allowed",
                        body: ["error": "Method Not Allowed"]
                    )
                }

                return makeSiteIconsResponse(requestPath: request.path)
            }

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

    private func makeAppStoreIconResponse(requestPath: String) -> Data {
        let query = queryParameter("query", from: requestPath)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let country = queryParameter("country", from: requestPath)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        let selectedCountry = country.flatMap { Self.appStoreCountries.contains($0) ? $0 : nil }

        guard query.count >= 2 else {
            return makeJSONObjectResponse(
                status: 200,
                reason: "OK",
                object: ["ok": false, "error": "Иконка не найдена"]
            )
        }

        do {
            let payload = try findAppStoreIcon(query: query, country: selectedCountry)
            return makeJSONObjectResponse(status: 200, reason: "OK", object: payload)
        } catch {
            print("[ProductionServer] Failed to resolve App Store icon: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": error.localizedDescription]
            )
        }
    }

    private func makeSiteIconsResponse(requestPath: String) -> Data {
        let rawURL = queryParameter("url", from: requestPath)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !rawURL.isEmpty else {
            return makeJSONObjectResponse(
                status: 200,
                reason: "OK",
                object: ["ok": false, "error": "Иконки не найдены"]
            )
        }

        do {
            let payload = try findSiteIcons(rawURL: rawURL)
            return makeJSONObjectResponse(status: 200, reason: "OK", object: payload)
        } catch SiteIconsError.invalidURL, SiteIconsError.unsafeURL {
            return makeJSONResponse(
                status: 400,
                reason: "Bad Request",
                body: ["error": "Invalid site URL"]
            )
        } catch {
            print("[ProductionServer] Failed to resolve site icons: \(error)")
            return makeJSONResponse(
                status: 500,
                reason: "Internal Server Error",
                body: ["error": error.localizedDescription]
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

    private func findSiteIcons(rawURL: String) throws -> [String: Any] {
        let pageURL = try normalizeSiteURL(rawURL)
        try validateExternalSiteURL(pageURL)

        let cacheKey = pageURL.absoluteString
        let now = Date()
        if let cached = siteIconsCache[cacheKey], cached.expiresAt > now {
            return cached.payload
        }

        let payload: [String: Any]
        do {
            let (data, response) = try fetchURL(
                pageURL,
                userAgent: Self.appStoreUserAgent,
                maxBytes: Self.maximumSiteHTMLBytes,
                validatesExternalSiteURL: true
            )

            guard let html = String(data: data, encoding: .utf8),
                  let resolvedPageURL = response.url else {
                payload = buildFallbackSiteIconsPayload(pageURL: pageURL)
                siteIconsCache[cacheKey] = SiteIconsCacheEntry(
                    expiresAt: now.addingTimeInterval(Self.siteIconsCacheTTL),
                    payload: payload
                )
                return payload
            }

            var candidates: [String: SiteIconCandidate] = [:]
            collectHTMLLinkCandidates(html: html, pageURL: resolvedPageURL, candidates: &candidates)
            collectMetaCandidates(html: html, pageURL: resolvedPageURL, candidates: &candidates)
            collectManifestCandidates(html: html, pageURL: resolvedPageURL, candidates: &candidates)
            collectFallbackCandidates(pageURL: resolvedPageURL, candidates: &candidates)

            let sorted = sortedSiteCandidates(candidates)
            if sorted.isEmpty {
                payload = buildFallbackSiteIconsPayload(pageURL: resolvedPageURL)
            } else {
                payload = [
                    "ok": true,
                    "domain": resolvedPageURL.host ?? pageURL.host ?? "",
                    "candidates": sorted.map(\.json),
                ]
            }
        } catch SiteIconsError.unsafeURL, SiteIconsError.invalidURL {
            throw SiteIconsError.unsafeURL
        } catch {
            payload = buildFallbackSiteIconsPayload(pageURL: pageURL)
        }

        siteIconsCache[cacheKey] = SiteIconsCacheEntry(
            expiresAt: now.addingTimeInterval(Self.siteIconsCacheTTL),
            payload: payload
        )
        return payload
    }

    private func buildFallbackSiteIconsPayload(pageURL: URL) -> [String: Any] {
        var candidates: [String: SiteIconCandidate] = [:]
        collectFallbackCandidates(pageURL: pageURL, candidates: &candidates)
        let sorted = sortedSiteCandidates(candidates)

        guard !sorted.isEmpty else {
            return ["ok": false, "error": "Иконки не найдены"]
        }

        return [
            "ok": true,
            "domain": pageURL.host ?? "",
            "candidates": sorted.map(\.json),
        ]
    }

    private func collectHTMLLinkCandidates(
        html: String,
        pageURL: URL,
        candidates: inout [String: SiteIconCandidate]
    ) {
        for tag in captureMatches(pattern: #"<link\b[^>]*>"#, in: html, captureGroup: 0) {
            let rel = readHTMLAttribute(tag: tag, attribute: "rel")?
                .lowercased()
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard let href = readHTMLAttribute(tag: tag, attribute: "href"),
                  let absoluteURL = absoluteURLString(href, baseURL: pageURL) else {
                continue
            }

            if rel.contains("apple-touch-icon-precomposed") || rel.contains("apple-touch-icon") {
                upsertSiteCandidate(
                    &candidates,
                    type: "apple-touch-icon",
                    url: absoluteURL,
                    previewURL: absoluteURL,
                    source: "Apple Touch Icon",
                    score: 96 + scoreFromDeclaredSizes(readHTMLAttribute(tag: tag, attribute: "sizes"))
                )
                continue
            }

            if rel.contains("shortcut icon") || rel == "icon" || rel.contains(" icon") || rel.contains("mask-icon") {
                upsertSiteCandidate(
                    &candidates,
                    type: "favicon",
                    url: absoluteURL,
                    previewURL: absoluteURL,
                    source: rel.contains("mask-icon") ? "Mask Icon" : "Favicon",
                    score: 38 + scoreFromDeclaredSizes(readHTMLAttribute(tag: tag, attribute: "sizes"))
                )
            }
        }
    }

    private func collectMetaCandidates(
        html: String,
        pageURL: URL,
        candidates: inout [String: SiteIconCandidate]
    ) {
        for tag in captureMatches(pattern: #"<meta\b[^>]*>"#, in: html, captureGroup: 0) {
            let property = readHTMLAttribute(tag: tag, attribute: "property")?.lowercased()
            let name = readHTMLAttribute(tag: tag, attribute: "name")?.lowercased()
            guard (property == "og:image" || name == "twitter:image"),
                  let content = readHTMLAttribute(tag: tag, attribute: "content"),
                  let absoluteURL = absoluteURLString(content, baseURL: pageURL) else {
                continue
            }

            upsertSiteCandidate(
                &candidates,
                type: "og-image",
                url: absoluteURL,
                previewURL: absoluteURL,
                source: property == "og:image" ? "Open Graph" : "Twitter",
                score: 64 + scoreFromURLSize(absoluteURL)
            )
        }
    }

    private func collectManifestCandidates(
        html: String,
        pageURL: URL,
        candidates: inout [String: SiteIconCandidate]
    ) {
        guard let manifestURL = findManifestURL(html: html, pageURL: pageURL) else {
            return
        }

        do {
            let (data, _) = try fetchURL(
                manifestURL,
                userAgent: Self.appStoreUserAgent,
                maxBytes: Self.maximumSiteManifestBytes,
                validatesExternalSiteURL: true
            )
            let payload = try JSONDecoder().decode(SiteManifestPayload.self, from: data)

            for icon in payload.icons ?? [] {
                guard let src = icon.src,
                      let absoluteURL = absoluteURLString(src, baseURL: manifestURL) else {
                    continue
                }

                let mimeBonus: Int
                if icon.type?.contains("svg") == true {
                    mimeBonus = 4
                } else if icon.type?.contains("png") == true {
                    mimeBonus = 8
                } else {
                    mimeBonus = 0
                }

                upsertSiteCandidate(
                    &candidates,
                    type: "manifest",
                    url: absoluteURL,
                    previewURL: absoluteURL,
                    source: "Manifest Icon",
                    score: 84 + scoreFromDeclaredSizes(icon.sizes) + mimeBonus + scoreFromURLSize(absoluteURL)
                )
            }
        } catch {
            return
        }
    }

    private func findManifestURL(html: String, pageURL: URL) -> URL? {
        for tag in captureMatches(pattern: #"<link\b[^>]*>"#, in: html, captureGroup: 0) {
            let rel = readHTMLAttribute(tag: tag, attribute: "rel")?.lowercased() ?? ""
            guard rel.contains("manifest"),
                  let href = readHTMLAttribute(tag: tag, attribute: "href"),
                  let absoluteURL = absoluteURL(href, baseURL: pageURL) else {
                continue
            }

            return absoluteURL
        }

        return nil
    }

    private func collectFallbackCandidates(pageURL: URL, candidates: inout [String: SiteIconCandidate]) {
        guard let host = pageURL.host,
              let scheme = pageURL.scheme,
              let originURL = URL(string: "\(scheme)://\(host)") else {
            return
        }

        let faviconURL = originURL.appendingPathComponent("favicon.ico").absoluteString
        let googleURL = "https://www.google.com/s2/favicons?domain=\(percentEncodeQueryValue(host))&sz=256"

        upsertSiteCandidate(
            &candidates,
            type: "favicon",
            url: faviconURL,
            previewURL: faviconURL,
            source: "Favicon fallback",
            score: 25
        )

        upsertSiteCandidate(
            &candidates,
            type: "google-favicon",
            url: googleURL,
            previewURL: googleURL,
            source: "Google Favicon",
            score: 18
        )
    }

    private func sortedSiteCandidates(_ candidates: [String: SiteIconCandidate]) -> [SiteIconCandidate] {
        candidates.values.sorted { lhs, rhs in
            if lhs.score == rhs.score {
                return lhs.previewURL < rhs.previewURL
            }
            return lhs.score > rhs.score
        }
    }

    private func upsertSiteCandidate(
        _ candidates: inout [String: SiteIconCandidate],
        type: String,
        url: String,
        previewURL: String,
        source: String,
        score: Int
    ) {
        if let current = candidates[previewURL], current.score >= score {
            return
        }

        candidates[previewURL] = SiteIconCandidate(
            id: "\(type)-\(javascriptStyleHash(previewURL))",
            type: type,
            url: url,
            previewURL: previewURL,
            source: source,
            score: score
        )
    }

    private func findAppStoreIcon(query: String, country: String?) throws -> [String: Any] {
        let countries = country.map { [$0] } ?? Self.appStoreCountries

        for countryCode in countries {
            let payload = try findAppStoreIconsByCountry(query: query, country: countryCode)
            if (payload["ok"] as? Bool) == true {
                return payload
            }
        }

        return ["ok": false, "error": "Иконка не найдена в App Store"]
    }

    private func findAppStoreIconsByCountry(query: String, country: String) throws -> [String: Any] {
        guard let searchURL = makeAppStoreSearchURL(query: query, country: country) else {
            throw AppStoreIconError.invalidSearchURL
        }

        let (data, _) = try fetchURL(searchURL, userAgent: nil)
        let searchPayload = try JSONDecoder().decode(AppStoreSearchPayload.self, from: data)

        let relevantCandidates = (searchPayload.results ?? [])
            .map { app in (app: app, score: appStoreRelevanceScore(query: query, app: app)) }
            .filter { $0.score >= Self.minimumAppStoreRelevanceScore && $0.app.trackViewUrl?.isEmpty == false }
            .sorted { $0.score > $1.score }
            .prefix(15)

        guard !relevantCandidates.isEmpty else {
            return ["ok": false, "error": "Иконка не найдена в App Store"]
        }

        var results: [AppStoreResolvedIcon] = []
        for candidate in relevantCandidates {
            guard let appURL = candidate.app.trackViewUrl,
                  let iconURL = try parseAppIconFromAppPage(appURL) else {
                continue
            }

            results.append(
                AppStoreResolvedIcon(
                    title: candidate.app.trackName ?? query,
                    appURL: appURL,
                    iconURL: iconURL,
                    country: country,
                    matchedName: candidate.app.trackName ?? "",
                    score: candidate.score
                )
            )
        }

        guard let first = results.first else {
            return ["ok": false, "error": "Иконка не найдена в App Store"]
        }

        return [
            "ok": true,
            "title": first.title,
            "appUrl": first.appURL,
            "iconUrl": first.iconURL,
            "country": first.country,
            "matchedName": first.matchedName,
            "score": first.score,
            "results": results.map(\.json),
        ]
    }

    private func makeAppStoreSearchURL(query: String, country: String) -> URL? {
        var components = URLComponents(string: "https://itunes.apple.com/search")
        components?.queryItems = [
            URLQueryItem(name: "term", value: query),
            URLQueryItem(name: "country", value: country),
            URLQueryItem(name: "media", value: "software"),
            URLQueryItem(name: "entity", value: "software"),
            URLQueryItem(name: "limit", value: "15"),
        ]
        return components?.url
    }

    private func appStoreRelevanceScore(query: String, app: AppStoreSearchResult) -> Int {
        let normalizedQuery = normalizeForMatch(query)
        let track = normalizeForMatch(app.trackName)
        let seller = normalizeForMatch(app.sellerName)
        let bundle = normalizeForMatch(app.bundleId)

        guard !normalizedQuery.isEmpty else {
            return 0
        }

        var score = 0
        score += fieldScore(query: normalizedQuery, value: track, exact: 120, startsWith: 95, includes: 65)
        score += fieldScore(query: normalizedQuery, value: seller, exact: 40, startsWith: 28, includes: 14)
        score += fieldScore(query: normalizedQuery, value: bundle, exact: 42, startsWith: 30, includes: 18)

        if track.contains("studio") && normalizedQuery == "youtube" {
            score -= 55
        }

        if track.contains("music") && !normalizedQuery.contains("music") {
            score -= 18
        }

        return max(score, 0)
    }

    private func fieldScore(
        query: String,
        value: String,
        exact: Int,
        startsWith: Int,
        includes: Int
    ) -> Int {
        if value.isEmpty {
            return 0
        }

        if value == query {
            return exact
        }

        if value.hasPrefix(query) {
            return startsWith
        }

        if value.contains(query) {
            return includes
        }

        return 0
    }

    private func normalizeForMatch(_ value: String?) -> String {
        guard let value else {
            return ""
        }

        return value
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "ё", with: "е")
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    private func parseAppIconFromAppPage(_ appURL: String) throws -> String? {
        guard let url = URL(string: appURL) else {
            throw AppStoreIconError.invalidAppURL
        }

        do {
            let (data, _) = try fetchURL(url, userAgent: Self.appStoreUserAgent)
            guard let html = String(data: data, encoding: .utf8) else {
                return nil
            }

            let candidates = collectMzstaticIconCandidates(from: html)
            return pickBestIconCandidate(candidates)
        } catch {
            return nil
        }
    }

    private func collectMzstaticIconCandidates(from html: String) -> [String] {
        var candidates = Set<String>()

        for value in captureMatches(
            pattern: #"<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>"#,
            in: html
        ) {
            candidates.insert(value)
        }

        for rawJSON in captureMatches(
            pattern: #"<script[^>]+type=["']application/ld\+json["'][^>]*>([\s\S]*?)</script>"#,
            in: html
        ) {
            collectJSONLDImageCandidates(from: rawJSON, into: &candidates)
        }

        for value in captureMatches(
            pattern: #"https?://[^"' )]+mzstatic[^"' )]+"#,
            in: html,
            captureGroup: 0
        ) {
            candidates.insert(value)
        }

        return candidates
            .filter { $0.contains("mzstatic.com") }
            .map { $0.replacingOccurrences(of: "\\/", with: "/") }
    }

    private func collectJSONLDImageCandidates(from rawJSON: String, into candidates: inout Set<String>) {
        guard let data = rawJSON.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) else {
            return
        }

        collectJSONLDImageCandidates(from: parsed, into: &candidates)
    }

    private func collectJSONLDImageCandidates(from value: Any, into candidates: inout Set<String>) {
        if let payload = value as? [String: Any] {
            if let image = payload["image"] as? String {
                candidates.insert(image)
            } else if let images = payload["image"] as? [Any] {
                for image in images {
                    collectJSONLDImageCandidates(from: image, into: &candidates)
                }
            } else if let imageObject = payload["image"] {
                collectJSONLDImageCandidates(from: imageObject, into: &candidates)
            }

            for nestedValue in payload.values {
                if nestedValue is [String: Any] || nestedValue is [Any] {
                    collectJSONLDImageCandidates(from: nestedValue, into: &candidates)
                }
            }
            return
        }

        if let values = value as? [Any] {
            for nestedValue in values {
                collectJSONLDImageCandidates(from: nestedValue, into: &candidates)
            }
        }
    }

    private func pickBestIconCandidate(_ candidates: [String]) -> String? {
        guard !candidates.isEmpty else {
            return nil
        }

        let sorted = candidates
            .map { (url: $0, score: appStoreIconScore($0)) }
            .sorted { $0.score > $1.score }

        return normalizeMzstaticIconSize(sorted.first?.url)
    }

    private func appStoreIconScore(_ url: String) -> Double {
        var score = 0.0
        let lower = url.lowercased()

        if lower.contains("400x400") {
            score += 10
        }

        if lower.contains(".webp") {
            score += 4
        } else if lower.contains(".png") {
            score += 3
        }

        if lower.contains("/image/thumb/") {
            score += 2
        }

        if let size = firstCapture(pattern: #"(\d{2,4})x(\d{2,4})bb"#, in: lower),
           let width = Double(size) {
            score += width / 100
        }

        return score
    }

    private func normalizeMzstaticIconSize(_ url: String?) -> String? {
        guard let url else {
            return nil
        }

        return url.replacingOccurrences(
            of: #"/(?:100|120|180|512)x(?:100|120|180|512)bb(?:-\d+)?(?=\.)"#,
            with: "/400x400bb-75",
            options: .regularExpression
        )
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
                print("[ProductionServer] Using bundled Resources/web at \(bundledWebURL.path)")
                return bundledWebURL
            }
        }

        throw NSError(
            domain: "Launey.ProductionWebServer",
            code: 1,
            userInfo: [
                NSLocalizedDescriptionKey: "Missing production web root at Resources/web."
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

    private func queryParameter(_ name: String, from rawPath: String) -> String? {
        let absolutePath = rawPath.hasPrefix("/")
            ? "http://localhost\(rawPath)"
            : rawPath
        guard let components = URLComponents(string: absolutePath) else {
            return nil
        }

        return components.queryItems?.first { $0.name == name }?.value
    }

    private func normalizeSiteURL(_ rawURL: String) throws -> URL {
        let value = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            throw SiteIconsError.invalidURL
        }

        let prefixed = value.range(of: #"^https?://"#, options: [.regularExpression, .caseInsensitive]) == nil
            ? "https://\(value)"
            : value

        guard let url = URL(string: prefixed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host?.isEmpty == false else {
            throw SiteIconsError.invalidURL
        }

        return url
    }

    private func validateExternalSiteURL(_ url: URL) throws {
        guard let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines),
              !host.isEmpty else {
            throw SiteIconsError.invalidURL
        }

        guard !isUnsafeHost(host) else {
            throw SiteIconsError.unsafeURL
        }
    }

    private func isUnsafeHost(_ host: String) -> Bool {
        let normalizedHost = host
            .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
            .lowercased()

        if normalizedHost == "localhost" || normalizedHost.hasSuffix(".localhost") {
            return true
        }

        if isUnsafeIPv4Address(normalizedHost) || isUnsafeIPv6Address(normalizedHost) {
            return true
        }

        return resolvedAddresses(for: normalizedHost).contains { address in
            isUnsafeIPv4Address(address) || isUnsafeIPv6Address(address)
        }
    }

    private func resolvedAddresses(for host: String) -> [String] {
        var hints = addrinfo(
            ai_flags: AI_ADDRCONFIG,
            ai_family: AF_UNSPEC,
            ai_socktype: SOCK_STREAM,
            ai_protocol: IPPROTO_TCP,
            ai_addrlen: 0,
            ai_canonname: nil,
            ai_addr: nil,
            ai_next: nil
        )
        var result: UnsafeMutablePointer<addrinfo>?

        guard getaddrinfo(host, nil, &hints, &result) == 0, let result else {
            return []
        }
        defer { freeaddrinfo(result) }

        var addresses: [String] = []
        var pointer: UnsafeMutablePointer<addrinfo>? = result
        while let current = pointer {
            let family = current.pointee.ai_family
            if family == AF_INET {
                var addr = current.pointee.ai_addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }
                var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                if inet_ntop(AF_INET, &addr, &buffer, socklen_t(INET_ADDRSTRLEN)) != nil {
                    addresses.append(String(cString: buffer))
                }
            } else if family == AF_INET6 {
                var addr = current.pointee.ai_addr.withMemoryRebound(to: sockaddr_in6.self, capacity: 1) { $0.pointee.sin6_addr }
                var buffer = [CChar](repeating: 0, count: Int(INET6_ADDRSTRLEN))
                if inet_ntop(AF_INET6, &addr, &buffer, socklen_t(INET6_ADDRSTRLEN)) != nil {
                    addresses.append(String(cString: buffer))
                }
            }
            pointer = current.pointee.ai_next
        }

        return addresses
    }

    private func isUnsafeIPv4Address(_ value: String) -> Bool {
        var address = in_addr()
        guard inet_pton(AF_INET, value, &address) == 1 else {
            return false
        }

        let octets = withUnsafeBytes(of: address) { Array($0) }
        guard octets.count == 4 else {
            return true
        }

        let first = octets[0]
        let second = octets[1]

        return first == 0 ||
            first == 10 ||
            first == 127 ||
            (first == 169 && second == 254) ||
            (first == 172 && (16...31).contains(second)) ||
            (first == 192 && second == 168)
    }

    private func isUnsafeIPv6Address(_ value: String) -> Bool {
        var address = in6_addr()
        guard inet_pton(AF_INET6, value, &address) == 1 else {
            return false
        }

        let bytes = withUnsafeBytes(of: address) { Array($0) }
        guard bytes.count == 16 else {
            return true
        }

        let isLoopback = bytes.prefix(15).allSatisfy { $0 == 0 } && bytes[15] == 1
        let isUnspecified = bytes.allSatisfy { $0 == 0 }
        let isUniqueLocal = (bytes[0] & 0xfe) == 0xfc
        let isLinkLocal = bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80
        let isIPv4Mapped = bytes.prefix(10).allSatisfy { $0 == 0 } && bytes[10] == 0xff && bytes[11] == 0xff

        if isIPv4Mapped {
            let mappedIPv4 = "\(bytes[12]).\(bytes[13]).\(bytes[14]).\(bytes[15])"
            return isUnsafeIPv4Address(mappedIPv4)
        }

        return isLoopback || isUnspecified || isUniqueLocal || isLinkLocal
    }

    private func fetchURL(
        _ url: URL,
        userAgent: String?,
        maxBytes: Int? = nil,
        validatesExternalSiteURL: Bool = false
    ) throws -> (Data, HTTPURLResponse) {
        if validatesExternalSiteURL {
            try validateExternalSiteURL(url)
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        if let userAgent {
            request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        }

        let semaphore = DispatchSemaphore(value: 0)
        let resultBox = DownloadResultBox()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 12
        let delegate = validatesExternalSiteURL
            ? SecureRedirectDelegate { [weak self] url in
                guard let self else {
                    return false
                }
                return (try? self.validateExternalSiteURL(url)) != nil
            }
            : nil
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)

        let task = session.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }

            if let error {
                resultBox.store(.failure(error))
                return
            }

            guard let data, let response else {
                resultBox.store(.failure(AppStoreIconError.networkFailed))
                return
            }

            resultBox.store(.success((data, response)))
        }
        task.resume()
        semaphore.wait()
        session.invalidateAndCancel()

        guard let result = resultBox.load() else {
            throw AppStoreIconError.networkFailed
        }

        let (data, response) = try result.get()
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppStoreIconError.invalidResponse
        }

        if validatesExternalSiteURL, let finalURL = httpResponse.url {
            try validateExternalSiteURL(finalURL)
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw AppStoreIconError.networkFailed
        }

        if let maxBytes, data.count > maxBytes {
            throw SiteIconsError.responseTooLarge
        }

        return (data, httpResponse)
    }

    private func captureMatches(
        pattern: String,
        in text: String,
        captureGroup: Int = 1
    ) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return []
        }

        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            guard match.numberOfRanges > captureGroup,
                  let matchRange = Range(match.range(at: captureGroup), in: text) else {
                return nil
            }

            return String(text[matchRange])
        }
    }

    private func firstCapture(pattern: String, in text: String, captureGroup: Int = 1) -> String? {
        captureMatches(pattern: pattern, in: text, captureGroup: captureGroup).first
    }

    private func readHTMLAttribute(tag: String, attribute: String) -> String? {
        firstCapture(
            pattern: #"\#(attribute)\s*=\s*["']([^"']+)["']"#,
            in: tag,
            captureGroup: 1
        )?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func absoluteURLString(_ value: String, baseURL: URL) -> String? {
        absoluteURL(value, baseURL: baseURL)?.absoluteString
    }

    private func absoluteURL(_ value: String, baseURL: URL) -> URL? {
        guard let url = URL(string: value, relativeTo: baseURL)?.absoluteURL,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }

        return url
    }

    private func scoreFromDeclaredSizes(_ sizesValue: String?) -> Int {
        guard let sizesValue, !sizesValue.isEmpty else {
            return 0
        }

        var score = 0
        for token in sizesValue.split(whereSeparator: { $0.isWhitespace }) {
            guard let widthString = firstCapture(pattern: #"(\d{2,4})x(\d{2,4})"#, in: String(token)),
                  let heightString = firstCapture(pattern: #"(\d{2,4})x(\d{2,4})"#, in: String(token), captureGroup: 2),
                  let width = Double(widthString),
                  let height = Double(heightString) else {
                continue
            }

            let minSide = min(width, height)
            let ratio = max(width, height) / max(1, minSide)

            if minSide >= 512 {
                score += 16
            } else if minSide >= 192 {
                score += 12
            } else if minSide >= 180 {
                score += 9
            } else if minSide >= 96 {
                score += 4
            }

            if ratio <= 1.2 {
                score += 4
            }
        }

        return score
    }

    private func scoreFromURLSize(_ url: String) -> Int {
        let lower = url.lowercased()
        guard let widthString = firstCapture(pattern: #"(\d{2,4})[x_](\d{2,4})"#, in: lower),
              let heightString = firstCapture(pattern: #"(\d{2,4})[x_](\d{2,4})"#, in: lower, captureGroup: 2),
              let width = Double(widthString),
              let height = Double(heightString) else {
            return lower.hasSuffix(".svg") ? 6 : 0
        }

        let minSide = min(width, height)
        let ratio = max(width, height) / max(1, minSide)
        var score = 0

        if minSide >= 512 {
            score += 16
        } else if minSide >= 192 {
            score += 11
        } else if minSide >= 180 {
            score += 8
        } else if minSide >= 96 {
            score += 3
        }

        if ratio <= 1.2 {
            score += 4
        }

        return score
    }

    private func javascriptStyleHash(_ value: String) -> String {
        var hash: Int32 = 0
        for scalar in value.unicodeScalars {
            hash = Int32(truncatingIfNeeded: (Int(hash) << 5) - Int(hash) + Int(scalar.value))
        }

        return String(abs(Int(hash)), radix: 36)
    }

    private func percentEncodeQueryValue(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
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
