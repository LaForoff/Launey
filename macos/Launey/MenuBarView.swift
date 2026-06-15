//
//  MenuBarView.swift
//  Launey
//

import SwiftUI
import AppKit

struct MenuBarView: View {
    @ObservedObject private var serverManager = ServerManager.shared

    var body: some View {
        Text("Launey")
        Text("Version 1.0.0")
        Text("Статус: \(serverManager.status.localizedTitle)")

        Divider()

        Button("Открыть Launey") {
            Task {
                await BrowserManager.openLauneyWhenReady()
            }
        }

        Button("Проверить обновления") {
            Task {
                await BrowserManager.openUpdateCheckWhenReady()
            }
        }

        Divider()

        Button("Выход") {
            NSApplication.shared.terminate(nil)
        }
    }
}
