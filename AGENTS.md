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
1. **Foundation & Tooling**
   - Restructure `src/` into feature folders (`src/app`, `src/ntr`, `src/viewer`) and configure path aliases via Vite + TS.
   - Add linting (ESLint + `@typescript-eslint`) and formatting (Biome or Prettier) scripts; install Vitest + `@vitest/ui`.
   - Update `package.json` scripts (`lint`, `format`, `test`, `check`, `tauri:dev`, `tauri:build`).
   - Verification: `npm run lint && npm run test && npm run tauri dev` (confirm starter view loads).

2. **Shared Utilities & Types**
   - Create `src/shared/result.ts` (`Result` helpers), `src/shared/iter.ts` (line iterator utilities), and basic logging/toast abstractions.
   - Define strict TypeScript types for physical units, identifiers, and enumerations referenced by RO/BOG/TEE/ARM/PROF/RED records.
   - Verification: Vitest unit tests for utility helpers (`npm run test`).

3. **NTR Schema Modeling**
   - Establish `src/ntr/model.ts` with domain entities: `NtrFile`, `RunMetadata`, component interfaces for RO/BOG/TEE/ARM/PROF/RED, and issue structures (error vs warning).
   - Add JSON schema-based validation helpers to guard parsed output (runtime `zod` or custom validators).
   - Verification: Type-level checks pass (`npm run check`) and model tests run green (`npm run test`).

4. **Lexer & Core Parser Scaffolding**
   - Implement a resilient line reader that trims comments, normalizes whitespace, and produces token tuples with line numbers.
   - Build a `parseRecord` dispatcher that routes tokens to record-specific handlers, accumulating issues instead of throwing.
   - Verification: Vitest snapshot tests covering neutral happy-path lines and malformed tokens.

5. **Record Parsers (Phase 1)**
   - Implement RO (straight pipe), BOG (bend), RED (reducers), TEE (tee), ARM (valve), PROF (profile) parsers with strict numeric/unit validation and range checks.
   - Cross-validate against `Example.ntr` and spec tables; accumulate issues for unsupported flags.
   - Verification: targeted Vitest suites using fixture-driven tests (`tests/ntr/ro.spec.ts`, etc.).

6. **Record Parsers (Phase 2)**
   - Implement TEE, ARM, and PROF parsing including branch logic and profile metadata.
   - Add composite tests ensuring mixed-record files parse deterministically and issues aggregate correctly.
   - Verification: `npm run test` with scenario fixtures; manual dry run by parsing `/data/Example.ntr` via a temporary CLI (Node script).

7. **File Loading Bridge**
   - Add a Tauri command (`open_ntr_file`) that invokes the file dialog, reads file bytes via Rust, and returns contents (UTF-8) or structured errors.
   - Ensure capability config (`capabilities/default.json`) grants `fs:read` and dialog permissions per Tauri 2 guidelines.
   - Verification: Integration test using `@tauri-apps/api/core.invoke` in Vitest’s Tauri runner (or mocked harness), plus manual `npm run tauri dev`.

8. **In-Memory Scene Graph**
   - Translate parsed components into an intermediate scene representation (`src/viewer/sceneGraph.ts`) describing nodes, transforms, and materials.
   - Encode shared defaults (pipe thickness, colors) and compute bounding boxes for fit-to-view.
   - Verification: Unit tests for geometry metadata (e.g., reducer length calculations), `npm run test`.

9. **Babylon.js Viewer Shell**
   - Initialize Babylon engine within a React-less plain DOM canvas module (`src/viewer/viewer.ts`), wiring ArcRotateCamera, lights, and grid controls.
   - Render primitive meshes for RO/BOG/RED/TEE/ARM/PROF using Babylon builders; implement selection highlight + color-by-type mode.
   - Verification: Manual run (`npm run tauri dev`) inspecting sample file rendering; visual regression aids via screenshot capture script (optional).

10. **UI Integration & Panels**
    - Build toolbar (open file, reset view, color mode dropdown), metadata sidebar, and issues panel with DOM templates (`src/app/ui/*`).
    - Hook keyboard shortcuts (F fit view, R reset, G grid toggle); display parser issues inline.
    - Verification: Playwright or Tauri driver smoke test for key workflows; manual exploratory testing on all three OS targets.

11. **Error Handling & Telemetry Placeholder**
    - Centralize toast/error panel handling; surface all parser/runtime errors with actionable guidance.
    - Implement opt-in telemetry toggle stub conforming to Product Principle #1 (no data sent yet).
    - Verification: Unit tests for error pipeline and UI state; manual toggling during dev run.

12. **Packaging & CI Hooks**
    - Configure GitHub Actions (lint, test, `tauri build --ci`) and platform-specific bundle metadata.
    - Document build/test workflow in `README.md`; prepare SemVer release checklist.
    - Verification: Local dry run `npm run tauri build`; confirm artifacts in `src-tauri/target`.
