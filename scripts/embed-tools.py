#!/usr/bin/env python3
"""Embed shared tools in the two standalone HTML files, with no runtime imports."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Check the embedded tools without writing files')
args = parser.parse_args()
core = (ROOT / 'src/tools-core.js').read_text()
worker = core + '\n' + (ROOT / 'src/tools-worker.js').read_text()
ui = (ROOT / 'src/tools-ui.js').read_text()
styles = (ROOT / 'src/tools.css').read_text()
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
    if args.check:
        if text != path.read_text():
            raise SystemExit(f'{path.name}: embedded tools are out of date; run scripts/embed-tools.py')
    else:
        path.write_text(text)
    print(path.name + (': up to date' if args.check else ''))
