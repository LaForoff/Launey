#!/bin/bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

log() {
    echo "==> $*"
}

fail() {
    echo "Ошибка: $*" >&2
    exit 1
}

usage() {
    cat >&2 <<EOF
Использование:
  ./scripts/${SCRIPT_NAME} <version> <build>

Пример:
  ./scripts/${SCRIPT_NAME} 0.1.4 5
EOF
    exit 1
}

if [[ $# -ne 2 ]]; then
    usage
fi

readonly VERSION="$1"
readonly BUILD="$2"

if [[ ! "${VERSION}" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
    fail "версия должна быть в формате 0.1.4"
fi

if [[ ! "${BUILD}" =~ ^[0-9]+$ ]]; then
    fail "build должен быть целым числом"
fi

readonly PROJECT_ROOT="$(pwd)"
readonly XCODE_PROJECT="macos/Launey.xcodeproj"
readonly PROJECT_FILE="${XCODE_PROJECT}/project.pbxproj"
readonly BUILD_INFO_FILE="launey-web/src/config/buildInfo.ts"
readonly PACKAGE_SCRIPT="scripts/package_sparkle_update.sh"
readonly APPCAST_FILE="appcast.xml"
readonly RELEASE_DIR="dist-release"
readonly ZIP_NAME="Launey-v${VERSION}-macOS.zip"
readonly ZIP_PATH="${RELEASE_DIR}/${ZIP_NAME}"
readonly GITHUB_ZIP_URL="https://github.com/LaForoff/Launey/releases/download/v${VERSION}/${ZIP_NAME}"

if [[ ! -d ".git" || ! -d "macos" || ! -d "launey-web" || ! -d "scripts" ]]; then
    fail "скрипт нужно запускать из корня проекта Launey"
fi

for required_path in \
    "${XCODE_PROJECT}" \
    "${PROJECT_FILE}" \
    "${BUILD_INFO_FILE}" \
    "${PACKAGE_SCRIPT}" \
    "${APPCAST_FILE}"
do
    if [[ ! -e "${required_path}" ]]; then
        fail "не найден обязательный путь: ${required_path}"
    fi
done

if ! command -v perl >/dev/null 2>&1; then
    fail "perl не найден, он нужен для безопасного обновления файлов"
fi

log "Обновляю версии: version=${VERSION}, build=${BUILD}"

perl -0pi -e "s/MARKETING_VERSION = [0-9]+(?:\\.[0-9]+){1,2};/MARKETING_VERSION = ${VERSION};/g; s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${BUILD};/g" "${PROJECT_FILE}"

perl -0pi -e "s/export const APP_VERSION = '[^']+'/export const APP_VERSION = '${VERSION}'/" "${BUILD_INFO_FILE}"

perl -0pi -e "s/readonly EXPECTED_VERSION=\"[^\"]+\"/readonly EXPECTED_VERSION=\"${VERSION}\"/" "${PACKAGE_SCRIPT}"

log "Собираю Release build"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
    -project "${XCODE_PROJECT}" \
    -scheme Launey \
    -configuration Release build

log "Создаю Sparkle ZIP"
"./${PACKAGE_SCRIPT}"

if [[ ! -f "${ZIP_PATH}" ]]; then
    fail "ZIP не найден после упаковки: ${ZIP_PATH}"
fi

log "Ищу Sparkle sign_update"
SIGN_UPDATE_PATH="$(find "${HOME}/Library/Developer/Xcode/DerivedData" -name sign_update -type f -print -quit 2>/dev/null || true)"

if [[ -z "${SIGN_UPDATE_PATH}" ]]; then
    fail "sign_update не найден в ~/Library/Developer/Xcode/DerivedData. Убедитесь, что Sparkle загружен через Swift Package Manager и Release build прошёл успешно."
fi

log "Подписываю ZIP"
SIGN_OUTPUT="$("${SIGN_UPDATE_PATH}" "${ZIP_PATH}")"
echo "${SIGN_OUTPUT}"

SIGNATURE="$(printf '%s\n' "${SIGN_OUTPUT}" | sed -n 's/.*sparkle:edSignature="\([^"]*\)".*/\1/p' | head -n 1)"
SIGNED_LENGTH="$(printf '%s\n' "${SIGN_OUTPUT}" | sed -n 's/.*length="\([0-9]*\)".*/\1/p' | head -n 1)"

if [[ -z "${SIGNATURE}" ]]; then
    fail "не удалось извлечь sparkle:edSignature из вывода sign_update"
fi

if [[ -z "${SIGNED_LENGTH}" ]]; then
    fail "не удалось извлечь length из вывода sign_update"
fi

log "Обновляю appcast.xml"
perl -0pi -e "
    s|<title>Launey [^<]+</title>|<title>Launey ${VERSION}</title>|;
    s|url=\"[^\"]*Launey-v[^\"]+-macOS\\.zip\"|url=\"${GITHUB_ZIP_URL}\"|;
    s|sparkle:shortVersionString=\"[^\"]*\"|sparkle:shortVersionString=\"${VERSION}\"|;
    s|sparkle:version=\"[^\"]*\"|sparkle:version=\"${BUILD}\"|;
    s|sparkle:edSignature=\"[^\"]*\"|sparkle:edSignature=\"${SIGNATURE}\"|;
    s|length=\"[0-9]*\"|length=\"${SIGNED_LENGTH}\"|;
" "${APPCAST_FILE}"

if command -v xmllint >/dev/null 2>&1; then
    log "Проверяю appcast.xml через xmllint"
    xmllint --noout "${APPCAST_FILE}"
else
    log "xmllint не найден, пропускаю XML-проверку"
fi

cat <<EOF

Готово.

version: ${VERSION}
build: ${BUILD}
ZIP path: ${PROJECT_ROOT}/${ZIP_PATH}
length: ${SIGNED_LENGTH}
signature: ${SIGNATURE}
GitHub Release tag: v${VERSION}
GitHub ZIP URL: ${GITHUB_ZIP_URL}

Следующие ручные шаги:
  1. git add .
  2. git commit -m "Prepare release ${VERSION}"
  3. git push
  4. создать GitHub Release v${VERSION}
  5. загрузить ZIP ${ZIP_PATH}
  6. отметить Pre-release
  7. проверить обновление через Sparkle
EOF
