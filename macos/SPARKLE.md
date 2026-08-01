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

## Release notes

The release notes for 0.1.5 are stored in
`ReleaseNotes/Launey-v0.1.5-macOS.md`. Use the same text for the GitHub Release
description.

Before running Sparkle's `generate_appcast`, place a copy of the Markdown file
next to the update archive and keep their base names identical:

```text
Launey-v0.1.5-macOS.zip
Launey-v0.1.5-macOS.md
```

Sparkle 2.9 will add the Markdown file to the generated appcast as the release
notes for that update. Publish the generated `appcast.xml`, archive, and release
notes together. Do not add the 0.1.5 item to the checked-in appcast manually:
its archive size, EdDSA signature, and download URL must come from the final
signed release artifact.

Update archives and the appcast must be signed with the same Sparkle private
key. Only the public key belongs in the application bundle and Git history.
