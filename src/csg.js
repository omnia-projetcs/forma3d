/*
csg.js — adapted BSP algorithms in src/csg.js
Original source: https://github.com/evanw/csg.js
Original author: Evan Wallace
License: MIT

Copyright (c) 2011 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
/* FORMA 3D — BSP solid operations.
 * Set-operation sequences and plane splitting adapted from csg.js (MIT),
 * Copyright (c) 2011 Evan Wallace. See licenses/csg-MIT.txt.
 * Iterative traversal, resource limits and conforming tessellation added for this editor.
 * Floating-point mesh CSG is not an exact B-rep kernel.
 */
'use strict';
var FCSG=(()=>{
 const {dot,sub,add,mul,cross,len,norm,lerp}=FM;let epsilon=1e-5,steps=0;
 const limit=()=>{if(++steps>18000000)throw Error(FI.t("Opération trop complexe. Simplifiez le maillage, puis réessayez."));};
 class Poly{
  constructor(v,n=null,w=null){this.v=v;this.n=n||norm(cross(sub(v[1],v[0]),sub(v[2],v[0])));this.w=w===null?dot(this.n,v[0]):w;}
  flip(){this.v.reverse();this.n=mul(this.n,-1);this.w=-this.w;}
 }
 function split(poly,n,w,cf,cb,front,back){limit();let type=0;const types=poly.v.map(v=>{const d=dot(n,v)-w,t=d < -epsilon?2:d>epsilon?1:0;type|=t;return t;});if(type===0){(dot(n,poly.n)>0?cf:cb).push(poly);return;}if(type===1){front.push(poly);return;}if(type===2){back.push(poly);return;}const f=[],b=[];for(let i=0;i<poly.v.length;i++){const j=(i+1)%poly.v.length,a=poly.v[i],v=poly.v[j],ta=types[i],tb=types[j];if(ta!==2)f.push(a);if(ta!==1)b.push(a);if((ta|tb)===3){const t=(w-dot(n,a))/dot(n,sub(v,a)),q=lerp(a,v,t);f.push(q);b.push(q);}}if(f.length>=3)front.push(new Poly(f,poly.n.slice(),poly.w));if(b.length>=3)back.push(new Poly(b,poly.n.slice(),poly.w));}
 class Node{
  constructor(polys=[]){this.n=null;this.w=0;this.p=[];this.front=null;this.back=null;if(polys.length)this.build(polys);}
  build(polys){const stack=[[this,polys]];while(stack.length){const [node,ps]=stack.pop();if(!ps.length)continue;if(!node.n){const p=ps[Math.floor(ps.length/2)];node.n=p.n.slice();node.w=p.w;}const f=[],b=[];for(const p of ps)split(p,node.n,node.w,node.p,node.p,f,b);if(f.length){node.front||=new Node();stack.push([node.front,f]);}if(b.length){node.back||=new Node();stack.push([node.back,b]);}}}
  invert(){const stack=[this];while(stack.length){const node=stack.pop();for(const p of node.p)p.flip();if(node.n)node.n=mul(node.n,-1);node.w=-node.w;[node.front,node.back]=[node.back,node.front];if(node.front)stack.push(node.front);if(node.back)stack.push(node.back);}}
  all(){const out=[],stack=[this];while(stack.length){const node=stack.pop();for(const p of node.p)out.push(p);if(node.front)stack.push(node.front);if(node.back)stack.push(node.back);}return out;}
  clipPolys(polys){const out=[],stack=[[this,polys]];while(stack.length){const [node,ps]=stack.pop();if(!ps.length)continue;if(!node.n){for(const p of ps)out.push(p);continue;}const f=[],b=[];for(const p of ps)split(p,node.n,node.w,f,b,f,b);if(node.front)stack.push([node.front,f]);else for(const p of f)out.push(p);if(node.back)stack.push([node.back,b]);}return out;}
  clipTo(tree){const stack=[this];while(stack.length){const node=stack.pop();node.p=tree.clipPolys(node.p);if(node.front)stack.push(node.front);if(node.back)stack.push(node.back);}}
 }
 function polygons(g){if(g.csgPolygons)return g.csgPolygons.map(v=>{const verts=v.map(p=>p.slice());let n=[0,0,0];for(let i=1;i<verts.length-1;i++){const q=cross(sub(verts[i],verts[0]),sub(verts[i+1],verts[0]));if(len(q)>len(n))n=q;}n=norm(n);return new Poly(verts,n,dot(n,verts[0]));});const out=[],p=g.positions;for(let i=0;i<p.length;i+=9){const v=[Array.from(p.subarray(i,i+3)),Array.from(p.subarray(i+3,i+6)),Array.from(p.subarray(i+6,i+9))];if(len(cross(sub(v[1],v[0]),sub(v[2],v[0])))>1e-10)out.push(new Poly(v));}return coalesce(out,g);}
 function coalesce(polys,g){
  // Greedily dissolve coplanar interior edges into convex BSP polygons.
  // This keeps float32 STL triangulation details out of the splitting tree.
  if(polys.length!==g.positions.length/9)return polys;
  const t=FG.topology(g),nodes=polys.map((p,i)=>({parent:i,ids:t.faces[i].slice(),p,area:len(cross(sub(p.v[1],p.v[0]),sub(p.v[2],p.v[0])))}));
  const find=i=>{let j=i;while(nodes[j].parent!==j)j=nodes[j].parent;while(i!==j){const k=nodes[i].parent;nodes[i].parent=j;i=k;}return j;};
  const pairs=[...t.edges.values()].filter(es=>es.length===2).map(es=>[es[0].face,es[1].face]);
  for(let pass=0;pass<8;pass++){let changes=0;
   for(const pair of pairs){let a=find(pair[0]),b=find(pair[1]);if(a===b)continue;const A=nodes[a],B=nodes[b];if(A.ids.length+B.ids.length>512)continue;
    const plane=A.area>=B.area?A.p:B.p,normal=plane.n,w=plane.w;
    if(dot(A.p.n,B.p.n)<.999999||!A.ids.concat(B.ids).every(i=>Math.abs(dot(normal,t.vertices[i])-w)<epsilon*.8))continue;
    const edges=new Map();for(const ids of [A.ids,B.ids])for(let i=0;i<ids.length;i++){const x=ids[i],y=ids[(i+1)%ids.length],rev=y+':'+x;if(edges.has(rev))edges.delete(rev);else edges.set(x+':'+y,[x,y]);}
    const next=new Map();let bad=false;for(const [x,y] of edges.values()){if(next.has(x)){bad=true;break;}next.set(x,y);}if(bad||next.size<3)continue;
    const start=next.keys().next().value,ids=[];let at=start;do{ids.push(at);at=next.get(at);if(at===undefined||ids.length>next.size){bad=true;break;}}while(at!==start);
    if(bad||ids.length!==next.size)continue;
    for(let i=0;i<ids.length;i++){const x=t.vertices[ids[(i+ids.length-1)%ids.length]],y=t.vertices[ids[i]],z=t.vertices[ids[(i+1)%ids.length]],u=sub(y,x),v=sub(z,y);if(dot(cross(u,v),normal)<-epsilon*(len(u)+len(v))){bad=true;break;}}
    if(bad)continue;
    A.ids=ids;A.p=new Poly(ids.map(i=>t.vertices[i]),normal.slice(),w);A.area+=B.area;B.parent=a;changes++;
   }if(!changes)break;
  }
  return nodes.filter((n,i)=>n.parent===i).map(n=>n.p);
 }
 function lowerBound(a,val,axis){let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m][axis]<val)lo=m+1;else hi=m;}return lo;}
 function tessellate(polys){/* Insert shared boundary vertices before triangulation, eliminating BSP T-junctions. */const unique=new Map(),snap=p=>{const key=FG.keyOf(p,0,epsilon);if(!unique.has(key))unique.set(key,p);return unique.get(key);};for(const p of polys)p.v=p.v.map(snap);const vertices=[...unique.values()],sorted=[0,1,2].map(k=>vertices.slice().sort((a,b)=>a[k]-b[k])),cache=new Map(),out=[];let work=0;
  for(const poly of polys){const contour=[];for(let i=0;i<poly.v.length;i++){const a=poly.v[i],b=poly.v[(i+1)%poly.v.length],ka=FG.keyOf(a,0,epsilon),kb=FG.keyOf(b,0,epsilon);if(ka===kb)continue;const cacheKey=ka<kb?ka+'|'+kb:kb+'|'+ka;let pts=cache.get(cacheKey);if(!pts){const d=sub(b,a),l2=dot(d,d),axis=Math.abs(d[0])>Math.abs(d[1])?(Math.abs(d[0])>Math.abs(d[2])?0:2):(Math.abs(d[1])>Math.abs(d[2])?1:2),list=sorted[axis];pts=[a,b];const start=lowerBound(list,Math.min(a[axis],b[axis])+epsilon,axis),end=lowerBound(list,Math.max(a[axis],b[axis])-epsilon,axis);for(let j=start;j<end;j++){if(++work>25000000)throw Error(FI.t("Tessellation trop complexe. Les sources ont été conservées."));const v=list[j],t=dot(sub(v,a),d)/l2;if(t<=epsilon/Math.sqrt(l2)||t>=1-epsilon/Math.sqrt(l2))continue;const err=sub(v,add(a,mul(d,t)));if(dot(err,err)<epsilon*epsilon*2)pts.push(v);}pts.sort((v,w)=>dot(sub(v,a),d)-dot(sub(w,a),d));cache.set(cacheKey,pts);}const ordered=pts[0]===a?pts:pts.slice().reverse();for(let j=0;j<ordered.length-1;j++)contour.push(ordered[j]);}if(contour.length===3)FG.tri(out,...contour);else if(contour.length>3){const c=mul(contour.reduce((s,v)=>add(s,v),[0,0,0]),1/contour.length);for(let i=0;i<contour.length;i++)FG.tri(out,c,contour[i],contour[(i+1)%contour.length]);}if(out.length/9>FG.MAX_TRIANGLES)throw Error(FI.t("Résultat trop dense."));}
  if(!out.length)return null;const geo=FG.clean(FG.geometry(out)).geo;geo.csgPolygons=polys.map(p=>p.v.map(v=>v.slice()));return geo;
 }
 function run(a,b,op){if(a.positions.length/9+b.positions.length/9>80000)throw Error(FI.t("Les booléens sont limités à 80 000 triangles cumulés. Utilisez « Simplifier » sur une copie."));for(const g of [a,b])if(!g.csgPolygons){const d=FG.analyze(g);if(!d.closed||d.signedVolume<=0)throw Error(FI.t("Le booléen nécessite des volumes fermés et orientés vers l’extérieur. Utilisez « Analyser le maillage »."));}steps=0;epsilon=Math.max(1e-5,Math.max(...a.bounds.size,...b.bounds.size)*1e-6);const A=new Node(polygons(a)),B=new Node(polygons(b));if(op==='union'){A.clipTo(B);B.clipTo(A);B.invert();B.clipTo(A);B.invert();A.build(B.all());}else if(op==='subtract'){A.invert();A.clipTo(B);B.clipTo(A);B.invert();B.clipTo(A);B.invert();A.build(B.all());A.invert();}else if(op==='intersect'){A.invert();B.clipTo(A);B.invert();A.clipTo(B);B.clipTo(A);A.build(B.all());A.invert();}else throw Error(FI.t("Opération booléenne inconnue."));const result=tessellate(A.all());if(result){const report=FG.analyze(result);if(!report.closed)throw Error(FI.t("Cette opération produit un maillage non fermé ou ambigu. Aucun résultat n’a été appliqué. Essayez un outil plus simple ou une autre position de coupe."));}return result;}
 return {run};
})();
if(typeof module!=='undefined')module.exports=FCSG;
