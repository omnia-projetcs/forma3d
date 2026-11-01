// Runs inside the application session; all user strings come from toolText.
const tx = key => toolText[key] || key;
const toolError = error => Error(toolText.errors[error.message] || error.message);
const toolNumber = (id, label, value, attributes = '') => `<label class="field"><span>${esc(tx(label))}</span><input id="${id}" type="number" value="${Number(value)}" step="any" ${attributes}></label>`;
const toolAxes = (id, selected = 0) => `<select id="${id}">${['X', 'Y', 'Z'].map((v, i) => `<option value="${i}" ${i === selected ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
const toolFormat = value => value.toLocaleString(tx('locale'), {maximumFractionDigits: 3});
function checkMeshPartsBudget(added, removed = []) {
  const remaining = state.objects.filter(o => !removed.includes(o));
  if (remaining.length + added.length > 300) throw Error(tx('partsLimit'));
  if (FCopy.memoryBytes([...remaining, ...added]) > FCopy.MAX_SCENE_BYTES) throw Error(tx('partsMemoryLimit'));
}
function meshPartsInspector(o) {
  if (!o || o.param) return '';
  return `<div class="property-section mesh-parts-panel"><div class="section-label">${tx('independentParts')}</div><button class="secondary fullwidth" data-action="splitComponents" ${o.locked || !o.visible || busy ? 'disabled' : ''}>${icon('split')}${tx('separateParts')}</button><p class="note">${tx('partsHelp')}</p></div>`;
}
async function splitIndependentParts() {
  const o = single();
  // Split in local coordinates: large translations and tiny scales must not
  // change which triangles share edges. Each part keeps the source transform.
  const meshes = await runJob('split', {mesh: o.geo}, tx('separatingParts'));
  if (meshes.length < 2) { toast(tx('singlePartHelp')); return; }
  const parts = meshes.map((mesh, i) => {
    const placed = FModel.placeWorld(FG.geometry(mesh));
    const suffix = ' · ' + tx('part') + ' ' + (i + 1);
    return makeObject(placed.geo, {
      name: o.name.slice(0, 100 - suffix.length) + suffix,
      position: FM.point(matrix(o), placed.position), rotation: o.rotation.slice(), scale: o.scale.slice(),
      color: o.color, hole: o.hole, smooth: o.smooth, material: o.material ? {...o.material} : null
    });
  });
  checkMeshPartsBudget(parts, state.keepSources ? [] : [o]);
  commit(tx('separateParts'), () => {
    if (state.keepSources) o.visible = false;
    else state.objects = state.objects.filter(item => item.id !== o.id);
    state.objects.push(...parts); state.selected = parts.map(part => part.id);
  });
  toast(parts.length + ' ' + tx('partsSeparated'));
}
// Automatic and single-edge rounding use the same temporary preview lifecycle.
function isManualFillet() { return state.region.filletScope === 'edge'; }
function filletScopeControl() {
  const scope = state.region.filletScope || 'all';
  return `<label class="field"><span>${tx('filletScope')}</span><select id="regionFilletScope" ${busy ? 'disabled' : ''}>${['all', 'side', 'edge'].map(value => `<option value="${value}" ${scope === value ? 'selected' : ''}>${tx('filletScope_' + value)}</option>`).join('')}</select></label>`;
}
function filletOrientationControl() {
  const orientation = state.region.filletOrientation || 'all';
  return `<label class="field" style="margin-top:10px"><span>${tx('filletOrientation')}</span><select id="regionFilletOrientation" ${busy ? 'disabled' : ''}>${['all', 'vertical', 'horizontal'].map(value => `<option value="${value}" ${orientation === value ? 'selected' : ''}>${tx('filletOrientation_' + value)}</option>`).join('')}</select></label><p class="note">${tx('filletOrientationHelp')}</p>`;
}
function autoFilletLauncher(o) {
  if (!o) return '';
  return `<div class="property-section"><button class="secondary fullwidth" data-action="autoRound" ${o.locked || !o.visible || o.hole || busy ? 'disabled' : ''}>${icon('fillet')}${tx('autoFillet')}</button></div>`;
}
function autoFilletPlan() {
  const model = currentFilletModel();
  if (!model) return {error: tx('autoFilletSelect')};
  if (model.error) return {error: model.error};
  const o = state.objects.find(o => o.id === model.objectId), r = state.region;
  const side = r.filletSide || 'z+', axis = 'xyz'.indexOf(side[0]);
  const local = [0, 0, 0]; local[axis] = (side[1] === '+' ? 1 : -1) * (o.scale[axis] < 0 ? -1 : 1);
  const settings = {scope: r.filletScope || 'all', direction: FM.rotate(o.rotation, local), adaptive: r.filletAdaptive !== false, progressLabel: tx('autoFillet'), orientation: r.filletOrientation || 'all', orientationAxis: FM.rotate(o.rotation, [0, 0, 1])};
  const key = settings.scope + '|' + side + '|' + settings.adaptive + '|' + settings.orientation;
  model.autoPlans ||= new Map();
  if (!model.autoPlans.has(key)) {
    try { model.autoPlans.set(key, {...FAutoFillet.plan(model.mesh, settings, model.info), settings, model}); }
    catch (error) { model.autoPlans.set(key, {error: toolError(error).message}); }
  }
  return model.autoPlans.get(key);
}
function autoFilletRadiusInput(id, plan = autoFilletPlan()) {
  const r = state.region, min = plan.complex ? .01 : .05, max = plan.complex && r.filletAdaptive !== false ? 10000 : Math.floor((plan.maxRadius || 10000) * 1000) / 1000;
  return `<input id="${id}" type="number" aria-label="${tx('autoFilletRadius')}" min="${min}" max="${max}" step="any" inputmode="decimal" value="${Number(r.filletRadius.toFixed(3))}" ${busy ? 'disabled' : ''}>`;
}
function autoFilletInspector() {
  const r = state.region, plan = autoFilletPlan(), error = r.filletError || plan.error;
  return `<section class="property-section region-panel fillet-panel"><div class="section-label">${tx('autoFillet')} <span class="badge">O</span></div><p class="region-intro">${tx('autoFilletIntro')}</p>
    ${filletScopeControl()}
    ${filletOrientationControl()}
    ${r.filletScope === 'side' ? `<label class="field" style="margin-top:10px"><span>${tx('filletSide')}</span><select id="regionFilletSide" ${busy ? 'disabled' : ''}>${['z+', 'z-', 'x-', 'x+', 'y-', 'y+'].map(value => `<option value="${value}" ${(r.filletSide || 'z+') === value ? 'selected' : ''}>${tx('filletSide_' + value)}</option>`).join('')}</select></label><p class="note">${tx('filletSideHelp')}</p>` : ''}
    ${plan.complex ? `<label class="inline-check"><input id="regionFilletAdaptive" type="checkbox" ${r.filletAdaptive !== false ? 'checked' : ''} ${busy ? 'disabled' : ''}>${tx('filletAdaptive')}</label><p class="note">${tx('filletAdaptiveHelp')}</p>` : ''}
    <label class="field fillet-radius-field" style="margin-top:10px"><span>${tx(plan.complex && r.filletAdaptive !== false ? 'filletRadiusMaxInput' : 'autoFilletRadius')}</span>${autoFilletRadiusInput('regionFilletRadius', plan)}</label>
    ${plan.edges ? `<p class="fillet-clearance">${plan.edges.length} ${tx('filletEdgesSelected')}<br>${tx(plan.complex ? 'filletCommonRange' : 'filletRange')} ${radiusText(Math.ceil(plan.minRadius * 1000) / 1000)}–${radiusText(Math.floor(plan.maxRadius * 1000) / 1000)} mm.</p>` : ''}
    ${error ? `<p class="fillet-error" role="alert">${esc(error)}</p>` : ''}
    ${r.stats ? `<div class="region-result"><strong>${r.stats.adaptedEdges ? tx('filletRadiusMaxShort') : 'R'} ${radiusText(r.stats.radius)} mm · ${r.stats.edgeCount} ${tx('filletEdgesRounded')}</strong><span>${tx('filletClosed')} · ${toolFormat(r.stats.triangles)} triangles</span>${r.stats.adaptedEdges ? `<span>${tx('filletEffectiveRadius')} ${radiusText(r.stats.effectiveMin)}–${radiusText(r.stats.effectiveMax)} mm · ${r.stats.adaptedEdges} ${tx('filletEdgesAdapted')}</span>` : ''}</div><label class="inline-check"><input id="regionCompare" type="checkbox" ${r.compare ? 'checked' : ''}>${tx('filletCompare')}</label>` : ''}
    <div class="region-controls"><button class="secondary" data-action="regionPreview" ${plan.error || busy ? 'disabled' : ''}>${tx('filletPreview')}</button><button class="primary" data-action="regionApply" ${!r.preview || busy ? 'disabled' : ''}>${tx('filletApply')}</button></div>
    <button class="secondary fullwidth" data-action="cancelEdit">${tx('filletCancel')}</button><p class="note">${tx('autoFilletHelp')}</p></section>`;
}
function autoFilletHud(hud) {
  const r = state.region;
  const selectionLabel = tx('filletScope_' + (r.filletScope || 'all')) + ((r.filletOrientation || 'all') !== 'all' ? ' · ' + tx('filletOrientation_' + r.filletOrientation) : '');
  hud.classList.add('fillet-hud');
  hud.innerHTML = `<div class="region-hud-title"><strong>${tx('autoFillet')}</strong><span class="badge">${r.preview ? tx('filletPreviewReady') : busy ? tx('filletCalculating') : esc(selectionLabel)}</span></div>
    <p>${esc(r.filletError || (r.preview ? (r.filletOrientation && r.filletOrientation !== 'all' ? tx('filletOrientation_' + r.filletOrientation) + '. ' : '') + (r.stats?.adaptedEdges ? tx('filletEffectiveRadius') + ' ' + radiusText(r.stats.effectiveMin) + '–' + radiusText(r.stats.effectiveMax) + ' mm. ' : '') + tx('filletPreviewHelp') : tx('autoFilletIntro')))}</p><div class="fillet-hud-row"><label>${tx('filletRadiusShort')} ${autoFilletRadiusInput('regionFilletRadiusHud')}<span>mm</span></label><button class="primary" data-action="regionApply" ${!r.preview || busy ? 'disabled' : ''}>${tx('filletApply')}</button><button class="secondary" data-action="cancelEdit">${tx('filletCancel')}</button></div>`;
}
function beginAutoFillet(preview = true) {
  discardRegion(true);
  const o = editable().length === 1 ? editable()[0] : null, r = state.region;
  if (o && !o.hole) { r.objectId = o.id; r.sourceId = o.geo.id; r.sourceKey = filletSignature(o); r.center = objectBounds(o).center.slice(); }
  update();
  if (preview && o && !o.hole) queueAutoFilletPreview();
}
function queueAutoFilletPreview() {
  clearTimeout(filletTimer);
  const r = state.region, revision = r.revision;
  filletTimer = setTimeout(async () => {
    filletTimer = null;
    if (busy || gesture || $('modal').open || state.mode !== 'round' || isManualFillet() || r.revision !== revision || !r.objectId) return;
    try { await previewAutoFillet(); }
    catch (error) { if (state.mode === 'round' && !isManualFillet() && r.revision === revision) { r.filletError = error.message; update(); } }
  }, 250);
}
function changeAutoFilletSetting(el) {
  const r = state.region;
  if (el.id === 'regionFilletOrientation') {
    if (!['all', 'vertical', 'horizontal'].includes(el.value)) return;
    r.filletOrientation = el.value; beginAutoFillet(); return;
  }
  if (el.id === 'regionFilletAdaptive') { r.filletAdaptive = el.checked; beginAutoFillet(); return; }
  if (el.id === 'regionFilletSide') { r.filletSide = el.value; beginAutoFillet(); return; }
  const value = +el.value;
  discardRegion(false);
  const minimum = autoFilletPlan().complex ? .01 : .05;
  if (!el.value.trim() || !Number.isFinite(value) || value < minimum || value > 10000) { r.filletError = tx(minimum === .01 ? 'filletInvalidSmallRadius' : 'filletInvalidRadius'); update(); return; }
  r.filletRadius = value; update(); queueAutoFilletPreview();
}
function changeFilletScope(value) {
  if (!['all', 'side', 'edge'].includes(value)) return;
  state.region.filletScope = value;
  if (value === 'edge') { discardRegion(true); update(); }
  else beginAutoFillet();
}
async function previewAutoFillet() {
  clearTimeout(filletTimer); filletTimer = null;
  const o = single(), r = state.region;
  if (o.hole) throw Error(tx('autoFilletSelect'));
  if (r.objectId !== o.id || r.sourceKey !== filletSignature(o)) beginAutoFillet(false);
  const plan = autoFilletPlan();
  if (plan.error) { r.filletError = plan.error; update(); throw Error(plan.error); }
  const radius = r.filletRadius, key = filletSignature(o);
  discardRegion(false);
  const revision = r.revision;
  if (radius < plan.minRadius || (radius > plan.maxRadius && !(plan.complex && plan.settings.adaptive))) { r.filletError = tx('filletRadiusTooLarge'); update(); throw Error(r.filletError); }
  let result;
  try { result = await runJob('autoFillet', {mesh: plan.model.mesh.positions, radius, ...plan.settings}, tx('autoFillet')); }
  catch (error) { const translated = toolError(error); if (r.revision === revision && state.mode === 'round') { r.filletError = translated.message; update(); } throw translated; }
  if (state.mode !== 'round' || isManualFillet() || !state.objects.includes(o) || r.objectId !== o.id || filletSignature(o) !== key || r.revision !== revision) return;
  r.preview = {...o, geo: FG.geometry(result.positions), position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], param: null, smooth: true};
  r.stats = result.stats; r.compare = false; r.filletError = null;
  renderer.previewObject = r.preview; renderer.zone = null; update();
}
function filletAppliedToast(stats, fallback) {return stats.adaptedEdges ? tx('filletAppliedWithAdaptation') + ' ' + radiusText(stats.effectiveMin) + '–' + radiusText(stats.effectiveMax) + ' mm. ' + tx('filletUndoHint') : fallback;}
function filletHistoryLabel(stats, label) {
  if (stats.orientation && stats.orientation !== 'all') label += ' · ' + tx('filletOrientation_' + stats.orientation);
  return stats.adaptedEdges ? label + ' · ' + tx('filletAdaptedTag') : label;
}
function drawAutoFilletOverlay() {
  const plan = autoFilletPlan(), r = state.region;
  if (!plan.edges) return;
  const lines = r.preview && !r.compare ? r.stats?.guideLines || [] : plan.edges.flatMap(e => [...e.a, ...e.b]);
  const gl = renderer.gl; gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
  renderer.lines(lines, '#ed9a24', 1); gl.depthFunc(gl.LESS); gl.depthMask(true);
}

function patternDialog() {
  const list = editable();
  if (!list.length) throw Error(tx('selectObjects'));
  const b = combinedBounds(list);
  const d = modal(tx('patterns'), tx('patternIntro'), `
    <label class="field"><span>${tx('kind')}</span><select id="patternKind"><option value="linear">${tx('linear')}</option><option value="grid">${tx('grid')}</option><option value="circular">${tx('circular')}</option></select></label>
    <div class="fields2">${toolNumber('patternCount', 'count', 4, 'min="1" max="300" step="1"')}<label class="field"><span>${tx('axis')}</span>${toolAxes('patternAxis')}</label></div>
    <div id="patternSpacing">${toolNumber('patternStep', 'spacing', Math.max(10, b.size[0] + 10))}</div>
    <div id="patternGrid" hidden><div class="fields2">${toolNumber('patternRows', 'rows', 2, 'min="1" max="300" step="1"')}<label class="field"><span>${tx('secondAxis')}</span>${toolAxes('patternSecondAxis', 1)}</label></div>${toolNumber('patternRowStep', 'rowSpacing', Math.max(10, b.size[1] + 10))}</div>
    <div id="patternCircle" hidden>${toolNumber('patternAngle', 'angle', 360, 'min="-360" max="360"')}<p class="note">${tx('angleHelp')}</p><div class="fields3">${[0, 1, 2].map(k => toolNumber('patternCenter' + k, 'center' + k, k === 2 ? b.center[2] : 0)).join('')}</div><label class="inline-check"><input type="checkbox" id="patternRotate" checked>${tx('rotateCopies')}</label></div>
    <div id="patternSummary" class="pattern-summary" aria-live="polite"></div><p class="note">${tx('patternHelp')}</p>`,
    [{label: tx('createCopies'), primary: true, id: 'createPattern', action: () => {
      const input = read(); let copies;
      try { copies = FTools.pattern(list, state.objects, input); } catch (e) { throw toolError(e); }
      commit(tx(input.kind), () => { state.objects.push(...copies); state.selected = [...list.map(o => o.id), ...copies.map(o => o.id)]; });
      d.close(); renderer.fit(selected());
    }}]);
  function read() {
    return {kind: $('patternKind').value, axis: +$('patternAxis').value, count: $('patternCount').valueAsNumber, step: $('patternStep').valueAsNumber,
      secondAxis: +$('patternSecondAxis').value, rows: $('patternRows').valueAsNumber, rowStep: $('patternRowStep').valueAsNumber,
      angle: $('patternAngle').valueAsNumber, center: [0, 1, 2].map(k => $('patternCenter' + k).valueAsNumber), rotate: $('patternRotate').checked};
  }
  function refresh() {
    const input = read();
    $('patternSpacing').hidden = input.kind === 'circular'; $('patternGrid').hidden = input.kind !== 'grid'; $('patternCircle').hidden = input.kind !== 'circular';
    try {
      const plan = FTools.patternPlan(input), count = list.length * (plan.total - 1);
      if (state.objects.length + count > 300) throw Error('Maximum: 300 objects. Reduce the pattern count.');
      $('patternSummary').textContent = `${count} ${tx('newObjects')} · ${state.objects.length + count} / 300`;
      $('createPattern').disabled = false;
    } catch (e) { $('patternSummary').textContent = toolError(e).message; $('createPattern').disabled = true; }
  }
  d.querySelectorAll('#modalBody input,#modalBody select').forEach(el => el.addEventListener('input', refresh));
  $('patternKind').addEventListener('change', () => { $('patternAxis').value = $('patternKind').value === 'circular' ? '2' : '0'; refresh(); });
  refresh();
}
const materialPresets = [null, {name: 'PLA', density: 1.24}, {name: 'PETG', density: 1.27}, {name: 'ABS', density: 1.04}, {name: tx('aluminum'), density: 2.7}, {name: tx('steel'), density: 7.85}];
function materialDialog() {
  const list = editable().filter(o => !o.hole);
  if (!list.length) throw Error(tx('selectSolids'));
  const current = FTools.inheritedMaterial(list), d = modal(tx('material'), tx('materialIntro'), `
    <label class="field"><span>${tx('preset')}</span><select id="materialPreset"><option value="custom">${tx('custom')}</option>${materialPresets.map((m, i) => `<option value="${i}">${m ? esc(m.name) : tx('unassigned')}</option>`).join('')}</select></label>
    <label class="field"><span>${tx('materialName')}</span><input id="materialName" maxlength="80" value="${esc(current?.name || 'PLA')}"></label>
    ${toolNumber('materialDensity', 'density', current?.density || 1.24, 'min="0.001" max="30"')}
    <p class="note">${tx('densityHelp')}</p>`, [{label: tx('applyMaterial'), primary: true, id: 'applyMaterial', action: () => {
      let value = null;
      if ($('materialPreset').value !== '0') {
        try { value = FTools.material({name: $('materialName').value.trim(), density: +$('materialDensity').value}); } catch (e) { throw toolError(e); }
      }
      commit(tx('material'), () => list.forEach(o => { o.material = value ? {...value} : null; })); d.close();
    }}]);
  $('materialPreset').onchange = () => {
    const preset = materialPresets[+$('materialPreset').value], disabled = $('materialPreset').value === '0';
    $('materialName').disabled = $('materialDensity').disabled = disabled;
    if (preset) { $('materialName').value = preset.name; $('materialDensity').value = preset.density; }
  };
  for (const id of ['materialName', 'materialDensity']) $(id).oninput = () => { $('materialPreset').value = 'custom'; };
}
function measurementRecords(list) {
  return list.map(o => ({id: o.id, name: o.name, positions: o.geo.positions, matrix: matrix(o), material: o.material || null}));
}
async function physicalDialog() {
  const list = selected().filter(o => o.visible && !o.hole);
  if (!list.length) throw Error(tx('selectSolids'));
  const result = await runJob('physicalProperties', {records: measurementRecords(list)}, tx('physical'));
  const dash = '—', format = v => v == null ? dash : toolFormat(v);
  modal(tx('physical'), tx('physicalIntro'), `
    <div class="stats-grid"><div class="stat-card"><strong>${format(result.valid ? result.volume / 1000 : null)}</strong><span>${tx('volume')} · cm³</span></div><div class="stat-card"><strong>${format(result.mass)}</strong><span>${tx('mass')} · g</span></div></div>
    <p class="property-result">${tx('surface')}: <b>${format(result.area)} mm²</b><br>${tx('centerOfMass')} (X / Y / Z): <b>${result.center ? result.center.map(format).join(' / ') + ' mm' : dash}</b></p>
    <table class="properties-table"><thead><tr><th>${tx('object')}</th><th>cm³</th><th>g</th></tr></thead><tbody>${result.rows.map(r => `<tr><td>${esc(r.name)}<br><small>${r.material ? esc(r.material.name) + ' · ' + format(r.material.density) + ' g/cm³' : tx('unassigned')}${!r.valid ? '<br>' + tx('invalidMesh') : ''}</small></td><td>${format(r.valid ? r.volume / 1000 : null)}</td><td>${format(r.mass)}</td></tr>`).join('')}</tbody></table>
    <p class="note warning">${tx('massHelp')}</p><p class="note">${tx('massInvalidHelp')}</p>`,
    editable().some(o => !o.hole) ? [{label: tx('material'), action: materialDialog}] : []);
  return result;
}
let sectionWorker = null, sectionTimer = null, sectionTimeout = null, sectionSequence = 0;
function clearSectionCaps() {
  if (renderer?.sectionCaps) for (const o of renderer.sectionCaps) renderer.invalidate(o.geo.id);
  if (renderer) renderer.sectionCaps = [];
}
function stopSection() {
  ++sectionSequence; clearTimeout(sectionTimer); clearTimeout(sectionTimeout); sectionWorker?.terminate(); sectionWorker = null;
  clearSectionCaps(); $('sectionPanel')?.remove();
  if (renderer) { renderer.section = null; renderer.request(); }
}
function sectionDialog() {
  if (!state.objects.some(o => o.visible && !o.hole)) throw Error(tx('selectSolids'));
  stopSection(); discardRegion(true); closeResizeInput(); state.face = null; renderer.facePreview = null; state.measure = []; $('measureBox').classList.add('hidden');
  const panel = document.createElement('section'); panel.id = 'sectionPanel'; panel.className = 'section-panel'; panel.setAttribute('aria-label', tx('section'));
  panel.innerHTML = `<div class="section-heading"><span>${tx('section')}</span><div class="section-buttons"><button type="button" id="foldSection" aria-label="${tx('foldSection')}" aria-expanded="true" aria-controls="sectionControls">−</button><button type="button" id="closeSection" aria-label="${tx('closeSection')}">×</button></div></div><div id="sectionControls">
    <label class="field"><span>${tx('axis')}</span>${toolAxes('sectionAxis', 2)}</label>
    ${toolNumber('sectionPosition', 'planePosition', 0)}<label class="field"><span>${tx('slidePlane')}</span><input id="sectionRange" type="range" min="0" max="1000" value="500" step="1"></label>
    <label class="inline-check"><input id="sectionAbove" type="checkbox">${tx('keepAbove')}</label>
    <p>${tx('sectionHelp')}</p><p id="sectionStatus" class="section-status" role="status"></p></div>`;
  $('workspace').appendChild(panel);
  const list = state.objects.filter(o => o.visible && !o.hole), b = combinedBounds(list);
  function range(reset) {
    const axis = +$('sectionAxis').value;
    if (reset) { $('sectionPosition').value = Number(b.center[axis].toFixed(4)); $('sectionRange').value = 500; }
    $('sectionPosition').min = b.min[axis]; $('sectionPosition').max = b.max[axis];
    refresh();
  }
  function refresh(fromRange = false) {
    const axis = +$('sectionAxis').value, lo = b.min[axis], hi = b.max[axis], extent = hi - lo;
    if (fromRange) $('sectionPosition').value = Number((lo + extent * +$('sectionRange').value / 1000).toFixed(5));
    const position = +$('sectionPosition').value;
    if ($('sectionPosition').value === '' || !Number.isFinite(position) || position < lo || position > hi) { $('sectionStatus').textContent = tx('invalidPlane'); return; }
    $('sectionRange').value = extent ? (position - lo) / extent * 1000 : 500;
    renderer.section = {axis, position, above: $('sectionAbove').checked, tolerance: Math.max(1e-6, Math.max(...b.size) * 2e-7)};
    const sequence = ++sectionSequence; clearTimeout(sectionTimer); clearTimeout(sectionTimeout); sectionWorker?.terminate(); sectionWorker = null; clearSectionCaps(); renderer.request();
    $('sectionStatus').textContent = tx('buildingSection');
    sectionTimer = setTimeout(() => {
      const section = renderer.section; if (!section || sequence !== sectionSequence) return;
      try {
        const url = URL.createObjectURL(new Blob([FORMA_WORKER_SOURCE], {type: 'text/javascript'}));
        try { sectionWorker = new Worker(url); } finally { URL.revokeObjectURL(url); }
        const w = sectionWorker;
        const fail = () => { if (sequence !== sectionSequence) return; clearTimeout(sectionTimeout); w.terminate(); sectionWorker = null; if ($('sectionStatus')) $('sectionStatus').textContent = tx('sectionFailed'); };
        w.onerror = fail;
        sectionTimeout = setTimeout(fail, 15000);
        w.onmessage = ({data}) => {
          if (sequence !== sectionSequence) return;
          clearTimeout(sectionTimeout); w.terminate(); sectionWorker = null;
          if (data.error) { $('sectionStatus').textContent = tx('sectionFailed'); return; }
          renderer.sectionCaps = data.result.caps.map(c => ({id: 'section-' + c.id, geo: FG.geometry(c.positions), position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], color: '#efaa4e', smooth: false, visible: true, hole: false, sectionCap: true}));
          $('sectionStatus').textContent = data.result.errors.length ? tx('sectionFailed') : tx('sectionReady'); renderer.request();
        };
        w.postMessage({id: sequence, op: 'sectionCaps', args: {records: measurementRecords(list), ...section}});
      } catch { if ($('sectionStatus')) $('sectionStatus').textContent = tx('sectionFailed'); }
    }, 160);
  }
  $('closeSection').onclick = stopSection;
  $('foldSection').onclick = () => {
    const folded = !$('sectionControls').hidden; $('sectionControls').hidden = folded;
    panel.classList.toggle('collapsed', folded); $('foldSection').textContent = folded ? '+' : '−';
    $('foldSection').setAttribute('aria-expanded', String(!folded));
  };
  $('sectionAxis').onchange = () => range(true);
  $('sectionPosition').oninput = () => refresh(); $('sectionRange').oninput = () => refresh(true); $('sectionAbove').onchange = () => refresh();
  range(true); renderer.request();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && renderer?.section && !$('modal').open) { stopSection(); e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
function toolInspector(o) {
  const list = selected().filter(item => item.visible && !item.hole);
  if (!list.length) return '';
  const m = o?.material;
  return `<div class="property-section"><div class="section-label">${tx('inspection')}</div><p class="note">${m ? esc(m.name) + ' · ' + toolFormat(m.density) + ' g/cm³' : tx('unassigned')}</p><div class="action-stack"><button data-action="material" ${editable().some(item => !item.hole) ? '' : 'disabled'}>${icon('sliders')}${tx('material')}</button><button data-action="physical">${icon('ruler')}${tx('physical')}</button><button data-action="section">${icon('cut')}${tx('section')}</button></div></div>`;
}
