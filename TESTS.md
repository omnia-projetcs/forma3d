# FORMA 3D 1.0 validation

Author: Nicolas Hanteville. Development checks performed on 27 September 2026.

[French validation notes](TESTS.fr.md)

## Numerical and localization checks

`npm test` runs **33 numerical/serialization checks** and **6 localization checks**, all passing.

Geometry coverage includes all 11 geometry types (including sketches), primitive closure/orientation/volume, union/subtraction/intersection against known analytical volumes, through-holes, ASCII/binary STL, binary headers beginning with `solid`, inch conversion, invalid files, mirroring, non-uniform transforms and rotation, positive/negative face extrusion, two-way cuts, subdivision, disconnected components, cleaning, rejection of open Boolean inputs, triangle budgets, project serialization and re-drilling the reimported example STL.

Localization checks cover catalogue values, English fallback, unknown messages, French and English geometry errors, persisted language selection, blocked storage and worker errors in both languages.

## Browser workflows

The existing `tests/browser_functional.py` suite passes **30 checks** in French. See `tests/browser-results.json` for the browser version and complete results. WebGL uses SwiftShader in the test environment.

The workflow covers creation, dimensions, undo/redo, gizmo dragging, file-picker import, face picking and extrusion, hole composition in a worker, accessible hidden sources, two-way cuts and volume conservation, ASCII/binary/fused STL downloads, project download/reopening, concave sketches, subdivision, sculpting and undo, worker cancellation and mesh diagnostics.

Desktop (1500 × 950), tablet (820 × 1180) and mobile (390 × 844) layouts are checked. No JavaScript/WebGL errors or HTTP/HTTPS application requests occurred in this standalone HTML injection workflow. Tests combine real mouse/keyboard/dialog interactions with `window.FORMA` state setup and assertions.

`tests/browser_i18n.py` passes **75 checks** and separately checks both `index.html` and `FORMA3D.html` in English and French:

- Initial browser language detection, unsupported-language fallback and French regional locales.
- Persistent language choice across reloads on a local HTTP origin.
- Switching without changing project geometry, names or serialized data.
- Escaping of user names and translated dynamic inspectors, palettes and operation menus.
- Help, author credit, export, cut, sketch and mesh-analysis dialogs.
- Inline sketch validation and actual Web Worker errors in both languages.
- Layout and language-selector access at widths of 1500, 820, 390 and 320 pixels.
- No JavaScript errors or external network requests.
- A real standalone `file://` launch with preference storage deliberately blocked.

Its current results are written to `tests/i18n-browser-results.json`. Screenshots are in `tests/preview-*.png`.

## Independent STL inspection

Previous exported files were also opened with Python `trimesh`, independently of the application parser. See `tests/independent-stl-results.json`.

| File | Result |
|---|---|
| Binary 20 mm cube | 12 triangles, closed, consistent orientation, 8,000 mm³ |
| ASCII 20 mm cube | 12 triangles, closed, consistent orientation, 8,000 mm³ |
| Mounting bracket | 5,286 triangles, closed, consistent orientation, approximately 48,753.814 mm³; bounds 80 × 52 × 47 mm |
| Browser export after union of the cut parts | 1,300 triangles, closed, consistent orientation, approximately 9,295.159 mm³ |

Two browser exports deliberately omit a union between touching parts. Their coordinates, volumes and ASCII/binary representations agree, but they retain internal cut faces and are not manifold as a combined mesh. This is the documented non-union export behaviour. The fused export was checked separately and was closed in that scenario.

## Limits of validation

- The older functional suite injects standalone HTML into `about:blank`; it does not test local-file policy or persistent IndexedDB. The bilingual suite adds a real `file://` launch in Chromium and persistent language preferences over local HTTP. These checks do not establish compatibility with every browser policy.
- Full IndexedDB session restoration between reloads is not covered by the bilingual suite. Explicit project files, download and reopening are covered by the functional suite.
- Firefox, Safari, physical touch devices, GPU context loss, near-limit files and every STL family have not been tested.
- Topological closure does not prove absence of self-intersections, sufficient wall thickness or suitability for manufacturing.

## Reproducing the checks

Numerical and localization checks only require Node.js. Browser checks require Python, Playwright and a Chromium installation in the development environment. `CHROMIUM_EXECUTABLE` can select a system browser; otherwise Playwright uses its installed browser.

```bash
npm test
node build.mjs
python tests/browser_functional.py
python tests/browser_i18n.py
```

The browser test harness uses `--no-sandbox` for isolated automated testing. It is not required for normal application use. None of this test tooling is an editor runtime dependency.
