# IFClite Desktop

A Tauri v2 desktop shell for [IFClite](https://ifclite.dev/docs/guide/desktop/).

- **Windows (this PC):** clone [ShobhitSuthar03/ifclite](https://github.com/ShobhitSuthar03/ifclite) with Git. Then `git pull` whenever the app changes. Do **not** re-download a zip from Cursor Codebase.
- **Cursor agents / Origin:** [shobhit-suthar/ifclite-tauri-desktop](https://cursor.com/codebase/shobhit-suthar/ifclite-tauri-desktop) (Origin CLI is WSL / macOS / Linux only).

The same React viewer runs in the browser (WASM geometry) and as a native Tauri app (Rayon + packed-shard cache).

## Local setup (Windows)

### 1. Clone once from GitHub (PowerShell)

Install [Git for Windows](https://git-scm.com/download/win) if needed. Git Credential Manager may ask for a GitHub username (`ShobhitSuthar03`) and a **Personal Access Token** (not your GitHub website password), or a browser Sign in.

```powershell
cd C:\Projects
git clone https://github.com/ShobhitSuthar03/ifclite.git
cd ifclite
```

Keep this folder. Later updates:

```powershell
cd C:\Projects\ifclite
git checkout main
git pull
npm install
```

Or: `powershell -File scripts\update.ps1`

A Codebase **Download** is a snapshot without Git history, so you cannot `git pull` it. Clone GitHub instead of downloading again.

### 2. First run — browser preview (no Rust)

Needs [Node.js 22+](https://nodejs.org/). From the repo folder (WSL or PowerShell):

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43127 → **Load sample**. The badge should say **Web WASM**. This is the fastest way to confirm the clone works.

### 3. Native window — Tauri (optional, after the preview works)

On **Windows (PowerShell)**, not WSL, install [Tauri v2 Windows prerequisites](https://v2.tauri.app/start/prerequisites/):

- Microsoft C++ Build Tools (MSVC)
- WebView2
- [Rust](https://rustup.rs/) **1.88+** (`rustup update stable`)

Then from the same repo folder:

```powershell
npm install
npm run dev:desktop
```

The badge should say **Desktop**. First compile of `ifc-lite-processing` can take several minutes.

### Optional: Origin CLI (WSL / macOS / Linux only)

PowerShell cannot run `origin repo clone`. If you use WSL:

```bash
curl -fsSL https://downloads.cursor.com/origin/install.sh | sh
origin auth login
origin repo clone shobhit-suthar/ifclite-tauri-desktop
```

On **WSL** instead of native Windows for Tauri, install Linux WebKitGTK deps, then `npm run dev:desktop`:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf pkg-config
npm run dev:desktop
```

## What the docs miss

The [Building for Desktop](https://ifclite.dev/docs/guide/desktop/#host-command-contract-tauri) page lists command *names*. The live `NativeBridge` in `@ifc-lite/geometry` is stricter. This shell follows the TypeScript, not just the table.

### Commands (`invoke`)

| Command | Arguments | Result |
|---|---|---|
| `get_geometry` | `{ buffer: number[] }` | `{ meshes, totalVertices, totalTriangles, coordinateInfo }` |
| `get_geometry_from_path` | `{ path }` | same |
| `get_geometry_streaming` | `{ buffer }` | `GeometryStats` (batches arrive as events) |
| `get_geometry_streaming_from_path` | `{ path, cacheKey, preferPackedShards }` | `GeometryStats` |
| `get_native_geometry_cache_manifest` | `{ cacheKey }` | manifest or `null` |
| `get_native_geometry_cache_packed_shard` | `{ cacheKey, shardIndex }` | packed shard bytes (`IFCB` magic `0x49464342`) |
| `get_native_geometry_cache_stream_status` | `{ cacheKey }` | status or `null` |

Extra host commands used by this UI: `hash_ifc_path`, `read_ifc_bytes`.

### Events (`listen`) — docs are incomplete

| Event | Used by NativeBridge |
|---|---|
| `geometry-packed-batch` | yes (documented) |
| `geometry-color-update` | yes (documented) |
| `geometry-batch` | yes (mesh-array fallback, **not documented**) |
| `native-shard-ready` | yes (packed-shard path, **not documented**) |

Path streaming **requires** a `cacheKey`. NativeBridge throws if it is missing. Cache shards are binary, not JSON; the decoder lives in `@ifc-lite/geometry`.

Payloads are camelCase. Mesh arrays use `{ expressId, ifcType?, positions, normals, indices, color }`. Coordinate info uses `{ originShift, originalBounds, shiftedBounds, hasLargeCoordinates }`.

## Other commands

```bash
npm run build            # web bundle
npm run build:desktop    # native installer
npm run test:native      # Rust host-contract tests
```

## Layout

```
src/                 React viewer (Three.js, shadcn-style UI)
src-tauri/src/       Host commands wrapping ifc-lite-processing
public/sample.ifc    Two-wall IFC2X3 fixture
```

`GeometryProcessor` is constructed with `preferNative: true`. That flag only activates when `isTauri()` is true; the web preview always stays on WASM.

The web engine is a **4.2 MB WASM binary**. This shell starts `processor.init()` as soon as the page loads so fetch + compile overlap empty-state idle time. Opening a file no longer waits on a cold engine unless you click Sample before that warmup finishes.

## Viewer orientation

WASM `MeshData` is already **WebGL Y-up** (the IFC Z-up → Y-up swap happens in MeshDataJs). The viewer follows the [Three.js integration tutorial](https://ifclite.dev/docs/tutorials/threejs-integration/): add meshes as-is, fold `mesh.origin` into `mesh.position`, `DoubleSide` materials, and Three.js `OrbitControls` (left orbit, middle/right pan, wheel zoom). Do not apply an extra `rotation.x = -π/2` — that lays the building on its side.

Native `ifc-lite-processing` meshes are still IFC Z-up. The loader converts them with the same `[x, y, z] → [x, z, -y]` swap before they reach the scene.

Geometry streams in parallel with `@ifc-lite/parser`. The **Structure** panel is Project → Site → Building → Storey (search + two-way selection). The **Properties** panel shows GlobalId, attributes, property sets, and quantities. Hover highlights elements; Escape clears the selection. Large-coordinate models surface an RTC shift in the status bar.

The **Filters** tab uses `@ifc-lite/query` (`IfcQuery`) to isolate a scoped set in 3D: pick a type or storey first, then add property clauses (`whereProperty`). Presets cover walls, external / load-bearing walls, fire rating, and `NetSideArea > 10`. Non-matching meshes dim; picking only hits the isolated IDs. The **Breakdown** tab groups that same result set by IFC type, storey, name, `IsExternal`, or `FireRating`. Property filters are never run on `query.all()` for STEP files — scope with type or storey first. DuckDB SQL is not included.

On desktop, drag the vertical splitters to resize the left and right docks (220–560px). Double-click a splitter to restore the defaults (320 / 340). Widths persist in `localStorage`. The 3D view only redraws when the camera, selection, hover, or layout actually changes — it does not run a continuous 60fps loop.

**Dark / Light** in the header switches the chrome and the 3D viewport. The choice is stored as `ifclite.theme`.

**CSV** lives on the right **Export** tab and uses `GeometryProcessor.exportCsv` from the [exporting guide](https://ifclite.dev/docs/guide/exporting/): tables `entities` (optional flattened `Pset_Prop` columns), `properties`, `quantities`, and `spatial`; comma / semicolon / tab delimiters. Scope **All** writes the full table; **Isolated** keeps the current query set (spatial rows keep parent nodes); **Visible** keeps elements shown at full opacity; **Selected** keeps the clicked element. The Rust exporter does not take an isolation set for CSV, so those scopes filter rows after export. Formula-injection quoting is preserved. Native Tauri geometry still uses WASM for CSV.

## Notes from the IFClite guide

- Native tessellation does **not** consume `tessellationQuality` yet.
- Native output is already site-local; this host still fills `coordinateInfo` bounds for the frontend.
- Large models should use path + cache commands so IFC bytes never cross JS IPC.
