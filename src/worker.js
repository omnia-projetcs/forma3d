/* Isolated mesh jobs. The main thread can terminate this worker without altering the project. */
'use strict';
self.onmessage=({data})=>{const {id,op,args,language}=data;FI.setLanguage(language,false);const g=p=>FG.geometry(p);try{let result;
 if(op==='boolean'){let acc=g(args.meshes[0]);for(let i=1;i<args.meshes.length&&acc;i++){self.postMessage({id,progress:`Volume ${i} / ${args.meshes.length-1}`});acc=FCSG.run(acc,g(args.meshes[i]),args.kind);}result=acc?{positions:acc.positions,csgPolygons:acc.csgPolygons}:null;}
 else if(op==='compose'){const solids=args.meshes.filter(m=>!m.hole),holes=args.meshes.filter(m=>m.hole);if(!solids.length)throw Error(FI.t("Sélectionnez au moins un solide."));let acc=g(solids[0]);for(let i=1;i<solids.length&&acc;i++)acc=FCSG.run(acc,g(solids[i]),'union');for(const h of holes)if(acc)acc=FCSG.run(acc,g(h),'subtract');result=acc?{positions:acc.positions,csgPolygons:acc.csgPolygons}:null;}
 else if(op==='analyze')result=FG.analyze(g(args.mesh));
 else if(op==='clean'){const c=FG.clean(g(args.mesh));result={positions:c.geo.positions,removed:c.removed};}
 else if(op==='split')result=FG.connected(g(args.mesh)).map(m=>({positions:m.positions}));
 else if(op==='patch')result=FG.planarPatch(g(args.mesh),args.face);
 else if(op==='extrudeFace'){const mesh=g(args.mesh),patch=FG.planarPatch(mesh,args.face),prism=FG.patchPrism(mesh,patch,args.distance),geo=FCSG.run(mesh,prism,args.distance>0?'union':'subtract');result=geo?{positions:geo.positions,csgPolygons:geo.csgPolygons}:null;}
 else if(op==='subdivide')result={positions:FG.subdivide(g(args.mesh)).positions};
 else if(op==='smooth')result={positions:FG.smoothMesh(g(args.mesh),args.iterations||1,args.strength||.25).positions};
 else if(op==='simplify')result={positions:FG.simplify(g(args.mesh),args.ratio||.6).positions};
 else if(op==='import')result={positions:FG.parseSTL(args.buffer,args.unit).positions};
 else if(op==='export')result=FG.exportSTL(args.meshes.map(g),args.binary,args.name);
 else throw Error(FI.t("Traitement inconnu."));
 self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error.message||String(error)});}};
