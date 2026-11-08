/* Automatic fillets share the existing exact edge detector and convex clipper.
 * All bands are cut from original edges at once. Three-face outer vertices
 * receive spherical caps when every incident edge is rounded. */
var FAutoFillet = (() => {
  'use strict';
  const {add, sub, mul, dot, cross, norm, len} = FM;
  function plan(g, settings = {}, info = FFillet.inspect(g)) {
    const scope = settings.scope || 'all';
    if (!['all', 'side'].includes(scope)) throw Error('Invalid automatic fillet scope.');
    const orientation = settings.orientation || 'all';
    if (!['all', 'vertical', 'horizontal'].includes(orientation)) throw Error('Invalid fillet edge orientation.');
    const axis = settings.orientationAxis || [0, 0, 1];
    if (orientation !== 'all' && (!Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite) || len(axis) < .9))
      throw Error('Invalid vertical axis for edge rounding.');
    const vertical = orientation === 'all' ? null : norm(axis);
    let patches = null;
    if (scope === 'side') {
      const d = settings.direction;
      if (!Array.isArray(d) || d.length !== 3 || !d.every(Number.isFinite) || len(d) < .9) throw Error('Choose a side to round.');
      const direction = norm(d), scores = info.patches.map(p => dot(p.normal, direction));
      const best = Math.max(...scores), facing = info.patches.map((p, i) => ({p, i})).filter(({i}) => scores[i] > best - 1e-4);
      const outer = Math.max(...facing.map(({p}) => dot(p.origin, direction)));
      patches = new Set(facing.filter(({p}) => dot(p.origin, direction) >= outer - info.tol * 8).map(({i}) => i));
    }
    let edges = info.edges.filter(e => !e.patches.some(p => info.patches[p].smoothFacet) && (!patches || e.patches.some(p => patches.has(p))));
    if (!edges.length) throw Error('No straight outer edges on this side. Try another side or the single-edge tool.');
    // Classify directions in the object's frame, independently of camera orbit.
    // A one-degree tolerance absorbs STL/Float32 noise; oblique edges belong
    // only to the unfiltered selection, never to both orientation filters.
    if (vertical) {
      const sine = Math.sin(Math.PI / 180), cosine = Math.cos(Math.PI / 180);
      edges = edges.filter(e => {
        const alignment = Math.abs(dot(norm(sub(e.b, e.a)), vertical));
        return orientation === 'vertical' ? alignment >= cosine : alignment <= sine;
      });
      if (!edges.length) throw Error(orientation === 'vertical' ? 'No vertical outer edges in this selection.' : 'No horizontal outer edges in this selection.');
    }
    const complex = edges.some(e => !info.convex.isConvex(e.component));
    if (complex) edges = edges.map(e => localEdge(e, info));
    if (edges.some(e => e.reason)) throw Error('Not enough clearance for an automatic fillet. Use the single-edge tool.');
    if (edges.length > 120) throw Error('Too many outer edges for one operation. Choose a single side.');
    const minRadius = Math.max(...edges.map(e => e.minRadius));
    // Opposite bands share the available face width. Do not advertise the
    // single-edge maximum as safe for rounding both sides of that face.
    const maxRadius = Math.min(...edges.map(e => e.maxRadius)) / (complex ? 1 : 2);
    if (maxRadius < minRadius) throw Error('Not enough clearance for an automatic fillet. Use the single-edge tool.');
    return {info, edges, minRadius, maxRadius, scope, complex, orientation};
  }
  function localEdge(edge, info) {
 const {add,sub,mul,dot,len}=FM, c=Math.cos(edge.angle),sn=Math.sin(edge.angle),ratio=Math.tan(edge.angle/2),tol=info.tol;
 const tangents=[mul(sub(mul(edge.normal1,c),edge.normal2),1/sn),mul(sub(mul(edge.normal2,c),edge.normal1),1/sn)];
 let width=Infinity;
 for(let side=0;side<2;side++){
  const tangent=tangents[side],patch=info.patches[edge.patches[side]],segments=patch.boundary.map(b=>[b.a,b.b].map(id=>{const v=sub(info.topology.vertices[id],edge.a);return [dot(v,edge.direction),dot(v,tangent)];}));
  const xs=[edge.length*.5,edge.length*.1,edge.length*.9];
  for(const seg of segments)for(const p of seg)if(p[0]>tol*16&&p[0]<edge.length-tol*16)xs.push(p[0]-tol*8,p[0]+tol*8);
  for(const x of xs){let hit=Infinity;
   for(const [a,b] of segments){if(Math.abs(a[0]-b[0])<tol||x<=Math.min(a[0],b[0])+tol||x>=Math.max(a[0],b[0])-tol)continue;const y=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);if(y>tol*16)hit=Math.min(hit,y);}
   width=Math.min(width,hit);
  }
 }
 const maxRadius=(width-tol*32)/(ratio*2),minRadius=Math.max(.01,tol*64);
 return {...edge,reason:Number.isFinite(maxRadius)&&maxRadius>=minRadius?null:'clearance',maxRadius,minRadius,tangent1:tangents[0],tangent2:tangents[1],caps:[{normal:mul(edge.direction,-1),offset:-dot(edge.direction,edge.a)+tol*4},{normal:edge.direction.slice(),offset:dot(edge.direction,edge.b)+tol*4}]};
}

  function clipPlanes(edges, radius, origin, info, caps = false) {
    const planes = [];
    for (const edge of edges) {
      const segments = Math.max(8, Math.ceil(edge.angle / (Math.PI / 48))), c = Math.cos(edge.angle);
      const basis = mul(sub(edge.normal2, mul(edge.normal1, c)), 1 / Math.sin(edge.angle));
      const center = add(sub(edge.a, origin), mul(add(edge.normal1, edge.normal2), -radius / (1 + c)));
      for (let step = 0; step < segments; step++) {
        const angle = edge.angle * (step + .5) / segments;
        const n = add(mul(edge.normal1, Math.cos(angle)), mul(basis, Math.sin(angle)));
        planes.push({n, w: dot(n, center) + radius * Math.cos(edge.angle / (2 * segments))});
      }
    }
    if (!caps) return planes;
    const incident = new Map();
    for (const edge of edges) for (const v of [edge.a, edge.b]) {
      const key = FG.keyOf(v);
      if (!incident.has(key)) incident.set(key, {v, edges: []});
      incident.get(key).edges.push(edge);
    }
    for (const {v, edges: at} of incident.values()) {
      const ids = [...new Set(at.flatMap(e => e.patches))];
      if (at.length !== 3 || ids.length !== 3) continue;
      const ns = ids.map(i => info.patches[i].normal), det = dot(ns[0], cross(ns[1], ns[2]));
      if (Math.abs(det) < 1e-7) continue;
      const delta = mul(add(add(cross(ns[1], ns[2]), cross(ns[2], ns[0])), cross(ns[0], ns[1])), -radius / det);
      const center = add(sub(v, origin), delta);
      // The sphere must be tangent to all three incident planes, inside the
      // original component. Unusual high-valence corners keep the band solver.
      if (ids.some(i => Math.abs(dot(info.patches[i].normal, delta) + radius) > info.tol)) continue;
      const steps = 10;
      for (let i = 1; i < steps; i++) for (let j = 1; j < steps - i; j++) {
        const n = norm(add(add(mul(ns[0], i), mul(ns[1], j)), mul(ns[2], steps - i - j)));
        planes.push({n, w: dot(n, center) + radius});
      }
    }
    return planes;
  }
  function run(args, progress = () => {}, wasm = null) {
    const g = FG.geometry(args.mesh), p = plan(g, args), r = Number(args.radius);
    const adaptive = p.complex && args.adaptive !== false;
    if (!Number.isFinite(r) || r < p.minRadius || (!adaptive && r > p.maxRadius)) throw Error('Radius exceeds the available clearance. Reduce it before applying.');
    if (p.complex) return roundComplex(g, p, r, adaptive, wasm, progress, args.progressLabel);
    const outputs = [], guides = []; let rounded = 0;
    for (const comp of p.info.convex.components) {
      const chosen = p.edges.filter(e => e.component === comp.id);
      const positions = new Float32Array(comp.faces.length * 9);
      comp.faces.forEach((fi, i) => positions.set(g.positions.subarray(fi * 9, fi * 9 + 9), i * 9));
      if (!chosen.length) { outputs.push(positions); continue; }
      progress('Rounding outer edges: ' + (rounded + 1) + ' / ' + p.edges.length);
      if (p.info.convex.isConvex(comp.id)) {
        const mesh = FG.geometry(positions), info = FFillet.inspect(mesh), edges = chosen.map(e => FFillet.match(info, e));
        const result = FFillet.roundConvex(mesh, info, edges[0], r, () => {}, edges);
        outputs.push(result.positions); guides.push(...(result.stats.guideLines || []));
      }
      rounded += chosen.length;
    }
    const positions = new Float32Array(outputs.reduce((n, p) => n + p.length, 0));
    let offset = 0; for (const p of outputs) { positions.set(p, offset); offset += p.length; }
    const result = FG.geometry(positions), report = FG.analyze(result), removed = p.info.report.volume - report.volume;
    if (!report.closed || report.signedVolume <= 0 || removed <= Math.max(1e-9, p.info.report.volume * 1e-10)) throw Error('Automatic rounding could not produce a closed solid. Reduce the radius or choose a single side.');
    return {positions, stats: {radius: r, edgeCount: rounded, edgeLength: p.edges.reduce((n, e) => n + e.length, 0), triangles: report.triangles, closed: true, removedVolume: removed, minRadius: p.minRadius, maxRadius: p.maxRadius, guideLines: guides, scope: p.scope, orientation: p.orientation}, mode: 'round'};
  }

  function roundComplex(g, p, radius, adaptive, wasm, progress, progressLabel) {
    if (!wasm) throw Error('The local rounding engine could not be initialized.');
    const owned = [], own = value => {owned.push(value); return value;};
    const tolerance = Math.max(.0002, Math.min(.001, p.info.tol * 16));
    const solid = geo => {
      const t = FG.topology(geo);
      return own(new wasm.Manifold(new wasm.Mesh({numProp: 3, vertProperties: new Float32Array(t.vertices.flat()), triVerts: new Uint32Array(t.faces.flat())})));
    };
    try {
      const source = solid(g), tools = [], radii = [];
      if (source.status() !== 'NoError') throw Error('The mesh cannot form a valid solid for local rounding.');
      for (let i = 0; i < p.edges.length; i++) {
        const edge = p.edges[i], r = adaptive ? Math.min(radius, edge.maxRadius * .95) : radius;
        if (r < edge.minRadius) throw Error('Not enough clearance for an automatic fillet. Use the single-edge tool.');
        const tool = FFillet.cutter(edge, r, p.info.tol).mesh;
        tools.push(solid(tool)); radii.push(r);
        if (i % 8 === 0) progress((progressLabel || 'Rounding outer edges') + ': ' + (i + 1) + ' / ' + p.edges.length);
      }
      const rounded = own(wasm.Manifold.difference([source, ...tools]));
      if (rounded.status() !== 'NoError') throw Error('Automatic rounding could not produce a closed solid. Reduce the radius or choose a single side.');
      // Remove boolean provenance seams before simplification, then round-trip
      // through Float32. Weld by the editor's exact topology keys so the final
      // mesh is valid for both the WASM kernel and the standalone STL editor.
      const original = own(rounded.asOriginal()), simplified = own(original.setTolerance(tolerance));
      let mesh = simplified.getMesh();
      const canonical = new Map();
      for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
        const key = FG.keyOf(mesh.vertProperties, i);
        if (canonical.has(key)) {const at = canonical.get(key); for (let k = 0; k < 3; k++) mesh.vertProperties[i + k] = mesh.vertProperties[at + k];}
        else canonical.set(key, i);
      }
      mesh.tolerance = tolerance;
      const imported = own(new wasm.Manifold(mesh)), cleanOriginal = own(imported.asOriginal()), clean = own(cleanOriginal.setTolerance(tolerance * 2));
      if (clean.status() !== 'NoError' || clean.genus() !== source.genus()) throw Error('Local rounding would change an opening or disconnect a thin feature. Reduce the radius.');
      mesh = clean.getMesh();
      const positions = new Float32Array(mesh.triVerts.length * 3);
      for (let i = 0; i < mesh.triVerts.length; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[mesh.triVerts[i] * mesh.numProp + k];
      const result = FG.geometry(positions), report = FG.analyze(result), removed = p.info.report.volume - report.volume;
      if (!report.closed || report.signedVolume <= 0 || removed <= Math.max(1e-9, p.info.report.volume * 1e-10) || FG.connected(result).length !== p.info.convex.components.length)
        throw Error('Automatic rounding could not produce a closed solid. Reduce the radius or choose a single side.');
      return {positions, stats: {radius, edgeCount: p.edges.length, edgeLength: p.edges.reduce((s, e) => s + e.length, 0), triangles: report.triangles, closed: true, removedVolume: removed, minRadius: p.minRadius, maxRadius: p.maxRadius,
        effectiveMin: Math.min(...radii), effectiveMax: Math.max(...radii), adaptedEdges: radii.filter(r => r < radius - 1e-6).length, scope: p.scope, orientation: p.orientation, solver: 'manifold-local', guideLines: []}, mode: 'round'};
    } finally {for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();}
  }

  return {plan, clipPlanes, run};
})();
