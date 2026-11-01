/* Local organic modelling. Millimetres, Z up. Shared by UI and isolated worker. */
var FCharacter = (() => {
  'use strict';
  const {add, sub, mul, dot, cross, len, norm, lerp, clamp} = FM;
  const LIMIT = 120000;
  function metadata(value) {
    if(value==null)return null;
    if(typeof value!=='object'||Array.isArray(value))throw Error('character.parameters');
    const result={};if(value.uv!==undefined){if(!['cylindrical','spherical','planar'].includes(value.uv))throw Error('character.parameters');result.uv=value.uv;}
    if(value.template!==undefined){if(typeof value.template!=='string'||!FCharacterModels.get(value.template))throw Error('character.parameters');result.template=value.template;}
    if(value.base){const b=value.base;if(!['head','bust','body'].includes(b.kind)||![b.height,b.width,b.head,b.detail].every(Number.isFinite))throw Error('character.parameters');result.base={kind:b.kind,height:b.height,width:b.width,head:b.head,detail:b.detail};}
    if(value.bones){if(!Array.isArray(value.bones)||!value.bones.length||value.bones.length>64)throw Error('character.parameters');
      result.bones=value.bones.map((b,i)=>{if(!Number.isInteger(b.parent)||b.parent>=i||b.parent< -1||(i&&b.parent<0)||!Array.isArray(b.p)||b.p.length!==3||b.p.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)||!Array.isArray(b.rotation)||b.rotation.length!==3||b.rotation.some(v=>!Number.isFinite(v)||Math.abs(v)>180))throw Error('character.parameters');return {name:String(b.name||'Joint').slice(0,80),parent:b.parent,p:b.p.slice(),rotation:b.rotation.slice()};});
    }
    if(value.retopology){const r=value.retopology;if(!Array.isArray(r.vertices)||r.vertices.length>40000||!Array.isArray(r.quads)||r.quads.length>10000||r.vertices.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e8))||r.quads.some(q=>!Array.isArray(q)||q.length!==4||new Set(q).size!==4||q.some(i=>!Number.isInteger(i)||i<0||i>=r.vertices.length)))throw Error('character.parameters');result.retopology={vertices:r.vertices.map(v=>v.slice()),quads:r.quads.map(q=>q.slice())};}
    return result;
  }
  function referenceConfig(value) {
    if(value==null)return {references:{}};
    if(typeof value!=='object'||Array.isArray(value))throw Error('character.parameters');
    const references={};for(const view of ['front','right']){const r=value.references?.[view];if(!r)continue;
      if(typeof r.data!=='string'||r.data.length>4*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(r.data)||![r.height,r.x,r.z,r.opacity].every(Number.isFinite)||r.height<.1||r.height>10000||Math.abs(r.x)>10000||Math.abs(r.z)>10000||r.opacity<.05||r.opacity>.8)throw Error('character.parameters');
      references[view]={data:r.data,height:r.height,x:r.x,z:r.z,opacity:r.opacity};
    }return {references};
  }
  function check(g, max = LIMIT) {
    if (g.positions.length / 9 > max) throw Error('character.limit');
    return FG.topology(g);
  }
  function rebuild(vertices, faces) {
    const p = new Float32Array(faces.length * 9);
    faces.forEach((f, i) => f.forEach((v, k) => p.set(vertices[v], i * 9 + k * 3)));
    return FG.geometry(p);
  }
  function loop(g) {
    if(g.positions.length/9>28000)throw Error('character.loopLimit');
    const t = check(g, 28000), {vertices: v, faces, edges, adj} = t;
    const boundary = v.map(() => []);
    for (const es of edges.values()) {
      if (es.length > 2) throw Error('character.manifold');
      if (es.length === 1) { const {a,b} = es[0]; boundary[a].push(b); boundary[b].push(a); }
    }
    const points = v.map((p, i) => {
      if (boundary[i].length === 2) return add(mul(p, .75), mul(add(v[boundary[i][0]], v[boundary[i][1]]), .125));
      if (boundary[i].length) return p.slice();
      const n = adj[i].size; if (!n) return p.slice();
      const beta = (5/8 - (3/8 + Math.cos(2*Math.PI/n)/4)**2)/n;
      return add(mul(p, 1 - n*beta), mul([...adj[i]].reduce((s,j) => add(s,v[j]), [0,0,0]), beta));
    });
    const edgeIDs = new Map(), key = (a,b) => a < b ? a+':'+b : b+':'+a;
    for (const [k, es] of edges) {
      const {a,b} = es[0]; let p = mul(add(v[a],v[b]), .5);
      if (es.length === 2) {
        const c = faces[es[0].face].find(i => i !== a && i !== b), d = faces[es[1].face].find(i => i !== a && i !== b);
        p = add(mul(add(v[a],v[b]), 3/8), mul(add(v[c],v[d]), 1/8));
      }
      edgeIDs.set(k, points.length); points.push(p);
    }
    const fs = [];
    for (const [a,b,c] of faces) { const ab=edgeIDs.get(key(a,b)),bc=edgeIDs.get(key(b,c)),ca=edgeIDs.get(key(c,a)); fs.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]); }
    const result=rebuild(points,fs);if(g.colors)result.colors=subdivisionColors(g.colors);return result;
  }
  function subdivisionColors(colors){
    const out=new Float32Array(colors.length*4);let offset=0;
    for(let i=0;i<colors.length;i+=9){const a=Array.from(colors.subarray(i,i+3)),b=Array.from(colors.subarray(i+3,i+6)),c=Array.from(colors.subarray(i+6,i+9)),ab=lerp(a,b,.5),bc=lerp(b,c,.5),ca=lerp(c,a,.5);for(const color of [a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca]){out.set(color,offset);offset+=3;}}
    return out;
  }
  function refine(g){if(g.positions.length/9>30000)throw Error('character.detailLimit');const result=FG.subdivide(g);if(g.colors)result.colors=subdivisionColors(g.colors);return result;}
  // A reusable, incrementally updated vertex index for brush neighbourhoods.
  class Spatial {
    constructor(vertices, cell) { this.v=vertices; this.cell=Math.max(.0001,cell); this.bins=new Map(); this.keys=[]; vertices.forEach((p,i)=>this.put(i,p)); }
    key(p) {return p.map(v=>Math.floor(v/this.cell)).join(',');}
    put(i,p) {const k=this.key(p),old=this.keys[i];if(old===k)return;if(old!==undefined){const b=this.bins.get(old);b.delete(i);if(!b.size)this.bins.delete(old);}if(!this.bins.has(k))this.bins.set(k,new Set());this.bins.get(k).add(i);this.keys[i]=k;}
    query(p,r) {const a=p.map(x=>Math.floor((x-r)/this.cell)),b=p.map(x=>Math.floor((x+r)/this.cell)),out=[];
      if((b[0]-a[0]+1)*(b[1]-a[1]+1)*(b[2]-a[2]+1)>100000)return this.v.map((_,i)=>i);
      for(let z=a[2];z<=b[2];z++)for(let y=a[1];y<=b[1];y++)for(let x=a[0];x<=b[0];x++){const bin=this.bins.get(x+','+y+','+z);if(bin)for(const i of bin)out.push(i);}return out;
    }
  }
  // Triangle BVH; refit only leaves and ancestors touched by a brush stroke.
  class BVH {
    constructor(g) {this.g=g;this.leaves=[];this.root=this.build(Array.from({length:g.positions.length/9},(_,i)=>i),null);}
    bounds(ids) {const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],p=this.g.positions;for(const i of ids)for(let k=0;k<9;k++){const a=k%3,q=p[i*9+k];lo[a]=Math.min(lo[a],q);hi[a]=Math.max(hi[a],q);}return {min:lo,max:hi};}
    build(ids,parent) {const b=this.bounds(ids),node={...b,parent};if(ids.length<=12){node.ids=ids;ids.forEach(i=>this.leaves[i]=node);}else{const size=sub(b.max,b.min),a=size.indexOf(Math.max(...size)),p=this.g.positions;ids.sort((i,j)=>(p[i*9+a]+p[i*9+3+a]+p[i*9+6+a])-(p[j*9+a]+p[j*9+3+a]+p[j*9+6+a]));const m=ids.length>>1;node.left=this.build(ids.slice(0,m),node);node.right=this.build(ids.slice(m),node);}return node;}
    refit(faces) {const nodes=new Set();for(const f of faces)if(this.leaves[f])nodes.add(this.leaves[f]);let layer=[...nodes];for(const n of layer)Object.assign(n,this.bounds(n.ids));while(layer.length){const next=new Set();for(const n of layer)if(n.parent)next.add(n.parent);for(const n of next){n.min=n.left.min.map((v,i)=>Math.min(v,n.right.min[i]));n.max=n.left.max.map((v,i)=>Math.max(v,n.right.max[i]));}layer=[...next];}}
    pick(origin,direction) {let best=null;const p=this.g.positions,visit=n=>{if(!FM.rayBox(origin,direction,n))return;if(n.ids){for(const i of n.ids){const a=p.subarray(i*9,i*9+3),b=p.subarray(i*9+3,i*9+6),c=p.subarray(i*9+6,i*9+9),d=FM.rayTriangle(origin,direction,a,b,c);if(d!==null&&(!best||d<best.distance))best={distance:d,face:i,local:add(origin,mul(direction,d)),normal:FG.normal(a,b,c)};}}else{visit(n.left);visit(n.right);}};visit(this.root);return best;}
  }
  function mirrors(t,axis,plane) {
    const extent=Math.max(...FM.bounds(t.vertices.flat()).size),tol=Math.max(1e-5,extent*2e-5),index=new Spatial(t.vertices,tol*2),result=new Int32Array(t.vertices.length);result.fill(-1);
    t.vertices.forEach((p,i)=>{const q=p.slice();q[axis]=2*plane-p[axis];let d=tol;for(const j of index.query(q,tol)){const s=len(sub(t.vertices[j],q));if(s<=d){result[i]=j;d=s;}}});return result;
  }
  // Marching tetrahedra: one global edge cache prevents cracks between cells.
  function surface(values,dims,origin,step) {
    const [nx,ny,nz]=dims,idx=(x,y,z)=>x+nx*(y+ny*z),out=[],cache=new Map();
    const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],tets=[[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]];
    function edge(a,b,ps,vs,ids){const ia=ids[a],ib=ids[b],key=ia<ib?ia+':'+ib:ib+':'+ia;if(!cache.has(key))cache.set(key,lerp(ps[a],ps[b],vs[a]/(vs[a]-vs[b])).map(Math.fround));return cache.get(key);}
    function tri(a,b,c,dir){const n=cross(sub(b,a),sub(c,a));if(len(n)<1e-12)return;if(dot(n,dir)<0)[b,c]=[c,b];out.push(...a,...b,...c);if(out.length/9>LIMIT)throw Error('character.resolution');}
    for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const ids=corners.map(c=>idx(x+c[0],y+c[1],z+c[2])),vs=ids.map(i=>values[i]-.000137);
      if(vs.every(v=>v<0)||vs.every(v=>v>=0))continue;
      const ps=corners.map(c=>[origin[0]+(x+c[0])*step,origin[1]+(y+c[1])*step,origin[2]+(z+c[2])*step]);
      for(const tet of tets){const inside=tet.filter(i=>vs[i]<0),outside=tet.filter(i=>vs[i]>=0);if(!inside.length||!outside.length)continue;
        const center=a=>mul(a.reduce((s,i)=>add(s,ps[i]),[0,0,0]),1/a.length),dir=sub(center(outside),center(inside)),e=(a,b)=>edge(a,b,ps,vs,ids);
        if(inside.length===1||outside.length===1){const one=inside.length===1?inside[0]:outside[0],others=inside.length===1?outside:inside;tri(e(one,others[0]),e(one,others[1]),e(one,others[2]),dir);}
        else{const [a,b]=inside,[c,d]=outside,A=e(a,c),B=e(a,d),C=e(b,c),D=e(b,d);tri(A,B,D,dir);tri(A,D,C,dir);}
      }
    }
    if(!out.length)throw Error('character.empty');
    const g=FG.clean(FG.geometry(out)).geo,report=FG.analyze(g);if(!report.closed||report.signedVolume<=0)throw Error('character.manifold');return g;
  }
  const smoothMin=(a,b,k)=>{if(!Number.isFinite(a))return b;const h=clamp(.5+.5*(b-a)/k,0,1);return b*(1-h)+a*h-k*h*(1-h);};
  function base(kind,height=170,width=1,head=1,detail=48) {
    if(!['head','bust','body'].includes(kind)||!Number.isFinite(height)||height<10||height>1000||!Number.isFinite(width)||width<.6||width>1.5||!Number.isFinite(head)||head<.7||head>1.4)throw Error('character.parameters');
    const fields=[],ell=(c,r)=>fields.push(p=>{const q=p.map((v,i)=>(v-c[i])/r[i]);return (len(q)-1)*Math.min(...r);});
    const capsule=(a,b,r)=>fields.push(p=>{const ab=sub(b,a),h=clamp(dot(sub(p,a),ab)/dot(ab,ab),0,1);return len(sub(p,add(a,mul(ab,h))))-r;});
    if(kind==='head'){ell([0,0,.53],[.32*width,.30,.44*head]);ell([0,-.12,.31],[.25*width,.23,.22]);capsule([0,0,.04],[0,0,.30],.15);ell([0,-.30,.49],[.055,.09,.09]);}
    else {
      ell([0,0,.66],[.17*width,.105,.20]);ell([0,0,.49],[.14*width,.105,.095]);capsule([0,0,.78],[0,0,.87],.055);ell([0,0,.93],[.075*head,.077*head,.10*head]);
      for(const s of [-1,1]){capsule([s*.13*width,0,.78],[s*.27*width,0,.66],.055);capsule([s*.27*width,0,.66],[s*.37*width,-.015,.56],.043);ell([s*.40*width,-.015,.54],[.055,.035,.045]);
        if(kind==='body'){capsule([s*.075*width,0,.49],[s*.085*width,0,.28],.069);capsule([s*.085*width,0,.28],[s*.09*width,0,.075],.047);ell([s*.09*width,-.035,.045],[.053,.09,.04]);}}
    }
    const lo=kind==='head'?[-.46,-.46,-.20]:kind==='bust'?[-.52,-.25,.34]:[-.52,-.25,-.04],hi=kind==='head'?[.46,.40,1.18]:[.52,.25,1.12];
    lo[0]*=width;hi[0]*=width;hi[2]=Math.max(hi[2],kind==='head'?.53+.44*head+.08:.93+.10*head+.08);
    const step=Math.max(...sub(hi,lo))/clamp(Math.round(detail),24,64),dims=sub(hi,lo).map(v=>Math.ceil(v/step)+1),values=new Float32Array(dims.reduce((a,b)=>a*b,1));
    for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){const p=[lo[0]+x*step,lo[1]+y*step,lo[2]+z*step];let d=Infinity;for(const f of fields)d=smoothMin(d,f(p),.035);values[x+dims[0]*(y+dims[1]*z)]=d;}
    // Extract in millimetres, so tiny normalized triangles are not collapsed by
    // the application's fixed welding tolerance before scaling the model.
    const g=surface(values,dims,lo.map(v=>v*height),step*height),b=g.bounds,factor=height/b.size[2],p=g.positions;for(let i=0;i<p.length;i+=3){p[i]*=factor;p[i+1]*=factor;p[i+2]=(p[i+2]-b.min[2])*factor;}return FG.geometry(p);
  }
  function remesh(meshes,resolution=48,progress=()=>{}) {
    if(!Array.isArray(meshes)||!meshes.length||![32,48,64,96].includes(resolution))throw Error('character.parameters');
    const gs=meshes.map(p=>FG.geometry(p));if(gs.reduce((s,g)=>s+g.positions.length/9,0)>LIMIT)throw Error('character.limit');
    for(const g of gs)if(!FG.analyze(g).closed)throw Error('character.closed');
    const b=FM.bounds(gs.flatMap(g=>[...g.bounds.min,...g.bounds.max])),step=Math.max(...b.size)/resolution,origin=b.min.map(v=>v-step*2.1),dims=b.size.map(v=>Math.ceil(v/step)+6),[nx,ny,nz]=dims,total=nx*ny*nz;
    const occupied=new Uint8Array(total);let work=0;
    for(const g of gs){const rows=Array.from({length:ny*nz},()=>[]),p=g.positions;
      // Project each triangle to the YZ grid, then intersect X scanlines.
      for(let i=0;i<p.length;i+=9){const a=Array.from(p.subarray(i,i+3)),u=sub(Array.from(p.subarray(i+3,i+6)),a),v=sub(Array.from(p.subarray(i+6,i+9)),a),den=u[1]*v[2]-u[2]*v[1];if(Math.abs(den)<1e-16)continue;
        const ys=[a[1],a[1]+u[1],a[1]+v[1]],zs=[a[2],a[2]+u[2],a[2]+v[2]],y0=Math.max(0,Math.ceil((Math.min(...ys)-origin[1])/step)),y1=Math.min(ny-1,Math.floor((Math.max(...ys)-origin[1])/step)),z0=Math.max(0,Math.ceil((Math.min(...zs)-origin[2])/step)),z1=Math.min(nz-1,Math.floor((Math.max(...zs)-origin[2])/step));
        for(let z=z0;z<=z1;z++)for(let y=y0;y<=y1;y++){if(++work>24000000)throw Error('character.resolution');const Y=origin[1]+y*step-a[1],Z=origin[2]+z*step-a[2],s=(Y*v[2]-Z*v[1])/den,t=(Z*u[1]-Y*u[2])/den;if(s>=-1e-8&&t>=-1e-8&&s+t<=1+1e-8)rows[y+ny*z].push({x:a[0]+s*u[0]+t*v[0],delta:den<0?1:-1});}
      }
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
        const hits=rows[y+ny*z].sort((a,b)=>a.x-b.x),events=[];for(const hit of hits){const last=events.at(-1);if(last&&hit.x-last.x<=step*1e-6)last.delta+=hit.delta;else events.push({...hit});}
        // Non-zero winding joins overlapping outward shells within one STL,
        // while inward cavity shells still cancel the enclosing solid.
        let winding=0;for(let k=0;k+1<events.length;k++){winding+=Math.sign(events[k].delta);if(!winding)continue;const x0=Math.max(0,Math.ceil((events[k].x-origin[0])/step)),x1=Math.min(nx-1,Math.floor((events[k+1].x-origin[0])/step));for(let x=x0;x<=x1;x++)occupied[x+nx*(y+ny*z)]=1;}
      }
    }
    progress('character.surface');let values=Float32Array.from(occupied,x=>x?-1:1);
    // One symmetric filter removes voxel stair steps. Resolution is explicit.
    const filtered=values.slice();for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=x+nx*(y+ny*z);filtered[i]=(values[i]*2+values[i-1]+values[i+1]+values[i-nx]+values[i+nx]+values[i-nx*ny]+values[i+nx*ny])/8;}
    const g=surface(filtered,dims,origin,step);return {positions:g.positions,voxel:step,triangles:g.positions.length/9};
  }
  function normals(t) {
    const face=t.faces.map(f=>cross(sub(t.vertices[f[1]],t.vertices[f[0]]),sub(t.vertices[f[2]],t.vertices[f[0]]))),adj=t.vertices.map(()=>[]),sum=t.vertices.map(()=>[0,0,0]);
    t.faces.forEach((f,i)=>f.forEach(v=>{adj[v].push(i);sum[v]=add(sum[v],face[i]);}));return {face,adj,sum};
  }
  function uv(g,mode='cylindrical') {
    if(!['cylindrical','spherical','planar'].includes(mode))throw Error('character.parameters');
    const p=g.positions,b=g.bounds,uvs=new Float32Array(p.length/3*2);
    for(let i=0;i<p.length;i+=9){const us=[];for(let k=0;k<3;k++){const off=i+k*3,x=p[off]-b.center[0],y=p[off+1]-b.center[1],z=p[off+2]-b.center[2];let u,v;
      if(mode==='planar'){u=(p[off]-b.min[0])/(b.size[0]||1);v=(p[off+2]-b.min[2])/(b.size[2]||1);}else{u=Math.atan2(y,x)/(2*Math.PI)+.5;v=mode==='spherical'?Math.acos(clamp(z/(Math.hypot(x,y,z)||1),-1,1))/Math.PI:(p[off+2]-b.min[2])/(b.size[2]||1);}us.push(u);uvs[(off/3)*2]=u;uvs[(off/3)*2+1]=v;
    }if(mode!=='planar'&&Math.max(...us)-Math.min(...us)>.5)for(let k=0;k<3;k++)if(us[k]<.5)uvs[(i/3+k)*2]+=1;}
    return uvs;
  }
  function skeleton(bounds) {
    const b=bounds,c=b.center,h=b.size[2],w=b.size[0],p=(x,z)=>[c[0]+x*w,c[1],b.min[2]+z*h];
    return [{name:'Hips',parent:-1,p:p(0,.49)},{name:'Spine',parent:0,p:p(0,.65)},{name:'Chest',parent:1,p:p(0,.77)},{name:'Neck',parent:2,p:p(0,.85)},{name:'Head',parent:3,p:p(0,.94)},
      {name:'UpperArm.L',parent:2,p:p(-.17,.77)},{name:'Forearm.L',parent:5,p:p(-.34,.65)},{name:'Hand.L',parent:6,p:p(-.47,.54)},
      {name:'UpperArm.R',parent:2,p:p(.17,.77)},{name:'Forearm.R',parent:8,p:p(.34,.65)},{name:'Hand.R',parent:9,p:p(.47,.54)},
      {name:'Thigh.L',parent:0,p:p(-.09,.46)},{name:'Shin.L',parent:11,p:p(-.10,.27)},{name:'Foot.L',parent:12,p:p(-.10,.06)},
      {name:'Thigh.R',parent:0,p:p(.09,.46)},{name:'Shin.R',parent:14,p:p(.10,.27)},{name:'Foot.R',parent:15,p:p(.10,.06)}].map(b=>({...b,rotation:[0,0,0]}));
  }
  function weights(p,bones) {
    const ds=bones.map((b,i)=>{const children=bones.filter(c=>c.parent===i),end=children.length===1?children[0].p:b.p,ab=sub(end,b.p),t=clamp(dot(sub(p,b.p),ab)/(dot(ab,ab)||1),0,1);return {i,d:len(sub(p,add(b.p,mul(ab,t))))};}).sort((a,b)=>a.d-b.d).slice(0,4),raw=ds.map(d=>1/Math.max(.001,d.d)**4),total=raw.reduce((s,v)=>s+v,0);return {j:ds.map(d=>d.i),w:raw.map(v=>v/total)};
  }
  function poseMatrices(bones) {
    const matrices=[];bones.forEach((b,i)=>{const local=FM.compose(b.parent<0?b.p:sub(b.p,bones[b.parent].p),FM.qeuler(b.rotation||[0,0,0]),[1,1,1]);matrices[i]=b.parent<0?local:FM.mm(matrices[b.parent],local);});return matrices.map((m,i)=>FM.mm(m,FM.compose(mul(bones[i].p,-1),[0,0,0,1],[1,1,1])));
  }
  function pose(g,bones) {const matrices=poseMatrices(bones),p=g.positions,out=new Float32Array(p.length);for(let i=0;i<p.length;i+=3){const v=Array.from(p.subarray(i,i+3)),{j,w}=weights(v,bones);let q=[0,0,0];j.forEach((b,k)=>q=add(q,mul(FM.point(matrices[b],v),w[k])));out.set(q,i);}const result=FG.geometry(out);if(g.colors)result.colors=g.colors.slice();return result;}
  function edit(g,kind,ids,amount=0) {
    const t=check(g),v=t.vertices.map(p=>p.slice()),fs=[],chosen=new Set(ids);if(!chosen.size)throw Error('character.selection');
    if(kind==='splitEdge'){
      const [a,b]=ids;if(ids.length!==2||!t.adj[a]?.has(b))throw Error('character.edge');const m=v.length;v.push(mul(add(v[a],v[b]),.5));
      for(const f of t.faces){if(f.includes(a)&&f.includes(b)){const k=f.findIndex((x,i)=>(x===a&&f[(i+1)%3]===b)||(x===b&&f[(i+1)%3]===a)),A=f[k],B=f[(k+1)%3],C=f[(k+2)%3];fs.push([A,m,C],[m,B,C]);}else fs.push(f);}
    }else if(kind==='extrudeFaces'){
      if(!Number.isFinite(amount)||!amount||Math.abs(amount)>1000||ids.some(i=>!t.faces[i]))throw Error('character.parameters');
      const used=new Set(ids.flatMap(i=>t.faces[i])),sum=new Map(),copy=new Map(),edges=new Map();
      for(const i of ids){const f=t.faces[i],n=cross(sub(v[f[1]],v[f[0]]),sub(v[f[2]],v[f[0]]));for(const a of f)sum.set(a,add(sum.get(a)||[0,0,0],n));for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3],key=a<b?a+':'+b:b+':'+a;if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}
      for(const a of used){copy.set(a,v.length);v.push(add(v[a],mul(norm(sum.get(a)),amount)));}
      t.faces.forEach((f,i)=>fs.push(chosen.has(i)?f.map(a=>copy.get(a)):f));for(const [a,b] of edges.values()){const A=copy.get(a),B=copy.get(b);fs.push([a,b,B],[a,B,A]);}
    }else throw Error('character.parameters');
    const result=rebuild(v,fs),r=FG.analyze(result),before=FG.analyze(g);if(r.boundary>before.boundary||r.nonManifold>before.nonManifold||r.degenerate>before.degenerate)throw Error('character.manifold');return result;
  }
  function thickness(g,threshold=1,samples=1200) {
    if(!Number.isFinite(threshold)||threshold<=0||threshold>1000)throw Error('character.parameters');
    if(!FG.analyze(g).closed)throw Error('character.closed');check(g);const tree=new BVH(g),p=g.positions,step=Math.max(1,Math.ceil(p.length/9/samples)),eps=Math.max(1e-5,Math.max(...g.bounds.size)*1e-6),hits=[];
    for(let f=0;f<p.length/9;f+=step){const a=Array.from(p.subarray(f*9,f*9+3)),b=Array.from(p.subarray(f*9+3,f*9+6)),c=Array.from(p.subarray(f*9+6,f*9+9)),n=FG.normal(a,b,c),center=mul(add(add(a,b),c),1/3),hit=tree.pick(sub(center,mul(n,eps)),mul(n,-1));if(hit&&hit.distance>eps)hits.push({face:f,thickness:hit.distance+eps});}
    if(!hits.length)throw Error('character.empty');return {minimum:Math.min(...hits.map(h=>h.thickness)),maximum:Math.max(...hits.map(h=>h.thickness)),sampleCount:hits.length,thin:hits.filter(h=>h.thickness<threshold),threshold};
  }
  // Binary glTF with vertex normals, UVs, materials and optional real skin joints.
  function glb(objects,withRig=false) {
    const chunks=[],views=[],accessors=[],nodes=[],meshes=[],materials=[],skins=[],roots=[];let size=0;
    function array(data,type,count,componentType,min,max){const pad=(4-size%4)%4;if(pad){chunks.push(new Uint8Array(pad));size+=pad;}const view=views.length;views.push({buffer:0,byteOffset:size,byteLength:data.byteLength});chunks.push(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));size+=data.byteLength;const id=accessors.length;accessors.push({bufferView:view,componentType,count,type,...(min?{min,max}:{})});return id;}
    for(const o of objects){const g=o.geo,count=g.positions.length/3,position=array(g.positions,'VEC3',count,5126,g.bounds.min,g.bounds.max),normal=array(FG.normals(g,true),'VEC3',count,5126),uvs=array(uv(g,o.character?.uv||'cylindrical'),'VEC2',count,5126),c=parseInt(o.color.slice(1),16),material=materials.length;materials.push({name:o.name,pbrMetallicRoughness:{baseColorFactor:[(c>>16&255)/255,(c>>8&255)/255,(c&255)/255,1],metallicFactor:0,roughnessFactor:.8}});
      const attributes={POSITION:position,NORMAL:normal,TEXCOORD_0:uvs},mesh=meshes.length,node=nodes.length;nodes.push({name:o.name,mesh,translation:o.position,rotation:o.rotation,scale:o.scale});roots.push(node);
      if(g.colors){const linear=Float32Array.from(g.colors,v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);attributes.COLOR_0=array(linear,'VEC3',count,5126);}
      const bones=withRig?o.character?.bones:null;
      if(bones?.length){const joints=new Uint16Array(count*4),ws=new Float32Array(count*4);for(let i=0;i<count;i++){const w=weights(Array.from(g.positions.subarray(i*3,i*3+3)),bones);joints.set(w.j,i*4);ws.set(w.w,i*4);}attributes.JOINTS_0=array(joints,'VEC4',count,5123);attributes.WEIGHTS_0=array(ws,'VEC4',count,5126);
        const start=nodes.length,ibm=new Float32Array(bones.length*16);bones.forEach((b,i)=>{ibm.set(FM.compose(mul(b.p,-1),[0,0,0,1],[1,1,1]),i*16);nodes.push({name:b.name,translation:b.parent<0?b.p:sub(b.p,bones[b.parent].p),rotation:FM.qeuler(b.rotation||[0,0,0]),children:bones.map((c,k)=>c.parent===i?start+k:-1).filter(k=>k>=0)});});
        // Mesh and skeleton share the same object transform, above both siblings.
        const group=nodes.length;nodes.push({name:o.name+' rig',translation:o.position,rotation:o.rotation,scale:o.scale,children:[node,start]});roots[roots.length-1]=group;delete nodes[node].translation;delete nodes[node].rotation;delete nodes[node].scale;nodes[node].skin=skins.length;skins.push({joints:bones.map((_,i)=>start+i),skeleton:start,inverseBindMatrices:array(ibm,'MAT4',bones.length,5126)});
      }
      meshes.push({primitives:[{attributes,material,mode:4}]});
    }
    const json={asset:{version:'2.0',generator:'FORMA 3D Character Studio'},scene:0,scenes:[{nodes:roots}],nodes,meshes,materials,buffers:[{byteLength:size}],bufferViews:views,accessors,...(skins.length?{skins}:{})},encoded=new TextEncoder().encode(JSON.stringify(json)),jsonSize=Math.ceil(encoded.length/4)*4,binSize=Math.ceil(size/4)*4,buffer=new ArrayBuffer(12+8+jsonSize+8+binSize),dv=new DataView(buffer),bytes=new Uint8Array(buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,buffer.byteLength,true);dv.setUint32(12,jsonSize,true);dv.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonSize);bytes.set(encoded,20);dv.setUint32(20+jsonSize,binSize,true);dv.setUint32(24+jsonSize,0x004e4942,true);let off=28+jsonSize;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length;}return buffer;
  }
  return {LIMIT,metadata,referenceConfig,loop,refine,Spatial,BVH,mirrors,surface,base,remesh,normals,uv,skeleton,weights,poseMatrices,pose,edit,thickness,glb};
})();
