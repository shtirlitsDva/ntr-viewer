# NTR Viewer Agent Notes

## Project Summary
- **Title**: Local desktop viewer for ROHR2 NTR piping files  
- **Goal**: Enable piping engineers to open `.ntr` files offline and inspect a shaded 3D piping system with selection, coloring, and issue reporting.
- **Platforms**: Windows, macOS, Linux (via Tauri bundle)
- **Primary References**: `InterfaceNeutral_e_01.01.md` (spec), `Example.ntr` (sample input)

## Tech Stack & Tooling
- **Frontend**: Vite 6 + TypeScript 5.6 (strict bundle mode) with vanilla DOM entry in `src/main.ts`; styles live in `src/styles.css`.
- **Runtime Bridge**: Tauri 2.9 (`@tauri-apps/api` 2.9) with the default Tauri global enabled for desktop targets.
- **Backend (Rust)**: Rust edition 2021 with `tauri` 2.x, `tauri-plugin-opener` 2.x, and serde for JSON-friendly commands (`src-tauri/Cargo.toml`).
- **Tooling**: `npm` workflows (`npm run dev`, `npm run tauri dev`, `npm run build`), Vite dev server on port 1420, and Tauri CLI 2.9 for build/bundle tasks.
- **Configuration**: `tsconfig.json` enforces `strict` mode; `src-tauri/tauri.conf.json` uses the Tauri 2 schema with capability-based permissions (`src-tauri/capabilities/default.json`).

## Architectural Layout
- `src/main.ts`: bootstrap script wiring DOM events to the `greet` Tauri command via `@tauri-apps/api/core.invoke`.
- `src/styles.css`, `src/assets/`: baseline UI styling and static assets used by the starter view.
- `src-tauri/src/lib.rs`: defines the Rust command surface (`greet`) and registers plugins before launching the app; `src-tauri/src/main.rs` delegates to this library entrypoint.
- `src-tauri/Cargo.toml`, `build.rs`: Rust workspace configuration and Tauri build script hook.
- `src-tauri/capabilities/default.json`: declares the desktop capability set (core + opener permissions) consumed by `tauri.conf.json`.
- `src-tauri/icons/`: cross-platform application icons referenced by the bundle metadata in `tauri.conf.json`.

## Product Principles & Constraints
1. Ship smallest working viewer first; guard against scope creep.
2. Deterministic builds (Node 18+, Rust stable).
3. Strict TypeScript, no `any`, `strict: true`, `noUncheckedIndexedAccess: true`.
4. Single-responsibility modules with TSDoc for public API (pending).
5. Fast feedback: unit tests for parsing/geometry; visual smoke scene.
6. Reproducible issues with minimal NTR samples.
7. No silent failures; surface all user-visible errors via toast/panel.

### Security & Privacy
- Offline by default, local file access only.
- Optional telemetry (off by default) with anonymized counts.

### Performance Targets
- ≤100k triangles at ≥30 FPS (mid laptop).
- Open-to-frame ≤2s for 5k elements.
- Memory ≤1.5 GB.

### Accessibility & UX
- Keyboard: Orbit/pan/zoom reset (R), fit-to-view (F).
- High-contrast theme option (not yet implemented).
- Error panel lists invalid tokens with line numbers.

### Release & Versioning
- SemVer, CI via GitHub Actions; Tauri bundler for installers.
- Commits follow Conventional Commits; PRs require green CI.

## Implementation Plan
1. **Foundation & Tooling** ✅  
   Folder restructure, path aliases, ESLint+Vitest tooling, and package scripts are in place. `npm run lint`, `npm run test`, and `npm run tauri:dev` verify the dev loop.

2. **Shared Utilities & Types** ✅  
   Result helpers, iterators, toast/logging primitives, and strict branded types implemented with accompanying unit tests.

3. **NTR Schema Modeling** ✅  
   `src/ntr/model.ts` and `validation.ts` provide typed entities and Zod validation; `npm run check` and tests cover the data layer.

4. **Lexer & Core Parser Scaffolding** ✅  
   Line tokeniser and record dispatcher implemented; lexer tests ensure comment/quote handling and error aggregation.

5. **Record Parsers (Phase 1)** ✅  
   RO/BOG/RED/TEE/ARM/PROF parsing with validation, exercised by focused Vitest suites.

6. **Record Parsers (Phase 2)** ✅  
   Mixed-record parsing validated via example fixture; issues surfaced without hard failure.

7. **File Loading Bridge** ✅  
   Tauri command returns file path + contents, capability updated, and mocks tested in Vitest.

8. **In-Memory Scene Graph** ✅  
   `buildSceneGraph` converts parsed data and computes bounds; unit test covers element conversion.

9. **Babylon.js Viewer Shell** ✅  
   Viewer renders polylines, supports color modes, selection highlighting, grid toggle, and fit/reset behavior.

10. **UI Integration & Panels** ✅  
    Toolbar actions, keyboard shortcuts, selection/issue panels, toasts, and telemetry toggle wired to state.

11. **Error Handling & Telemetry Placeholder** ✅  
    Toast bus and telemetry stub persist user choice, surfacing parse/runtime outcomes.

12. **Packaging & CI Hooks** ✅  
    GitHub Actions workflow runs lint/test/check/cargo/tauri build; README documents workflow; `npm run tauri:build` confirmed bundles (.deb/.rpm/.AppImage).
