# NTR Viewer

Local desktop viewer for ROHR2 Neutral (`.ntr`) piping models. The application parses NTR element
records, converts them to a scene graph, and renders the geometry with Babylon.js within a Tauri
shell. The UI supports file loading, color-mapping, selection inspection, and issue surfacing.

## Prerequisites

- Node.js 20+
- npm 10+
- Rust stable toolchain (via `rustup`)
- System dependencies for Tauri (GTK/WebKit stack on Linux)

## Getting Started

Install dependencies once after cloning the repository:

```bash
npm install
```

Start the desktop application in development mode:

```bash
npm run tauri:dev
```

The viewer launches with an empty scene. Use **Open NTR** to load a file (e.g. `data/Example.ntr`).
Loaded geometry can be inspected directly in the viewport—click elements to review metadata in the
selection panel.

## Available Scripts

| Command                | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Start the Vite dev server (for frontend only)  |
| `npm run tauri:dev`    | Launch the full Tauri desktop experience       |
| `npm run lint`         | ESLint over TypeScript sources                 |
| `npm run check`        | Type-check the project (`tsc --noEmit`)        |
| `npm run test`         | Execute Vitest suites                          |
| `npm run tauri:build`  | Produce release bundles via Tauri              |

Rust checks can be run separately inside `src-tauri`:

```bash
cargo check
```

## Telemetry

Anonymous telemetry is **disabled by default**. Enable it from the toolbar toggle if you want to
log local-only events (currently emitted to the developer console). The setting persists in
`localStorage`.

## Continuous Integration

CI runs on every push and pull request via `.github/workflows/ci.yml`. The workflow executes lint,
type-check, unit tests, `cargo check`, and a Tauri build job to ensure release bundles continue to
compile.

## Sample Data

The repository ships with `data/InterfaceNeutral_e_01.01.md` (specification) and `data/Example.ntr`
for testing. Loading the sample file exercises straight pipes, bends, tees, reducers, arms, and
profiles.
