# Sparkle release setup

Launey reads its Sparkle configuration from `Launey/Info.plist`. Version and
build values remain connected to the Xcode `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION` build settings.

Before publishing updates:

1. Run Sparkle's `generate_keys` tool once.
2. Keep the generated private key in the macOS login Keychain. Never commit a
   private key or an exported private-key file to this repository.
3. Replace `PASTE_SPARKLE_PUBLIC_ED_KEY_HERE` in `SUPublicEDKey` with the public
   key printed by `generate_keys`.
4. Publish `appcast.xml` in the GitHub repository at the URL configured by
   `SUFeedURL`.
5. Increment `CFBundleVersion` (`CURRENT_PROJECT_VERSION`) for every release,
   including releases that keep the same marketing version.

Update archives and the appcast must be signed with the same Sparkle private
key. Only the public key belongs in the application bundle and Git history.
