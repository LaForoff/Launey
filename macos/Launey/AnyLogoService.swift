import Foundation
import CryptoKit
import ImageIO
import UniformTypeIdentifiers

// All mutable provider state is protected independently from the HTTP server queue.
final class AnyLogoService {
    struct Result { let status: Int; let body: [String: Any] }
    private struct Entry: Codable { var expires: Date; var status: Int; var payload: Data }
    private struct Store: Codable { var entries: [String: Entry] = [:]; var images: [String: String] = [:]; var cooldown: Date? = nil; var cooldowns: [String: Date]? = nil }
    typealias Transport = (URL, Int) -> (HTTPURLResponse, Data)?
    private let lock = NSCondition()
    private let slots = DispatchSemaphore(value: 3)
    private var pending = Set<String>()
    private var timestamps: [String: [Date]] = [:]
    private var cooldowns: [String: Date] = [:]
    private var store: Store
    private let directory: URL
    private let transport: Transport?
    private var storeURL: URL { directory.appendingPathComponent("anylogo-cache.json") }

    init(directory: URL, transport: Transport? = nil) {
        self.directory = directory
        self.transport = transport
        self.store = (try? Data(contentsOf: directory.appendingPathComponent("anylogo-cache.json"))).flatMap { try? JSONDecoder().decode(Store.self, from: $0) } ?? Store()
        self.cooldowns = store.cooldowns ?? [:]
        if let legacy = store.cooldown { self.cooldowns["anylogo"] = max(self.cooldowns["anylogo"] ?? .distantPast, legacy) }
        store.cooldown = nil
        store.images = store.images.filter { Self.validImageName($0.value) }
        trimImages()
    }
    private static func validImageName(_ name: String) -> Bool {
        name.range(of: #"^(anylogo|pubrio|debounce)-[0-9a-f]{64}\.(png|jpg|webp|svg)$"#, options: .regularExpression) != nil
    }
    private func trimImages() {
        if store.images.count > 500 {
            for key in store.images.keys.sorted().prefix(store.images.count - 500) { store.images.removeValue(forKey: key) }
        }
    }

    private func persist() {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(store) { try? data.write(to: storeURL, options: .atomic) }
    }
    static func validDomain(_ domain: String) -> Bool {
        guard domain.utf8.count <= 253, domain == domain.lowercased(), !domain.hasSuffix("."), domain.contains(".") else { return false }
        let parts = domain.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2, let last = parts.last, last.count >= 2,
              (last.allSatisfy({ $0.isASCII && $0.isLetter }) || last.hasPrefix("xn--")),
              !["localhost", "local", "internal", "test", "invalid", "example", "onion"].contains(String(last)) else { return false }
        return parts.allSatisfy { label in
            !label.isEmpty && label.count <= 63 && label.first != "-" && label.last != "-" &&
            label.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
        }
    }
    func request(path: String, value: String, variant: String?, provider: String? = nil) -> Result {
        let search = path == "/api/brand-search"
        guard value.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else {
            return Result(status: 400, body: ["ok": false, "error": "Invalid request"])
        }
        let trimmed = search
            ? value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").lowercased()
            : value.trimmingCharacters(in: .whitespacesAndNewlines)
        let image = path == "/api/brand-image"
        let source = image ? (provider ?? "anylogo") : "anylogo"
        guard ["anylogo", "pubrio", "debounce"].contains(source),
              search ? (trimmed.count >= 2 && trimmed.count <= 80) : Self.validDomain(trimmed),
              !image || (["icon", "wordmark"].contains(variant ?? "") && (source == "anylogo" || variant == "icon")) else {
            return Result(status: 400, body: ["ok": false, "error": "Invalid request"])
        }
        // Keep historical AnyLogo keys so existing downloads remain usable after upgrade.
        let legacyKey = path + ":" + trimmed.lowercased() + ":" + (variant ?? "")
        let key = image && source != "anylogo" ? source + ":" + legacyKey : legacyKey
        lock.lock()
        while pending.contains(key) { lock.wait() }
        if image, let name = store.images[key], Self.validImageName(name), name.hasPrefix(source + "-"), FileManager.default.fileExists(atPath: directory.appendingPathComponent("icon-cache").appendingPathComponent(name).path) {
            if source == "pubrio", name == "pubrio-60dd26ecb0a70ae7cd7737c82d53cb6b6f8bef8b97e1ce0ad3b34b22e5b20966.svg" {
                lock.unlock(); return Result(status: 404, body: ["ok": false, "error": "Brand image not found"])
            }
            lock.unlock(); return Result(status: 200, body: ["ok": true, "localIcon": "/icon-cache/" + name])
        }
        if let entry = store.entries[key], entry.expires > Date(), let body = (try? JSONSerialization.jsonObject(with: entry.payload)) as? [String: Any] {
            lock.unlock(); return Result(status: entry.status, body: body)
        }
        let now = Date()
        if let until = cooldowns[source], until > now {
            let seconds = max(1, Int(ceil(until.timeIntervalSince(now))))
            lock.unlock(); return Result(status: 429, body: ["ok": false, "error": "Provider cooldown", "retryAfterSeconds": seconds])
        }
        pending.insert(key)
        lock.unlock()
        slots.wait()
        lock.lock()
        let start = Date()
        let limits: [(String, Int)] = image ? [(source + ":image", source == "anylogo" ? 40 : 30), ("global:image", 60)] : [("anylogo:metadata", 15)]
        var budgetWait = 0
        for (category, limit) in limits {
            timestamps[category] = (timestamps[category] ?? []).filter { start.timeIntervalSince($0) < 60 }
            if timestamps[category, default: []].count >= limit, let first = timestamps[category]?.first {
                budgetWait = max(budgetWait, max(1, Int(ceil(60 - start.timeIntervalSince(first)))))
            }
        }
        let remaining = (cooldowns[source] ?? .distantPast).timeIntervalSince(start)
        let canFetch = remaining <= 0 && budgetWait == 0
        if canFetch { for (category, _) in limits { timestamps[category, default: []].append(start) } }
        lock.unlock()
        let result: Result
        if remaining > 0 {
            result = Result(status: 429, body: ["ok": false, "error": "Provider cooldown", "retryAfterSeconds": max(1, Int(ceil(remaining)))])
        } else if budgetWait > 0 {
            result = Result(status: 429, body: ["ok": false, "error": "Request budget exhausted", "retryAfterSeconds": budgetWait])
        } else {
            result = fetch(search: search, image: image, value: trimmed, variant: variant, provider: source)
        }
        // Record provider cooldown before releasing the upstream slot so queued work sees it.
        lock.lock()
        if canFetch, result.status == 429, let seconds = result.body["retryAfterSeconds"] as? Int {
            cooldowns[source] = max(cooldowns[source] ?? .distantPast, Date().addingTimeInterval(TimeInterval(seconds)))
            store.cooldowns = cooldowns
        }
        slots.signal()
        if image, let local = result.body["localIcon"] as? String { store.images[key] = String(local.dropFirst("/icon-cache/".count)); trimImages() }
        if result.status != 429 && (!image || result.status != 200) {
            let items = (result.body[search ? "suggestions" : "variants"] as? [Any]) ?? []
            let ttl: TimeInterval = result.status == 404 && image ? 3600 : result.status != 200 ? 30 : (search ? (items.isEmpty ? 900 : 86400) : (items.isEmpty ? 3600 : 604800))
            if let payload = try? JSONSerialization.data(withJSONObject: result.body) { store.entries[key] = Entry(expires: Date().addingTimeInterval(ttl), status: result.status, payload: payload) }
            if store.entries.count > 200 {
                for key in store.entries.sorted(by: { $0.value.expires < $1.value.expires }).prefix(store.entries.count - 200).map(\.key) { store.entries.removeValue(forKey: key) }
            }
        }
        persist(); pending.remove(key); lock.broadcast(); lock.unlock()
        return result
    }
    private func fetch(search: Bool, image: Bool, value: String, variant: String?, provider: String) -> Result {
        var components = URLComponents()
        components.scheme = "https"
        components.host = image ? ["anylogo": "img.anylogo.dev", "pubrio": "logo.pubrio.com", "debounce": "logo.debounce.com"][provider] : "api.anylogo.dev"
        components.path = search ? "/search" : (image ? "/\(value)" : "/kit/\(value)")
        components.queryItems = search ? [URLQueryItem(name: "q", value: value)] : (image && provider == "anylogo" ? [URLQueryItem(name: "variant", value: variant), URLQueryItem(name: "fallback", value: "404")] : nil)
        guard let url = components.url else { return error("Invalid URL") }
        let output: (HTTPURLResponse, Data)?
        if let transport {
            output = transport(url, image ? 5 * 1024 * 1024 : 512 * 1024)
        } else {
            let receiver = Receiver(host: components.host!, limit: image ? 5 * 1024 * 1024 : 512 * 1024)
            let config = URLSessionConfiguration.ephemeral; config.timeoutIntervalForRequest = 8; config.timeoutIntervalForResource = 8
            let session = URLSession(configuration: config, delegate: receiver, delegateQueue: nil)
            let task = session.dataTask(with: url); task.resume()
            let completed = receiver.done.wait(timeout: .now() + 9) == .success
            if !completed { task.cancel() }
            output = completed ? receiver.snapshot() : nil
            session.invalidateAndCancel()
        }
        guard let (response, data) = output, data.count <= (image ? 5 * 1024 * 1024 : 512 * 1024) else { return error("Provider request failed") }
        if response.statusCode == 404 {
            if image { return Result(status: 404, body: ["ok": false, "error": "Brand image not found"]) }
            return Result(status: 200, body: ["ok": true, search ? "suggestions" : "variants": []])
        }
        if response.statusCode == 429 || (response.statusCode == 503 && response.value(forHTTPHeaderField: "Retry-After") != nil) {
            let raw = response.value(forHTTPHeaderField: "Retry-After") ?? "60"
            let seconds: Int
            if let value = Int(raw) { seconds = min(86400, max(1, value)) }
            else { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(secondsFromGMT: 0); f.dateFormat = "EEE',' dd MMM yyyy HH':'mm':'ss z"; seconds = min(86400, max(1, Int(ceil((f.date(from: raw) ?? Date().addingTimeInterval(60)).timeIntervalSinceNow)))) }
            return Result(status: 429, body: ["ok": false, "error": "Provider rate limit", "retryAfterSeconds": seconds])
        }
        guard (200..<300).contains(response.statusCode) else { return error("Provider returned HTTP \(response.statusCode)") }
        if image {
            if let status = response.value(forHTTPHeaderField: "X-Logo-Status")?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), ["not-found", "missing", "fallback"].contains(status) {
                return Result(status: 404, body: ["ok": false, "error": "Brand image not found"])
            }
            // Pubrio's observed missing-logo response is a fixed SVG returned as HTTP 200.
            // Compare only this provider's exact bytes; real logos and other providers stay independent.
            if provider == "pubrio", SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == "60dd26ecb0a70ae7cd7737c82d53cb6b6f8bef8b97e1ce0ad3b34b22e5b20966" {
                return Result(status: 404, body: ["ok": false, "error": "Brand image not found"])
            }
            for header in ["X-Anylogo-Fallback", "X-Logo-Fallback", "X-Placeholder", "X-Logo-Placeholder", "X-Fallback"] {
                if let value = response.value(forHTTPHeaderField: header)?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), ["1", "true", "yes", "monogram", "transparent", "placeholder", "not-found", "missing", "fallback"].contains(value) {
                    return Result(status: 404, body: ["ok": false, "error": "Brand image not found"])
                }
            }
            return saveImage(data, provider: provider)
        }
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return error("Invalid provider response") }
        if search {
            guard let raw = object["suggestions"] as? [[String: Any]] else { return error("Invalid provider response") }
            let suggestions: [[String: Any]] = raw.prefix(8).compactMap { item in
                guard let name = item["name"] as? String, !name.isEmpty, name.count <= 200, let domain = item["domain"] as? String, Self.validDomain(domain) else { return nil }
                return ["name": name, "domain": domain]
            }
            return Result(status: 200, body: ["ok": true, "suggestions": suggestions])
        }
        guard let raw = object["variants"] as? [[String: Any]] else { return error("Invalid provider response") }
        var seen = Set<String>()
        let variants: [[String: Any]] = raw.compactMap { item in
            guard let shape = item["shape"] as? String, ["icon", "wordmark"].contains(shape), seen.insert(shape).inserted else { return nil }
            var result: [String: Any] = ["shape": shape]
            for key in ["width", "height"] { if let value = item[key] as? Int, (1...4096).contains(value) { result[key] = value } }
            if let scalable = item["scalable"] as? Bool { result["scalable"] = scalable }
            return result
        }
        return Result(status: 200, body: ["ok": true, "variants": variants])
    }
    private func error(_ message: String) -> Result { Result(status: 502, body: ["ok": false, "error": message]) }
    private func saveImage(_ data: Data, provider: String) -> Result {
        let ext: String
        if let source = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(source) as String?, let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = props[kCGImagePropertyPixelWidth] as? Int, let height = props[kCGImagePropertyPixelHeight] as? Int, (1...4096).contains(width), (1...4096).contains(height), CGImageSourceCreateImageAtIndex(source, 0, nil) != nil {
            switch type { case "public.png": ext = "png"; case "public.jpeg": ext = "jpg"; case "org.webmproject.webp": ext = "webp"; default: return error("Unsupported image") }
        } else if let text = String(data: data, encoding: .utf8), SafeSVG.check(text, data: data) { ext = "svg" }
        else { return error("Invalid image") }
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let name = "\(provider)-\(digest).\(ext)"
        let dest = directory.appendingPathComponent("icon-cache", isDirectory: true)
        do { try FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true); try data.write(to: dest.appendingPathComponent(name), options: .atomic) }
        catch { return self.error("Unable to save image") }
        return Result(status: 200, body: ["ok": true, "localIcon": "/icon-cache/" + name])
    }
}

private final class Receiver: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    let done = DispatchSemaphore(value: 0); let host: String; let limit: Int
    private let lock = NSLock()
    private var data = Data(); private var response: HTTPURLResponse?; private var failure: Error?
    func snapshot() -> (HTTPURLResponse, Data)? {
        lock.lock(); defer { lock.unlock() }
        guard let response, failure == nil else { return nil }
        return (response, data)
    }
    init(host: String, limit: Int) { self.host = host; self.limit = limit }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, url.scheme == "https", url.host == host, url.port == nil, url.user == nil, url.password == nil else { completionHandler(nil); return }
        completionHandler(request)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        lock.lock(); self.response = response as? HTTPURLResponse; lock.unlock()
        if response.expectedContentLength > Int64(limit) { completionHandler(.cancel) } else { completionHandler(.allow) }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock(); let tooLarge = self.data.count + data.count > limit
        if !tooLarge { self.data.append(data) }; lock.unlock()
        if tooLarge { dataTask.cancel() }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { lock.lock(); failure = error; lock.unlock(); done.signal() }
}

private final class SafeSVG: NSObject, XMLParserDelegate {
    private var safe = true; private var root = false; private var styleText: String?
    static func check(_ text: String, data: Data) -> Bool {
        let lower = text.lowercased()
        guard !lower.contains("<!doctype"), !lower.contains("<!entity"), !lower.contains("<?xml-stylesheet"), !lower.contains("@import") else { return false }
        let validator = SafeSVG(); let parser = XMLParser(data: data); parser.delegate = validator; parser.shouldResolveExternalEntities = false
        return parser.parse() && validator.root && validator.safe
    }
    private static func safeValue(_ value: String) -> Bool {
        guard !value.contains("\\"), !value.contains("@"), !value.contains("/*"), !value.contains("&") else { return false }
        let expression = try! NSRegularExpression(pattern: #"url\(\s*#[A-Za-z0-9_.:-]+\s*\)|(?:translate|scale|rotate|skewX|skewY|matrix|rgb|rgba)\([-+0-9eE.,%/\s]+\)"#, options: [.caseInsensitive])
        let range = NSRange(value.startIndex..., in: value)
        let stripped = expression.stringByReplacingMatches(in: value, range: range, withTemplate: "")
        return !stripped.contains("(") && !stripped.contains(")") && !stripped.lowercased().contains("url")
    }
    private static func safeStyle(_ value: String) -> Bool {
        let allowed: Set<String> = ["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "clip-path", "clip-rule", "mask", "mask-type", "display", "visibility", "color", "stop-color", "stop-opacity"]
        return value.split(separator: ";").allSatisfy { declaration in
            if declaration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
            let parts = declaration.split(separator: ":", maxSplits: 1)
            guard parts.count == 2 else { return false }
            let property = parts[0].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = parts[1].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return allowed.contains(property) && (property != "mask-type" || ["luminance", "alpha"].contains(value)) && safeValue(value)
        }
    }
    private static func safeStylesheet(_ value: String) -> Bool {
        guard !value.contains("\\"), !value.contains("@"), !value.contains("/*") else { return false }
        let selector = #"(?:[.#][A-Za-z_][A-Za-z0-9_-]*|svg|g|path|rect|circle|ellipse|line|polyline|polygon|stop)"#
        let pattern = #"\s*("# + selector + #"(?:\s*,\s*"# + selector + #")*)\s*\{([^{}]*)\}"#
        let regex = try! NSRegularExpression(pattern: pattern)
        let fullRange = NSRange(value.startIndex..., in: value)
        let matches = regex.matches(in: value, range: fullRange)
        var end = 0
        for match in matches {
            guard match.range.location == end, let body = Range(match.range(at: 2), in: value), safeStyle(String(value[body])) else { return false }
            end = NSMaxRange(match.range)
        }
        let remaining = (value as NSString).substring(from: end)
        return remaining.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) { if styleText != nil { styleText! += string } }
    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if styleText != nil { if let text = String(data: CDATABlock, encoding: .utf8) { styleText! += text } else { safe = false } }
    }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if elementName.lowercased() == "style", let styleText { if !Self.safeStylesheet(styleText) { safe = false }; self.styleText = nil }
    }
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes: [String : String]) {
        let name = elementName.lowercased().split(separator: ":").last.map(String.init) ?? ""
        if !root { root = name == "svg"; if !root { safe = false } }
        if styleText != nil { safe = false }
        if name == "style" { styleText = "" }
        let elements: Set<String> = ["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "title", "desc", "use", "symbol", "style"]
        if !elements.contains(name) { safe = false }
        for (key, value) in attributes {
            let key = key.lowercased(); let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if (key == "mask-type" && !["luminance", "alpha"].contains(value.lowercased())) || key.hasPrefix("on") || key == "xml:base" || key == "base" || (key == "style" ? !Self.safeStyle(value) : !Self.safeValue(value)) || ((key == "href" || key.hasSuffix(":href")) && !value.hasPrefix("#")) { safe = false }
        }
    }
}
