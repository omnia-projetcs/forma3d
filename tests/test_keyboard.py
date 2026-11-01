"""Real keyboard, clipboard and pointer regressions for both standalone editions.

Run: python3 tests/test_keyboard.py
"""
import functools
import http.server
import os
from pathlib import Path
import shutil
import threading

from playwright.sync_api import sync_playwright
from test_tools import QuietHandler, syntax_checks

ROOT = Path(__file__).resolve().parents[1]


def run_checks(browser, url, locale):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function('window.FORMA?.ready')
    page.locator('[data-shape="box"]').first.click()
    assert page.evaluate('FORMA.state.objects.length') == 1
    page.keyboard.press('r')
    assert page.evaluate('FORMA.state.mode') == 'rotate'

    # A persistent settings checkbox used to swallow every subsequent shortcut.
    page.locator('#snapEnabled').click()
    page.keyboard.press('g')
    assert page.evaluate('FORMA.state.mode') == 'translate'
    before = page.evaluate('FORMA.state.objects[0].position[0]')
    page.keyboard.press('ArrowRight')
    assert page.evaluate('FORMA.state.objects[0].position[0]') == before + 1
    page.keyboard.press('Control+c')
    assert page.evaluate('FORMA.clipboardInfo.count') == 1
    page.keyboard.press('Control+v')
    assert page.evaluate('FORMA.state.objects.length') == 2

    # Cut is reversible, and undo leaves the captured clipboard available.
    cut_id = page.evaluate('FORMA.state.selected[0]')
    page.keyboard.press('Control+x')
    assert page.evaluate('FORMA.state.objects.length') == 1
    page.keyboard.press('Control+z')
    assert page.evaluate('(id)=>FORMA.state.objects.some(o=>o.id===id)', cut_id)
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate('FORMA.state.objects.length') == 1
    page.keyboard.press('Control+v')
    assert page.evaluate('FORMA.state.objects.length') == 2
    assert page.evaluate('(id)=>FORMA.state.selected[0]!==id', cut_id)
    page.keyboard.press('Control+Shift+v')
    assert page.evaluate('FORMA.state.objects.length') == 3

    # Native text selection/cut/paste must not remove a scene object.
    name = page.locator('#projectName')
    name.fill('Keyboard project')
    name.press('Control+a')
    name.press('Control+x')
    assert name.input_value() == ''
    assert page.evaluate('FORMA.state.objects.length') == 3
    name.press('Control+v')
    assert name.input_value() == 'Keyboard project'

    # A keypad value and Enter commit the edit and return focus to the viewport.
    pos = page.locator('#pos0')
    pos.click()
    page.keyboard.press('Control+a')
    # Playwright maps bare Numpad keys to navigation (NumLock off).
    assert pos.evaluate("el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'7',code:'Numpad7',location:3,bubbles:true,cancelable:true}))")
    page.keyboard.type('75')
    assert pos.input_value() == '75', (pos.input_value(),page.evaluate('({active:document.activeElement.id,mode:FORMA.state.mode,gesture:FORMA.gesture})'))
    page.keyboard.press('Enter')
    assert page.evaluate('FORMA.state.objects.find(o=>o.id===FORMA.state.selected[0]).position[0]') == 75
    assert page.evaluate('document.activeElement.id') == 'viewport'
    page.keyboard.press('ArrowLeft')
    assert page.evaluate('FORMA.state.objects.find(o=>o.id===FORMA.state.selected[0]).position[0]') == 74
    page.keyboard.press('Control+c')
    assert page.evaluate('FORMA.clipboardInfo.count') == 1

    # Moving straight from one edited coordinate to another preserves focus.
    page.locator('#pos0').fill('80')
    page.locator('#pos1').click()
    assert page.evaluate('document.activeElement.id') == 'pos1'
    page.keyboard.press('Control+a')
    page.keyboard.type('25')
    page.keyboard.press('Enter')
    assert page.evaluate('FORMA.state.objects.find(o=>o.id===FORMA.state.selected[0]).position.slice(0,2)') == [80,25]
    page.keyboard.press('Delete')
    assert page.evaluate('FORMA.state.objects.length') == 2
    page.keyboard.press('Control+z')
    assert page.evaluate('FORMA.state.objects.length') == 3

    # Modifier shortcuts work while range controls keep their native arrow keys.
    page.evaluate('FORMA.setMode("thin")')
    slider = page.locator('#regionAmountRange')
    slider.focus()
    value = float(slider.input_value())
    page.keyboard.press('ArrowRight')
    assert float(slider.input_value()) == value + 1
    page.keyboard.press('Control+c')
    assert page.evaluate('FORMA.clipboardInfo.count') == 1
    page.keyboard.press('Control+v')
    assert page.evaluate('FORMA.state.objects.length') == 4
    page.keyboard.press('Escape')

    # Empty/failed cuts leave existing geometry and clipboard intact.
    page.evaluate('FORMA.choose([])')
    count = page.evaluate('FORMA.clipboardInfo.count')
    page.keyboard.press('Control+x')
    assert page.evaluate('FORMA.state.objects.length') == 4
    assert page.evaluate('FORMA.clipboardInfo.count') == count

    # Exercise object dragging with actual pointer events, then keyboard copy.
    page.evaluate('''() => {
      const F=FORMA;F.commit('drag fixture',()=>{
        F.state.objects=[F.makeObject(FG.primitive('box'),{position:[0,0,15]})];
        F.state.selected=F.state.objects.map(o=>o.id);
      });F.renderer.fit();
    }''')
    page.wait_for_timeout(100)
    canvas = page.locator('#viewport').bounding_box()
    candidate = page.evaluate('''() => {
      const r=FORMA.renderer;
      for(const point of [[0,-15,22],[15,0,22],[-15,0,22],[0,15,22]]){
        const p=r.project(point);if(r.pick(p[0],p[1]))return p.slice(0,2);
      }
    }''')
    page.mouse.move(canvas['x'] + candidate[0], canvas['y'] + candidate[1])
    page.mouse.down()
    assert page.evaluate('FORMA.gesture?.type') == 'dragObject'
    page.mouse.move(canvas['x'] + candidate[0] + 55, canvas['y'] + candidate[1] + 25, steps=5)
    page.mouse.up()
    assert page.evaluate('FORMA.state.objects[0].position.some((v,i)=>Math.abs(v-[0,0,15][i])>.1)')
    page.keyboard.press('Control+c')
    page.keyboard.press('Control+v')
    assert page.evaluate('FORMA.state.objects.length') == 2

    # Escape releases even a camera gesture (which has no model-history state).
    page.mouse.down(button='right')
    assert page.evaluate('FORMA.gesture?.type') == 'orbit'
    page.keyboard.press('Escape')
    assert page.evaluate('FORMA.gesture') is None
    page.mouse.up(button='right')
    page.keyboard.press('Control+c')
    page.keyboard.press('Control+v')
    assert page.evaluate('FORMA.state.objects.length') == 3
    assert not errors, errors
    print(f'{locale} {url.split(":")[0]}: keyboard, keypad, native text, cut/undo, dragging and gesture cancellation passed')
    context.close()


def main():
    syntax_checks()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    executable = os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for locale in ['FR', 'EN']:
                path = ROOT / f'FORMA3D_{locale}.html'
                for url in [path.as_uri(), f'http://127.0.0.1:{server.server_address[1]}/{path.name}']:
                    run_checks(browser, url, locale)
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
