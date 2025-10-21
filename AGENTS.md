# NTR Viewer Agent Notes

## Project Summary
- **Title**: Local desktop viewer for ROHR2 NTR piping files  
- **Goal**: Enable piping engineers to open `.ntr` files offline and inspect a shaded 3D piping system with selection, coloring, and issue reporting.
- **Platforms**: Windows, macOS, Linux (via Tauri bundle)
- **Primary References**: `InterfaceNeutral_e_01.01.md` (spec), `Example.ntr` (sample input)

## Tech Stack & Tooling
- **Frontend**: Tauri + Vite + TypeScript (strict, `noUncheckedIndexedAccess`), Babylon.js for rendering.
- **Backend (Tauri)**: Rust stable (`rust-toolchain.toml`).
- **Formatting / Linting**: Biome (`biome.json`), ESLint (`@typescript-eslint`).
- **Testing**: Vitest planned (`/tests` folder reserved) — currently absent.
- **Node**: v18+ with `package-lock.json` committed for deterministic builds.
- **Key Scripts** (`package.json`): `dev` (tauri dev), `build` (tauri build), `check` (tsc --noEmit), `lint`, `format`, `preview`.

## Architectural Layout
- `app/main.ts` bootstraps UI via `bootstrapApp`.
- `app/ui/` contains Vanilla DOM UI scaffolding (`app-bootstrap.ts`, `styles.css`) implementing toolbar, drag/drop, keyboard shortcuts, side panels, issue reporting.
- `app/ntr/`:
  - `model.ts`: Strongly typed domain models for NTR metadata, components, issues.
  - `parser.ts`: Line-oriented parser with nominal-diameter registry, issue tracking, deterministic error handling.
  - `result.ts`: Minimal `Result` helper utilities (`ok`, `err`, `map`, `flatMap`).
- `app/geo/builders.ts`: Babylon mesh builders for straight pipes, reducers, bends (Bezier sweep), and tees.
- `app/render/viewer.ts`: Babylon scene orchestration (ArcRotateCamera turntable, grid, highlighting, coloring modes, selection propagation).
- `src-tauri/src/main.rs`: Minimal Tauri bootstrap placeholder.
- Planned directories per brief (present but mostly empty): `/tests` (missing), `app/assets/samples/` (contains sample `.ntr` files).

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
- Keyboard: Orbit/pan/zoom reset (R), fit-to-view (F), toggle grid (G).
- High-contrast theme option (not yet implemented).
- Error panel lists invalid tokens with line numbers.

### Release & Versioning
- SemVer, CI via GitHub Actions; Tauri bundler for installers.
- Commits follow Conventional Commits; PRs require green CI.

## Current Observations (2024-XX repo snapshot)
- Parser supports GEN/AUFT/DN/RO/RED/BOG/TEE records with issue aggregation; unknown records downgraded to warnings.
- Viewer wiring present: selection highlight, color modes (`type`, `material`, `loadCase`, `group`, `diameter`), grid toggle, fit/reset, drag/drop, toolbar.
- Geometry builders generate Babylon tubes/cones; reducers use `radiusFunction`, bends use quadratic Bezier path.
- Issue/sum/selection panels display metadata and component details.
- No tests yet, no high-contrast theme, telemetry placeholder, and `/tests` directory missing.
- `src-tauri` side currently stub-only; file read via Tauri FS API in UI.

## Backlog / Follow-Ups
1. Implement Vitest suites for parser and geometry to satisfy fast-feedback principle.
2. Integrate Babylon scene smoke-test or snapshot harness.
3. Add unified error toast/panel styling (per principle 7).
4. Flesh out Tauri commands for file dialogs/telemetry toggle as future work.
5. Implement high-contrast theme toggle and persist state.

