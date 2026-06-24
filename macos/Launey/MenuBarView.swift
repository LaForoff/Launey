//
//  MenuBarView.swift
//  Launey
//

import SwiftUI
import AppKit

struct MenuBarView: View {
    @ObservedObject private var serverManager = ServerManager.shared

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Unknown"
    }

    var body: some View {
        Text("Launey")
        Text("Version \(appVersion)")
        Text("Статус: \(serverManager.status.localizedTitle)")

        Divider()

        Button("Открыть Launey") {
            Task {
                await BrowserManager.openLauneyWhenReady()
            }
        }

        Button("Проверить обновления") {
            UpdateManager.shared.checkForUpdates()
        }

        Divider()

        Button("Выход") {
            NSApplication.shared.terminate(nil)
        }
    }
}
