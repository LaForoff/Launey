#!/bin/bash

set -euo pipefail

readonly EXPECTED_VERSION="0.1.4"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly RELEASE_DIRECTORY="${REPOSITORY_ROOT}/dist-release"
readonly ARCHIVE_PATH="${RELEASE_DIRECTORY}/Launey-v${EXPECTED_VERSION}-macOS.zip"

find_latest_release_app() {
    local latest_app=""
    local latest_timestamp=0
    local candidate
    local timestamp

    while IFS= read -r -d '' candidate; do
        timestamp="$(stat -f '%m' "${candidate}")"
        if (( timestamp > latest_timestamp )); then
            latest_timestamp="${timestamp}"
            latest_app="${candidate}"
        fi
    done < <(
        find "${REPOSITORY_ROOT}/macos" "${HOME}/Library/Developer/Xcode/DerivedData" \
            -type d -path '*/Build/Products/Release/Launey.app' -print0 2>/dev/null || true
    )

    printf '%s' "${latest_app}"
}

app_path="${1:-${LAUNEY_APP_PATH:-}}"
if [[ -z "${app_path}" ]]; then
    app_path="$(find_latest_release_app)"
fi

if [[ -z "${app_path}" || ! -d "${app_path}" ]]; then
    echo "error: Launey.app was not found." >&2
    echo "Build the Release configuration or pass the app path:" >&2
    echo "  $0 /path/to/Launey.app" >&2
    exit 1
fi

readonly INFO_PLIST="${app_path}/Contents/Info.plist"
if [[ ! -f "${INFO_PLIST}" ]]; then
    echo "error: Invalid app bundle; Contents/Info.plist is missing: ${app_path}" >&2
    exit 1
fi

built_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${INFO_PLIST}")"
if [[ "${built_version}" != "${EXPECTED_VERSION}" ]]; then
    echo "error: Expected Launey ${EXPECTED_VERSION}, found ${built_version}." >&2
    exit 1
fi

mkdir -p "${RELEASE_DIRECTORY}"
rm -f "${ARCHIVE_PATH}"
ditto -c -k --keepParent "${app_path}" "${ARCHIVE_PATH}"

archive_size="$(stat -f '%z' "${ARCHIVE_PATH}")"

echo "Sparkle archive: ${ARCHIVE_PATH}"
echo "Archive length: ${archive_size} bytes"
echo
echo "Next, sign the archive with Sparkle:"

sign_update="$(find "${HOME}/Library/Developer/Xcode/DerivedData" \
    -type f -path '*/SourcePackages/artifacts/sparkle/Sparkle/bin/sign_update' \
    -print -quit 2>/dev/null || true)"

if [[ -n "${sign_update}" ]]; then
    printf '  %q %q\n' "${sign_update}" "${ARCHIVE_PATH}"
else
    printf '  /path/to/Sparkle/bin/sign_update %q\n' "${ARCHIVE_PATH}"
fi

echo "Copy the resulting sparkle:edSignature and length into appcast.xml."
