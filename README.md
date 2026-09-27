# FORMA 3D — local 3D modelling and STL editor

Version 1.0 • English / French interface • HTML, CSS and JavaScript • native WebGL

**Author: Nicolas Hanteville** · [Documentation française](README.fr.md) · [MIT license](LICENSE)

FORMA 3D is a mesh editor with simple parametric shapes, 3D manipulation, Boolean operations, local sculpting and STL import/export. Its workflow is based on assembling volumes. It does not include a B-rep kernel or a mechanical constraint solver.

## Getting started

**Open `FORMA3D.html` in a recent desktop browser with WebGL enabled.** This standalone file includes the code, styles, geometry engine, both languages and the example model. It loads no CDN, remote font or remote model. No account or subscription is required.

The source distribution also includes `index.html`, which loads local files from `src/` and `assets/`. Keep the directory structure intact.

Some browser or enterprise policies restrict workers or storage for local files. In that case, use the optional static server, without installing dependencies:

```bash
cd forma3d
./run.sh
# Open http://127.0.0.1:8080
```

`run.sh` uses an existing Node.js or Python 3 installation. Editing and calculations stay entirely in the browser; the server only serves files over loopback. Nothing is sent to a third-party service.

With Node.js alone:

```bash
node server.mjs
# Alternative port: PORT=8090 node server.mjs
```

Click **Explore an example part** to open a mounting bracket with holes. The example is also available as an STL in `examples/`.

## Languages

Use the **EN / FR** selector in the header to switch languages without reloading or losing your project. On first launch, the editor chooses the first supported browser language, falling back to English. Your choice is saved locally when browser storage is available; switching also works when storage is blocked.

The interface, tooltips, accessibility labels, dialogs, help, notifications, validation errors and worker errors support both languages. New default object names use the current language. Existing project names, object names and imported file names remain unchanged. The project format, STL coordinates and units are independent of the interface language.

The primary README is in English; the [French README](README.fr.md) is maintained alongside it.

## Features

| Area | Features |
|---|---|
| Creation | Box, cylinder, sphere, cone/truncated cone, tube, torus, prism, wedge, rounded plate, decorative gear |
| Sketching | Simple polygon outline, draggable points, grid, Z extrusion, outline editing while the shape remains parametric |
| Manipulation | Single/multiple selection, translation axes, rotation rings, scale handles, numeric input, locked proportions, grid snapping |
| Placement | Centre X/Y, place on ground, alignment, local mirror, duplication, linear arrays |
| Volumes | Union, subtraction, intersection, composition of solids and hole volumes, optional hidden source objects |
| STL | ASCII/binary import, mm/cm/m/inch input units, multiple files, drag and drop, ASCII/binary export of selected or visible solids |
| Mesh editing | Positive/negative extrusion of a planar region, X/Y/Z plane cuts, connected-component separation, ×4 subdivision |
| Sculpting | Inflate, deflate, smooth and flatten brushes; adjustable radius and strength; undoable strokes |
| Inspection | Distance between surface points, bounding dimensions, triangle display, transparency, smooth shading |
| Diagnostics | Triangle/vertex counts, open/non-manifold edges, inconsistent orientation, degenerate triangles, surface area and signed volume |
| Projects | Save/open `.forma3d`, attempted IndexedDB autosave, session undo/redo, PNG view export |

**Clean triangles** removes duplicates and degenerate triangles. **It does not fill holes.** Simplification and geometry smoothing are destructive, so the editor keeps a hidden copy of the original. Visual normal smoothing does not move vertices.

## Editing an STL

1. Click **Import STL**, choose the file and its units. STL has no standardized unit metadata; choosing incorrectly can make a part 10, 25.4 or 1,000 times too large.
2. Adjust **Local dimensions**, **Position** and **Rotation** in the inspector. Dimensions are measured before rotation; view labels show world-space bounds.
3. To extend a planar region, activate **Face**, click its surface, enter a distance and apply. Positive distances add material; negative distances remove it. This does not reconstruct CAD history or edit an original radius feature.
4. To remove half a part or split it, use **Cut**, choose the plane axis and coordinate, then keep one side or create two parts.
5. To drill a hole, add a cylinder, size it and position it through the part, mark it as **Hole**, select both objects with Shift+click, then use **Operations → Compose solids + holes**.
6. Analyze the result, save the editable project and export STL. Check the result in your slicer or manufacturing tool.

For direct subtraction, **the first selected object is the target**. Compose first unions the solids, then subtracts hole volumes.

Preserved source objects stay dimmed in the object list. The eye button makes them visible again. Hidden sources are not exported. A Hole object is only a tool: it removes material only after composition or an export with solid union and hole application enabled.

### Sculpting a surface

Select a part, activate **Sculpt**, choose a brush action and drag over the surface. Brushes move existing vertices. A large triangle without vertices near the brush may appear unresponsive: increase the radius or use **Subdivide ×4**. There is no adaptive remeshing during a stroke. Sculpting can introduce self-intersections; analyze and inspect the result.

### Creating a part from a drawing

Click **Create a 2D sketch**, place at least three vertices and extrude. The outline closes automatically. It may be concave, but cannot intersect itself or contain holes. For a hole, extrude a second outline and subtract it. Sketch constraints and dimensions are not solved automatically.

## Navigation and shortcuts

| Action | Control |
|---|---|
| Selection | Click; Shift+click to add/remove |
| Box selection | Shift+drag the background; selects projected object centres |
| Orbit | Drag the background or use the right mouse button |
| Pan camera | Middle mouse button or Alt+drag |
| Zoom | Scroll wheel; two-finger gesture support |
| View | Top/front/left/right/isometric buttons; orthographic/perspective |
| Move / rotate / scale | G / R / S |
| Face / sculpt / measure | E / B / M |
| Frame | F |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Save / duplicate | Ctrl+S / Ctrl+D |
| Select all / delete | Ctrl+A / Delete |
| Move by steps | Arrow keys; Shift+up/down for Z |

## Saving and privacy

**Export STL** produces triangulated geometry without colours, parameters, named objects or history. **Also keep a `.forma3d` file** to resume editing. This format stores geometry, names, colours, transforms, unfrozen shape parameters, solid/hole state, visibility and locking. Mesh operations freeze the resulting shape’s parameters; source objects can be preserved separately.

Undo/redo history stays in memory for the current session: up to 45 steps, subject to a geometry memory budget. It is not stored in the project file. Camera, grid and brush settings are not persisted. The interface language is stored separately as a browser preference.

IndexedDB autosave is a convenience, not a durable backup. Clearing browser data, changing the origin/directory or restrictive browser settings can make it unavailable. The interface reports this. Explicit project files are your saved backups.

The application makes no calls to AI servers, cloud storage or external APIs. This describes the application code, not the behaviour of browser extensions, browser configuration or browser telemetry.

## Safeguards and limitations

- **Booleans: 80,000 combined triangles per operand pair.** Inputs must be closed and outward-facing. Topologically open results are rejected and project objects stay unchanged. Tangent, nearly coplanar, very thin, very large or self-intersecting inputs may fail. This floating-point engine is not an exact CAD kernel.
- **Files:** at most 100 MiB per STL, 1,200,000 triangles per geometry, 20 STL files per import and 300 objects per project. These are ceilings, not performance guarantees. Use substantially smaller meshes for Booleans and sculpting.
- **Sculpting:** interactive limit of 120,000 triangles; subdivision accepts up to 180,000 input triangles; the interface limits ASCII export to 150,000 triangles. Prefer binary STL.
- **Jobs:** cancellable workers, a 90-second timeout and internal computation budgets. Expensive operations may be rejected before these limits.
- **Quality:** diagnostics do not detect self-intersections, minimum wall thickness or every manufacturing defect. Passing edge checks does not certify printability. Vertex-clustering simplification may change shape and topology.
- **Not included:** STEP/IGES, NURBS, exact B-rep, constraint solving, dependent parametric history, standardized mechanical threads/gears, articulated assemblies, arbitrary edge fillets/chamfers or universal STL repair. The rounded plate is an extruded rounded 2D outline.

Stored vertices use 32-bit floats; intermediate calculations use JavaScript numbers. Topology checks weld by 0.00001 mm quantization; Boolean tolerance depends on part extent. The editor is not a certified metrology tool.

## Project structure and development

```text
FORMA3D.html             ready-to-open standalone distribution
index.html              multi-file entry point
src/shell.html          HTML structure
src/ui.css              responsive interface styles
src/locales.js          English translations keyed by French source messages
src/i18n.js             language selection, persistence and translation helpers
src/app.js              state, commands, history and interaction
src/renderer.js         WebGL rendering, camera and picking
src/math.js             matrices, vectors and quaternions
src/geometry.js         primitives, STL, topology, sketches and sculpting
src/csg.js              BSP, union/subtraction/intersection and checks
src/worker.js           isolated geometry jobs with the selected language
src/storage.js          project format and IndexedDB
assets/worker-source.js generated embedded worker
assets/demo.js          embedded example, no download required
examples/               sample projects and STL files
build.mjs               assembly without npm dependencies
server.mjs / run.sh     optional static server
licenses/               adapted third-party code attribution
tests/                  numerical and browser checks
```

Scripts are classic JavaScript, without runtime ES module imports, for local-file compatibility. Workers are created from a Blob. No framework, bundler, npm package or WebAssembly is required to run the editor.

```bash
npm test                       # numerical, serialization and localization checks
node build.mjs                 # rebuild both HTML entries and embedded worker
node server.mjs                # optional local server
python tests/browser_functional.py  # optional existing browser workflow
python tests/browser_i18n.py    # optional bilingual browser checks
```

`npm run build` and `npm start` are also available. **`npm install` is unnecessary.** Optional browser checks need Python, Playwright and Chromium in the development environment. Set `CHROMIUM_EXECUTABLE` to override the browser path. Test tooling is never loaded by the application.

To add a message, use `FI.t('French source message')` and add its English translation to `src/locales.js`. Keep user text outside translation calls. The static shell is translated before dynamic content is inserted. Both the main thread and workers load the same catalogue. Rebuild the distribution after source changes.

## Validation

See [TESTS.md](TESTS.md) and the reports in `tests/` for the tested scope and limitations. These checks do not constitute industrial validation, complete cross-browser coverage or support for every STL family.

## License and references

Copyright © 2026 **Nicolas Hanteville and FORMA 3D contributors**. Distributed under the MIT license.

The BSP Boolean sequences and plane splitting in `src/csg.js` are adapted from **csg.js by Evan Wallace, copyright 2011, MIT**. The complete notice is in `licenses/csg-MIT.txt` and the standalone distribution. Third-party attribution is preserved.

Technical references for the format and algorithm (no runtime dependencies):

- [Evan Wallace’s csg.js](https://evanw.github.io/csg.js/)
- [csg.js source](https://github.com/evanw/csg.js)
- [Three.js STL exporter documentation](https://threejs.org/docs/pages/STLExporter.html)
- [MDN WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
- [MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
