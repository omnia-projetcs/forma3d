"""Geometry and real drag regressions for automatic object alignment.

Run: python3 tests/test_alignment.py
"""
import os
from pathlib import Path
import shutil

from playwright.sync_api import sync_playwright
from test_tools import syntax_checks

ROOT = Path(__file__).resolve().parents[1]

CORE = """() => {
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const bounds=(center,size)=>({center,size,min:center.map((v,i)=>v-size[i]/2),max:center.map((v,i)=>v+size[i]/2)});
 const source=bounds([0,0,10],[20,20,20]),target={id:'target',bounds:bounds([50,35,10],[30,20,20])};
 const project=p=>p.map(v=>v*4),align=(raw,axes=[0],previous=[],zoom=4)=>FMove.align(source,[target],raw,axes,p=>p.map(v=>v*zoom),previous);
 let r=align([24,0,0]);assert(r.delta[0]===25&&r.guides[0].sourceAnchor==='max'&&r.guides[0].targetAnchor==='min','Opposite edges snap into contact');
 r=align([49,0,0]);assert(r.delta[0]===50&&r.guides[0].sourceAnchor==='center','Centers align');
 assert(align([44,0,0]).delta[0]===45,'Minimum edges align');
 assert(align([54,0,0]).delta[0]===55,'Maximum edges align');
 assert(align([24,0,0], [0], [], 100).guides.length===0,'Tolerance uses screen pixels, not fixed millimeters');
 const previous=align([24,0,0]).guides;
 assert(align([22.5,0,0],[0],previous).delta[0]===25,'Hysteresis holds within the release radius');
 assert(align([21.9,0,0],[0],previous).guides.length===0,'Snap releases when dragged away');
 const negative={id:'negative',bounds:bounds([-50,35,10],[30,20,20])};
 assert(FMove.align(source,[negative],[-24,0,0],[0],project).delta[0]===-25,'Contact works in the negative direction');
 r=align([24,34,0],[0,1]);assert(r.delta[0]===25&&r.delta[1]===35&&r.delta[2]===0,'Plane movement aligns two axes while preserving depth');
 assert(align([24,34,0],[0]).delta[1]===34,'Axis movement cannot change a locked coordinate');
 assert(FMove.align(source,[],[24,34,0],[0,1],project).guides.length===0,'No reference means no attraction');
 assert(FMove.align(source,[target],[24,0,0],[0],p=>[0,p[1],p[2]]).guides.length===0,'End-on axis does not attract invisible distances');
 return true;
}"""

FIXTURE = """({group=false,hidden=false,view='top',rotated=false}) => {
 const F=FORMA,box=FG.primitive('box',{w:20,d:20,h:20});
 const moving=group?[F.makeObject(box,{name:'A',position:[-20,0,10]}),F.makeObject(box,{name:'B',position:[10,0,10]})]:[F.makeObject(box,{name:'Moving',position:[0,0,10]})];
 const target=F.makeObject(rotated?FG.primitive('box',{w:40,d:20,h:20}):box,{
  name:'Reference',position:view==='front'?[45,0,42]:group||rotated?[65,32,10]:[45,32,10],locked:true,visible:!hidden,
  rotation:rotated?FM.qaxis([0,0,1],Math.PI/4):[0,0,0,1],scale:rotated?[1.2,.8,1]:[1,1,1]
 });
 F.commit('Alignment fixture',()=>{F.state.objects=[...moving,target];F.state.selected=moving.map(o=>o.id);});
 F.setMode('translate');F.renderer.viewPreset(view);F.renderer.camera.target=[20,15,20];F.renderer.camera.distance=190;F.renderer.matrices();F.renderer.request();
 document.getElementById('snapEnabled').checked=false;document.getElementById('objectSnapEnabled').checked=true;
 return F.state.timeline.nodes.length;
}"""


def drag(page, anchor, delta, kind='dragObject'):
    canvas = page.locator('#viewport').bounding_box()
    start, end = page.evaluate('''({anchor,delta})=>{
      const r=FORMA.renderer;r.matrices();return [r.project(anchor),r.project(FM.add(anchor,delta))];
    }''', {'anchor': anchor, 'delta': delta})
    page.mouse.move(canvas['x'] + start[0], canvas['y'] + start[1])
    page.mouse.down()
    assert page.evaluate('FORMA.gesture?.type') == kind, page.evaluate('({type:FORMA.gesture?.type,handles:FORMA.handles})')
    page.mouse.move(canvas['x'] + end[0], canvas['y'] + end[1], steps=10)


def positions(page):
    return page.evaluate('FORMA.state.objects.filter(o=>FORMA.state.selected.includes(o.id)).map(o=>o.position)')


def near(actual, expected, tolerance=1e-5):
    assert len(actual) == len(expected)
    assert all(abs(a-b) < tolerance for a, b in zip(actual, expected)), (actual, expected)


def setup(page, **options):
    count = page.evaluate(FIXTURE, options)
    page.wait_for_function("FORMA.renderer.frame===null&&FORMA.handles.some(h=>h.type==='translate')")
    return count


def run_checks(browser, locale):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: remote.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
    page.goto((ROOT / f'FORMA3D_{locale}.html').as_uri())
    page.wait_for_function('window.FORMA?.ready')
    assert page.evaluate(CORE)
    history = setup(page)
    drag(page, [-6,-6,20], [24,31,0])
    near(positions(page)[0], [25,32,10])
    assert page.evaluate('FORMA.gesture.snapGuides.length') == 2
    page.keyboard.down('Shift')
    near(positions(page)[0], [24,31,10])
    assert page.evaluate('FORMA.gesture.snapGuides.length') == 0
    page.keyboard.up('Shift')
    near(positions(page)[0], [25,32,10])
    # Keep an actual view of the guides for visual QA.
    page.screenshot(path=f'/tmp/forma-alignment-{locale}.png')
    page.mouse.up()
    assert page.evaluate('FORMA.state.timeline.nodes.length') == history + 1
    assert page.evaluate('FORMA.gesture') is None
    page.keyboard.press('Control+z')
    near(positions(page)[0], [0,0,10])
    page.keyboard.press('Control+Shift+z')
    near(positions(page)[0], [25,32,10])

    setup(page)
    page.locator('#objectSnapEnabled').uncheck()
    drag(page, [-6,-6,20], [24,31,0])
    near(positions(page)[0], [24,31,10])
    assert page.evaluate('FORMA.gesture.snapGuides.length') == 0
    page.mouse.up()

    # Hidden references are excluded; a locked reference was used above.
    setup(page, hidden=True)
    drag(page, [-6,-6,20], [24,31,0])
    near(positions(page)[0], [24,31,10])
    page.mouse.up()

    setup(page, group=True)
    drag(page, [-26,-6,20], [34,31,0])
    near(positions(page)[0], [15,32,10])
    near(positions(page)[1], [45,32,10])
    page.mouse.up()

    # Rotated and scaled references use their world bounds.
    setup(page, rotated=True)
    expected = 65 - 64 / (2 * 2**.5) - 10
    drag(page, [-6,-6,20], [expected-.6,31,0])
    near(positions(page)[0], [expected,32,10])
    page.keyboard.press('Escape')
    page.mouse.up()
    near(positions(page)[0], [0,0,10])

    setup(page, view='front')
    drag(page, [-6,-10,14], [24,0,31])
    near(positions(page)[0], [25,0,42])
    page.mouse.up()

    # Drag an actual X arrow: alignment must not move Y or Z.
    setup(page)
    handle = page.evaluate("FORMA.handles.find(h=>h.type==='translate'&&h.index===0)")
    anchor = [handle['pivot'][0] + handle['length'], handle['pivot'][1], handle['pivot'][2]]
    drag(page, anchor, [24,31,0], kind='gizmo')
    near(positions(page)[0], [25,0,10])
    assert page.evaluate('FORMA.gesture.snapGuides.every(g=>g.axis===0)')
    page.mouse.up()

    # Alignment overrides grid rounding exactly, and grid remains when disabled.
    setup(page)
    page.evaluate("FORMA.commit('Fractional reference',()=>FORMA.state.objects[1].position[0]=45.3)")
    page.locator('#snapEnabled').check()
    page.locator('#snapStep').select_option('5')
    drag(page, [-6,-6,20], [24.5,31,0])
    near(positions(page)[0], [25.3,32,10])
    page.mouse.up()
    setup(page)
    page.locator('#objectSnapEnabled').uncheck()
    page.locator('#snapEnabled').check()
    drag(page, [-6,-6,20], [24,31,0])
    near(positions(page)[0], [25,30,10])
    page.mouse.up()

    # The original plane-cut command stays distinct from clipboard cutting.
    page.evaluate("FORMA.dispatch('cut')")
    assert page.locator('#modal').evaluate('(el)=>el.open')
    page.locator('#modalClose').click()
    page.evaluate("FORMA.dispatch('cutSelection')")
    assert page.evaluate('FORMA.state.objects.length') == 1
    page.keyboard.press('Control+z')
    assert page.evaluate('FORMA.state.objects.length') == 2

    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('#objectSnapEnabled').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    box = page.locator('.snap-box').bounding_box()
    assert box['x'] >= 0 and box['x'] + box['width'] <= 391
    page.screenshot(path=f'/tmp/forma-alignment-mobile-{locale}.png')
    assert not errors, errors
    assert not remote, remote
    print(f'{locale}: edge/center snapping, zoom, hysteresis, groups, transformed references, planes/axes, bypass, grid, undo and narrow layout passed')
    context.close()


def main():
    syntax_checks()
    executable = os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=executable, headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for locale in ['FR', 'EN']:
            run_checks(browser, locale)
        browser.close()


if __name__ == '__main__':
    main()
