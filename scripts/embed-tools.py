#!/usr/bin/env python3
"""Embed shared tools in the two standalone HTML files, with no runtime imports."""
import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Check the embedded tools without writing files')
args = parser.parse_args()
model_data = (ROOT / 'src/character-model-data.json').read_text().strip()
core = '\n'.join((ROOT / name).read_text() for name in ['src/tools-core.js', 'src/auto-fillet.js', 'src/character-core.js']) + '\nvar FCharacterModelData = ' + model_data + ';\n' + (ROOT / 'src/character-models.js').read_text()
vendor = ROOT / 'vendor/manifold-3d'
factory = (vendor / 'manifold.js').read_text().replace('import.meta.url', '"file:///forma3d-bundled/manifold.js"').replace('export default Module;', 'return Module;')
wasm = base64.b64encode((vendor / 'manifold.wasm').read_bytes()).decode('ascii')
bootstrap = 'var FManifoldFactory = (()=>{' + factory + '\n})();\n' + '''
var FManifold = (() => {
  let initialized;
  return {get() {
    if (!initialized) initialized = FManifoldFactory({wasmBinary: Uint8Array.from(atob(''' + json.dumps(wasm) + '''), c => c.charCodeAt(0))}).then(module => {module.setup(); return module;});
    return initialized;
  }};
})();
'''
worker = core + '\n' + bootstrap + '\n' + (ROOT / 'src/tools-worker.js').read_text() + '\n' + (ROOT / 'src/character-worker.js').read_text()
previews = json.loads((ROOT / 'src/character-model-previews.json').read_text())['images']
ui = 'const characterModelPreviews = ' + json.dumps(previews, ensure_ascii=False) + ';\n' + (ROOT / 'src/tools-ui.js').read_text() + '\n' + (ROOT / 'src/character-ui.js').read_text()
styles = (ROOT / 'src/tools.css').read_text() + '\n' + (ROOT / 'src/character.css').read_text()
locales = json.loads((ROOT / 'src/tools-locales.json').read_text())

def replace(text, name, content):
    pattern = rf'/\* BEGIN SHARED {name} \*/.*?/\* END SHARED {name} \*/'
    replacement = f'/* BEGIN SHARED {name} */\n{content}\n/* END SHARED {name} */'
    result, count = re.subn(pattern, lambda _: replacement, text, flags=re.S)
    if count != 1:
        raise ValueError(f'Expected one {name} marker, found {count}')
    return result

for locale, suffix in [('en', 'EN'), ('fr', 'FR')]:
    path = ROOT / f'FORMA3D_{suffix}.html'
    text = path.read_text()
    text = replace(text, 'CORE', core + '\nFORMA_WORKER_SOURCE += ' + json.dumps('\n' + worker, ensure_ascii=False) + ';')
    text = replace(text, 'UI', 'const toolText = ' + json.dumps(locales[locale], ensure_ascii=False, indent=2) + ';\n' + ui)
    text = replace(text, 'CSS', styles)
    license_markup = '<script type="text/plain" id="manifoldLicense">\nManifold 3.5.4 — https://github.com/elalish/manifold\n' + (vendor / 'LICENSE').read_text() + '\n</script>\n'
    if 'id="manifoldLicense"' in text:
        text = re.sub(r'<script type="text/plain" id="manifoldLicense">.*?</script>\n', lambda _: license_markup, text, flags=re.S)
    else:
        text = text.replace('</body>', license_markup + '</body>')
    character_license = '<script type="text/plain" id="characterModelsLicense">\n' + (ROOT / 'assets/characters/kaykit/LICENSE.txt').read_text() + '\nSource: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0\nGoblin, Ogre, Dwarf and Elf: FORMA adaptations of the complete KayKit Rogue and Barbarian meshes. See assets/characters/kaykit/adaptations.json and scripts/prepare-character-models.py.\n</script>\n'
    if 'id="characterModelsLicense"' in text:
        text = re.sub(r'<script type="text/plain" id="characterModelsLicense">.*?</script>\n', lambda _: character_license, text, flags=re.S)
    else:
        text = text.replace('</body>', character_license + '</body>')

    if args.check:
        if text != path.read_text():
            raise SystemExit(f'{path.name}: embedded tools are out of date; run scripts/embed-tools.py')
    else:
        path.write_text(text)
    print(path.name + (': up to date' if args.check else ''))
