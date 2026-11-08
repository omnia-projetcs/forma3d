const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),html=read('FORMA3D.html');
const ctx={console,atob,TextEncoder,TextDecoder,crypto:crypto.webcrypto,self:{postMessage(){}}};vm.createContext(ctx);
vm.runInContext(JSON.parse(html.match(/var FORMA_WORKER_SOURCE = ("[^\n]+");/)[1]),ctx);
vm.runInContext(read('src/character-core.js')+'\nvar FCharacterModelData='+read('src/character-model-data.json')+';\n'+read('src/character-models.js'),ctx);ctx.assert=assert;
vm.runInContext(`
  assert.equal(FCharacterModels.catalog.length,7);
  assert.deepEqual(Array.from(FCharacterModels.catalog,p=>p.id),['knight','mage','rogue','goblin','ogre','dwarf','elf']);
  assert.deepEqual(Array.from(FCharacterModels.catalog.filter(p=>p.category==='monster'),p=>p.id),['goblin','ogre']);
  for(const id of ['barbarian','ranger']){assert.equal(FCharacter.metadata({template:id}).template,id);assert.ok(FCharacterModels.generate(id).colors.length>0);}
  for(const model of FCharacterModels.catalog){
    const g=FCharacterModels.generate(model.id),report=FG.analyze(g);
    assert.ok(report.triangles>3000&&report.triangles<120000);assert.equal(report.degenerate,0);assert.equal(report.nonManifold,0);assert.equal(report.inconsistent,0);
    assert.equal(g.colors.length,g.positions.length);assert.ok(g.colors.every(v=>v>=0&&v<=1));assert.ok(Math.abs(g.bounds.size[2]-model.height)<.001);
    const palette=new Set();for(let i=0;i<g.colors.length;i+=3)palette.add([g.colors[i],g.colors[i+1],g.colors[i+2]].map(v=>Math.round(v*31)).join(','));assert.ok(palette.size>20);
    const copy=FCharacterModels.generate(model.id);copy.colors[0]=0;assert.notEqual(copy.colors,g.colors);
    const moved=FG.transform(g,FM.compose([20,0,0],[0,0,0,1],[1,1,1]));assert.ok(moved.colors.every((v,i)=>v===g.colors[i]));
    for(const refined of [FCharacter.refine(g),FCharacter.loop(g)]){assert.equal(refined.positions.length,g.positions.length*4);assert.equal(refined.colors.length,refined.positions.length);assert.equal(refined.colors[0],g.colors[0]);assert.ok(refined.colors.some(v=>v>.8));}
    const reflected=FG.transform(g,FM.compose([0,0,0],[0,0,0,1],[-1,1,1]),true);for(let i=0;i<g.colors.length;i+=9)assert.equal(reflected.colors[i+3],g.colors[i+6]);
    const packed=FCharacter.glb([{name:model.en,geo:g,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],color:'#ffffff'}]);const dv=new DataView(packed),json=JSON.parse(new TextDecoder().decode(new Uint8Array(packed,20,dv.getUint32(12,true))));assert.ok(json.meshes[0].primitives[0].attributes.COLOR_0!==undefined);
    assert.equal(FCharacter.metadata({template:model.id}).template,model.id);
  }
  assert.throws(()=>FCharacterModels.generate('unknown'));assert.throws(()=>FCharacter.metadata({template:'unknown'}));
`,ctx,{timeout:30000});
const provenance=JSON.parse(read('assets/characters/kaykit/provenance.json'));
assert.equal(provenance.license,'CC0-1.0');assert.ok(read('assets/characters/kaykit/LICENSE.txt').includes('Creative Commons Zero'));
for(const file of provenance.files){const raw=fs.readFileSync(path.join(root,'assets/characters/kaykit',file.file));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),file.sha256);}
const adaptations=JSON.parse(read('assets/characters/kaykit/adaptations.json')),data=JSON.parse(read('src/character-model-data.json'));
assert.equal(adaptations.sourceRevision,provenance.revision);
assert.equal(adaptations.recipeSha256,crypto.createHash('sha256').update(read(adaptations.recipe)).digest('hex'));
assert.deepEqual(adaptations.models.map(m=>m.id),['goblin','ogre','dwarf','elf']);
for(const model of adaptations.models){
  assert.equal(model.sourceSha256,provenance.files.find(f=>f.file===model.sourceFile).sha256);
  const mesh=data[model.id];assert.equal(mesh.variant,model.id);assert.equal(mesh.height,model.heightMm);
  assert.equal(model.meshSha256,crypto.createHash('sha256').update(Buffer.from(mesh.positions,'base64')).update(Buffer.from(mesh.colors,'base64')).digest('hex'));
  assert.notEqual(mesh.positions,data[model.sourceFile==='Rogue.glb'?'rogue':'barbarian'].positions);
}
const previews=JSON.parse(read('src/character-model-previews.json')).images;assert.equal(Object.keys(previews).length,7);for(const preview of Object.values(previews))assert.ok(preview.src.startsWith('data:image/png;base64,'));
console.log('7 complete fantasy models: complete geometry, palette, transforms, GLB colours, metadata, provenance and previews passed.');
