"""Finished character library, vertex colour persistence and sculpting workflows."""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import struct
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def check(browser, origin, locale):
    context = browser.new_context(viewport={'width':1440, 'height':950}, accept_downloads=True)
    page = context.new_page()
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith((origin, 'blob:', 'data:')) else (external.append(route.request.url), route.abort()))
    page.goto(f'{origin}/FORMA3D_{locale}.html')
    page.wait_for_function('window.FORMA?.character')
    page.locator('[data-character=character]').click()
    assert page.locator('[data-character-model]').count() == 7
    assert page.evaluate('[...document.querySelectorAll(".character-model-card img")].every(i=>i.complete&&i.naturalWidth>0)')
    page.locator('#characterModelCategory').select_option('fighter')
    assert page.locator('[data-character-model]').count() == 1
    page.locator('#characterModelCategory').select_option('monster')
    assert page.locator('[data-character-model]').evaluate_all('(els)=>els.map(e=>e.dataset.characterModel)') == ['goblin','ogre']
    page.locator('#characterModelCategory').select_option('fantasy')
    assert page.locator('[data-character-model]').evaluate_all('(els)=>els.map(e=>e.dataset.characterModel)') == ['dwarf','elf']
    page.locator('#characterModelCategory').select_option('all')
    page.locator('#characterModelSearch').fill('mage')
    assert page.locator('[data-character-model]').count() == 1
    page.locator('#characterModelSearch').fill('no-matching-model')
    assert page.locator('[data-character-model]').count() == 0
    page.locator('[data-character=resetModels]').click()
    page.locator('[data-character-model=knight]').click()
    page.wait_for_function('FORMA.state.objects.length===1&&!FORMA.busy')
    assert page.evaluate('FORMA.state.objects[0].character.template') == 'knight'
    assert page.evaluate('''() => {const o=FORMA.state.objects[0];return o.geo.colors.length===o.geo.positions.length&&o.geo.colors.some(v=>v<.1)&&o.geo.colors.some(v=>v>.8);}''')
    page.evaluate('window.savedColours=FORMA.state.objects[0].geo.colors.slice();window.savedPositions=FORMA.state.objects[0].geo.positions.slice()')
    assert page.evaluate('''() => {
      for(const binary of [false,true]){const packed=FStore.pack(FORMA.state,binary),loaded=FStore.unpack(binary?packed:JSON.parse(JSON.stringify(packed)));if(!loaded.objects[0].geo.colors.every((v,i)=>v===savedColours[i])||loaded.objects[0].character.template!=='knight')return false;}return true;
    }''')
    # Native clipboard clones the palette and undo restores the scene.
    page.evaluate('FORMA.copySelection();FORMA.pasteSelection()')
    assert page.evaluate('FORMA.state.objects[1].geo.colors.every((v,i)=>v===savedColours[i])')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects.length') == 1
    # Masks and a geometry deformation retain the authored palette.
    page.locator('[data-character=invertMask]').click()
    page.locator('[data-character=clearMask]').click()
    assert page.evaluate('FORMA.state.objects[0].geo.colors.every((v,i)=>v===savedColours[i])')
    x, y = page.evaluate('''() => {const F=FORMA,o=F.state.objects[0],b=o.geo.bounds,p=F.renderer.project(FM.point(F.renderer.model(o),[b.center[0],b.center[1],b.min[2]+b.size[2]*.46])),r=document.querySelector('#viewport').getBoundingClientRect();return [r.x+p[0],r.y+p[1]];}''')
    page.mouse.move(x,y)
    page.mouse.down()
    page.mouse.move(x+3,y-2)
    page.wait_for_timeout(25)
    page.mouse.move(x+5,y-3)
    page.mouse.up()
    assert page.evaluate('FORMA.state.objects[0].geo.positions.some((v,i)=>v!==savedPositions[i])')
    assert page.evaluate('FORMA.state.objects[0].geo.colors.every((v,i)=>v===savedColours[i])')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects[0].geo.positions.every((v,i)=>v===savedPositions[i])')
    # Draw indexed palette attributes together with the original wire/grid paths.
    page.evaluate('FORMA.renderer.wire=true;FORMA.renderer.grid=true;FORMA.renderer.render()')
    assert page.evaluate('FORMA.renderer.gl.getError()') == 0
    page.evaluate('FORMA.renderer.wire=false;FORMA.renderer.grid=false;FORMA.renderer.render()')
    for expression in ['FORMA.modifyMesh("subdivide")', 'FORMA.character.applyMesh("loop")']:
        page.evaluate(expression)
        assert page.evaluate('FORMA.state.objects.at(-1).geo.colors.length') == page.evaluate('savedColours.length*4')
        assert page.evaluate('FORMA.state.objects.at(-1).geo.colors.some(v=>v>.8)')
        page.evaluate('FORMA.undo()')
        assert page.evaluate('FORMA.state.objects.length') == 1
    with page.expect_download() as item:
        page.evaluate('FORMA.character.exportGLB()')
    target=Path('/tmp')/f'forma-coloured-{locale}.glb'
    item.value.save_as(target)
    raw=target.read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    gltf=json.loads(raw[20:20+size])
    assert 'COLOR_0' in gltf['meshes'][0]['primitives'][0]['attributes']
    # Inserting another complete model preserves the first one and its placement.
    page.locator('[data-character-model=mage]').click()
    page.wait_for_function('FORMA.state.objects.length===2&&!FORMA.busy')
    assert page.evaluate('FORMA.objectBounds(FORMA.state.objects[1]).min[0]>FORMA.objectBounds(FORMA.state.objects[0]).max[0]')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects.length') == 1
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FORMA.state.objects.length') == 2
    # Every requested fantasy figure passes through the real worker and card.
    for index, key in enumerate(['rogue', 'goblin', 'dwarf', 'elf', 'ogre'], start=3):
        page.locator(f'[data-character-model={key}]').click()
        page.wait_for_function(f'FORMA.state.objects.length==={index}&&!FORMA.busy')
        assert page.evaluate('FORMA.state.objects.at(-1).character.template') == key
        assert page.evaluate('FORMA.renderer.gl.getError()') == 0
    assert page.evaluate('''() => {
      for(const binary of [false,true]){
        const packed=FStore.pack(FORMA.state,binary),loaded=FStore.unpack(binary?packed:JSON.parse(JSON.stringify(packed)));
        if(loaded.objects.length!==7||!loaded.objects.every((o,i)=>o.character.template===FORMA.state.objects[i].character.template&&o.geo.colors.length===o.geo.positions.length))return false;
      }return true;
    }''')
    # The selected ogre exports through the actual STL dialog in millimetres.
    page.evaluate('FORMA.exportDialog()')
    page.locator('#exportUnion').uncheck()
    with page.expect_download() as item:
        page.locator('#doExport').click()
    raw=Path(item.value.path()).read_bytes()
    triangles=struct.unpack_from('<I',raw,80)[0]
    assert len(raw)==84+triangles*50
    imported=page.evaluate('data=>{const g=FG.parseSTL(new Uint8Array(data).buffer,1);return {height:g.bounds.size[2],triangles:g.positions.length/9};}',list(raw))
    assert abs(imported['height']-230)<.001 and imported['triangles']==triangles
    page.evaluate('document.querySelector("#toastArea").replaceChildren()')
    if locale=='FR':
        page.screenshot(path=str(ROOT/'FORMA3D_Character_Preview.png'))
    page.evaluate('document.querySelector("#toastArea").replaceChildren()')
    for width in [1440,768,375]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if width==375:
            page.locator('[data-character=libraryToggle]').click()
        assert page.locator('#characterModelSearch').is_visible()
        page.screenshot(path=f'/tmp/forma-models-{locale}-{width}.png')
    assert not errors, errors
    assert not external, external
    context.close()
    print(f'{locale}: finished models, filters, sculpt/undo, colours, file/autosave, clipboard, GLB, layout and offline checks passed',flush=True)


if __name__=='__main__':
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            for locale in ['FR','EN']:
                check(browser,f'http://127.0.0.1:{server.server_address[1]}',locale)
            browser.close()
    finally:
        server.shutdown()
