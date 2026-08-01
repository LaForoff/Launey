# Agent worklog

## 2026-08-02 — Folder header editing flow

- Keep the closed folder menu behavior unchanged, but make “Редактировать” inside an open folder enter its inline reorder mode.
- Show only the overflow button in the normal folder header and replace it with “Сохранить” while editing.
- Reuse the existing blur/glow transition language from space controls for the overflow/save swap.
- Reset folder editing whenever the folder opens or closes; verify statically without running an application build.

## 2026-08-01 — Automatic wallpaper readability

- Analyze newly uploaded local images on a small offscreen canvas while the existing file button shows “Подготовка фотографии…” and a progress ring.
- Base the recommendation on average luminance plus the brighter quartile so isolated dark areas do not hide an otherwise bright wallpaper.
- Convert the result into the existing `backgroundDim` control; keep video and URL backgrounds unchanged and preserve manual adjustment in Settings.
- Confirm completion with: “Фон подготовлен для лучшей читаемости. Затемнение можно изменить в настройках.”
- Verify with TypeScript/static checks only; the user owns application builds.

## 2026-08-01 — Folder zoom transition

- Open folders from the pressed folder preview's viewport rectangle.
- Animate only shell transform and opacity; keep backdrop blur static for drag performance.
- Reverse the geometry on close and use a crossfade when reduced motion is enabled.
- Verify with TypeScript checks only; the user owns application builds.
- Keep the folder backdrop fully visible from its first frame so blur precedes the shell zoom.
- Hide the folder overflow menu while editing and restore it with a scale/fade layout transition after saving.
- Reuse the space-title blur/glow language for the overflow button and `GlowSwap` for the edit/save label.
- Make the closed folder preview surface a static backdrop layer and apply a stable 28px blur behind its mini-icons.
- Remove `clip-path: shape()` and compositor transforms from that backdrop because Safari drops blur for the combined layer.
- The pager transform and viewport mask isolate tiles from the wallpaper backdrop; render and blur the active wallpaper inside the folder preview instead.
