//
//  LauneyApp.swift
//  Launey
//
//  Created by некетоша on 15.06.2026.
//

import SwiftUI

@main
struct LauneyApp: App {
    @NSApplicationDelegateAdaptor(BrowserManager.self) private var browserManager

    var body: some Scene {
        MenuBarExtra("Launey", systemImage: "bolt.fill") {
            MenuBarView()
        }
        .menuBarExtraStyle(.menu)
    }
}
