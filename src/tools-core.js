/* Shared, dependency-free modelling helpers. Embedded in the bilingual standalone application. */
var FTools = (() => {
  'use strict';
  function material(value) {
    if (value == null) return null;
    if (typeof value !== 'object' || typeof value.name !== 'string' ||
        !value.name.trim() || value.name.length > 80 || typeof value.density !== 'number' ||
        !Number.isFinite(value.density) || value.density < .001 || value.density > 30)
      throw Error('Invalid material: density must be 0.001–30 g/cm³.');
    return {name: value.name.trim(), density: value.density};
  }
  function inheritedMaterial(objects) {
    const solids = objects.filter(o => !o.hole), first = solids[0]?.material;
    return first && solids.every(o => o.material?.name === first.name && o.material?.density === first.density)
      ? material(first) : null;
  }
  function patternPlan(input) {
    const {kind, axis, count, step, secondAxis, rows, rowStep, angle, center} = input;
    const integer = n => Number.isInteger(n) && n >= 1 && n <= 300;
    const distance = n => Number.isFinite(n) && Math.abs(n) >= .01 && Math.abs(n) <= 100000;
    if (!['linear', 'grid', 'circular'].includes(kind) || ![0, 1, 2].includes(axis) || !integer(count))
      throw Error('Invalid pattern type, axis or count.');
    if (kind !== 'circular' && count > 1 && !distance(step)) throw Error('Spacing must be 0.01–100,000 mm (positive or negative).');
    if (kind === 'grid' && (![0, 1, 2].includes(secondAxis) || secondAxis === axis || !integer(rows) || (rows > 1 && !distance(rowStep))))
      throw Error('Choose two different axes, valid counts and non-zero spacing.');
    if (kind === 'circular' && (!Number.isFinite(angle) || Math.abs(angle) < .01 || Math.abs(angle) > 360 ||
        !Array.isArray(center) || center.length !== 3 || !center.every(v => Number.isFinite(v) && Math.abs(v) <= 1000000)))
      throw Error('Choose an angle between −360° and 360° (non-zero) and a valid center.');
    const total = count * (kind === 'grid' ? rows : 1);
    if (total < 2 || total > 300) throw Error('The pattern must contain 2–300 occurrences, including the original.');
    const placements = [], normal = [0, 0, 0]; normal[axis] = 1;
    for (let j = 0; j < (kind === 'grid' ? rows : 1); j++) for (let i = 0; i < count; i++) {
      if (!i && !j) continue;
      const offset = [0, 0, 0];
      if (kind !== 'circular') { if (i) offset[axis] = i * step; if (kind === 'grid' && j) offset[secondAxis] = j * rowStep; }
      const degrees = kind === 'circular' ? angle * i / (Math.abs(Math.abs(angle) - 360) < 1e-8 ? count : count - 1) : 0;
      placements.push({offset, rotation: FM.qaxis(normal, FM.rad(degrees))});
    }
    return {total, placements};
  }
  function pattern(objects, scene, input) {
    if (!objects.length) throw Error('Select at least one visible, unlocked object.');
    const plan = patternPlan(input);
    if (scene.length + objects.length * (plan.total - 1) > FCopy.MAX_OBJECTS) throw Error('Maximum: 300 objects. Reduce the pattern count.');
    const captured = FCopy.capture(objects);
    if (FCopy.memoryBytes(scene) + FCopy.memoryBytes(objects) * (plan.total - 1) > FCopy.MAX_SCENE_BYTES)
      throw Error('The pattern would exceed the 180 MiB geometry budget.');
    // Validate every placement before allocating copies or changing the document.
    for (const p of plan.placements) for (const o of objects) {
      const position = input.kind === 'circular' ? FM.add(input.center, FM.rotate(p.rotation, FM.sub(o.position, input.center))) : FM.add(o.position, p.offset);
      if (position.some(v => !Number.isFinite(v) || Math.abs(v) >= 1e8)) throw Error('Pattern positions are outside the supported range.');
    }
    const added = [], names = new Set(scene.map(o => o.name));
    for (const p of plan.placements) {
      const copies = FCopy.instantiate(captured, scene, p.offset);
      for (let i = 0; i < copies.length; i++) {
        const copy = copies[i], source = objects[i];
        copy.name = FCopyName(source.name, names);
        if (input.kind === 'circular') {
          copy.position = FM.add(input.center, FM.rotate(p.rotation, FM.sub(source.position, input.center)));
          if (input.rotate !== false) copy.rotation = FM.norm(FM.qm(p.rotation, source.rotation));
        }
        added.push(copy);
      }
    }
    return added;
  }
  function FCopyName(name, names) {
    let i = 2, next;
    do { const suffix = ' · ' + i++; next = String(name).slice(0, 100 - suffix.length) + suffix; } while (names.has(next));
    names.add(next); return next;
  }
  function physical(record) {
    const geo = FG.geometry(record.positions), report = FG.analyze(geo), m = record.matrix;
    if (!Array.isArray(m) || m.length !== 16 || !m.every(Number.isFinite) || !FM.inverse(m)) throw Error('Invalid measurement transform.');
    const mat = material(record.material), p = geo.positions, origin = geo.bounds.center;
    let signedVolume = 0, weighted = [0, 0, 0], area = 0;
    for (let i = 0; i < p.length; i += 9) {
      const a = FM.sub(Array.from(p.subarray(i, i + 3)), origin), b = FM.sub(Array.from(p.subarray(i + 3, i + 6)), origin), c = FM.sub(Array.from(p.subarray(i + 6, i + 9)), origin);
      const v = FM.dot(a, FM.cross(b, c)) / 6;
      signedVolume += v;
      for (let k = 0; k < 3; k++) weighted[k] += v * (a[k] + b[k] + c[k]) / 4;
      const ab = FM.direction(m, FM.sub(b, a)), ac = FM.direction(m, FM.sub(c, a));
      area += FM.len(FM.cross(ab, ac)) / 2;
    }
    const determinant = FM.dot(FM.direction(m, [1, 0, 0]), FM.cross(FM.direction(m, [0, 1, 0]), FM.direction(m, [0, 0, 1])));
    const volume = Math.abs(signedVolume * determinant), valid = report.closed && signedVolume > 1e-12;
    const center = valid ? FM.point(m, FM.add(origin, weighted.map(v => v / signedVolume))) : null;
    return {id: record.id, name: record.name, report, area, volume, valid, center, material: mat, mass: valid && mat ? volume / 1000 * mat.density : null};
  }
  function physicalSummary(records) {
    const rows = records.map(physical), valid = rows.length > 0 && rows.every(r => r.valid), assigned = valid && rows.every(r => r.mass !== null);
    const mass = assigned ? rows.reduce((s, r) => s + r.mass, 0) : null;
    return {rows, valid, volume: rows.reduce((s, r) => s + r.volume, 0), area: rows.reduce((s, r) => s + r.area, 0), mass,
      center: mass > 0 ? [0, 1, 2].map(k => rows.reduce((s, r) => s + r.mass * r.center[k], 0) / mass) : null};
  }
  function sectionCaps(records, axis, position, above) {
    if (![0, 1, 2].includes(axis) || !Number.isFinite(position)) throw Error('Invalid section plane.');
    const normal = [0, 0, 0]; normal[axis] = 1;
    const caps = [], errors = [];
    for (const record of records) {
      try {
        const geo = FG.transform(FG.geometry(record.positions), record.matrix);
        const tolerance = Math.max(1e-6, Math.max(...geo.bounds.size) * 2e-7);
        if (position <= geo.bounds.min[axis] + tolerance || position >= geo.bounds.max[axis] - tolerance) continue;
        const piece = FPlane.split(geo, normal, position)[above ? 'above' : 'below'];
        if (!piece) continue;
        const points = [], p = piece.positions;
        for (let i = 0; i < p.length; i += 9) {
          if ([0, 3, 6].every(k => Math.abs(p[i + k + axis] - position) <= tolerance))
            for (let k = 0; k < 9; k++) points.push(p[i + k]);
        }
        if (points.length) caps.push({id: record.id, positions: new Float32Array(points)});
      } catch (error) { errors.push({id: record.id, message: error.message}); }
    }
    return {caps, errors};
  }
  return {material, inheritedMaterial, patternPlan, pattern, physical, physicalSummary, sectionCaps};
})();
