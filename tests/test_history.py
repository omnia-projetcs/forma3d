"""Regression: rolling history, retained branches, persistence and memory budgets.

Run: python3 tests/test_history.py
"""
import json
import os
from pathlib import Path
import shutil
import tempfile

from playwright.sync_api import sync_playwright
from test_tools import syntax_checks

ROOT = Path(__file__).resolve().parents[1]

FIXTURE = """() => {
 const F=FORMA, box=F.makeObject(FG.primitive('box'),{
   name:'Part',position:[0,0,15],material:{name:'PLA',density:1.24}
 });
 box.construction=FModel.capture([FModel.cloneObject(box)],box,'Original');
 const snap=i=>FModel.snapshot({name:'Full history',objects:[{...box,position:[i,0,15]}],selected:[box.id]});
 const nodes=Array.from({length:999},(_,i)=>({id:'step'+i,parent:i?'step'+(i-1):null,label:'Move '+i,time:i,state:snap(i)}));
 nodes.push({id:'oldBranch',parent:'step400',label:'Kept branch',time:999,state:snap(-50)});
 const h={version:1,nodes,current:'step998',tip:'step998'};
 F.loadDocument({...nodes[998].state,timeline:h},'Loaded fixture',true);
 window.originalNodes=FStore.pack(F.state,false).timeline.nodes;
 return F.state.timeline.nodes.length;
}"""

LIMIT_CHECKS = """() => {
 const assert=(value,label)=>{if(!value)throw Error(label);};
 const s={name:'Budget check',objects:[],selected:[]};
 const chain=count=>({version:1,nodes:Array.from({length:count},(_,i)=>({id:'limit'+i,parent:i?'limit'+(i-1):null,label:'Step',time:i,state:s})),current:'limit'+(count-1),tip:'limit'+(count-1)});
 const h=chain(1000);
 for(let i=0;i<75;i++)FHistory.append(h,s,'Continued edit');
 assert(h.nodes.length===1000&&h.nodes[0].id==='limit75'&&h.nodes[0].parent===null,'Rolling append keeps the newest thousand');
 assert(FHistory.path(h).length===1000,'All retained linear states remain undoable');
 FHistory.validate(h);
 // Migrate files made by the temporary 10,000-state release, preserving a past cursor.
 const legacy=chain(1500),legacyCursor='limit20';legacy.current=legacyCursor;
 const migrated=FHistory.validate(legacy);
 assert(migrated.nodes.length===1000&&migrated.current===legacyCursor&&migrated.tip===legacyCursor,'Migration preserves the viewed scene');
 assert(migrated.nodes.some(n=>n.id==='limit20')&&migrated.nodes.some(n=>n.id==='limit1499'),'Protected cursor and tip are retained');
 FHistory.validate(migrated);
 FHistory.append(migrated,s,'Edit an old retained state');
 assert(FHistory.path(migrated).at(-2).id===legacyCursor,'A fresh edit can undo to an old retained cursor');
 FHistory.validate(migrated);
 // Parents that expired become separate roots, never fabricated undo links.
 const forest=chain(1000);forest.nodes.push({id:'other',parent:'limit0',label:'Other branch',time:1000,state:s});
 forest.current=forest.tip='other';
 const trimmed=FHistory.validate(forest);
 assert(trimmed.nodes.length===1000&&FHistory.path(trimmed,'other').length===1,'Expired shared ancestor produces an independent branch');
 assert(FHistory.path(trimmed,'limit999')[0].id==='limit1','Other recent branch remains navigable');
 FHistory.append(trimmed,s,'Edit retained branch');FHistory.validate(trimmed);
 const forestLoaded=FStore.unpack(JSON.parse(JSON.stringify(FStore.pack({...s,timeline:trimmed},false))));
 assert(forestLoaded.timeline.nodes.length===1000&&FHistory.leaves(forestLoaded.timeline).length===2,'Detached branches survive a full saved-file round trip');
 const imported=FHistory.importBranch(trimmed,chain(1000),'Imported branch');
 assert(imported.nodes.length===1000&&FHistory.path(imported).length===1000,'Import rolls within the same capacity');
 // Memory pruning removes old mesh references before accepting the next edit.
 const object=bytes=>({id:'budget',position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],geo:{positions:{byteLength:bytes}}});
 const heavy={...s,objects:[object(FHistory.MAX_BYTES/2)]},memory=FHistory.create(s);
 FHistory.append(memory,heavy,'Mesh A');FHistory.append(memory,heavy,'Transform A');
 const latest=FHistory.append(memory,{...s,objects:[object(FHistory.MAX_BYTES/2+1)]},'Mesh B');
 assert(memory.nodes.length===1&&memory.current===latest.id&&memory.nodes[0].parent===null,'Old meshes expire to respect the memory budget');
 const before=JSON.stringify(memory);
 let rejected=false;try{FHistory.append(memory,{...s,objects:[object(FHistory.MAX_BYTES+1)]},'Oversized scene');}catch(e){rejected=/256/.test(e.message);}
 assert(rejected&&JSON.stringify(memory)===before,'An oversized scene fails without pruning existing history');
 return true;
}"""


def run_checks(browser, locale):
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    url = (ROOT / 'FORMA3D.html').as_uri() + '?lang=' + locale.lower()
    page.goto(url)
    page.wait_for_function('window.FORMA?.ready')
    assert page.evaluate(FIXTURE) == 1000
    page.locator('#viewport').focus()
    page.keyboard.press('ArrowRight')
    assert page.evaluate('FORMA.state.timeline.nodes.length') == 1000
    assert page.evaluate('FORMA.state.objects[0].position[0]') == 999
    page.keyboard.press('Control+c')
    page.keyboard.press('Control+v')
    assert page.evaluate('FORMA.state.timeline.nodes.length') == 1000
    assert page.evaluate('FORMA.state.objects.length') == 2
    assert page.evaluate('''() => {
      const nodes=FStore.pack(FORMA.state,false).timeline.nodes,ids=new Set(nodes.map(n=>n.id));
      const expected=window.originalNodes.slice(2).map(n=>({...n,parent:ids.has(n.parent)?n.parent:null}));
      return JSON.stringify(nodes.slice(0,998))===JSON.stringify(expected)&&nodes[0].id==='step2';
    }''')
    assert not page.locator('.toast.error').count()

    # Save the complete real file, then reopen it through the application's input.
    with tempfile.TemporaryDirectory() as directory:
        with page.expect_download() as info:
            page.keyboard.press('Control+s')
        saved = Path(directory) / 'long-history.forma3d'
        info.value.save_as(saved)
        data = json.loads(saved.read_text())
        assert len(data['timeline']['nodes']) == 1000
        assert data['timeline']['nodes'][0]['id'] == 'step2'
        other_context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        other = other_context.new_page()
        other.on('pageerror', lambda error: errors.append(str(error)))
        other.goto(url)
        other.wait_for_function('window.FORMA?.ready')
        other.locator('#projectInput').set_input_files(saved)
        other.wait_for_function('FORMA.state.timeline.nodes.length===1000')
        assert other.evaluate('FORMA.state.objects.length') == 2
        assert other.evaluate('FORMA.state.objects[0].material.density') == 1.24
        assert other.evaluate('FORMA.state.objects.every(o=>o.construction.sources.length===1)')
        other.keyboard.press('Control+z')
        assert other.evaluate('FORMA.state.objects.length') == 1
        other.keyboard.press('Control+Shift+z')
        assert other.evaluate('FORMA.state.objects.length') == 2
        other.evaluate("FORMA.historyGo('oldBranch')")
        assert other.evaluate('FORMA.state.objects[0].position[0]') == -50
        other.locator('#viewport').focus()
        other.keyboard.press('ArrowLeft')
        assert other.evaluate('FORMA.state.objects[0].position[0]') == -51
        assert other.evaluate('FORMA.state.timeline.nodes.length') == 1000
        assert other.evaluate("FHistory.leaves(FORMA.state.timeline).length") == 2
        other_context.close()

    # Restore the binary autosave using the same loader as a resumed session.
    assert page.evaluate('''async () => {
      await FStore.write(FStore.pack(FORMA.state,true));
      const restored=FStore.unpack(await FStore.read());
      FORMA.loadDocument(restored,'Resumed session',true);
      return FORMA.state.timeline.nodes.length===1000&&FORMA.state.objects.length===2;
    }''')
    assert page.evaluate(LIMIT_CHECKS)
    assert not errors, errors
    print(f'{locale}: rolling 1,000 states, retained branches, file/autosave restore, undo/redo, legacy migration and memory checks passed')
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
