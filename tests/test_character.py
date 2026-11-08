"""Character Studio browser workflows on a disposable localhost server.

Run: FORMA_CHROME=/path/to/chrome python3 tests/test_character.py
"""
import functools
import http.server
import os
from pathlib import Path
import shutil
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run_checks(browser, origin, locale):
    context = browser.new_context(viewport={'width': 1440, 'height': 950}, accept_downloads=True)
    page = context.new_page()
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin) or route.request.url.startswith(('blob:', 'data:')) else (external.append(route.request.url), route.abort()))
    page.goto(f'{origin}/FORMA3D.html?lang={locale.lower()}')
    page.wait_for_function('window.FORMA?.character')
    page.locator('[data-character=character]').click()
    page.locator('.character-custom-bases > summary').click()
    page.locator('[data-character=base-head]').first.click()
    page.locator('#charBaseDetail').select_option('32')
    page.locator('#createCharacterBase').click()
    page.wait_for_function('FORMA.state.objects.length===1 && !FORMA.busy')
    assert page.evaluate('FG.analyze(FORMA.state.objects[0].geo).closed')
    assert page.evaluate('FORMA.state.brush.mode') == 'grab'
    assert page.locator('#charRadius').evaluate('(el)=>el.checkValidity()')

    def stroke(dx=18, dy=-8):
        x, y = page.evaluate('''() => {
          const F=FORMA,o=F.state.objects.find(o=>F.state.selected.includes(o.id)),b=o.geo.bounds;
          const p=F.renderer.project(FM.point(F.renderer.model(o),[b.center[0]+b.size[0]*.18,b.center[1],b.min[2]+b.size[2]*.58]));
          const r=document.querySelector('#viewport').getBoundingClientRect();return [p[0]+r.x,p[1]+r.y];
        }''')
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + dx/2, y + dy/2)
        page.wait_for_timeout(25)
        page.mouse.move(x + dx, y + dy)
        page.mouse.up()

    page.evaluate('window.originalPositions=FORMA.state.objects[0].geo.positions.slice()')
    stroke()
    assert page.evaluate('FORMA.character.studio.metrics.averageCandidates<FORMA.character.studio.metrics.vertices')
    assert page.evaluate('FORMA.state.objects[0].geo.positions.some((v,i)=>Math.abs(v-originalPositions[i])>.001)')
    assert page.evaluate('FG.analyze(FORMA.state.objects[0].geo).closed')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects[0].geo.positions.every((v,i)=>v===originalPositions[i])')

    page.locator('[data-character=brush-mask]').click()
    stroke()
    assert page.evaluate('FORMA.state.objects[0].geo.mask?.some(v=>v>0)')
    assert page.evaluate('FORMA.state.objects[0].geo.positions.every((v,i)=>v===originalPositions[i])')
    assert page.evaluate('''() => {
      const packed=FStore.pack(FORMA.state,false),loaded=FStore.unpack(JSON.parse(JSON.stringify(packed)));
      const a=FORMA.state.objects[0].geo.mask,b=loaded.objects[0].geo.mask;
      return b.length===a.length&&b.every((v,i)=>Math.abs(v-a[i])<1/255+.0001);
    }''')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('!FORMA.state.objects[0].geo.mask')
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FORMA.state.objects[0].geo.mask.some(v=>v>0)')
    page.locator('[data-character=clearMask]').click()
    assert page.evaluate('!FORMA.state.objects[0].geo.mask')

    page.locator('[data-character=brush-inflate]').click()
    page.evaluate('FORMA.setMode("translate");FORMA.setMode("sculpt")')
    assert page.evaluate('FORMA.state.brush.mode') == 'inflate'
    page.locator('#charRadius').fill('8')
    page.locator('#charRadius').dispatch_event('input')
    stroke()
    assert page.evaluate('FG.analyze(FORMA.state.objects[0].geo).closed')
    page.locator('#viewport').focus()
    page.keyboard.press('[')
    assert abs(page.evaluate('FORMA.state.brush.radius') - 6.8) < .001
    assert page.locator('#charRadius').evaluate('(el)=>el.checkValidity()')
    page.keyboard.press('Space')
    page.locator('#charCommandSearch').fill('GLB')
    assert page.locator('[data-command]').count() == 1
    page.keyboard.press('Escape')

    # UVs and a real skin survive the native project and are present in GLB.
    page.evaluate('FORMA.character.rigDialog()')
    page.locator('#saveCharacterRig').click()
    page.evaluate('FORMA.character.uvDialog()')
    page.locator('#charUVMode').select_option('spherical')
    page.locator('#modalFoot .primary').click()
    assert page.evaluate('''() => {
      const a=FStore.unpack(JSON.parse(JSON.stringify(FStore.pack(FORMA.state,false))));return a.objects[0].character.bones.length===17&&a.objects[0].character.uv==='spherical';
    }''')
    with page.expect_download() as info:
        page.evaluate('FORMA.character.exportGLB()')
    output = Path('/tmp') / f'forma-character-{locale}.glb'
    info.value.save_as(output)
    assert output.read_bytes()[:4] == b'glTF'
    page.evaluate('window.beforePose=FORMA.state.objects[0].geo;FORMA.character.rigDialog()')
    # Native close events can arrive after the shared dialog was reopened.
    page.evaluate('document.querySelector("#modal").dispatchEvent(new Event("close"))')
    page.locator('#charBone').select_option('1')
    page.locator('#charBoneR2').fill('20')
    page.locator('#charBoneR2').dispatch_event('change')
    page.wait_for_function('FORMA.renderer.previewObject && !FORMA.busy')
    assert page.evaluate('FORMA.state.objects[0].geo===beforePose')
    page.locator('#modalClose').click()
    page.wait_for_function('!FORMA.renderer.previewObject && !FORMA.busy')
    assert page.evaluate('FORMA.state.objects[0].character.bones[1].rotation[2]===0')

    # Build one real quad over the source surface with four pointer clicks.
    page.evaluate('FORMA.character.startRetopo()')
    quad = page.evaluate('''() => {
      const F=FORMA,o=F.state.objects[0],b=o.geo.bounds,r=document.querySelector('#viewport').getBoundingClientRect();
      return [[-.08,.68],[.08,.68],[.08,.77],[-.08,.77]].map(([x,z])=>{const p=F.renderer.project(FM.point(F.renderer.model(o),[b.center[0]+x*b.size[0],b.center[1],b.min[2]+z*b.size[2]]));return [p[0]+r.x,p[1]+r.y];});
    }''')
    for x, y in quad:
        page.mouse.click(x, y)
    page.screenshot(path=f'/tmp/forma-retopo-{locale}.png')
    assert page.evaluate('FORMA.character.studio.retopo.quads.length') == 1, page.evaluate('({r:FORMA.character.studio.retopo,toasts:document.querySelector("#toastArea").innerText})')
    assert page.evaluate('FORMA.state.objects.at(-1).geo.positions.length/9') == 2
    assert page.evaluate('FStore.unpack(JSON.parse(JSON.stringify(FStore.pack(FORMA.state,false)))).objects.at(-1).character.retopology.quads.length') == 1
    page.locator('[data-character=retopoFinish]').click()
    page.evaluate('FORMA.undo();FORMA.choose([FORMA.state.objects[0].id])')

    # A local image is embedded, drawn, saved, restored and excluded from exports.
    page.evaluate('FORMA.character.referenceDialog()')
    import base64
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9U0AAAAASUVORK5CYII=')
    page.locator('#charRef-front').set_input_files({'name': 'reference.png', 'mimeType': 'image/png', 'buffer': png})
    page.wait_for_function('document.querySelector("#charRefPreview-front img")')
    page.locator('#saveCharacterReferences').click()
    assert page.evaluate('''() => {
      const data=FStore.pack(FORMA.state,false),loaded=FStore.unpack(JSON.parse(JSON.stringify(data)));
      return loaded.characterStudio.references.front.data.startsWith('data:image/')&&loaded.timeline.nodes.at(-1).state.characterStudio.references.front.height===170;
    }''')

    # The wall inspection runs in the actual isolated worker.
    assert page.evaluate('''async () => {
      const F=FORMA,b=FG.primitive('box',{w:10,d:10,h:10}),r=await F.runJob('characterThickness',{positions:b.positions,threshold:11},'Test');return Math.abs(r.minimum-10)<.001&&r.thin.length>0;
    }''')
    assert page.evaluate('''async () => {
      const F=FORMA,b=FG.primitive('box',{w:10,d:10,h:10}),r=await F.runJob('characterRemesh',{meshes:[b.positions],resolution:32},'Test');return FG.analyze(FG.geometry(r.positions)).closed;
    }''')
    # Check a smooth subdivision, kept source and undo/redo.
    page.evaluate('''() => {const F=FORMA;const o=F.makeObject(FG.primitive('box',{w:10,d:10,h:10}),{name:'Subdivision source'});F.commit('Box',()=>{F.state.objects.push(o);F.state.selected=[o.id];});}''')
    count = page.evaluate('FORMA.state.objects.length')
    page.evaluate('FORMA.character.applyMesh("loop")')
    assert page.evaluate('FORMA.state.objects.length') == count + 1
    assert page.evaluate('FORMA.state.objects.filter(o=>!o.visible).length') >= 1
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects.length') == count
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FORMA.state.objects.length') == count + 1

    # Narrow layouts keep the workspace switch and inspector accessible.
    before_width = page.locator('#viewport').bounding_box()['width']
    page.locator('[data-character=libraryToggle]').click()
    page.wait_for_function('(w)=>document.querySelector("#viewport").getBoundingClientRect().width>w', arg=before_width)
    page.locator('[data-character=libraryToggle]').click()
    page.locator('[data-character=historyFold]').click()
    assert page.locator('[data-character=historyFold]').get_attribute('aria-expanded') == 'false'
    page.locator('[data-character=historyFold]').click()
    for width in [1440, 768, 375]:
        page.set_viewport_size({'width': width, 'height': 900})
        page.evaluate('FORMA.renderer.fit(FORMA.state.objects.filter(o=>o.visible));FORMA.update()')
        page.screenshot(path=f'/tmp/forma-character-{locale}-{width}.png')
        overflow = page.evaluate('''() => [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(e).position!=='absolute';}).slice(0,12).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right}))''')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width, overflow)
        page.locator('[data-character=character]').is_visible()
        if width == 375:
            page.locator('.toolbar [data-action=rightPanel]').click()
            assert page.locator('#rightPanel').is_visible()
        page.screenshot(path=f'/tmp/forma-character-{locale}-{width}.png')
        if width == 375:
            page.locator('#rightPanel [data-action=rightPanel]').click()
    assert not errors, errors
    assert not external, external
    print(f'{locale}: character creation, brush, mask/history, project, GLB, references, worker, subdivision and responsive checks passed', flush=True)
    context.close()


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium'), headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for locale in ['FR', 'EN']:
                run_checks(browser, f'http://127.0.0.1:{server.server_address[1]}', locale)
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
