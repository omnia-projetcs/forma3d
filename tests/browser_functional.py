"""Optional browser checks (Python + Playwright installed separately).
Application has no Python or Playwright dependency.
In a headless Linux environment use: xvfb-run -a python tests/browser_functional.py
CHROMIUM_EXECUTABLE may override the system browser path.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, time
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name,condition):
    if not condition: raise AssertionError(name)
    checks.append({'name':name,'ok':True}); print('PASS',name,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE'),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle'])
    context=browser.new_context(viewport={'width':1500,'height':950},accept_downloads=True,locale='fr-FR')
    page=context.new_page();errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    # Injected into about:blank: no HTTP server is used. This does not test
    # file:// origin rules or persistence, which vary by browser policy.
    page.set_content((ROOT/'FORMA3D.html').read_text(),wait_until='load')
    page.wait_for_function('window.FORMA && FORMA.ready')
    check('Initialisation WebGL',page.evaluate('!!FORMA.renderer.gl'))
    page.click('[data-action=welcomeBox]')
    check('Création par le bouton de bienvenue',page.evaluate('FORMA.state.objects.length===1'))
    page.uncheck('#lockRatio');page.fill('#dim0','45');page.locator('#dim0').press('Tab')
    check('Dimensions numériques non uniformes',page.evaluate('Math.abs(FORMA.objectBounds(FORMA.state.objects[0]).size[0]-45)<.001 && FORMA.state.objects[0].scale[1]===1'))
    page.evaluate('FORMA.undo()')
    check('Annuler',page.evaluate('Math.abs(FORMA.objectBounds(FORMA.state.objects[0]).size[0]-30)<.001'))
    page.evaluate('FORMA.redo()')
    check('Rétablir',page.evaluate('Math.abs(FORMA.objectBounds(FORMA.state.objects[0]).size[0]-45)<.001'))
    # Exercise the projected translate gizmo with real pointer events.
    page.evaluate("FORMA.setMode('translate');FORMA.renderer.request()")
    page.wait_for_timeout(100)
    h=page.evaluate("FORMA.handles.find(h=>h.type==='translate'&&h.index===0)")
    rect=page.locator('#viewport').bounding_box()
    start=[h['center'][i]+.7*(h['end'][i]-h['center'][i]) for i in range(2)]
    dx=h['end'][0]-h['center'][0];dy=h['end'][1]-h['center'][1]
    before=page.evaluate('FORMA.state.objects[0].position[0]')
    page.mouse.move(rect['x']+start[0],rect['y']+start[1]);page.mouse.down()
    page.mouse.move(rect['x']+start[0]+dx*.45,rect['y']+start[1]+dy*.45,steps=6);page.mouse.up()
    check('Gizmo déplacement par glissement',abs(page.evaluate('FORMA.state.objects[0].position[0]')-before)>.1)
    # Fresh fixture. The file itself is imported through the actual input.
    page.evaluate('FORMA.state.objects=[];FORMA.state.selected=[];FORMA.update()')
    page.locator('#importInput').set_input_files(str(ROOT/'examples/cube_20mm_binaire.stl'))
    page.click('#doImport');page.wait_for_function('FORMA.state.objects.length===1 && !FORMA.busy')
    check('Import STL binaire par le sélecteur de fichier',page.evaluate('FORMA.state.objects[0].geo.positions.length===108 && FORMA.state.objects[0].param===null'))
    # Surface picking and a real extrusion button.
    page.click('[data-mode=face]');page.wait_for_timeout(100)
    xy=page.evaluate('FORMA.renderer.project([2,1,20]).slice(0,2)');rect=page.locator('#viewport').bounding_box()
    page.mouse.click(rect['x']+xy[0],rect['y']+xy[1]);page.wait_for_function('FORMA.state.face!==null && !FORMA.busy')
    check('Sélection de face plane au clic',page.evaluate('FORMA.state.face.patch.ids.length===2'))
    page.fill('#extrudeDistance','5');page.click('[data-action=extrudeFace]')
    page.wait_for_function('!FORMA.busy && Math.abs(FORMA.objectBounds(FORMA.state.objects[0]).size[2]-25)<.01')
    check('Extrusion positive sur un STL importé',page.evaluate('FG.analyze(FORMA.world(FORMA.state.objects[0])).closed'))
    # Real palette and inspector to create the cutter.
    page.click('[data-shape=cylinder]')
    for selector,value in [('#param_r','3'),('#param_h','60'),('#pos0','0'),('#pos1','0'),('#pos2','15')]:
        page.fill(selector,value);page.locator(selector).press('Tab')
    page.click('[data-action=hole]')
    page.evaluate('FORMA.choose(FORMA.state.objects.filter(o=>o.visible).map(o=>o.id))')
    page.click('[data-action=operations]');page.click('[data-action=compose]')
    page.wait_for_function('!FORMA.busy && FORMA.state.objects.length===3')
    check('Composition solide + perçage dans le worker',page.evaluate('FORMA.state.objects.filter(o=>o.visible).length===1 && FG.analyze(FORMA.world(FORMA.state.objects[2])).closed'))
    check('Sources booléennes conservées et masquées',page.evaluate('FORMA.state.objects.slice(0,2).every(o=>!o.visible)'))
    check('Sources masquées accessibles dans la liste',page.locator('.scene-row.object-hidden:visible').count()==2)
    previous_volume=page.evaluate('FG.analyze(FORMA.world(FORMA.state.objects[2])).volume')
    page.click('[data-action=cut]');page.select_option('#cutKeep','both');page.fill('#cutPosition','12.5');page.click('#doCut')
    page.wait_for_function('!FORMA.busy && FORMA.state.selected.length===2 && FORMA.state.objects.filter(o=>o.visible).length===2')
    check('Découpe en deux parties par le dialogue',page.evaluate('FORMA.state.objects.filter(o=>o.visible).every(o=>FG.analyze(FORMA.world(o)).closed)'))
    volume=page.evaluate('FORMA.state.objects.filter(o=>o.visible).reduce((s,o)=>s+FG.analyze(FORMA.world(o)).volume,0)')
    check('Conservation du volume lors de la découpe',abs(previous_volume-volume)<.1)
    # Download via the export UI; validate downloaded bytes with our independent Node tests too.
    for fmt in ['binary','ascii']:
        page.click('[data-action=export]');page.check('input[name=stlFormat][value='+fmt+']');page.uncheck('#exportUnion')
        with page.expect_download(timeout=5000) as d:page.click('#doExport')
        downloaded=d.value;target=ROOT/'tests'/('ui-export-'+fmt+'.stl');downloaded.save_as(str(target))
        check('Téléchargement export STL '+fmt,target.stat().st_size>84)
    # Union export removes the coincident caps between the two cut parts.
    page.click('[data-action=export]');page.check('#exportUnion')
    with page.expect_download(timeout=5000) as d:page.click('#doExport')
    d.value.save_as(str(ROOT/'tests/ui-export-fused.stl'))
    check('Export fusionné des deux parties', (ROOT/'tests/ui-export-fused.stl').stat().st_size>84)
    # Save a real file, load its serialized state and compare dimensions/flags.
    with page.expect_download(timeout=5000) as d:page.click('[data-action=save]')
    saved=d.value;target=ROOT/'tests/ui-saved.forma3d';saved.save_as(str(target));data=json.loads(target.read_text())
    check('Téléchargement projet .forma3d',data['format']=='forma3d' and len(data['objects'])==5)
    page.evaluate('FORMA.state.objects=[];FORMA.state.selected=[];FORMA.update()')
    page.locator('#projectInput').set_input_files(str(target));page.wait_for_function('FORMA.state.objects.length===5')
    check('Réouverture du fichier projet',page.evaluate('FORMA.state.objects.filter(o=>o.visible).length===2'))
    # Sketch UI with the included editable concave contour.
    page.click('[data-action=sketch]');page.click('#sketchExample');page.fill('#sketchHeight','8');page.click('#doSketch')
    check('Esquisse concave et extrusion via le dialogue',page.evaluate("FORMA.state.objects.at(-1).param.type==='sketch' && FG.analyze(FORMA.state.objects.at(-1).geo).closed"))
    page.evaluate("FORMA.setMode('sculpt')")
    initial=page.evaluate('FORMA.state.objects.at(-1).geo.positions.length')
    page.locator('#inspector [data-action=subdivide]').click();page.wait_for_function('!FORMA.busy')
    check('Subdivision interactive ×4',page.evaluate('FORMA.state.objects.at(-1).geo.positions.length')==initial*4)
    # Real sculpt stroke. Ray-hit is found on the visible mesh, avoiding UI chrome.
    page.evaluate("FORMA.renderer.viewPreset('top');FORMA.renderer.fit([FORMA.state.objects.at(-1)])")
    page.wait_for_timeout(100)
    pt=page.evaluate('''()=>{const r=FORMA.renderer;for(let y=r.h*.3;y<r.h*.7;y+=12)for(let x=r.w*.3;x<r.w*.7;x+=12){const hit=r.pick(x,y);if(hit?.object.id===FORMA.state.objects.at(-1).id)return [x,y];}return null;}''')
    old_positions=page.evaluate('Array.from(FORMA.state.objects.at(-1).geo.positions)')
    rect=page.locator('#viewport').bounding_box();page.mouse.move(rect['x']+pt[0],rect['y']+pt[1]);page.mouse.down();page.mouse.move(rect['x']+pt[0]+22,rect['y']+pt[1]+14,steps=12);page.mouse.up()
    check('Pinceau de retouche sur la surface',page.evaluate('Array.from(FORMA.state.objects.at(-1).geo.positions)')!=old_positions)
    check('Retouche annulable',page.evaluate("FORMA.state.history.at(-1).label.toLowerCase().includes('retouche')"))
    page.evaluate('FORMA.undo()')
    check('Annuler la retouche restaure la géométrie',page.evaluate('Array.from(FORMA.state.objects.at(-1).geo.positions)')==old_positions)
    # Cancellation happens synchronously before a worker response can be delivered.
    result=page.evaluate('''async()=>{const n=FORMA.state.objects.length;const p=FORMA.runJob('analyze',{mesh:FORMA.world(FORMA.state.objects.at(-1))});document.getElementById('cancelJob').click();let rejected=false;try{await p;}catch{rejected=true;}return rejected&&!FORMA.busy&&FORMA.state.objects.length===n;}''')
    check('Annulation worker sans modifier le projet',result)
    # Diagnostic via toolbar; its text must contain the disclaimer too.
    page.evaluate("FORMA.setMode('translate')");page.locator('#inspector [data-action=analyze]').click();page.wait_for_function("document.getElementById('modal').open && !FORMA.busy")
    check('Dialogue diagnostic et limites affichées','auto-intersections' in page.locator('#modalBody').inner_text())
    page.locator('#modalClose').click()
    # Showcase screenshot without notifications.
    page.evaluate('FORMA.state.objects=[];FORMA.state.selected=[];FORMA.update();FORMA.loadDemo();FORMA.renderer.viewPreset("iso");document.getElementById("rightPanel").scrollTop=0;document.getElementById("toastArea").innerHTML="";')
    page.wait_for_timeout(200)
    page.screenshot(path=str(ROOT/'tests/preview-desktop.png'))
    page.set_viewport_size({'width':820,'height':1180});page.evaluate("FORMA.renderer.fit()");page.wait_for_timeout(150)
    check('Interface tablette sans débordement horizontal',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.screenshot(path=str(ROOT/'tests/preview-tablet.png'))
    page.set_viewport_size({'width':390,'height':844});page.evaluate("FORMA.renderer.fit()");page.wait_for_timeout(150)
    check('Interface mobile sans débordement horizontal',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.screenshot(path=str(ROOT/'tests/preview-mobile.png'))
    check('Aucune erreur JavaScript / WebGL',len(errors)==0)
    external=[r for r in requests if r.startswith(('http:','https:'))]
    check('Aucune requête réseau de l’application',not external)
    report={'browser':browser.version,'documentMode':'standalone HTML injected into about:blank','checks':checks,'errors':errors,'external_requests':external,'limitations':['file:// origin policy not tested','IndexedDB persistence not tested on opaque about:blank origin','Firefox, Safari and real touch devices not tested']}
    (ROOT/'tests/browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
print(f'\n{len(checks)} browser checks passed')
