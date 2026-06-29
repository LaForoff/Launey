//
//  UpdateManager.swift
//  Launey
//

import Sparkle

@MainActor
final class UpdateManager: NSObject, SPUUpdaterDelegate, SPUStandardUserDriverDelegate {
    static let shared = UpdateManager()

    private var updaterController: SPUStandardUpdaterController!
    private(set) var isCheckingForUpdates = false

    private override init() {
        super.init()
        updaterController = SPUStandardUpdaterController(
            startingUpdater: true,
            updaterDelegate: self,
            userDriverDelegate: self
        )
    }

    func checkForUpdates() {
        setCheckingForUpdates(true)
        updaterController.checkForUpdates(nil)
    }

    nonisolated static func updateCheckStatus() -> [String: String] {
        let isChecking = UserDefaults.standard.bool(forKey: "LauneyUpdateCheckInProgress")
        return ["checking": isChecking ? "true" : "false"]
    }

    func standardUserDriverWillFinishUpdateSession() {
        setCheckingForUpdates(false)
    }

    func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
        setCheckingForUpdates(false)
    }

    private func setCheckingForUpdates(_ isChecking: Bool) {
        isCheckingForUpdates = isChecking
        UserDefaults.standard.set(isChecking, forKey: "LauneyUpdateCheckInProgress")
    }
}
