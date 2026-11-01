"""Automatic outer fillets: analytic geometry and real browser workflows.
Run: python3 tests/test_auto_fillet.py
Development dependencies match tests/test_tools.py; no application dependencies.
"""
import math
import os
from pathlib import Path
import shutil
import struct
import tempfile

from playwright.sync_api import sync_playwright
from test_tools import syntax_checks

ROOT = Path(__file__).resolve().parents[1]

CORE = r"""async () => {
 const assert=(ok,label)=>{if(!ok)throw Error(label);},near=(a,b,t=1e-4)=>Math.abs(a-b)<t;
 const g=FG.primitive('box',{w:30,d:20,h:15}),args={mesh:g.positions,radius:2,scope:'all'},original=Array.from(g.positions);
 const all=await FORMA.runJob('autoFillet',args,'Geometry test'),rounded=FG.geometry(all.positions),report=FG.analyze(rounded);
 assert(all.stats.edgeCount===12&&report.closed&&report.signedVolume>0,'All 12 edges form one closed outward solid');
 assert(original.every((v,i)=>v===g.positions[i]),'Original source array remains unchanged');
 assert(rounded.bounds.size.every((v,i)=>near(v,[30,20,15][i])),'Overall dimensions are preserved');
 let maxError=0,corners=0;
 for(let i=0;i<all.positions.length;i+=3){
  const v=Array.from(all.positions.slice(i,i+3)),q=v.map((x,k)=>Math.max(0,Math.abs(x)-[13,8,5.5][k]));
  maxError=Math.max(maxError,Math.abs(Math.hypot(...q)-2));
  if(q.every(x=>x>.1))corners++;
 }
 assert(corners>100&&maxError<.045,'Edges and three-face corners follow the requested circular/spherical radius');
 const expected=26*16*11+4*(26*16+26*11+16*11)+Math.PI*4*(26+16+11)+4*Math.PI*8/3;
 assert(Math.abs(report.volume-expected)/expected<.001,'Rounded-box volume agrees with the analytic solid');
 for(const axis of [0,1,2])for(const sign of [-1,1]){
  const direction=[0,0,0];direction[axis]=sign;
  const side=await FORMA.runJob('autoFillet',{...args,scope:'side',direction},'Side test'),p=side.positions;
  assert(side.stats.edgeCount===4&&FG.analyze(FG.geometry(p)).closed,'Each of six sides rounds four perimeter edges');
  const half=[15,10,7.5],opposite=-sign*half[axis],others=[0,1,2].filter(k=>k!==axis);
  for(const a of [-1,1])for(const b of [-1,1]){
   const target=[0,0,0];target[axis]=opposite;target[others[0]]=a*half[others[0]];target[others[1]]=b*half[others[1]];
   let found=false;for(let i=0;i<p.length;i+=3)if(target.every((v,k)=>near(v,p[i+k])))found=true;
   assert(found,'The opposite four corners remain sharp and at their original coordinates');
  }
 }
 // A wedge exercises non-right angles without relying on primitive metadata.
 const wedge=FG.primitive('wedge',{w:30,d:20,h:15}),wp=FAutoFillet.plan(wedge,{scope:'all'});
 const wr=await FORMA.runJob('autoFillet',{mesh:wedge.positions,radius:.5,scope:'all'},'Wedge test');
 assert(wr.stats.edgeCount===wp.edges.length&&FG.analyze(FG.geometry(wr.positions)).closed,'Oblique convex edges round together');
 // An ASCII STL goes through the same geometric detector as a primitive.
 const text=FG.exportSTL([g],false,'fixture'),stl=FG.parseSTL(new TextEncoder().encode(text).buffer,1);
 const imported=await FORMA.runJob('autoFillet',{...args,mesh:stl.positions},'STL test');
 assert(imported.stats.edgeCount===12&&FG.analyze(FG.geometry(imported.positions)).closed,'Imported STL rounds without construction history');
 // Independent components in one STL must both be rounded.
 const shifted=FG.transform(g,FM.compose([60,0,0],[0,0,0,1],[1,1,1])),combined=new Float32Array(g.positions.length*2);combined.set(g.positions);combined.set(shifted.positions,g.positions.length);
 const multiple=await FORMA.runJob('autoFillet',{...args,mesh:combined},'Components test');
 assert(multiple.stats.edgeCount===24&&FG.connected(FG.geometry(multiple.positions)).length===2,'Disconnected components retain their placement');
 // Legacy single-edge rounding still works with the refactored clipper.
 const info=FFillet.inspect(g),edge=info.edges.find(e=>!e.reason);
 const single=await FORMA.runJob('fillet',{mesh:g.positions,edge,radius:2},'Single edge test');
 assert(FG.analyze(FG.geometry(single.positions)).closed&&single.stats.radius===2,'Existing manual single-edge fillet works');
 for(const bad of [0,-1,100,NaN]){
  let rejected=false;try{FAutoFillet.run({...args,radius:bad});}catch{rejected=true;}
  assert(rejected,'Invalid or excessive radii are rejected');
 }
 let rejected=false;try{FAutoFillet.plan(FG.geometry(g.positions.slice(9)),{});}catch{rejected=true;}
 assert(rejected,'Open STL is rejected');
 return {volume:report.volume,maxRadiusError:maxError,triangles:report.triangles};
}"""


def wait_preview(page, scope=None, orientation=None):
    expression = '!FORMA.busy && !!FORMA.state.region.preview'
    if scope:
        expression += f' && FORMA.state.region.stats.scope === "{scope}"'
    if orientation:
        expression += f' && FORMA.state.region.stats.orientation === "{orientation}"'
    page.wait_for_function(expression, timeout=60000)


def setup(page, transformed=False):
    page.evaluate("""transformed=>{
      const F=FORMA;F.setMode('translate');
      const o=F.makeObject(FG.primitive('box',{w:30,d:20,h:15}),{name:'Selected part',color:'#52ad9e',material:{name:'PLA',density:1.24},position:[0,0,7.5]});
      if(transformed){o.rotation=FM.qaxis(FM.norm([1,2,3]),.7);o.scale=[1.5,.8,2];o.position=[15,-20,30];}
      const other=F.makeObject(FG.primitive('box',{w:8,d:8,h:8}),{name:'Untouched',position:[60,0,4]});
      F.commit('Fixture',()=>{F.state.objects=[o,other];F.state.selected=[o.id];});F.renderer.fit();
      window.autoOriginal=o.geo;window.otherOriginal=other.geo;
    }""", transformed)


def workflows(browser, locale, output):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: remote.append(req.url) if req.url.startswith(('http:', 'https:')) else None)
    page.goto((ROOT / f'FORMA3D_{locale}.html').as_uri())
    page.wait_for_function('window.FORMA?.ready')
    print(locale, 'geometry:', page.evaluate(CORE), flush=True)
    setup(page)
    before = page.evaluate('FORMA.state.timeline.nodes.length')
    page.locator('[data-action="autoRound"]').click()
    wait_preview(page, 'all')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 12
    assert page.evaluate('FORMA.state.objects[0].geo===autoOriginal&&FORMA.state.objects[1].geo===otherOriginal')
    assert page.evaluate('FORMA.state.timeline.nodes.length') == before
    # A temporary preview cannot enter a project save or STL export.
    assert page.evaluate('FStore.unpack(FStore.pack(FORMA.state,false)).objects[0].geo.positions.length') == 108
    assert page.evaluate('FORMA.state.region.preview.geo.positions.length') > 108
    page.screenshot(path=str(output / f'all-{locale}.png'))
    # Orientation changes invalidate the old preview and combine with one side.
    page.locator('#regionFilletOrientation').select_option('vertical')
    wait_preview(page, 'all', 'vertical')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 4
    page.screenshot(path=str(output / f'vertical-{locale}.png'))
    page.locator('#regionFilletOrientation').select_option('horizontal')
    wait_preview(page, 'all', 'horizontal')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 8
    page.locator('#regionFilletScope').select_option('side')
    page.locator('#regionFilletSide').select_option('x+')
    page.locator('#regionFilletOrientation').select_option('vertical')
    wait_preview(page, 'side', 'vertical')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 2
    page.locator('#regionFilletSide').select_option('z+')
    page.wait_for_function('!FORMA.busy && !!FORMA.state.region.filletError')
    assert 'vertical' in page.locator('.fillet-error').inner_text().lower()
    assert page.evaluate('!FORMA.state.region.preview && FORMA.renderer.previewObject===null')
    assert page.locator('.fillet-panel [data-action="regionApply"]').is_disabled()
    page.locator('#regionFilletOrientation').select_option('horizontal')
    wait_preview(page, 'side', 'horizontal')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 4
    page.locator('#regionFilletScope').select_option('all')
    wait_preview(page, 'all', 'horizontal')
    page.locator('#regionFilletOrientation').select_option('all')
    wait_preview(page, 'all', 'all')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 12
    assert page.evaluate('FORMA.state.timeline.nodes.length') == before

    page.locator('#regionCompare').check()
    assert page.evaluate('FORMA.renderer.previewObject===null')
    page.locator('#regionCompare').uncheck()
    page.locator('#regionFilletRadius').fill('1.5')
    page.locator('#regionFilletRadius').press('Tab')
    page.wait_for_function('!FORMA.busy&&FORMA.state.region.preview&&FORMA.state.region.stats.radius===1.5', timeout=60000)
    page.locator('.fillet-panel [data-action="regionApply"]').click()
    assert page.evaluate('FORMA.state.mode') == 'translate'
    assert page.evaluate('FORMA.state.timeline.nodes.length') == before + 1
    assert page.evaluate('FORMA.state.objects[0].geo!==autoOriginal&&FORMA.state.objects[1].geo===otherOriginal')
    assert page.evaluate('FORMA.state.objects[0].material.density') == 1.24
    assert page.evaluate('FORMA.state.objects[0].color') == '#52ad9e'
    assert page.evaluate('FG.analyze(FORMA.state.objects[0].geo).closed')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects[0].geo===autoOriginal')
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FG.analyze(FORMA.state.objects[0].geo).closed')

    # Export the applied selection and read the actual downloaded STL.
    page.evaluate('FORMA.setMode("translate");FORMA.choose([FORMA.state.objects[0].id]);FORMA.exportDialog()')
    page.locator('#exportUnion').uncheck()
    with page.expect_download() as download:
        page.locator('#doExport').click()
    destination = output / f'rounded-{locale}.stl'
    download.value.save_as(destination)
    data = destination.read_bytes()
    assert len(data) == 84 + struct.unpack_from('<I', data, 80)[0] * 50
    report = page.evaluate('data=>FG.analyze(FG.parseSTL(new Uint8Array(data).buffer,1))', list(data))
    assert report['closed'] and report['signedVolume'] > 0

    # One-side rounding follows object axes after rotation/nonuniform scaling.
    setup(page, transformed=True)
    page.evaluate('FORMA.state.region.filletRadius=1')
    page.locator('[data-action="autoRound"]').click()
    wait_preview(page, 'all')
    page.locator('#regionFilletOrientation').select_option('vertical')
    wait_preview(page, 'all', 'vertical')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 4
    page.locator('#regionFilletOrientation').select_option('horizontal')
    wait_preview(page, 'all', 'horizontal')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 8
    page.locator('#regionFilletOrientation').select_option('all')
    wait_preview(page, 'all', 'all')
    page.locator('#regionFilletScope').select_option('side')
    wait_preview(page, 'side')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 4
    page.locator('#regionFilletSide').select_option('x-')
    wait_preview(page, 'side')
    assert page.evaluate('FORMA.state.region.stats.edgeCount') == 4
    page.screenshot(path=str(output / f'side-{locale}.png'))
    # Oversized radius clears the previous preview and blocks Apply.
    page.locator('#regionFilletRadius').fill('1000')
    page.locator('#regionFilletRadius').press('Tab')
    page.wait_for_function('!FORMA.busy&&!!FORMA.state.region.filletError')
    assert page.evaluate('!FORMA.state.region.preview&&FORMA.renderer.previewObject===null')
    assert page.locator('.fillet-panel [data-action="regionApply"]').is_disabled()
    assert page.evaluate('FORMA.state.objects[0].geo===autoOriginal')
    page.locator('#regionFilletRadius').fill('1')
    page.locator('#regionFilletRadius').press('Tab')
    wait_preview(page, 'side')
    page.locator('#viewport').focus()
    page.keyboard.press('Escape')
    assert page.evaluate('!FORMA.state.region.preview&&FORMA.state.objects[0].geo===autoOriginal')

    # Switch back to choosing one edge and exercise the legacy interaction.
    page.locator('#regionFilletScope').select_option('edge')
    assert page.locator('#regionFilletEdge').is_visible()
    edge_value = page.locator('#regionFilletEdge option').nth(1).get_attribute('value')
    page.locator('#regionFilletEdge').select_option(edge_value)
    wait_preview(page)
    assert page.evaluate('FORMA.state.region.filletScope') == 'edge'
    assert page.evaluate('FORMA.state.region.stats.radius') == 1

    # Narrow-screen controls fit; Apply can be reached from the HUD.
    setup(page)
    page.set_viewport_size({'width': 700, 'height': 900})
    page.evaluate('FORMA.state.region.filletRadius=1;FORMA.state.region.filletScope="all";FORMA.setMode("round")')
    wait_preview(page, 'all')
    page.locator('[data-action="rightPanel"]').first.click()
    page.locator('#regionFilletScope').select_option('side')
    wait_preview(page, 'side')
    page.locator('.fillet-panel').scroll_into_view_if_needed()
    page.screenshot(path=str(output / f'narrow-{locale}.png'))
    box = page.locator('#regionFilletRadius').bounding_box()
    assert 0 <= box['x'] and box['x'] + box['width'] <= 700
    assert page.locator('#regionHud [data-action="regionApply"]').is_enabled()
    page.locator('#regionHud [data-action="regionApply"]').click()
    assert page.evaluate('FG.analyze(FORMA.state.objects[0].geo).closed')

    # Protected objects cannot start the operation from the inspector.
    page.evaluate('FORMA.setMode("translate");FORMA.state.objects[0].locked=true;FORMA.update()')
    assert page.locator('[data-action="autoRound"]').is_disabled()
    assert not errors, errors
    assert not remote, remote
    context.close()
    print(locale + ': preview, radius, sides, manual edge, apply/undo, STL export and mobile layout passed', flush=True)


if __name__ == '__main__':
    syntax_checks()
    executable = os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    with tempfile.TemporaryDirectory(prefix='forma-auto-fillet-') as temporary, sync_playwright() as playwright:
        output = Path(os.environ.get('FORMA_QA_DIR', temporary))
        output.mkdir(parents=True, exist_ok=True)
        browser = playwright.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for locale in ['FR', 'EN']:
            workflows(browser, locale, output)
        browser.close()
