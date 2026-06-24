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

}
