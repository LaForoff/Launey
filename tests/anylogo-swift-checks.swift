import Foundation

@main struct AnyLogoChecks {
    static func main() throws {
        for domain in ["example.com", "linear.app", "xn--e1afmkfd.xn--p1ai"] { precondition(AnyLogoService.validDomain(domain), domain) }
        for domain in ["localhost", "127.0.0.1", "0x7f.0x0.0x0.0x1", "thing.local", "bad..com", "-bad.com", "http://example.com", "EXAMPLE.COM"] { precondition(!AnyLogoService.validDomain(domain), domain) }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let body = try JSONSerialization.data(withJSONObject: ["ok": true, "suggestions": [["name": "Linear", "domain": "linear.app"]]])
        let entry: [String: Any] = ["expires": Date().addingTimeInterval(3600).timeIntervalSinceReferenceDate, "status": 200, "payload": body.base64EncodedString()]
        let store: [String: Any] = ["entries": ["/api/brand-search:linear:": entry], "images": [:]]
        try JSONSerialization.data(withJSONObject: store).write(to: directory.appendingPathComponent("anylogo-cache.json"))
        let service = AnyLogoService(directory: directory)
        precondition(service.request(path: "/api/brand-search", value: "linear", variant: nil).status == 200)
        precondition(service.request(path: "/api/brand-search", value: "a", variant: nil).status == 400)
        precondition(service.request(path: "/api/brand-image", value: "linear.app", variant: "bad").status == 400)
        precondition(service.request(path: "/api/brand-kit", value: "127.0.0.1", variant: nil).status == 400)
        func folder() throws -> URL {
            let url = directory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            return url
        }
        func response(_ url: URL, _ status: Int, _ headers: [String: String] = [:]) -> HTTPURLResponse {
            HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: headers)!
        }
        let missing = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 404), Data()) })
        let empty = missing.request(path: "/api/brand-kit", value: "missing.com", variant: nil)
        precondition(empty.status == 200 && (empty.body["variants"] as? [[String: Any]])?.isEmpty == true)
        precondition(missing.request(path: "/api/brand-image", value: "missing.com", variant: "icon").status == 404)
        let payload = Data(#"{"variants":[{"shape":"icon"},{"shape":"icon"},{"shape":"wordmark"}]}"#.utf8)
        let kit = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200), payload) })
        precondition((kit.request(path: "/api/brand-kit", value: "linear.app", variant: nil).body["variants"] as? [[String: Any]])?.count == 2)
        let cooldownDirectory = try folder()
        let limited = AnyLogoService(directory: cooldownDirectory, transport: { url, _ in (response(url, 429, ["Retry-After": "90"]), Data()) })
        precondition(limited.request(path: "/api/brand-kit", value: "linear.app", variant: nil).status == 429)
        let restored = AnyLogoService(directory: cooldownDirectory, transport: { _, _ in fatalError("cooldown should prevent request") })
        precondition(restored.request(path: "/api/brand-image", value: "linear.app", variant: "icon").status == 429)
        let countLock = NSLock(); var count = 0
        let coalesced = AnyLogoService(directory: try folder(), transport: { url, _ in
            countLock.lock(); count += 1; countLock.unlock()
            Thread.sleep(forTimeInterval: 0.1)
            return (response(url, 200), payload)
        })
        DispatchQueue.concurrentPerform(iterations: 8) { _ in
            precondition(coalesced.request(path: "/api/brand-kit", value: "linear.app", variant: nil).status == 200)
        }
        precondition(count == 1)
        let budget = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 404), Data()) })
        for index in 0..<15 { precondition(budget.request(path: "/api/brand-kit", value: "name\(index).com", variant: nil).status == 200) }
        precondition(budget.request(path: "/api/brand-kit", value: "overflow.com", variant: nil).status == 429)
        let safeSVG = Data(#"<svg xmlns="http://www.w3.org/2000/svg"><style>.st0,#mark { fill:rgb(255, 20, 4); stroke: url( #g ); }</style><defs><linearGradient id="g"/></defs><path class="st0" transform="translate(10 20) matrix(1,0,0,1,0,0)" style="fill:url(#g)" d="M0 0"/></svg>"#.utf8)
        let unsafeSVG = Data(#"<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.test/x)"/></svg>"#.utf8)
        let svgService = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200), url.path.contains("safe.com") ? safeSVG : unsafeSVG) })
        precondition(svgService.request(path: "/api/brand-image", value: "safe.com", variant: "icon").status == 200)
        precondition(svgService.request(path: "/api/brand-image", value: "evil.com", variant: "icon").status == 502)
        let badStyle = Data(#"<svg xmlns="http://www.w3.org/2000/svg"><style>.st0 { fill: url(https://evil.test/x); }</style><path class="st0"/></svg>"#.utf8)
        let badStyleService = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200), badStyle) })
        precondition(badStyleService.request(path: "/api/brand-image", value: "evil.com", variant: "icon").status == 502)
        let validMask = Data(#"<svg xmlns="http://www.w3.org/2000/svg"><mask style="mask-type:luminance"/><mask mask-type="alpha"/></svg>"#.utf8)
        let validMaskService = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200), validMask) })
        precondition(validMaskService.request(path: "/api/brand-image", value: "gitlab.com", variant: "icon").status == 200)
        let invalidMask = Data(#"<svg xmlns="http://www.w3.org/2000/svg"><mask style="mask-type:invalid"/></svg>"#.utf8)
        let invalidMaskService = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200), invalidMask) })
        precondition(invalidMaskService.request(path: "/api/brand-image", value: "evil.com", variant: "icon").status == 502)
        let normalized = AnyLogoService(directory: try folder(), transport: { url, _ in
            precondition(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value == "linear app")
            return (response(url, 200), Data(#"{"suggestions":[]}"#.utf8))
        })
        precondition(normalized.request(path: "/api/brand-search", value: "  Linear   APP  ", variant: nil).status == 200)
        precondition(normalized.request(path: "/api/brand-search", value: "line\nar", variant: nil).status == 400)
        let clamp = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 429, ["Retry-After": "999999"]), Data()) })
        precondition(clamp.request(path: "/api/brand-kit", value: "linear.app", variant: nil).body["retryAfterSeconds"] as? Int == 86400)
        let maintenance = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 503, ["Retry-After": "120"]), Data()) })
        precondition(maintenance.request(path: "/api/brand-image", value: "example.com", variant: "icon", provider: "pubrio").body["retryAfterSeconds"] as? Int == 120)
        let sharedSVG = Data(#"<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>"#.utf8)
        let multiDirectory = try folder()
        let multi = AnyLogoService(directory: multiDirectory, transport: { url, _ in
            precondition(["img.anylogo.dev", "logo.pubrio.com", "logo.debounce.com"].contains(url.host ?? ""))
            return (response(url, 200), sharedSVG)
        })
        let any = multi.request(path: "/api/brand-image", value: "linear.app", variant: "icon")
        let pub = multi.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio")
        let deb = multi.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "debounce")
        let anyPath = any.body["localIcon"] as! String, pubPath = pub.body["localIcon"] as! String, debPath = deb.body["localIcon"] as! String
        precondition(anyPath.hasPrefix("/icon-cache/anylogo-") && pubPath.hasPrefix("/icon-cache/pubrio-") && debPath.hasPrefix("/icon-cache/debounce-"))
        precondition(Set([anyPath, pubPath, debPath]).count == 3)
        let reopened = AnyLogoService(directory: multiDirectory, transport: { _, _ in fatalError("cached image should not request upstream") })
        precondition(reopened.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").body["localIcon"] as? String == pubPath)
        precondition(reopened.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "debounce").body["localIcon"] as? String == debPath)
        precondition(reopened.request(path: "/api/brand-image", value: "linear.app", variant: "icon").body["localIcon"] as? String == anyPath)
        precondition(multi.request(path: "/api/brand-image", value: "linear.app", variant: "wordmark", provider: "pubrio").status == 400)
        precondition(multi.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "fake").status == 400)
        let separate = try folder()
        let isolated = AnyLogoService(directory: separate, transport: { url, _ in
            url.host == "logo.pubrio.com" ? (response(url, 429, ["Retry-After": "90"]), Data()) : (response(url, 200), sharedSVG)
        })
        precondition(isolated.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 429)
        precondition(isolated.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "debounce").status == 200)
        let reloaded = AnyLogoService(directory: separate, transport: { url, _ in
            precondition(url.host != "logo.pubrio.com")
            return (response(url, 200), sharedSVG)
        })
        precondition(reloaded.request(path: "/api/brand-image", value: "other.app", variant: "icon", provider: "pubrio").status == 429)
        precondition(reloaded.request(path: "/api/brand-image", value: "other.app", variant: "icon").status == 200)
        let imageBudget = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 404), Data()) })
        for index in 0..<30 {
            precondition(imageBudget.request(path: "/api/brand-image", value: "logo\(index).com", variant: "icon", provider: "pubrio").status == 404)
        }
        precondition(imageBudget.request(path: "/api/brand-image", value: "limit.com", variant: "icon", provider: "pubrio").status == 429)
        for index in 0..<30 {
            precondition(imageBudget.request(path: "/api/brand-image", value: "logo\(index).com", variant: "icon", provider: "debounce").status == 404)
        }
        precondition(imageBudget.request(path: "/api/brand-image", value: "limit.com", variant: "icon").status == 429)
        let legacyDirectory = try folder()
        let legacyStore: [String: Any] = ["entries": [:], "images": [:], "cooldown": Date().addingTimeInterval(90).timeIntervalSinceReferenceDate]
        try JSONSerialization.data(withJSONObject: legacyStore).write(to: legacyDirectory.appendingPathComponent("anylogo-cache.json"))
        let legacy = AnyLogoService(directory: legacyDirectory, transport: { url, _ in (response(url, 200), sharedSVG) })
        precondition(legacy.request(path: "/api/brand-image", value: "linear.app", variant: "icon").status == 429)
        precondition(legacy.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 200)
        let parallelLock = NSLock(); var active = 0; var peak = 0
        let parallel = AnyLogoService(directory: try folder(), transport: { url, _ in
            parallelLock.lock(); active += 1; peak = max(peak, active); parallelLock.unlock()
            Thread.sleep(forTimeInterval: 0.15)
            parallelLock.lock(); active -= 1; parallelLock.unlock()
            return (response(url, 200), sharedSVG)
        })
        let providers = ["anylogo", "pubrio", "debounce"]
        DispatchQueue.concurrentPerform(iterations: 3) { index in
            precondition(parallel.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: providers[index]).status == 200)
        }
        precondition(peak == 3)
        let fallback = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200, ["X-Logo-Fallback": "true"]), sharedSVG) })
        precondition(fallback.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 404)
        let missingStatus = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200, ["X-Logo-Status": "not-found"]), sharedSVG) })
        precondition(missingStatus.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "debounce").status == 404)
        let unknownFlag = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200, ["X-Logo-Fallback": "unknown"]), sharedSVG) })
        precondition(unknownFlag.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 200)
        let noStore = AnyLogoService(directory: try folder(), transport: { url, _ in (response(url, 200, ["Cache-Control": "no-store"]), sharedSVG) })
        precondition(noStore.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 200)
        let fixture = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("launey-web/tests/fixtures/pubrio-placeholder.svg")
        do {
            let placeholder = try Data(contentsOf: fixture)
            var calls = 0
            let fixtureService = AnyLogoService(directory: try folder(), transport: { url, _ in calls += 1; return (response(url, 200), placeholder) })
            precondition(fixtureService.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 404)
            precondition(fixtureService.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 404)
            precondition(calls == 1)
            let legacyDirectory = try folder()
            let cachedName = "pubrio-60dd26ecb0a70ae7cd7737c82d53cb6b6f8bef8b97e1ce0ad3b34b22e5b20966.svg"
            try FileManager.default.createDirectory(at: legacyDirectory.appendingPathComponent("icon-cache"), withIntermediateDirectories: true)
            try placeholder.write(to: legacyDirectory.appendingPathComponent("icon-cache").appendingPathComponent(cachedName))
            let legacyStore: [String: Any] = ["entries": [:], "images": ["pubrio:/api/brand-image:linear.app:icon": cachedName]]
            try JSONSerialization.data(withJSONObject: legacyStore).write(to: legacyDirectory.appendingPathComponent("anylogo-cache.json"))
            let legacyFixture = AnyLogoService(directory: legacyDirectory, transport: { _, _ in fatalError("cached placeholder must not trigger a download") })
            precondition(legacyFixture.request(path: "/api/brand-image", value: "linear.app", variant: "icon", provider: "pubrio").status == 404)
            print("Passed Pubrio exact placeholder fixture")
        }
        print("Multi-provider Swift cache, budgets, cooldown and validation checks passed")
    }
}
