/* Geometry regressions use the exact geometry engine bundled in the HTML. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'FORMA3D_FR.html'),'utf8');
const context={console,performance,crypto:require('crypto').webcrypto,TextEncoder,TextDecoder,atob,btoa,self:{postMessage(){}},setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(JSON.parse(html.match(/var FORMA_WORKER_SOURCE = ("[^\n]+");/)[1]),context);
vm.runInContext(fs.readFileSync(path.join(root,'src/character-core.js'),'utf8'),context);
context.assert=assert;
vm.runInContext(`
 const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<=t,a+' != '+b);
 const closed=g=>{const r=FG.analyze(g);assert.equal(r.closed,true);assert.equal(r.degenerate,0);assert.ok(r.signedVolume>0);return r;};
 const box=FG.primitive('box',{w:10,d:10,h:10});
 const rounded=FCharacter.loop(box);closed(rounded);assert.equal(rounded.positions.length,box.positions.length*4);assert.ok(FG.analyze(rounded).volume<FG.analyze(box).volume);
 for(const kind of ['head','bust','body']){
   const g=FCharacter.base(kind,100,1,1,32);closed(g);near(g.bounds.size[2],100,1e-4);
 }
 const head=FCharacter.base('head',60,.7,1.4,48);closed(head);near(head.bounds.size[2],60,1e-4);
 assert.throws(()=>FCharacter.base('body',0,1,1,48));
 const spatial=new FCharacter.Spatial([[0,0,0],[10,0,0]],1);assert.equal(spatial.query([0,0,0],.5).length,1);spatial.v[0]=[20,0,0];spatial.put(0,[20,0,0]);assert.equal(spatial.query([0,0,0],.5).length,0);assert.equal(spatial.query([20,0,0],.5)[0],0);
 const tree=new FCharacter.BVH(box);near(tree.pick([20,0,0],[-1,0,0]).distance,15);assert.equal(tree.pick([20,30,0],[-1,0,0]),null);
 const moved=FG.geometry(box.positions.slice()),moving=new FCharacter.BVH(moved);for(let i=0;i<moved.positions.length;i+=3)moved.positions[i]+=10;moving.refit(Array.from({length:moved.positions.length/9},(_,i)=>i));near(moving.pick([20,0,0],[-1,0,0]).distance,5);
 const t=FG.topology(box),edge=[...t.edges.values()][0][0],split=FCharacter.edit(box,'splitEdge',[edge.a,edge.b]);closed(split);assert.equal(split.positions.length/9,box.positions.length/9+2);
 const extruded=FCharacter.edit(box,'extrudeFaces',[0],2);closed(extruded);assert.ok(FG.analyze(extruded).volume>1000);assert.throws(()=>FCharacter.edit(box,'splitEdge',[0]));
 const mesh2=FG.transform(box,FM.compose([5,0,0],[0,0,0,1],[1,1,1]));const remeshed=FCharacter.remesh([box.positions,mesh2.positions],32),remeshGeo=FG.geometry(remeshed.positions),report=closed(remeshGeo);near(report.volume,1500,120);assert.ok(remeshed.voxel>0);
 const nested=FCharacter.remesh([new Float32Array([...box.positions,...mesh2.positions])],32);near(closed(FG.geometry(nested.positions)).volume,report.volume,1);
 const tube=FG.primitive('tube',{r:10,inner:5,h:20,segments:32}),tubeRemesh=FG.geometry(FCharacter.remesh([tube.positions],32).positions);closed(tubeRemesh);assert.equal(new FCharacter.BVH(tubeRemesh).pick([0,0,-30],[0,0,1]),null);
 const wall=FCharacter.thickness(box,11);near(wall.minimum,10,1e-4);assert.ok(wall.thin.length>0);
 const bones=FCharacter.skeleton(box.bounds),matrices=FCharacter.poseMatrices(bones);for(const m of matrices)m.forEach((v,i)=>near(v,FM.identity()[i],1e-6));const pose=FCharacter.pose(box,bones);pose.positions.forEach((v,i)=>near(v,box.positions[i],1e-5));
 bones[1].rotation=[0,0,30];const posed=FCharacter.pose(box,bones);assert.ok(posed.positions.some((v,i)=>Math.abs(v-box.positions[i])>.01));
 const uv=FCharacter.uv(box,'cylindrical');assert.equal(uv.length,box.positions.length/3*2);assert.ok(uv.every(Number.isFinite));
 const data=FCharacter.glb([{name:'Character',geo:box,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],color:'#c0a48f',character:{bones,uv:'cylindrical'}}],true),dv=new DataView(data);assert.equal(dv.getUint32(0,true),0x46546c67);assert.equal(dv.getUint32(8,true),data.byteLength);const size=dv.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,size)));assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,17);assert.ok(json.meshes[0].primitives[0].attributes.TEXCOORD_0!==undefined);assert.ok(json.meshes[0].primitives[0].attributes.JOINTS_0!==undefined);
 for(const a of json.accessors){const v=json.bufferViews[a.bufferView];assert.ok(v.byteOffset+v.byteLength<=json.buffers[0].byteLength);assert.equal(v.byteOffset%4,0);}
 const wa=json.accessors[json.meshes[0].primitives[0].attributes.WEIGHTS_0],wv=json.bufferViews[wa.bufferView],weights=new Float32Array(data,28+size+wv.byteOffset,wa.count*4);for(let i=0;i<weights.length;i+=4)near(weights[i]+weights[i+1]+weights[i+2]+weights[i+3],1,1e-6);
 assert.throws(()=>FCharacter.metadata({bones:[{parent:0,p:[0,0,0],rotation:[0,0,0]}]}));assert.throws(()=>FCharacter.referenceConfig({references:{front:{data:'https://example.com/x.png'}}}));
 console.log('Character core: bases, subdivision, spatial index, BVH/refit, topology, remeshing, thickness, pose, UV, GLB and validation passed.');
`,context,{timeout:60000});
