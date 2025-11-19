# NTR Viewer – Agent Handbook

_Last updated: based on commit a04b788 (review/refactor-opportunities branch)._

## Purpose & Scope
- **Goal:** Provide an offline desktop application for inspecting ROHR2 `.ntr` piping models with interactive 3D visualisation, selection, colouring, and issue surfacing.
- **Supported targets:** Windows, macOS, Linux via Tauri desktop bundles.
- **Key references:** `InterfaceNeutral_e_01.01.md` (format specification) and `Example.ntr` (fixture used in parser tests).

## Build, Run & Test
| Task | Command | Notes |
| --- | --- | --- |
| Install deps | `npm install` | Requires Node 18+ (per `package.json` engines). |
| Web preview | `npm run dev` | Vite dev server on port 1420. |
| Desktop dev | `npm run tauri:dev` | Launches Tauri shell with hot reload (Rust + Node). |
| Desktop build | `npm run tauri:build` | Outputs bundles under `src-tauri/target/release/bundle/`. |
| Type check | `npm run check` | Runs `tsc --noEmit`. |
| Lint | `npm run lint` | ESLint 9 (flat config). |
| Tests | `npm test` / `npm run test:watch` | Vitest suites (11 files, 32 assertions as of latest commit). |

For Windows installer creation without Node on the target machine, pre-build `dist/` via `npm ci && npm run build`, ensure `beforeBuildCommand` in `src-tauri/tauri.conf.json` is empty, then execute `cargo tauri build --bundles msi` on the target system (see `AGENTS.md` history for rationale).

## Top-Level Structure
```
src/
  app/             Frontend controllers & bootstrap helpers
  viewer/          Babylon.js renderer, scene graph, camera
  ntr/             Parser, lexer, model definitions
  shared/          Generic utilities (result, toast, iter)
src-tauri/
  src/             Rust commands, file watching bridge
  capabilities/    Tauri capability configuration
tests/             Vitest suites (parser, viewer, app controllers)
.github/workflows/ci.yml   CI pipeline (lint + tests + Tauri build)
```

## Frontend Architecture

### Bootstrap (`src/app/main.ts`)
- Orchestrates controller creation and lifecycle. On DOM ready it:
  1. Loads Babylon viewer via `createViewerHost` (see below).
  2. Attaches toolbar, keyboard shortcuts, options panel, toast manager, file watch, and file drop controllers.
  3. Restores last opened file (`localStorage` key `ntr-viewer:last-file-path`), with fallbacks for missing files.
  4. Applies persisted viewer sensitivities (`ntr-viewer:options`).
- On unload it disposes controllers, stops file watching (`@tauri-apps/api/core.invoke("stop_file_watch")`), and releases viewer resources.

### Controllers & Utilities (`src/app`)
| Module | Responsibility | Key APIs |
| --- | --- | --- |
| `viewerHost.ts` | Wraps `createBabylonRenderer`, exposing scene controls (`load`, `setSelection`, `fitToBounds`, sensitivity getters/setters). Ensures renderer cleanup. |
| `toolbar.ts` | Manages toolbar button & toggle listeners (open, fit/reset, options, color, grid, iso, telemetry). Returns a disposable controller. |
| `keyboardShortcuts.ts` | Global keyboard shortcuts for fit (`F`), reset (`R`), clear selection (`Esc`), toggle grid (`G`). |
| `optionsPanel.ts` | Full options drawer behaviour: sensitivity inputs, manual path submission, storage sync, focus management. Exposes `show/hide/toggle/refresh/dispose`. |
| `fileWatch.ts` | Listens for `ntr-file-changed` / `ntr-file-watch-error` events from Tauri, surfacing async errors via injected callbacks. |
| `fileDrop.ts` | Normalises drop payloads from Tauri drag events (`DRAG_ENTER`, `DRAG_OVER`, `DRAG_LEAVE`, `DRAG_DROP`). |
| `toastManager.ts` | Subscribes to shared toast bus (`@shared/toast`), renders DOM elements, auto-dismisses after 5s. |
| `telemetryPreferences.ts` | Initialises telemetry toggle state via `@app/telemetry.initializeTelemetry()`. |
| `api/files.ts` | Thin wrappers around Tauri `invoke` calls (`open_ntr_file`, `load_ntr_file`, `start_file_watch`, `stop_file_watch`). Errors are returned to callers for UI handling. |
| `telemetry.ts` | Stores telemetry preference in `localStorage`, logs events to console when enabled (placeholder). |
| `viewCube.ts` | Renders the floating “view cube” gizmo that orients the camera to the requested cardinal direction (up/down/north/south/east/west). |

All controllers have dedicated Vitest coverage under `tests/app/` (`fileWatch.spec.ts`, `fileDrop.spec.ts`, `optionsPanel.spec.ts`), ensuring the refactored bootstrap remains regression-tested.

### Viewer (`src/viewer`)
- `viewer.ts` – Babylon.js renderer implementation (`BabylonSceneRenderer`). Key features:
  - Camera: custom `PivotOrbitCamera` supporting override pivots, clamped zoom sensitivity (wheel rate constant) and close-range orbiting.
  - Projection: can switch between perspective and orthographic isometric view (toolbar toggle).
  - Scene graph integration: loads meshes, handles selection highlighting, colour modes (`type`, `material`, or property-based).
  - Grid mesh, MSAA pipeline configuration, pointer picking logic, and toast/selection callbacks.
- `camera/PivotOrbitCamera.ts` – Extends `ArcRotateCamera` to orbit around custom pivots, enforces beta limits, and resets inertial offsets on manual moves.
- `sceneGraph.ts` – Converts parsed model elements into viewer-friendly objects (resolved coordinates, bounds). Method `buildSceneGraph` is covered by `tests/viewer/sceneGraph.spec.ts`.
- `RevitStylePointerInput.ts` – Middle-button pan / shift-rotate behaviour reminiscent of Revit navigation.

### Data Layer (`src/ntr` & `src/shared`)
- `ntr/lexer.ts`, `parser.ts`, `validation.ts`, `model.ts`, `types.ts` – Parse `.ntr` records into strongly typed structures; multiple parser/validation tests reside in `tests/ntr/*.spec.ts` and `tests/shared/*.spec.ts` for utilities.
- `shared/result.ts` – `ok/err` result type used across parser and app flow; tested via `tests/shared/result.spec.ts`.
- `shared/toast.ts` – Publish/subscribe bus for toasts; consumed by `toastManager.ts` and existing tests indirectly.

## Backend (Rust / Tauri)
- `src-tauri/src/lib.rs` implements commands exposed to the frontend:
  - `open_ntr_file`, `load_ntr_file` – file picker and direct path loader with encoding detection (UTF-8 + Windows-1252 fallback). Returns canonicalised path + contents.
  - `start_file_watch` / `stop_file_watch` – wraps `notify` watcher; emits events back to JS via `AppHandle.emit`. Paths normalised for cross-platform comparisons.
  - `greet` – default Tauri example command (unused in UI but available).
- File watching emits `ntr-file-changed` and `ntr-file-watch-error` events consumed by `fileWatch.ts`.
- Capabilities defined in `src-tauri/capabilities/default.json` (core + opener) are referenced by `src-tauri/tauri.conf.json`.

## Testing & Quality
- **Unit tests:** 11 Vitest suites covering parser, scene graph, shared utilities, file bridge mocks, and new controllers.
- **Linting:** ESLint 9 with TypeScript type-aware rules (see `eslint.config.js`). Offending files (e.g., borrowed Babylon examples) are excluded explicitly (`data/arcRotateCamera.ts`).
- **CI:** `.github/workflows/ci.yml` (verify lint/test and Tauri build). Ensure workflow stays updated when adding new scripts.

## Error Handling
- Parser emits detailed issues (`ParseIssue`) with severity (`warning`/`error`); surfaced in the UI issue panel (see `renderIssues` in `src/app/main.ts`).
- File watch start/stop failures now produce warning toasts (`reportWatchStartFailure`, `reportWatchStopFailure`). Async event handlers use `.catch(...)` to avoid silent rejections.
- Drag-and-drop errors and manual path errors dispatch descriptive toasts via shared helpers.

## Persistence
- `ntr-viewer:last-file-path` – Last successfully loaded file path; cleared if reload fails.
- `ntr-viewer:options` – Rotation/pan sensitivity JSON payload managed via `optionsPanel.ts`.
- `ntr-viewer:telemetry-enabled` – Telemetry preference (`"1"` or `"0"`).

## Known Limitations & TODOs
- High-contrast theme toggle is not yet implemented (placeholder requirement in UX section).
- Telemetry currently logs to console; no backend submission.
- No automated tests for Babylon renderer or Rust commands (opportunities for integration tests or snapshot rendering).
- Options panel does not yet expose additional viewer preferences (grid density, colour presets) – extension point exists via `BabylonRendererOptions` in `viewer.ts`.

## Contribution Notes
- TypeScript strictness enforced; avoid `any` unless justified and documented.
- Controllers follow disposable pattern; when adding new UI wiring, expose `.dispose()` to keep `main.ts` simple.
- Toasts should use `showToast` (or `publishToast(createToast(...))`) to ensure consistent styling/timeout.
- When updating file watchers, verify Vitest suites (`tests/app/fileWatch.spec.ts`, `tests/app/fileDrop.spec.ts`) still assert behaviour.
- Keep `AGENTS.md` in sync with structural changes—this document should be treated as the authoritative architecture reference for automation agents.
