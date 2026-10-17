"""Real mouse regressions for right-click sketch points in both editions.

Run: python3 tests/test_sketch_points.py
Uses the same development-only browser dependencies as test_tools.py.
"""
import functools
import http.server
import os
import shutil
import threading

from playwright.sync_api import sync_playwright
from test_tools import ROOT, QuietHandler, syntax_checks


def check_points(browser, origin, locale):
    context = browser.new_context(viewport={'width': 1584, 'height': 1200})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'{origin}/FORMA3D_{locale}.html')
    page.wait_for_function('window.FORMA?.ready')
    page.evaluate('FORMA.sketchDialog()')
    page.wait_for_function("document.getElementById('skCanvas_xy').width>100")

    def document():
        return page.evaluate('FORMA.sketchStudio.document')

    def position(plane, point):
        return page.evaluate('''([k,p])=>{
          const r=document.getElementById('skCanvas_'+k).getBoundingClientRect();
          const q=FORMA.sketchStudio.screen(k,p);return [r.left+q[0],r.top+q[1]];
        }''', [plane, point])

    def click(plane, point, button='right'):
        page.mouse.click(*position(plane, point), button=button)

    def fixture(path, plane='xy', mode='silhouettes'):
        page.evaluate('''([path,plane,mode])=>{
          const d=FSketch.create();d.plane=plane;d.mode=mode;
          if(mode==='path')d.path=path;else d.profiles[plane]=path;
          FORMA.sketchStudio.setDocument(d);
        }''', [path, plane, mode])
        page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    # Empty and open sketches accept right clicks, including inactive planes.
    for plane, points in {
        'xy': [[-23, -17, 0], [29, -17, 0]],
        'xz': [[-23, 0, 3], [29, 0, 3]],
        'yz': [[0, -23, 3], [0, 29, 3]],
    }.items():
        click(plane, points[0])
        click(plane, points[1])
        path = document()['profiles'][plane]
        assert path['nodes'] == points, (plane, path)
        assert len(path['edges']) == 1
        assert page.evaluate('FORMA.sketchStudio.active') == plane
    checks = 3

    # Inserting into a closed outline must keep closure, preview, and history.
    rectangle = {'nodes': [[-30, -20, 0], [30, -20, 0], [30, 20, 0], [-30, 20, 0]],
                 'edges': [{'kind': 'line'}] * 4, 'closed': True}
    fixture(rectangle)
    page.wait_for_function('FORMA.sketchStudio.ready')
    for plane in ['xy', 'xz', 'yz']:
        path = document()['profiles'][plane]
        a, b = path['nodes'][-1], path['nodes'][0]  # The closing edge.
        mid = [(x+y)/2 for x, y in zip(a, b)]
        before = document()
        click(plane, mid)
        after = document()
        assert len(after['profiles'][plane]['nodes']) == len(path['nodes']) + 1
        assert after['profiles'][plane]['closed']
        assert len(after['profiles'][plane]['edges']) == len(path['edges']) + 1
        assert all(abs(x-y) < 1e-6 for x, y in zip(after['profiles'][plane]['nodes'][-1], mid))
        page.wait_for_function('FORMA.sketchStudio.ready')
        page.locator('#skUndo').click()
        assert document() == before
        page.locator('#skRedo').click()
        assert document() == after
        click(plane, mid)  # Existing anchors are selected, never duplicated.
        assert document() == after
        checks += 1
    page.locator('#doSketch').click()
    assert page.evaluate("FORMA.state.objects.at(-1).param.type") == 'sketchStudio'
    page.evaluate('FORMA.sketchDialog(FORMA.state.objects.at(-1))')
    assert len(document()['profiles']['yz']['nodes']) == 5
    checks += 1

    # Right dragging pans with no geometry/history edit; a cancelled click is inert.
    before = document()
    revision = page.evaluate('FORMA.sketchStudio.revision')
    start = position('xy', [0, 0, 0])
    page.mouse.move(*start)
    page.mouse.down(button='right')
    assert document() == before  # Insertion waits until release.
    page.mouse.move(start[0]+35, start[1]+18, steps=5)
    page.mouse.up(button='right')
    assert document() == before
    assert page.evaluate('FORMA.sketchStudio.revision') == revision
    end = position('xy', [0, 0, 0])
    assert abs(end[0]-start[0]-35) < 1e-6 and abs(end[1]-start[1]-18) < 1e-6
    page.mouse.move(*end)
    page.mouse.down(button='right')
    page.keyboard.press('Escape')
    page.mouse.up(button='right')
    assert document() == before
    checks += 1

    # Subdivision preserves a quadratic curve in 3D, including its hidden axis.
    curve = {'nodes': [[-30, 0, 3], [30, 0, 23]],
             'edges': [{'kind': 'curve', 'control': [0, 40, 63]}], 'closed': False}
    fixture(curve, mode='path')
    page.locator('#skMeasure').click()  # Addition works independently of the tool.
    click('xy', [0, 20, 38])
    path = document()['path']
    assert len(path['nodes']) == 3 and len(path['edges']) == 2
    assert all(abs(x-y) < .03 for x, y in zip(path['nodes'][1], [0, 20, 38]))
    preserved = page.evaluate('''original=>{
      const p=FORMA.sketchStudio.document.path;
      const t=(p.nodes[1][0]+30)/60;
      for(let i=0;i<=100;i++){
        const u=i/100,j=u<t?0:1,v=j?(u-t)/(1-t):u/t;
        const a=FSketchDims.at(original.nodes[0],original.edges[0].control,original.nodes[1],u);
        const b=FSketchDims.at(p.nodes[j],p.edges[j].control,p.nodes[j+1],v);
        if(FM.len(FM.sub(a,b))>1e-7)return false;
      }return true;
    }''', curve)
    assert preserved
    checks += 1

    # An open path can also be extended while editing/measuring; curves still use two clicks.
    click('xz', [50, 0, 30])
    assert len(document()['path']['nodes']) == 4
    page.evaluate('FORMA.sketchStudio.fitAll()')
    page.locator('#skCurve').click()
    click('xy', [60, 10, 30])
    assert page.evaluate('!!FORMA.sketchStudio.pending')
    click('xy', [50, 30, 30])
    assert not page.evaluate('FORMA.sketchStudio.pending')
    assert document()['path']['edges'][-1]['kind'] == 'curve'
    checks += 1

    # Respect the 64-anchor limit without touching the existing sketch.
    nodes = [[i, 0, 0] for i in range(64)]
    fixture({'nodes': nodes, 'edges': [{'kind': 'line'}]*63, 'closed': False}, mode='path')
    before = document()
    click('xy', [70, 10, 0])
    assert document() == before
    checks += 1
    assert not errors, errors
    print(f'{locale}: {checks} sketch interaction checks passed, no page errors')
    if locale == 'FR':
        fixture(rectangle)
        click('xy', [0, -20, 0])
        page.wait_for_function('FORMA.sketchStudio.ready')
        page.screenshot(path='/tmp/forma3d-right-click.png')
    context.close()


def main():
    syntax_checks()
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    executable = os.environ.get('FORMA_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=executable, headless=True,
                args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for locale in ['EN', 'FR']:
                check_points(browser, f'http://127.0.0.1:{server.server_port}', locale)
            browser.close()
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
