#!/bin/zsh

set -euo pipefail

PRODUCT_FRAMEWORK="${BUILT_PRODUCTS_DIR}/Sparkle.framework"
PRODUCT_RU_STRINGS="${PRODUCT_FRAMEWORK}/Versions/Current/Resources/ru.lproj/Sparkle.strings"
EMBEDDED_FRAMEWORK="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}/Sparkle.framework"
EMBEDDED_RU_STRINGS="${EMBEDDED_FRAMEWORK}/Versions/Current/Resources/ru.lproj/Sparkle.strings"
MISSING_RU_STRINGS="${SRCROOT}/SparkleLocalization/ru.lproj/SparkleMissing.strings"

if [[ ! -f "${PRODUCT_RU_STRINGS}" ]]; then
    echo "error: Sparkle Russian localization was not found at ${PRODUCT_RU_STRINGS}"
    exit 1
fi

if [[ ! -f "${MISSING_RU_STRINGS}" ]]; then
    echo "error: Supplemental Sparkle localization was not found at ${MISSING_RU_STRINGS}"
    exit 1
fi

merge_strings() {
    local destination="$1"
    local merged_strings
    merged_strings="$(mktemp "${TMPDIR:-/tmp}/launey-sparkle-strings.XXXXXX")"

    # PlistBuddy keeps the value already present in the destination when Merge
    # encounters a duplicate key. Start with Launey's copy so our wording wins,
    # then fill in every untranslated Sparkle key from the bundled localization.
    /bin/cp "${MISSING_RU_STRINGS}" "${merged_strings}"
    /usr/libexec/PlistBuddy -c "Merge '${destination}'" "${merged_strings}"
    /usr/bin/plutil -lint "${merged_strings}"
    /bin/cp "${merged_strings}" "${destination}"
    /bin/rm -f "${merged_strings}"
}

# SwiftPM prepares this framework before Xcode embeds it into the application.
merge_strings "${PRODUCT_RU_STRINGS}"

# Incremental builds may already have an embedded copy. Keep it in sync when
# present; clean builds will copy the updated product framework afterwards.
if [[ -f "${EMBEDDED_RU_STRINGS}" ]]; then
    merge_strings "${EMBEDDED_RU_STRINGS}"

    if [[ "${CODE_SIGNING_ALLOWED:-NO}" == "YES" && -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" ]]; then
        /usr/bin/codesign \
            --force \
            --sign "${EXPANDED_CODE_SIGN_IDENTITY}" \
            --preserve-metadata=identifier,entitlements,flags \
            --generate-entitlement-der \
            "${EMBEDDED_FRAMEWORK}"
    fi
fi

echo "Completed Sparkle Russian localization: ${PRODUCT_RU_STRINGS}"
