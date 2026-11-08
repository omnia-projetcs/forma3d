"""STL import, independent parts and export regressions in both languages.

Run: python3 tests/test_stl_parts.py
Uses the same development-only Playwright/Chrome dependencies as test_tools.py.
"""
import os
from pathlib import Path
import shutil
import struct
import tempfile

from playwright.sync_api import sync_playwright
from test_tools import syntax_checks

ROOT = Path(__file__).resolve().parents[1]

FIXTURE = r"""({binary=true,one=false}) => {
 const box=FG.transform(FG.primitive('box',{w:10,d:12,h:14}),FM.compose([20,30,10],[0,0,0,1],[1,1,1]));
 const tube=FG.transform(FG.primitive('tube',{r:8,inner:5,h:30,segments:24}),FM.compose([60,30,20],[0,0,0,1],[1,1,1]));
 const sphere=FG.transform(FG.primitive('sphere',{r:6,segments:16}),FM.compose([35,65,12],[0,0,0,1],[1,1,1]));
 const meshes=one?[box]:[box,tube,sphere];
 window.partsFixture=meshes;
 const data=FG.exportSTL(meshes,binary,'assembly');
 return binary?Array.from(new Uint8Array(data)):data;
}"""

RECORDS = """() => FORMA.state.objects.map(o=>({id:o.id,name:o.name,visible:o.visible,hole:o.hole,smooth:o.smooth,color:o.color,material:o.material,bounds:FORMA.objectBounds(o),triangles:o.geo.positions.length/9}))"""


def near(actual, expected, tolerance=2e-4):
    assert len(actual) == len(expected)
    assert all(abs(a - b) <= tolerance for a, b in zip(actual, expected)), (actual, expected)


def import_file(page, binary=True, split=True, center=False, unit='1', one=False):
    data = page.evaluate(FIXTURE, {'binary': binary, 'one': one})
    payload = bytes(data) if binary else data.encode()
    page.locator('#importInput').set_input_files({'name': 'assembly.stl', 'mimeType': 'model/stl', 'buffer': payload})
    page.wait_for_selector('#importSplit')
    assert page.locator('#importSplit').is_checked()
    page.locator('#importSplit').set_checked(split)
    page.locator('#importCenter').set_checked(center)
    page.locator('#importUnit').select_option(unit)
    page.locator('#doImport').click()
    page.wait_for_function('!FORMA.busy && FORMA.state.objects.length > 0 && !document.querySelector("#modal").open')
    return payload


def reset(page):
    page.evaluate("FORMA.commit('Reset fixture',()=>{FORMA.state.objects=[];FORMA.state.selected=[];FORMA.state.keepSources=false;})")


def checks(browser, locale, output):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: remote.append(req.url) if req.url.startswith(('http:', 'https:')) else None)
    page.goto((ROOT / 'FORMA3D.html').as_uri() + '?lang=' + locale.lower())
    page.wait_for_function('window.FORMA?.ready')

    import_file(page)
    parts = page.evaluate(RECORDS)
    assert len(parts) == 3 and len(set(o['id'] for o in parts)) == 3
    for part, center, size in zip(parts, [[20, 30, 10], [60, 30, 20], [35, 65, 12]], [[10, 12, 14], [16, 16, 30], [12, 12, 12]]):
        near(part['bounds']['center'], center)
        near(part['bounds']['size'], size)
    assert page.evaluate('FORMA.state.selected.length') == 3
    # A single undo restores the pre-import scene; redo restores every part.
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects.length') == 0
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FORMA.state.objects.length') == 3

    # Select and move just one part through the inspector.
    page.evaluate('FORMA.objectManager()')
    page.locator(f'#objectManagerRows [data-select="{parts[0]["id"]}"] .row-name').click()
    page.locator('#modalClose').click()
    assert page.locator('.mesh-parts-panel [data-action="splitComponents"]').is_enabled()
    page.screenshot(path=str(output / f'parts-{locale}.png'))
    page.locator('#pos0').fill('25')
    page.locator('#pos0').press('Enter')
    moved = page.evaluate(RECORDS)
    near(moved[0]['bounds']['center'], [25, 30, 10])
    assert moved[1:] == parts[1:]
    page.evaluate('FORMA.undo()')
    near(page.evaluate(RECORDS)[0]['bounds']['center'], [20, 30, 10])

    # Undo restores the import's recorded multi-selection; choose one part again.
    page.evaluate('FORMA.choose([FORMA.state.objects[0].id])')
    # A selected part exports and reimports alone, with the expected binary size.
    page.evaluate('FORMA.exportDialog()')
    assert page.locator('#exportScope').input_value() == 'selected'
    page.locator('#exportUnion').uncheck()
    with page.expect_download() as downloaded:
        page.locator('#doExport').click()
    destination = output / f'part-{locale}.stl'
    downloaded.value.save_as(destination)
    data = destination.read_bytes()
    assert len(data) == 84 + struct.unpack_from('<I', data, 80)[0] * 50
    exported = page.evaluate("data=>{const g=FG.parseSTL(new Uint8Array(data).buffer,1);return {bounds:g.bounds,triangles:g.positions.length/9};}", list(data))
    near(exported['bounds']['center'], [20, 30, 10])
    near(exported['bounds']['size'], [10, 12, 14])
    assert exported['triangles'] == 12

    # Opting out retains one mesh; the prominent button separates it later.
    reset(page)
    import_file(page, split=False)
    assert page.evaluate('FORMA.state.objects.length') == 1
    before = page.evaluate('FORMA.state.timeline.nodes.length')
    original = page.evaluate(RECORDS)[0]
    page.locator('.mesh-parts-panel [data-action="splitComponents"]').click()
    page.wait_for_function('!FORMA.busy && FORMA.state.objects.length===3')
    assert page.evaluate('FORMA.state.timeline.nodes.length') == before + 1
    page.evaluate('FORMA.undo()')
    assert page.evaluate(RECORDS)[0] == original
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FORMA.state.objects.length') == 3

    # Local splitting preserves transforms, role, appearance and material.
    reset(page)
    import_file(page, split=False)
    world_before = page.evaluate("""() => {
      const F=FORMA,o=F.state.objects[0];
      F.commit('Transform',()=>{o.position=[123,-75,40];o.rotation=FM.qaxis(FM.norm([1,2,3]),.65);o.scale=[1.5,.75,2];o.hole=true;o.smooth=true;o.color='#d36c83';o.material={name:'PLA',density:1.24};});
      const key=p=>p.map(x=>x.toFixed(3)).join(',');
      window.vertexKeys=o=>{const p=F.world(o).positions,keys=[];for(let i=0;i<p.length;i+=3)keys.push(key(Array.from(p.slice(i,i+3))));return keys.sort();};
      return vertexKeys(o);
    }""")
    page.evaluate("FORMA.dispatch('splitComponents')")
    after = page.evaluate(RECORDS)
    assert len(after) == 3
    assert all(o['hole'] and o['smooth'] and o['color'] == '#d36c83' and o['material'] == {'name': 'PLA', 'density': 1.24} for o in after)
    assert page.evaluate('FORMA.state.objects.flatMap(vertexKeys).sort()') == world_before
    assert page.evaluate("FStore.unpack(FStore.pack(FORMA.state,false)).objects.length") == 3

    # Hidden-source preference and protection for locked/hidden objects.
    page.evaluate('FORMA.undo();FORMA.state.keepSources=true')
    page.evaluate("FORMA.dispatch('splitComponents')")
    assert page.evaluate('FORMA.state.objects.length') == 4
    assert page.evaluate('FORMA.state.objects.filter(o=>o.visible).length') == 3
    page.evaluate('FORMA.undo();FORMA.state.objects[0].locked=true;FORMA.update()')
    assert page.locator('.mesh-parts-panel [data-action="splitComponents"]').is_disabled()
    page.evaluate('FORMA.state.objects[0].locked=false;FORMA.state.objects[0].visible=false;FORMA.update()')
    assert page.locator('.mesh-parts-panel [data-action="splitComponents"]').is_disabled()

    # ASCII, unit conversion and joint centering retain relative placement.
    reset(page)
    import_file(page, binary=False, unit='10', center=True)
    centered = page.evaluate(RECORDS)
    b = page.evaluate('FORMA.combinedBounds(FORMA.state.objects)')
    near(b['center'][:2], [0, 0])
    near([b['min'][2]], [0])
    near(centered[0]['bounds']['size'], [100, 120, 140])
    near([centered[1]['bounds']['center'][i] - centered[0]['bounds']['center'][i] for i in range(3)], [400, 0, 100])
    # The tube remains one component, including its cavity.
    assert len(centered) == 3

    reset(page)
    import_file(page, one=True)
    before = page.evaluate('FORMA.state.timeline.nodes.length')
    page.locator('.mesh-parts-panel [data-action="splitComponents"]').click()
    page.wait_for_function('!FORMA.busy')
    assert page.evaluate('FORMA.state.timeline.nodes.length') == before
    assert page.evaluate('FORMA.state.objects.length') == 1
    assert ('Découper' if locale == 'FR' else 'Cut') in page.locator('#toastArea').inner_text()

    # Capacity refusal leaves the complete scene and history intact.
    reset(page)
    import_file(page, split=False)
    page.evaluate("""() => {const F=FORMA,source=F.state.objects[0];F.commit('Capacity fixture',()=>{for(let i=1;i<299;i++)F.state.objects.push(F.makeObject(source.geo,{name:'Existing '+i,visible:false}));});}""")
    before = page.evaluate('FORMA.state.timeline.nodes.length')
    page.evaluate("FORMA.dispatch('splitComponents').catch(e=>window.partsError=e.message)")
    assert '300' in page.evaluate('window.partsError')
    assert page.evaluate('FORMA.state.objects.length') == 299
    assert page.evaluate('FORMA.state.timeline.nodes.length') == before

    # The direct command remains reachable in the narrow inspector.
    reset(page)
    import_file(page, split=False)
    page.set_viewport_size({'width': 700, 'height': 900})
    page.locator('[data-action="rightPanel"]').first.click()
    button = page.locator('.mesh-parts-panel [data-action="splitComponents"]')
    button.scroll_into_view_if_needed()
    assert button.is_visible() and button.is_enabled()
    box = button.bounding_box()
    assert box['x'] >= 0 and box['x'] + box['width'] <= 700
    page.screenshot(path=str(output / f'parts-narrow-{locale}.png'))
    assert not errors, errors
    assert not remote, remote
    context.close()
    print(f'{locale}: import, separate, transform, undo/redo, selected STL export and narrow layout passed')


if __name__ == '__main__':
    syntax_checks()
    executable = os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    with tempfile.TemporaryDirectory(prefix='forma-stl-parts-') as temporary, sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for locale in ['FR', 'EN']:
            checks(browser, locale, Path(temporary))
        browser.close()
