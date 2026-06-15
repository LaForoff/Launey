//
//  BrowserManager.swift
//  Launey
//

import AppKit

@MainActor
final class BrowserManager: NSObject, NSApplicationDelegate {
    static let applicationURL = URL(string: "http://localhost:4242")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        Task {
            await Self.openLauneyWhenReady()
        }
    }

    static func openLauneyWhenReady() async {
        guard await ServerManager.shared.ensureServerIsRunning() else {
            print("[Launey] Browser was not opened because the server is unavailable")
            return
        }

        NSWorkspace.shared.open(Self.applicationURL)
    }

    static func openUpdateCheckWhenReady() async {
        guard await ServerManager.shared.ensureServerIsRunning() else {
            print("[Launey] Update page was not opened because the server is unavailable")
            return
        }

        guard var components = URLComponents(
            url: Self.applicationURL,
            resolvingAgainstBaseURL: false
        ) else {
            return
        }

        components.queryItems = [URLQueryItem(name: "action", value: "check-updates")]

        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }
}
