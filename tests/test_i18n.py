"""The single offline application switches languages without losing editing state.

Run: python3 tests/test_i18n.py
Uses the same development-only Playwright/Chrome dependencies as test_tools.py.
"""
import functools
import http.server
import os
from pathlib import Path
import shutil
import tempfile
import threading

from playwright.sync_api import sync_playwright
from test_tools import QuietHandler, ROOT, syntax_checks


def check_switch(browser, url):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: remote.append(request.url)
            if request.url.startswith(('http:', 'https:')) and not request.url.startswith('http://127.0.0.1:') else None)
    page.goto(url + '?lang=FR')
    page.wait_for_function('typeof window.FORMA?.changeLanguage === "function"')
    assert page.evaluate('FORMA.locale') == 'fr'
    assert page.locator('[data-action="undo"]').first.inner_text() == 'Annuler'
    assert page.locator('[data-character="character"]').first.inner_text() == 'Personnage'
    page.evaluate("""() => {
      FORMA.addShape('box'); FORMA.copySelection();
      FORMA.addShape('sphere'); FORMA.undo(); FORMA.addShape('cylinder');
      FORMA.state.objects[0].name='Sphere'; FORMA.state.name='Mon projet FR/EN'; FORMA.update();
      window.languageTestMarker = {};
      window.languageBefore = JSON.stringify(FStore.pack(FORMA.state, false));
      window.clipboardBefore = JSON.stringify(FORMA.clipboardInfo);
    }""")
    worker_error = """async () => {
      try { await FORMA.runJob('import', {buffer:new ArrayBuffer(0),unit:1}, 'Test'); }
      catch (error) { return error.message; }
      throw Error('Invalid STL was accepted');
    }"""
    french_error = page.evaluate(worker_error)
    for locale in ['en', 'fr', 'en']:
        page.locator('#languageSelect').select_option(locale)
        assert page.evaluate('FORMA.locale') == locale
        assert page.evaluate('document.documentElement.lang') == locale
        assert page.evaluate('!!window.languageTestMarker')
        assert page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))===languageBefore')
        assert page.evaluate('JSON.stringify(FORMA.clipboardInfo)===clipboardBefore')
        assert page.locator('[data-action="undo"]').first.inner_text() == ('Annuler' if locale == 'fr' else 'Undo')
        assert page.locator('[data-character="character"]').first.inner_text() == ('Personnage' if locale == 'fr' else 'Character')
        assert page.locator('[data-shape="cylinder"]').first.inner_text().endswith('Cylindre' if locale == 'fr' else 'Cylinder')
        assert page.evaluate('FExtended.specs.ring.h[0]') == ('Épaisseur' if locale == 'fr' else 'Thickness')
        assert page.evaluate('FThread.specs.screw.pitch[0]') == ('Pas du filetage (mm)' if locale == 'fr' else 'Thread pitch (mm)')
        assert page.evaluate('FSketch.PLANES.xy.title') == ('DESSUS' if locale == 'fr' else 'TOP')
        assert page.evaluate('FText.fonts.serif[0]') == ('Avec empattement' if locale == 'fr' else 'Serif')
        page.evaluate('FORMA.materialDialog()')
        assert page.locator('#materialPreset option[value="5"]').inner_text() == ('Acier' if locale == 'fr' else 'Steel')
        page.locator('#modalClose').click()
    assert page.evaluate(worker_error) != french_error
    copy_name = "name => FCopy.instantiate(FCopy.capture([{...FORMA.state.objects[0],name}]),[])[0].name"
    assert page.evaluate(copy_name, 'Sphere copie') == 'Sphere copy'
    # An intentional cancellation is a warning, including a French worker error.
    page.evaluate("""() => {
      FORMA.choose(FORMA.state.objects.map(o=>o.id));
      window.cancelBefore=JSON.stringify(FStore.pack(FORMA.state,false));
      window.cancelDone=false;
      FORMA.booleanAction('union').finally(()=>window.cancelDone=true);
      window.busySwitchRejected=!FORMA.changeLanguage('fr');
      document.getElementById('cancelJob').click();
    }""")
    page.wait_for_function('window.cancelDone')
    assert page.evaluate('window.busySwitchRejected && !document.getElementById("modal").open')
    assert page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))===cancelBefore')
    page.locator('#languageSelect').select_option('fr')
    assert page.evaluate(copy_name, 'Sphere copy') == 'Sphere copie'
    page.evaluate("""() => {
      window.cancelDone=false;
      FORMA.booleanAction('union').finally(()=>window.cancelDone=true);
      document.getElementById('cancelJob').click();
    }""")
    page.wait_for_function('window.cancelDone')
    assert page.evaluate('!document.getElementById("modal").open')
    assert page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))===cancelBefore')
    page.locator('#languageSelect').select_option('en')
    # Clipboard and branch history remain usable after repeated switches.
    nodes_before = page.evaluate('FORMA.state.timeline.nodes.length')
    page.evaluate('FORMA.pasteSelection()')
    assert page.evaluate('FORMA.state.objects.length') == 3
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.timeline.nodes.length') == nodes_before + 1  # Paste branch retained.
    assert page.evaluate('FORMA.state.objects.length') == 2
    page.locator('[data-character="character"]').first.click()
    page.locator('#languageSelect').select_option('fr')
    assert page.evaluate('FORMA.character.studio.space') == 'character'
    assert page.locator('.character-model-heading h2').inner_text() == 'Modèles de personnages'
    assert page.locator('[data-character-model="knight"] .model-name').inner_text() == 'Chevalier'
    assert page.locator('.character-model-library').get_attribute('aria-label') == 'Modèles de personnages'
    page.set_viewport_size({'width': 360, 'height': 800})
    assert page.locator('#languageSelect').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.evaluate('!FORMA.changeLanguage("de")')
    assert page.evaluate('FORMA.locale') == 'fr'
    # Preference survives reopening without a query override.
    page.goto(url)
    page.wait_for_function('window.FORMA?.ready')
    assert page.evaluate('FORMA.locale') == 'fr'
    assert not errors, errors
    assert not remote, remote
    context.close()
    print(f'{url.split(":")[0]}: live FR/EN, project, branches, clipboard, workers, preference and narrow layout passed', flush=True)


def main():
    syntax_checks()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium'), headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            check_switch(browser, f'http://127.0.0.1:{server.server_port}/FORMA3D.html')
            with tempfile.TemporaryDirectory() as directory:
                # Only the HTML is copied: no source, vendor or asset directories.
                path = Path(directory) / 'FORMA3D.html'
                shutil.copyfile(ROOT / 'FORMA3D.html', path)
                check_switch(browser, path.as_uri())
            context = browser.new_context(locale='fr-FR')
            context.add_init_script("Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw Error('Storage disabled')}")
            page = context.new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/FORMA3D.html?lang=invalid')
            page.wait_for_function('typeof window.FORMA?.changeLanguage === "function"')
            assert page.evaluate('FORMA.locale') == 'fr'
            assert '7 personnages' in page.evaluate("FORMA.character.setSpace('character');document.getElementById('welcome').innerText")
            assert page.evaluate('FORMA.changeLanguage("en")')
            page.set_viewport_size({'width': 360, 'height': 800})
            welcome = page.locator('#welcome').bounding_box()
            rail = page.locator('.studio-rail').bounding_box()
            assert welcome['x'] >= rail['x'] + rail['width']
            page.evaluate("FORMA.character.setSpace('piece')")
            assert page.locator('#studioHint').is_hidden()
            assert page.locator('.snap-box').is_visible()
            context.close()
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
