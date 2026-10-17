"""Geometry and browser regressions for the standalone editions.

Run: python3 tests/test_tools.py
Requires Node, Python Playwright and Chrome/Chromium for development only.
"""
import functools
import http.server
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


CORE_CHECKS = r"""async () => {
  const F = FORMA, checks = [];
  const assert = (value, label) => {if (!value) throw Error(label); checks.push(label);};
  const near = (a,b,t=1e-6) => Math.abs(a-b) < t;
  const box = FG.primitive('box',{w:10,d:20,h:30});
  const record = {id:'box',name:'Box',positions:box.positions,matrix:FM.compose([50,-20,100],FM.qaxis([0,0,1],Math.PI/2),[2,3,4]),material:{name:'Dense',density:2}};
  const physical = await F.runJob('physicalProperties',{records:[record]},'Test');
  assert(near(physical.volume,144000)&&near(physical.mass,288),'scaled volume and mass');
  assert(near(physical.area,21600),'area under non-uniform scaling');
  assert(physical.center.every((v,i)=>near(v,[50,-20,100][i])),'rotated translated center of gravity');
  const unknown = await F.runJob('physicalProperties',{records:[{...record,material:null}]},'Test');
  assert(unknown.mass===null&&unknown.center===null&&unknown.valid,'unassigned density never invents mass');
  const open = {...record,positions:box.positions.slice(9)};
  const invalid = await F.runJob('physicalProperties',{records:[open]},'Test');
  assert(!invalid.valid&&invalid.mass===null&&invalid.center===null,'open mesh rejects physical mass');
  const reversed = box.positions.slice();
  for(let i=0;i<reversed.length;i+=9) for(let j=0;j<3;j++) [reversed[i+3+j],reversed[i+6+j]]=[reversed[i+6+j],reversed[i+3+j]];
  assert(!FTools.physical({...record,positions:reversed}).valid,'inverted mesh rejected');
  const far = FTools.physical({...record,matrix:FM.compose([1e7,-1e7,1e7],[0,0,0,1],[1,1,1])});
  assert(near(far.volume,6000)&&far.center.every((v,i)=>near(v,[1e7,-1e7,1e7][i])),'large translation retains stable local integration');
  const weighted = FTools.physicalSummary([{...record,matrix:FM.identity(),material:{name:'A',density:1}}, {...record,id:'B',matrix:FM.compose([100,0,0],[0,0,0,1],[1,1,1]),material:{name:'B',density:3}}]);
  assert(near(weighted.mass,24)&&near(weighted.center[0],75),'mixed densities weight the center by mass');
  const o=F.makeObject(box,{name:'Seed',position:[10,0,5],material:{name:'PLA',density:1.24},param:{type:'box',args:{w:10,d:20,h:30}}});
  o.construction=FModel.capture([F.makeObject(box,{name:'Input',position:[12,0,5]})],o,'test');
  const input={kind:'circular',axis:2,count:4,angle:360,center:[0,0,5],rotate:true};
  const copies=FTools.pattern([o],[o],input);
  assert(copies.length===3&&near(copies[0].position[0],0)&&near(copies[0].position[1],10),'full circular pattern avoids duplicate endpoint');
  assert(near(copies[2].position[1],-10)&&near(FM.rotate(copies[0].rotation,[1,0,0])[1],1),'circular orientation follows axis');
  const original=FModel.originals(copies[0])[0];
  assert(near(original.position[0],0)&&near(original.position[1],12),'rotated pattern retains construction placement');
  copies[0].param.args.w=99;copies[0].geo.positions[0]+=1;
  assert(o.param.args.w===10&&o.geo.positions[0]!==copies[0].geo.positions[0],'pattern copies own parameters and mesh arrays');
  assert(copies[0].material.density===1.24&&copies[0].material!==o.material,'pattern retains an independent material record');
  const partial=FTools.pattern([o],[o],{...input,count:3,angle:180,rotate:false});
  assert(near(partial[1].position[0],-10)&&partial[0].rotation.every((v,i)=>near(v,o.rotation[i])),'partial arc includes endpoint and can retain orientation');
  const negative=FTools.pattern([o],[o],{...input,count:4,angle:-360});
  assert(near(negative[0].position[1],-10),'negative circular angles');
  const grid={kind:'grid',axis:0,secondAxis:1,count:3,rows:2,step:20,rowStep:-30};
  const gridCopies=FTools.pattern([o],[o],grid);
  assert(gridCopies.length===5&&near(gridCopies[4].position[0],50)&&near(gridCopies[4].position[1],-30),'rectangular grid supports negative spacing');
  const column=FTools.pattern([o],[o],{...grid,count:1,rows:2,step:NaN});
  assert(column.length===1&&near(column[0].position[0],10),'single-column grid ignores unused spacing');
  const other={...o,id:'second',position:[15,5,5]};
  const group=FTools.pattern([o,other],[o,other],{...grid,count:2,rows:1});
  assert(group.length===2&&near(group[1].position[0]-group[0].position[0],5),'multi-object patterns retain relative placement');
  let rejected=false;try{FTools.pattern([o],[o],{...grid,count:300,rows:2});}catch{rejected=true;}
  assert(rejected,'over-budget pattern rejected atomically');
  rejected=false;try{FTools.patternPlan({...grid,secondAxis:0});}catch{rejected=true;}
  assert(rejected,'grid rejects duplicate axes');
  F.commit('fixture',()=>{F.state.objects=[o];F.state.selected=[o.id];});
  const packed=FStore.pack(F.state,false), loaded=FStore.unpack(JSON.parse(JSON.stringify(packed)));
  assert(loaded.objects[0].material.density===1.24,'materials survive project and timeline round trip');
  const legacy=FStore.pack({name:'Legacy',objects:[o]},false);delete legacy.objects[0].material;
  assert(FStore.unpack(legacy).objects[0].material===null,'legacy projects remain readable');
  rejected=false;const corrupt=JSON.parse(JSON.stringify(packed));corrupt.objects[0].material.density=-1;
  try{FStore.unpack(corrupt);}catch{rejected=true;}
  assert(rejected,'invalid saved density rejected');
  for(const axis of [0,1,2]){
    const section=await F.runJob('sectionCaps',{records:[{...record,matrix:FM.identity()}],axis,position:0,above:false},'Test');
    assert(section.caps.length===1&&section.errors.length===0,`section cap on axis ${axis}`);
    const cap=section.caps[0].positions;
    for(let i=axis;i<cap.length;i+=3)if(!near(cap[i],0))throw Error('cap plane mismatch');
  }
  const tube=FG.primitive('tube',{r:10,inner:5,h:20,segments:48});
  const capResult=await F.runJob('sectionCaps',{records:[{...record,positions:tube.positions,matrix:FM.identity()}],axis:2,position:0,above:true},'Test');
  const cap=capResult.caps[0].positions;let area=0;
  for(let i=0;i<cap.length;i+=9){const a=Array.from(cap.slice(i,i+3)),b=Array.from(cap.slice(i+3,i+6)),c=Array.from(cap.slice(i+6,i+9));area+=FM.len(FM.cross(FM.sub(b,a),FM.sub(c,a)))/2;}
  const endArea=FTools.physical({...record,positions:tube.positions,matrix:FM.identity()}).volume/20;
  assert(near(area,endArea,1e-3),'section preserves the tube cavity');
  return checks;
}"""


def syntax_checks():
    for suffix in ['EN', 'FR']:
        html = (ROOT / f'FORMA3D_{suffix}.html').read_text()
        for attrs, code in re.findall(r'<script([^>]*)>(.*?)</script>', html, re.S):
            if 'text/plain' in attrs:
                continue
            with tempfile.NamedTemporaryFile(suffix='.js', mode='w') as file:
                file.write(code)
                file.flush()
                subprocess.run(['node', '--check', file.name], check=True, capture_output=True)


def run_browser_checks(browser, origin, locale):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: remote.append(request.url) if request.url.startswith(('http:', 'https:')) and not request.url.startswith(origin) else None)
    page.goto(f'{origin}/FORMA3D_{locale}.html')
    page.wait_for_function('window.FORMA?.ready')
    checks = page.evaluate(CORE_CHECKS)
    page.evaluate('FORMA.patternDialog()')
    page.locator('#patternKind').select_option('circular')
    page.locator('#patternCenter0').fill('')
    assert page.locator('#createPattern').is_disabled()
    page.locator('#patternCenter0').fill('0')
    page.locator('#patternCount').fill('4')
    page.locator('#createPattern').click()
    assert page.evaluate('FORMA.state.objects.length') == 4
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects.length') == 1
    page.evaluate('FORMA.redo()')
    assert page.evaluate('FORMA.state.objects.length') == 4
    checks.append('pattern UI, validation, undo and redo')
    page.evaluate('FORMA.materialDialog()')
    page.locator('#materialPreset').select_option('5')
    page.locator('#applyMaterial').click()
    assert page.evaluate('FORMA.state.objects.every(o=>o.material.density===7.85)')
    page.evaluate('FORMA.undo()')
    assert page.evaluate('FORMA.state.objects.every(o=>o.material.density===1.24)')
    checks.append('material UI applies atomically and supports undo')
    page.evaluate('FORMA.physicalDialog()')
    assert page.locator('.properties-table tbody tr').count() == 4
    page.locator('#modalClose').click()
    # Keep one solid to verify a real export and the section viewport independently.
    page.evaluate("FORMA.commit('one solid',()=>{FORMA.state.objects=FORMA.state.objects.slice(0,1);FORMA.state.selected=FORMA.state.objects.map(o=>o.id);});FORMA.renderer.fit();")
    before = page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))')
    page.evaluate('FORMA.sectionDialog()')
    page.wait_for_function("document.getElementById('sectionStatus').textContent.includes('unchanged')||document.getElementById('sectionStatus').textContent.includes('inchangée')")
    assert page.evaluate('FORMA.renderer.sectionCaps.length') == 1
    assert before == page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))')
    page.locator('#sectionRange').fill('200')
    page.locator('#sectionRange').dispatch_event('input')
    page.locator('#sectionRange').fill('750')
    page.locator('#sectionRange').dispatch_event('input')
    page.locator('#sectionAbove').check()
    page.wait_for_function('FORMA.renderer.sectionCaps.length===1')
    assert page.evaluate('FORMA.renderer.section.above')
    canvas = page.locator('#viewport').bounding_box()
    page.mouse.move(canvas['x'] + canvas['width'] * .7, canvas['y'] + canvas['height'] * .6)
    page.mouse.down()
    page.mouse.move(canvas['x'] + canvas['width'] * .7 + 40, canvas['y'] + canvas['height'] * .6 + 20, steps=5)
    page.mouse.up()
    assert before == page.evaluate('JSON.stringify(FStore.pack(FORMA.state,false))')
    checks.append('section worker, rapid movement, inversion and orbit leave project unchanged')
    # Export through the actual dialog, while inspection remains active.
    page.evaluate('FORMA.exportDialog()')
    page.locator('#exportUnion').uncheck()
    with page.expect_download() as download:
        page.locator('#doExport').click()
    data = Path(download.value.path()).read_bytes()
    triangles = struct.unpack_from('<I', data, 80)[0]
    assert len(data) == 84 + triangles * 50 and triangles == 12
    bounds = [[], [], []]
    for i in range(triangles):
        vertices = struct.unpack_from('<9f', data, 84 + i * 50 + 12)
        for j, value in enumerate(vertices):
            bounds[j % 3].append(value)
    assert [round(max(v) - min(v), 5) for v in bounds] == [10, 20, 30]
    imported = page.evaluate('(values)=>FG.parseSTL(new Uint8Array(values).buffer,1).bounds.size', list(data))
    assert imported == [10, 20, 30]
    checks.append('STL download remains complete during inspection and reimports correctly')
    page.keyboard.press('Escape')
    assert page.locator('#sectionPanel').count() == 0
    assert page.evaluate('!FORMA.renderer.section && FORMA.renderer.sectionCaps.length===0')
    page.evaluate('FORMA.sectionDialog();FORMA.addShape("cylinder")')
    assert page.evaluate('!FORMA.renderer.section')
    checks.append('section closes on Escape and before geometry edits')
    # Real save/open restores per-object materials and branches.
    with page.expect_download() as download:
        page.evaluate('FORMA.saveProject()')
    saved = Path(download.value.path()).read_text()
    page.evaluate('(text)=>FORMA.loadDocument(FStore.unpack(JSON.parse(text)),"reload",true)', saved)
    assert page.evaluate('FORMA.state.objects[0].material.density===1.24')
    checks.append('actual project save and reopen retain materials')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('FORMA.sectionDialog()')
    panel = page.locator('#sectionPanel').bounding_box()
    assert panel['x'] >= 0 and panel['x'] + panel['width'] <= 391
    page.locator('#foldSection').click()
    assert page.locator('#sectionPanel').bounding_box()['height'] < 75
    assert page.locator('#sectionControls').is_hidden()
    page.locator('#foldSection').click()
    assert page.locator('#sectionControls').is_visible()
    page.keyboard.press('Escape')
    page.evaluate('FORMA.patternDialog()')
    page.locator('#patternKind').select_option('grid')
    assert page.locator('#patternRows').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#modalClose').click()
    checks.append('inspection and pattern controls fit a narrow viewport')
    assert not errors, errors
    assert not remote, remote
    print(f'{locale}: {len(checks)} checks passed, no page errors or remote requests')
    context.close()


def main():
    subprocess.run(['python3', str(ROOT / 'scripts/embed-tools.py'), '--check'], check=True)
    syntax_checks()
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_address[1]}'
    executable = os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for locale in ['EN', 'FR']:
                run_browser_checks(browser, origin, locale)
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
