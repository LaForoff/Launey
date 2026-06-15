//
//  MenuBarView.swift
//  Launey
//

import SwiftUI
import AppKit

struct MenuBarView: View {
    var body: some View {
        Text("Launey")
        Text("Версия 1.0.0")

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
