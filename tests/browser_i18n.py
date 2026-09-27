"""Bilingual UI checks. Optional Python/Playwright; no application dependencies."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import os, json
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name, condition):
    if not condition: raise AssertionError(name)
    checks.append({'name':name,'ok':True}); print('PASS',name,flush=True)
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE'),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle'])
    for entry in ['index.html','FORMA3D.html']:
      context=browser.new_context(locale='en-GB',viewport={'width':1500,'height':950})
      page=context.new_page();errors=[];requests=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      page.on('request',lambda r:requests.append(r.url))
      page.goto(base+'/'+entry);page.wait_for_function('window.FORMA?.ready')
      check(entry+': browser language detection',page.locator('html').get_attribute('lang')=='en')
      check(entry+': welcome and accessibility labels',page.locator('#welcome h1').inner_text()=='Give shape to your ideas.' and page.locator('#languageSelect').get_attribute('aria-label')=='Language')
      page.select_option('#languageSelect','fr')
      check(entry+': French shell',page.locator('#welcome h1').inner_text()=='Donnez forme à vos idées.' and page.locator('#languageSelect').get_attribute('aria-label')=='Langue')
      page.reload();page.wait_for_function('window.FORMA?.ready')
      check(entry+': saved language survives reload',page.locator('html').get_attribute('lang')=='fr')
      page.click('[data-shape=cylinder]')
      check(entry+': new French names',page.evaluate('FORMA.state.objects[0].name')=='Cylindre')
      page.fill('#objectName','Pièce personnalisée <b> & Cylinder');page.locator('#objectName').press('Tab')
      page.fill('#projectName','Projet personnel français');page.locator('#projectName').press('Tab')
      before=page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))')
      page.select_option('#languageSelect','en')
      check(entry+': switching preserves project geometry and names',page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))')==before)
      check(entry+': dynamic inspector and palette',page.locator('#inspector').inner_text().find('Outer radius')>=0 and 'Cylinder' in page.locator('[data-shape=cylinder]').inner_text())
      check(entry+': names remain escaped',page.locator('.row-name').inner_text()=='Pièce personnalisée <b> & Cylinder' and page.locator('.row-name b').count()==0)
      for language in ['en','fr']:
        page.select_option('#languageSelect',language)
        titles={'en':['Welcome to FORMA 3D','Export STL','Plane cut','Create a 2D sketch','Mesh analysis'],'fr':['Bienvenue dans FORMA 3D','Exporter en STL','Découpe par un plan','Créer une esquisse 2D','Analyse du maillage']}[language]
        for action,title in zip(['help','export','cut','sketch','analyze'],titles):
          page.evaluate('(action)=>FORMA.dispatch(action)',action)
          page.wait_for_function('document.getElementById("modal").open && !FORMA.busy')
          check(f'{entry}: {language} {action} dialog',page.locator('#modalTitle').inner_text()==title)
          if action=='help':check(f'{entry}: {language} author credit','Nicolas Hanteville' in page.locator('#modalBody').inner_text())
          if action=='sketch':
            page.click('#doSketch')
            expected='Draw at least three points.' if language=='en' else 'Dessinez au moins trois points.'
            check(f'{entry}: {language} inline validation',page.locator('#dialogError').inner_text()==expected)
          page.locator('#modalClose').click()
        error=page.evaluate("async()=>{try{await FORMA.runJob('import',{buffer:new ArrayBuffer(0),unit:1})}catch(e){return e.message}}")
        check(f'{entry}: {language} worker error',error==('This file is not a recognized ASCII or binary STL.' if language=='en' else 'Ce fichier n’est pas un STL ASCII ou binaire reconnu.'))
        page.click('[data-action=operations]')
        check(f'{entry}: {language} operations menu',('Compose solids + holes' if language=='en' else 'Composer solides + perçages') in page.locator('#popover').inner_text())
        page.locator('[data-action=operations]').click()
        for width,height in [(1500,950),(820,1180),(390,844),(320,740)]:
          page.set_viewport_size({'width':width,'height':height})
          check(f'{entry}: {language} layout {width}px',page.evaluate('document.documentElement.scrollWidth<=innerWidth') and page.locator('#languageSelect').is_visible() and page.locator('[data-action=help]').bounding_box()['x']+page.locator('[data-action=help]').bounding_box()['width']<=width)
        page.set_viewport_size({'width':1500,'height':950})
      check(entry+': no JavaScript errors',not errors)
      check(entry+': no external requests',all(url.startswith(base) or url.startswith('blob:') for url in requests))
      page.select_option('#languageSelect','en');page.screenshot(path=str(ROOT/'tests/preview-en.png'))
      context.close()
    # Unsupported browser languages fall back to English; French locales are recognized.
    for locale,expected in [('de-DE','en'),('fr-CA','fr')]:
      context=browser.new_context(locale=locale);page=context.new_page();page.goto(base+'/index.html');page.wait_for_function('window.FORMA?.ready')
      check(locale+' detection',page.locator('html').get_attribute('lang')==expected);context.close()
    # A real file URL checks standalone packaging and blocked storage behaviour together.
    context=browser.new_context(locale='en-GB')
    context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked for test')}})")
    page=context.new_page();page.goto((ROOT/'FORMA3D.html').as_uri());page.wait_for_function('window.FORMA?.ready')
    page.select_option('#languageSelect','fr');page.click('[data-shape=cone]')
    check('Standalone file URL and blocked preference storage',page.evaluate("FI.language==='fr' && FORMA.state.objects[0].name==='Cône'"))
    context.close()
    (ROOT/'tests/i18n-browser-results.json').write_text(json.dumps({'browser':browser.version,'checks':checks},ensure_ascii=False,indent=2)+'\n')
    browser.close()
finally:server.shutdown();server.server_close()
print(f'{len(checks)} bilingual browser checks passed')
