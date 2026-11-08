/* Pure Node regressions for the bundled worker, without browser dependencies.
 * Optional: FORMA_TEST_PROJECT=/absolute/path/model.forma3d node tests/test_auto_fillet_complex.cjs
 * A personal project is read only; its content is never written into the repo.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.resolve(__dirname, '..');
async function check(locale) {
  const html = fs.readFileSync(path.join(root, 'FORMA3D.html'), 'utf8'), chunks = [];
  const pattern = /FORMA_WORKER_SOURCE\s*(\+?=)\s*("(?:[^"\\]|\\.)*")\s*;/g;
  for (const match of html.matchAll(pattern)) chunks.push(JSON.parse(match[2]));
  const posted = [], self = {postMessage: result => posted.push(result)};
  const context = {console, TextEncoder, TextDecoder, atob, URL, WebAssembly, Uint8Array, Uint8ClampedArray, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView, structuredClone, performance, setTimeout, clearTimeout, self};
  vm.createContext(context); vm.runInContext(chunks.join('\n'), context);
  context.assert = assert;
  await vm.runInContext(`(async()=>{
    const wasm=await FManifold.get(),held=[],own=x=>(held.push(x),x);
    function solid(g){const t=FG.topology(g);return own(new wasm.Manifold(new wasm.Mesh({numProp:3,vertProperties:new Float32Array(t.vertices.flat()),triVerts:new Uint32Array(t.faces.flat())})));}
    function mesh(m){const p=m.getMesh(),out=new Float32Array(p.triVerts.length*3);for(let i=0;i<p.triVerts.length;i++)for(let k=0;k<3;k++)out[i*3+k]=p.vertProperties[p.triVerts[i]*p.numProp+k];return FG.geometry(out);}
    function box(size,position){return solid(FG.transform(FG.primitive('box',{w:size[0],d:size[1],h:size[2]}),FM.compose(position,[0,0,0,1],[1,1,1])));}
    try{
      const plain=FG.primitive('box',{w:30,d:20,h:15});
      const verticalPlan=FAutoFillet.plan(plain,{orientation:'vertical'}),horizontalPlan=FAutoFillet.plan(plain,{orientation:'horizontal'});
      assert.strictEqual(verticalPlan.edges.length,4,'A box has four vertical edges');
      assert.strictEqual(horizontalPlan.edges.length,8,'A box has eight horizontal edges');
      const verticalResult=FAutoFillet.run({mesh:plain.positions,radius:2,orientation:'vertical'},()=>{},wasm),verticalReport=FG.analyze(FG.geometry(verticalResult.positions));
      const verticalVolume=15*(30*20-(4-Math.PI)*4);
      assert(verticalReport.closed&&Math.abs(verticalReport.volume-verticalVolume)/verticalVolume<.001,'Vertical-only rounding agrees with the analytic rounded extrusion');
      const horizontalResult=FAutoFillet.run({mesh:plain.positions,radius:2,orientation:'horizontal'},()=>{},wasm);
      assert(FG.analyze(FG.geometry(horizontalResult.positions)).closed&&horizontalResult.stats.edgeCount===8,'Horizontal-only rounding is closed');
      for(const x of [-15,15])for(const y of [-10,10])for(const z of [-5.5,5.5]){
        let retained=false;const ps=horizontalResult.positions;
        for(let i=0;i<ps.length;i+=3)if(Math.abs(ps[i]-x)<1e-4&&Math.abs(ps[i+1]-y)<1e-4&&Math.abs(ps[i+2]-z)<1e-4)retained=true;
        assert(retained,'Horizontal rounding keeps the middle segments of vertical corners sharp');
      }
      const rotation=FM.qaxis(FM.norm([1,2,3]),.7),rotated=FG.transform(plain,FM.compose([30,-20,8],rotation,[1.5,.8,2])),axis=FM.rotate(rotation,[0,0,1]);
      assert.strictEqual(FAutoFillet.plan(rotated,{orientation:'vertical',orientationAxis:axis}).edges.length,4,'Rotation and scaling preserve the vertical classification');
      assert.strictEqual(FAutoFillet.plan(rotated,{orientation:'horizontal',orientationAxis:axis}).edges.length,8,'Rotation and scaling preserve the horizontal classification');
      const wedge=FG.primitive('wedge',{w:30,d:20,h:15});
      assert(FAutoFillet.plan(wedge,{orientation:'vertical'}).edges.length+FAutoFillet.plan(wedge,{orientation:'horizontal'}).edges.length<FAutoFillet.plan(wedge,{}).edges.length,'Oblique edges are excluded from both filtered modes');
      assert.strictEqual(FAutoFillet.plan(plain,{scope:'side',direction:[1,0,0],orientation:'vertical'}).edges.length,2,'A lateral side has two vertical edges');
      assert.strictEqual(FAutoFillet.plan(plain,{scope:'side',direction:[1,0,0],orientation:'horizontal'}).edges.length,2,'A lateral side has two horizontal edges');
      assert.throws(()=>FAutoFillet.plan(plain,{scope:'side',direction:[0,0,1],orientation:'vertical'}),/No vertical/,'An empty orientation/side combination is explicit');
      assert.throws(()=>FAutoFillet.plan(plain,{orientation:'diagonal'}),/Invalid/,'Unknown filters are rejected');
      assert.throws(()=>FAutoFillet.plan(plain,{orientation:'vertical',orientationAxis:[0,0,0]}),/Invalid/,'An invalid local Z axis is rejected');
      const text=FG.exportSTL([plain],false,'orientation'),imported=FG.parseSTL(new TextEncoder().encode(text).buffer,1);
      assert.strictEqual(FAutoFillet.plan(imported,{orientation:'vertical'}).edges.length,4,'Imported STL edges use the same orientation filter');
      const plate=box([100,110,5],[0,0,2.5]),walls=[box([2,25,25],[-35,-15,17.5]),box([2,25,25],[0,-15,17.5]),box([25,2,20],[25,25,15])];
      const holes=[box([75,4,15],[0,-45,2.5]),box([4,65,15],[-42,0,2.5]),box([4,50,15],[42,0,2.5])];
      const joined=own(wasm.Manifold.union([plate,...walls])),source=own(wasm.Manifold.difference([joined,...holes])),g=mesh(source);
      assert(FG.analyze(g).closed,'Fixture is a closed mesh with attached walls and through-openings');
      const original=g.positions.slice(),plan=FAutoFillet.plan(g,{scope:'all'});
      assert(plan.complex&&plan.edges.length>12,'Non-convex fixture uses the local solver');
      const args={mesh:g.positions,scope:'all',radius:2,adaptive:true};
      const rounded=FAutoFillet.run(args,()=>{},wasm),r=FG.geometry(rounded.positions),report=FG.analyze(r);
      assert(report.closed&&report.signedVolume>0,'All rounded surfaces form a closed outward mesh');
      assert(rounded.stats.edgeCount===plan.edges.length,'No detected outer edge is silently skipped');
      assert(rounded.stats.adaptedEdges>0&&rounded.stats.effectiveMin<2&&rounded.stats.effectiveMax<=2,'Thin areas adapt to the requested maximum');
      assert(Array.from(original).every((v,i)=>v===g.positions[i]),'Original positions remain immutable');
      const result=solid(r);assert.strictEqual(result.genus(),source.genus(),'Every through-opening is preserved');
      assert.strictEqual(FG.connected(r).length,FG.connected(g).length,'No wall is detached');
      assert(report.volume<FG.analyze(g).volume,'Rounding removes material');
      assert.throws(()=>FAutoFillet.run({...args,adaptive:false},()=>{},wasm),/clearance/,'Exact excessive radius is refused');
      for(const orientation of ['vertical','horizontal']){
        const filteredPlan=FAutoFillet.plan(g,{orientation}),filtered=FAutoFillet.run({...args,orientation},()=>{},wasm),filteredMesh=FG.geometry(filtered.positions);
        assert(filtered.stats.orientation===orientation&&filtered.stats.edgeCount===filteredPlan.edges.length,'The local worker rounds precisely the filtered edge set');
        assert(filteredPlan.edges.length<plan.edges.length&&FG.analyze(filteredMesh).closed,'Both orientation filters work on attached walls and openings');
        assert.strictEqual(solid(filteredMesh).genus(),source.genus(),'Filtered rounding preserves openings');
      }
      const side=FAutoFillet.run({...args,scope:'side',direction:[1,0,0]},()=>{},wasm);
      assert(FG.analyze(FG.geometry(side.positions)).closed&&side.stats.edgeCount<plan.edges.length,'One-side operation preserves a valid whole part');
      const stl=FG.exportSTL([r],true),reimport=FG.parseSTL(stl,1);
      assert(FG.analyze(reimport).closed,'Real exported binary STL reimports as closed');
      assert.strictEqual(stl.byteLength,84+report.triangles*50,'Export has the correct binary size');
      globalThis.complexFixture=g;
      console.log('Complex geometry: '+plan.edges.length+' edges, '+rounded.stats.adaptedEdges+' adapted, closed STL and openings preserved');
    }finally{held.reverse().forEach(x=>x.delete());}
  })()`, context);
  // Test the real asynchronous worker entry point, not only the pure solver.
  await vm.runInContext(`self.onmessage({data:{id:77,op:'autoFillet',args:{mesh:complexFixture.positions,scope:'all',radius:2,adaptive:true}}})`, context);
  const response = posted.find(result => result.id === 77 && result.result);
  assert(response && response.result.stats.closed, 'Bundled WASM initializes and responds through the actual worker');
  assert(!posted.some(result => result.error), 'Worker reports no initialization or geometry error');
  if (process.env.FORMA_TEST_PROJECT) {
    const project = JSON.parse(fs.readFileSync(process.env.FORMA_TEST_PROJECT, 'utf8'));
    const object = project.objects.find(o => project.selected?.includes(o.id)) || project.objects.find(o => o.visible && !o.hole);
    const raw = project.geometries[object.geo].positions, bytes = typeof raw === 'string' ? Buffer.from(raw, 'base64') : Buffer.from(new Float32Array(raw).buffer);
    context.projectPositions = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); context.projectObject = object;
    await vm.runInContext(`(async()=>{
      const o=projectObject,g=FG.transform(FG.geometry(projectPositions),FM.compose(o.position,o.rotation,o.scale)),before=FG.analyze(g),plan=FAutoFillet.plan(g,{scope:'all'}),wasm=await FManifold.get();
      const result=FAutoFillet.run({mesh:g.positions,scope:'all',radius:2,adaptive:true},()=>{},wasm),geo=FG.geometry(result.positions),after=FG.analyze(geo);
      assert(after.closed&&after.volume<before.volume&&result.stats.edgeCount===plan.edges.length,'Personal project rounds every detected outer edge into a closed solid');
      assert(FG.analyze(FG.parseSTL(FG.exportSTL([geo],true),1)).closed,'Personal project exports and reimports correctly');
      for(const orientation of ['vertical','horizontal']){
        const selected=FAutoFillet.plan(g,{orientation}),filtered=FAutoFillet.run({mesh:g.positions,radius:2,adaptive:true,orientation},()=>{},wasm);
        assert(FG.analyze(FG.geometry(filtered.positions)).closed&&filtered.stats.edgeCount===selected.edges.length,'Provided project accepts vertical-only and horizontal-only rounding');
        console.log('Provided project '+orientation+': '+filtered.stats.edgeCount+' edges, closed');
      }
      console.log('Provided project: '+result.stats.edgeCount+' edges, '+result.stats.adaptedEdges+' adapted, '+after.triangles+' triangles, closed');
    })()`, context);
  }
  console.log(locale + ': local worker regression passed');
}
(async()=>{for(const locale of ['FR','EN'])await check(locale);})().catch(error=>{console.error(error);process.exitCode=1;});
