/* Character Studio runs in the existing application closure. No runtime imports. */
const ch = (fr,en) => document.documentElement.lang==='fr'?fr:en;
const studio = {
  space:'piece', symmetry:true, axis:0, frontOnly:true, pressure:true,
  lastBrush:'grab', hit:null, cursor:null, event:null, references:new Map(),
  topology:'vertices', faces:[], faceObject:null, initialized:false,
  bvh:new WeakMap(), maskMeshes:new WeakMap(), posePreview:null, metrics:null
};
const characterErrors = {
  'character.limit':()=>ch('Limite interactive : 120 000 triangles. Simplifiez une copie.','Interactive limit: 120,000 triangles. Simplify a copy.'),
  'character.loopLimit':()=>ch('La subdivision lissée accepte jusqu’à 28 000 triangles en entrée. Simplifiez une copie.','Smooth subdivision accepts up to 28,000 input triangles. Simplify a copy.'),
  'character.detailLimit':()=>ch('L’ajout de détail accepte jusqu’à 30 000 triangles en entrée.','Adding detail accepts up to 30,000 input triangles.'),
  'character.resolution':()=>ch('Cette résolution dépasse le budget de calcul. Choisissez un détail inférieur.','This resolution exceeds the computation budget. Choose a lower detail level.'),
  'character.manifold':()=>ch('Le résultat ne forme pas un maillage fermé et cohérent. L’original est conservé.','The result is not a consistent closed mesh. The original is preserved.'),
  'character.closed':()=>ch('Le remeshing nécessite des volumes fermés. Analysez et nettoyez le maillage.','Remeshing requires closed volumes. Analyze and clean the mesh first.'),
  'character.empty':()=>ch('Aucune surface obtenue. Augmentez la résolution.','No surface found. Increase the resolution.'),
  'character.parameters':()=>ch('Paramètres hors limites. Vérifiez les valeurs saisies.','Parameters out of range. Check the entered values.'),
  'character.selection':()=>ch('Sélectionnez des points ou des faces.','Select vertices or faces.'),
  'character.edge':()=>ch('Sélectionnez les deux sommets d’une même arête.','Select the two vertices of one edge.')
};
const characterMessage = error => characterErrors[error.message]?.() || error.message;
async function characterJob(op,args,title){try{return await runJob(op,args,title);}catch(error){throw Error(characterMessage(error));}}
const charButton = (action,label,extra='') => `<button type="button" data-character="${action}" ${extra}>${label}</button>`;
const charField = (id,label,value,min,max,step=1) => `<label class="field"><span>${label}</span><input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(Number(value).toFixed(4))}" required></label>`;
const brushNames = () => [
  ['grab',ch('Tirer','Grab'),'move'],['inflate',ch('Gonfler','Inflate'),'brush'],['deflate',ch('Creuser','Carve'),'brush'],
  ['smooth',ch('Lisser','Smooth'),'brush'],['flatten',ch('Aplatir','Flatten'),'face'],['pinch',ch('Pincer','Pinch'),'scale'],
  ['mask',ch('Masquer','Mask'),'shield'],['points',ch('Points','Vertices'),'mesh']
];
function characterConfig() {
  return state.characterStudio || {references:{}};
}
function setCharacterConfig(config,label) {commit(label,()=>{state.characterStudio=structuredClone(config);});}
function characterBVH(g) {let tree=studio.bvh.get(g);if(!tree){tree=new FCharacter.BVH(g);studio.bvh.set(g,tree);}return tree;}
function initCharacterStudio() {
  if(studio.initialized||!renderer)return;studio.initialized=true;
  const switcher=document.createElement('div');switcher.className='studio-switch';switcher.setAttribute('role','group');switcher.setAttribute('aria-label',ch('Espace de travail','Workspace'));
  switcher.innerHTML=charButton('piece',ch('Pièce','Part'),'aria-pressed="true"')+charButton('character',ch('Personnage','Character'),'aria-pressed="false"');
  document.querySelector('.brand').after(switcher);
  document.querySelectorAll('[data-action=import]').forEach(b=>b.setAttribute('aria-label',ch('Importer un STL','Import STL')));
  document.querySelectorAll('[data-action=export]').forEach(b=>b.setAttribute('aria-label',ch('Exporter en STL','Export STL')));
  const rail=document.createElement('nav');rail.className='studio-rail';rail.setAttribute('aria-label',ch('Outils principaux','Main tools'));
  rail.innerHTML=charButton('select',`${icon('focus')}<span>${ch('Choisir','Select')}</span>`,'title="V"')+[['translate','move',ch('Déplacer','Move'),'G'],['rotate','rotate',ch('Tourner','Rotate'),'R'],['scale','scale',ch('Taille','Scale'),'S'],['sculpt','brush',ch('Sculpter','Sculpt'),'B']].map(([mode,i,label,key])=>`<button data-mode="${mode}" title="${label} (${key})">${icon(i)}<span>${label}</span></button>`).join('')+charButton('search',`${icon('more')}<span>${ch('Chercher','Search')}</span>`,'title="Espace / Space"');
  $('workspace').appendChild(rail);
  const quick=document.createElement('div');quick.className='studio-quick';quick.innerHTML=charButton('libraryToggle',`${icon('library')}<span>${ch('Bibliothèque','Library')}</span>`,'aria-expanded="true"')+charButton('historyToggle',`${icon('undo')}<span>${ch('Historique','History')}</span>`,'aria-expanded="true"')+charButton('objects',`${icon('layers')}<span>${ch('Objets','Objects')}</span>`);
  document.querySelector('.edit-actions').after(quick);
  quick.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-label',b.textContent.trim());b.title=b.textContent.trim();});
  const bases=document.createElement('section');bases.className='character-bases';bases.innerHTML=`<h2>${ch('Commencer un personnage','Start a character')}</h2><p>${ch('Une base fermée, prête à sculpter.','A closed base, ready to sculpt.')}</p><div class="base-choices">${[['head',ch('Tête','Head')],['bust',ch('Buste','Bust')],['body',ch('Corps','Body')]].map(([kind,label])=>charButton('base-'+kind,`<svg viewBox="0 0 80 80" aria-hidden="true"><path d="${kind==='head'?'M29 68v-9c-11-7-15-19-13-32C18 6 59 6 63 27c3 15-2 28-13 32v9':kind==='bust'?'M10 70c2-17 12-24 23-25v-5c-8-4-10-11-9-19C27 6 53 6 56 21c1 8-1 15-9 19v5c11 1 21 8 23 25Z':'M36 22c-8-5-7-17 4-17s12 12 4 17l8 5 17 18-5 5-16-13-2 13 9 24-8 1-7-19-7 19-8-1 9-24-2-13-16 13-5-5 17-18Z'}"/></svg><span>${label}</span>`)).join('')}</div>${charButton('references',`${icon('import')}${ch('Références face / profil','Front / side references')}`,'class="secondary fullwidth"')}</section>`;
  $('leftPanel').prepend(bases);
  const customBases=document.createElement('details');customBases.className='character-custom-bases';customBases.innerHTML=`<summary>${ch('Créer une base personnalisée','Create a custom base')}</summary>`+bases.innerHTML;bases.replaceChildren(customBases);
  const models=document.createElement('section');models.className='character-model-library';models.setAttribute('aria-label',ch('Modèles de personnages','Character models'));
  models.innerHTML=`<div class="character-model-heading"><h2>${ch('Modèles de personnages','Character models')}</h2><span id="characterModelCount"></span></div><p class="character-model-intro">${ch('Cliquez sur un modèle pour le sculpter.','Click a model to start sculpting.')}</p><div class="character-model-filters"><input type="search" id="characterModelSearch" placeholder="${ch('Rechercher un modèle…','Search models…')}" aria-label="${ch('Rechercher un modèle de personnage','Search character models')}"><select id="characterModelCategory" aria-label="${ch('Type de personnage','Character type')}"><option value="all">${ch('Tous les modèles','All models')}</option><option value="fighter">${ch('Guerriers','Warriors')}</option><option value="magic">${ch('Magie','Magic')}</option><option value="stealth">${ch('Rogues','Rogues')}</option><option value="monster">${ch('Monstres','Monsters')}</option><option value="fantasy">${ch('Nains et elfes','Dwarves and elves')}</option></select></div><div id="characterModelGrid" class="character-model-grid"></div><div class="character-model-footer">${charButton('references',`${icon('import')}${ch('Références face / profil','Front / side references')}`,'class="secondary fullwidth"')}</div>`;
  $('leftPanel').prepend(models);renderCharacterModels();$('characterModelSearch').oninput=renderCharacterModels;$('characterModelCategory').onchange=renderCharacterModels;
  const hint=document.createElement('div');hint.id='studioHint';hint.className='studio-hint';$('workspace').appendChild(hint);
  const toolbar=document.querySelector('.toolbar');toolbar.classList.add('studio-toolbar');
  document.querySelector('.timeline-section .panel-title').insertAdjacentHTML('beforeend',charButton('historyFold','−',`class="fold-control" aria-label="${ch('Replier l’historique','Collapse history')}"`));
  const originalPick=renderer.pick.bind(renderer);
  renderer.pick=(x,y,filter=null)=>{
    if(state.mode!=='sculpt'&&studio.space!=='character')return originalPick(x,y,filter);
    const ray=renderer.ray(x,y);let best=null;
    for(const o of renderer.objects){if(!o.visible||o.locked||o.hole||(filter&&!filter(o)))continue;const m=matrix(o),inv=FM.inverse(m);if(!inv)continue;
      const origin=FM.point(inv,ray.origin),direction=FM.norm(FM.direction(inv,ray.direction)),hit=characterBVH(o.geo).pick(origin,direction);if(!hit)continue;
      const point=FM.point(m,hit.local),distance=FM.len(FM.sub(point,ray.origin));if(best&&best.distance<=distance)continue;
      const n=hit.normal,normal=FM.norm([inv[0]*n[0]+inv[1]*n[1]+inv[2]*n[2],inv[4]*n[0]+inv[5]*n[1]+inv[6]*n[2],inv[8]*n[0]+inv[9]*n[1]+inv[10]*n[2]]);best={object:o,point,local:hit.local,normal,face:hit.face,distance};
    }return best;
  };
  const originalData=renderer.data.bind(renderer);
  renderer.data=o=>{
    const custom=o.geo.characterNormals;if(!custom)return originalData(o);
    const gl=renderer.gl;let c=renderer.cache.get(o.geo.id);if(c)return c;
    const make=p=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,p,gl.DYNAMIC_DRAW);return b;};c={p:make(o.geo.positions),n:make(custom),colors:o.geo.colors?make(o.geo.colors):null,count:o.geo.positions.length/3,smooth:o.smooth,edges:null,features:null,featureCount:0};renderer.cache.set(o.geo.id,c);return c;
  };
  const originalMesh=renderer.drawMesh.bind(renderer);
  renderer.drawMesh=(o,overlay=false)=>{
    originalMesh(o,overlay);
    if(overlay||studio.space!=='character'||!state.selected.includes(o.id)||!o.geo.mask||o.sectionCap||o.hole)return;
    let mask=studio.maskMeshes.get(o.geo);if(mask===undefined){const p=[],positions=o.geo.positions,ns=o.geo.characterNormals||FG.normals(o.geo,true),eps=Math.max(...o.geo.bounds.size)*.00015;
      for(let i=0;i<positions.length;i+=9)if((o.geo.mask[i/3]+o.geo.mask[i/3+1]+o.geo.mask[i/3+2])/3>.15)for(let k=0;k<9;k++)p.push(positions[i+k]+ns[i+k]*eps);
      mask=p.length?FG.geometry(p):null;studio.maskMeshes.set(o.geo,mask);
    }if(mask)originalMesh({...o,id:o.id+'-mask',geo:mask,color:'#4b6383',sectionCap:true},true);
  };
  renderer.canvas.addEventListener('wheel',e=>{
    if(state.mode==='sculpt'&&e.shiftKey&&!gesture){e.preventDefault();e.stopImmediatePropagation();state.brush.radius=FM.clamp(state.brush.radius*Math.exp(-e.deltaY*.002),.1,1000);syncBrushFields();renderer.request();}
  },{capture:true,passive:false});
  renderer.canvas.addEventListener('pointerdown',e=>{studio.event=e;if(state.mode==='sculpt'&&!isPointMode()&&e.button===0&&!e.altKey){const p=pointerPosition(e);studio.hit=renderer.pick(...p);}},true);
  renderer.canvas.addEventListener('pointermove',e=>{studio.event=e;if(state.mode==='sculpt'&&!isPointMode()&&!gesture){studio.hit=renderer.pick(...pointerPosition(e));}},true);
  queueMicrotask(()=>{if(window.FORMA)window.FORMA.character={studio,models:FCharacterModels.catalog,insertModel:characterInsertModel,baseDialog:characterBaseDialog,meshDialog:characterMeshDialog,applyMesh:characterApplyMesh,referenceDialog:characterReferenceDialog,rigDialog:characterRigDialog,uvDialog:characterUVDialog,startRetopo:characterStartRetopo,thicknessDialog:characterThicknessDialog,exportGLB:characterExportGLB,setSpace:setStudioSpace,setBrush:setCharacterBrush,clearMask:characterClearMask,core:FCharacter};});
}
function setStudioSpace(space) {
  if(busy||gesture)throw Error(ch('Terminez l’action en cours.','Finish the current action.'));
  studio.space=space;studio.faces=[];studio.retopo=null;studio.posePreview=null;renderer.previewObject=null;
  if(space==='character'){
    document.body.classList.remove('library-collapsed');
    state.brush.mode=studio.lastBrush;renderer.details=false;renderer.grid=false;$('snapEnabled').checked=false;
    setMode('sculpt');
  }else{renderer.details=true;renderer.grid=true;setMode('translate');}
  document.querySelectorAll('[data-action=details]').forEach(b=>b.classList.toggle('active',renderer.details));document.querySelectorAll('[data-action=grid]').forEach(b=>b.classList.toggle('active',renderer.grid));
  $('leftPanel').classList.remove('open');update();renderer.request();
}
function setCharacterBrush(mode) {
  if(!brushNames().some(b=>b[0]===mode)||gesture||busy)return;
  studio.lastBrush=mode;state.brush.mode=mode;studio.topology='vertices';studio.faces=[];setMode('sculpt');update();
}
const previousStudioUpdate=update;
update=function(){previousStudioUpdate();initCharacterStudio();syncCharacterStudio();};
function syncCharacterStudio() {
  if(!studio.initialized)return;
  document.querySelectorAll('[data-character-model]').forEach(b=>b.disabled=busy||!!gesture);
  document.body.classList.toggle('character-space',studio.space==='character');
  document.querySelectorAll('.studio-switch button').forEach(b=>{const active=(b.dataset.character==='character')===(studio.space==='character');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('.studio-rail [data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  const selectButton=document.querySelector('.studio-rail [data-character=select]');selectButton?.classList.toggle('active',state.mode==='select');selectButton?.setAttribute('aria-pressed',String(state.mode==='select'));
  document.querySelectorAll('.studio-quick [data-character]').forEach(b=>{if(b.dataset.character==='libraryToggle')b.setAttribute('aria-expanded',String(!document.body.classList.contains('library-collapsed')));if(b.dataset.character==='historyToggle')b.setAttribute('aria-expanded',String(!document.body.classList.contains('history-collapsed')));});
  const fold=document.querySelector('[data-character=historyFold]'),folded=document.body.classList.contains('history-collapsed');if(fold){fold.textContent=folded?'+':'−';fold.setAttribute('aria-expanded',String(!folded));fold.setAttribute('aria-label',folded?ch('Déplier l’historique','Expand history'):ch('Replier l’historique','Collapse history'));}
  const hint=$('studioHint');hint.textContent=studio.space==='character'?(state.mode==='sculpt'?(isPointMode()?ch('Maj : ajouter des points · clic droit : tourner','Shift: add vertices · right drag: orbit'):ch('Maj : lisser · Ctrl : inverser / démasquer · [ ] : rayon · clic droit : tourner','Shift: smooth · Ctrl: invert / erase mask · [ ]: radius · right drag: orbit')):ch('G déplacer · R tourner · S taille · B sculpter','G move · R rotate · S scale · B sculpt')):ch('Espace : rechercher une commande','Space: search commands');
  if(studio.space==='character'&&!state.objects.length){$('welcome').querySelector('h1').textContent=ch('Créez votre personnage.','Create your character.');$('welcome').querySelector('p').textContent=ch('5 personnages complets, habillés et colorés, prêts à modifier.','5 complete characters with outfits and colours, ready to edit.');$('welcome').querySelector('.welcome-actions').innerHTML=charButton('modelLibrary',ch('Choisir un modèle','Choose a model'),'class="primary"')+charButton('customBase',ch('Base personnalisée','Custom base'),'class="secondary"');}
  else if(studio.space==='piece'&&!state.objects.length){$('welcome').querySelector('h1').textContent=ch('Donnez forme à vos idées.','Give shape to your ideas.');$('welcome').querySelector('p').textContent=ch('Combinez des formes, modifiez un STL et créez votre prochaine pièce 3D.','Combine shapes, edit an STL and create your next 3D part.');$('welcome').querySelector('.welcome-actions').innerHTML=`<button class="primary" data-action="welcomeBox">${ch('Créer une pièce','Create a part')}</button><button class="secondary" data-action="import">${ch('Importer un STL','Import STL')}</button>`;}
}
function renderCharacterModels(){
  const grid=$('characterModelGrid');if(!grid)return;
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),query=normalize($('characterModelSearch').value.trim()),category=$('characterModelCategory').value;
  const models=FCharacterModels.catalog.filter(p=>(category==='all'||category===p.category)&&normalize(p.fr+' '+p.en+' '+p.frNote+' '+p.enNote).includes(query));
  $('characterModelCount').textContent=String(models.length);
  grid.innerHTML=models.length?models.map(p=>{const preview=characterModelPreviews[p.id],label=ch(p.fr,p.en),note=ch(p.frNote,p.enNote);return `<button type="button" class="character-model-card" data-character-model="${p.id}" title="${esc(note)}" aria-label="${esc(ch('Ajouter le modèle : ','Add model: ')+label)}" ${busy?'disabled':''}><span class="model-add" aria-hidden="true">+</span><img src="${preview.src}" width="${preview.width}" height="${preview.height}" alt="" draggable="false"><span class="model-name">${esc(label)}</span><small>${p.height} mm · ${p.kind==='head'?ch('tête','head'):ch('corps','body')}</small></button>`;}).join(''):`<div class="character-model-empty"><p>${ch('Aucun modèle trouvé.','No models found.')}</p>${charButton('resetModels',ch('Afficher tous les modèles','Show all models'))}</div>`;
}
async function characterInsertModel(id){
  if(busy||gesture||$('modal').open)throw Error(ch('Terminez l’action en cours.','Finish the current action.'));
  const preset=FCharacterModels.get(id);if(!preset)throw Error(ch('Modèle inconnu.','Unknown model.'));
  if(state.objects.length>=300)throw Error(tx('partsLimit'));
  const label=ch(preset.fr,preset.en),result=await characterJob('characterModel',{preset:id,height:preset.height},ch('Préparation du modèle : ','Preparing model: ')+label),geo=FG.geometry(result.positions);geo.colors=result.colors;const o=makeObject(geo,{name:label,color:preset.color,smooth:false,character:{template:id}}),visible=state.objects.filter(v=>v.visible);
  if(visible.length){const b=combinedBounds(visible);o.position=[b.max[0]+geo.bounds.size[0]/2+Math.max(10,preset.height*.08),b.center[1],-geo.bounds.min[2]];}
  checkMeshPartsBudget([o]);commit(ch('Ajouter un modèle : ','Add model: ')+label,()=>{state.objects.push(o);state.selected=[o.id];});
  if(studio.space!=='character')setStudioSpace('character');setCharacterBrush('grab');state.brush.radius=Number((preset.height*.055).toFixed(2));renderer.viewPreset('front');renderer.fit([o]);$('leftPanel').classList.remove('open');update();toast(ch('Modèle ajouté. Vous pouvez le sculpter et le modifier.','Model added. You can sculpt and edit it.'));return o;
}
function characterInspector() {
  const o=editable().length===1?editable()[0]:null,disabled=!o||busy||o.hole?'disabled':'',mode=state.brush.mode;
  return `<section class="property-section character-tools"><div class="section-label">${ch('SCULPTURE','SCULPTING')}<span class="badge">B</span></div><div class="brush-grid">${brushNames().map(([id,label,i])=>charButton('brush-'+id,`${icon(i)}<span>${label}</span>`,`class="${mode===id?'active':''}" aria-pressed="${mode===id}"`)).join('')}</div>
    ${mode!=='points'?`<div class="brush-sliders">${charField('charRadius',ch('Rayon · mm','Radius · mm'),state.brush.radius,.1,1000,'any')}<input id="charRadiusRange" type="range" min="0.1" max="${Math.max(60,Math.ceil(state.brush.radius))}" step="0.1" value="${state.brush.radius}" aria-label="${ch('Rayon du pinceau','Brush radius')}">${charField('charStrength',ch('Intensité','Strength'),state.brush.strength,.01,3,'any')}<input id="charStrengthRange" type="range" min="0.01" max="3" step="0.01" value="${state.brush.strength}" aria-label="${ch('Intensité du pinceau','Brush strength')}"></div>`:''}
    <div class="symmetry-controls"><label><input id="charSymmetry" type="checkbox" ${studio.symmetry?'checked':''}>${ch('Symétrie en direct','Live symmetry')}</label><div role="group" aria-label="${ch('Axe de symétrie local','Local symmetry axis')}">${[0,1,2].map(a=>charButton('axis-'+a,['X','Y','Z'][a],`aria-pressed="${studio.axis===a}" class="${studio.axis===a?'active':''}"`)).join('')}</div></div><p class="note">${ch('Plan local au centre de l’objet. Les sommets centraux restent soudés.','Local plane through the object centre. Centre vertices stay welded.')}</p>
    <label class="inline-check"><input id="charFront" type="checkbox" ${studio.frontOnly?'checked':''}>${ch('Surface avant uniquement','Front-facing surface only')}</label><label class="inline-check"><input id="charPressure" type="checkbox" ${studio.pressure?'checked':''}>${ch('Pression du stylet','Pen pressure')}</label>
    <div class="mini-actions">${charButton('clearMask',ch('Effacer le masque','Clear mask'),disabled)}${charButton('invertMask',ch('Inverser le masque','Invert mask'),disabled)}</div>
    ${!o?`<p class="note">${ch('Sélectionnez un objet visible et déverrouillé, ou créez une base.','Select a visible unlocked object, or create a base.')}</p>`:''}</section>
    ${mode==='points'?`<details class="character-details" open><summary>${ch('Édition de points et de faces','Vertex and face editing')}</summary>${previousPointInspector()}<div class="property-section"><div class="mini-actions">${charButton('vertices',ch('Points','Vertices'),`aria-pressed="${studio.topology==='vertices'}"`)}${charButton('faces',ch('Faces','Faces'),`aria-pressed="${studio.topology==='faces'}"`)}</div><p class="note">${ch('Points : sélectionner deux sommets voisins pour diviser une arête. Faces : clic pour sélectionner, Maj pour ajouter.','Vertices: select two neighbours to split an edge. Faces: click to select, Shift to add.')}</p>${charButton('splitEdge',ch('Diviser l’arête sélectionnée','Split selected edge'),`class="secondary fullwidth" ${disabled}`)}${charField('charExtrude',ch('Extrusion des faces · mm','Face extrusion · mm'),2,-1000,1000,.1)}${charButton('extrudeFaces',ch('Extruder les faces sélectionnées','Extrude selected faces'),`class="secondary fullwidth" ${disabled}`)}</div></details>`:''}
    <section class="property-section"><div class="section-label">${ch('SURFACE ET DÉTAIL','SURFACE AND DETAIL')}</div><div class="action-stack">${charButton('loop',`${icon('mesh')}${ch('Subdivision lissée','Smooth subdivision')}`,disabled)}${charButton('remesh',`${icon('repair')}${ch('Remesher / réunir les volumes','Remesh / join volumes')}`,editable().length?'':'disabled')}${charButton('references',`${icon('import')}${ch('Images de référence','Reference images')}`)}</div></section>
    <details class="character-details"><summary>${ch('Préparer pour l’animation','Prepare for animation')}</summary><div class="property-section action-stack">${charButton('retopo',ch('Retopologie manuelle · quadrilatères','Manual retopology · quads'),disabled)}${charButton('uv',ch('Projection et aperçu UV','UV projection and preview'),disabled)}${charButton('rig',ch('Squelette et pose','Skeleton and pose'),disabled)}${charButton('exportGLB',ch('Exporter GLB · couleurs / UV / squelette','Export GLB · colors / UV / skeleton'),disabled)}</div></details><details class="character-details"><summary>${ch('Préparer pour l’impression','Prepare for printing')}</summary><div class="property-section action-stack">${charButton('thickness',ch('Échantillonner les épaisseurs','Sample wall thickness'),disabled)}<button data-action="cut">${ch('Découper en pièces','Cut into parts')}</button><button data-action="splitComponents">${ch('Séparer les composants','Separate components')}</button><button data-action="analyze">${ch('Vérifier le maillage','Check mesh')}</button><button data-action="export">${ch('Exporter STL','Export STL')}</button></div></details>`;
}
const previousPointInspector=pointInspector;
pointInspector=function(){return studio.space==='character'?characterInspector():previousPointInspector();};
const previousCharacterInspector=renderInspector;
renderInspector=function(){
  if(studio.space!=='character')return previousCharacterInspector();
  const list=selected(),o=list.length===1?list[0]:null;
  $('inspectorTitle').textContent=o?o.name:ch('Atelier personnage','Character studio');$('inspectorSubtitle').textContent=o?(o.geo.positions.length/9).toLocaleString()+' '+ch('triangles','triangles'):ch('Volumes, silhouette, détails.','Volumes, silhouette, details.');
  if(studio.retopo){$('inspector').innerHTML=`<section class="property-section"><div class="section-label">${ch('RETOPOLOGIE MANUELLE','MANUAL RETOPOLOGY')}</div><p>${ch('Cliquez quatre points sur la surface source pour créer un quadrilatère. Les points proches d’un sommet existant s’y accrochent.','Click four points on the source surface to create a quad. Points near an existing vertex snap to it.')}</p><p class="note">${studio.retopo.pending.length} / 4 · ${studio.retopo.quads.length} ${ch('quadrilatères','quads')}</p><div class="action-stack">${charButton('retopoUndo',ch('Retirer le dernier point','Remove last point'))}${charButton('retopoFinish',ch('Terminer la retopologie','Finish retopology'),'class="primary"')}</div><p class="note">${ch('Clic droit : tourner. Le résultat est une surface ouverte tant que les patches ne forment pas une enveloppe fermée. Les quadrilatères sont conservés dans le projet et triangulés pour le rendu et les exports.','Right drag: orbit. The result is an open surface until patches form a closed shell. Quads are stored in the project and triangulated for rendering and export.')}</p></section>`;return;}
  if(state.mode==='sculpt'){
    $('inspector').innerHTML=characterInspector()+`<details class="character-details"><summary>${ch('Objet et transformations','Object and transforms')}</summary><div class="property-section">${o?`<label class="field"><span>${ch('Nom','Name')}</span><input id="objectName" value="${esc(o.name)}" maxlength="100" ${o.locked?'disabled':''}></label><label class="field"><span>${ch('Couleur','Color')}</span><input type="color" id="objectColor" value="${o.color}" ${o.locked?'disabled':''}></label>`:''}<div class="action-stack"><button data-action="objectManager">${ch('Gérer les objets','Manage objects')}</button><button data-action="analyze">${ch('Analyser le maillage','Analyze mesh')}</button><button data-action="export">${ch('Exporter STL pour impression','Export STL for printing')}</button></div></div></details>`;
  }else{
    previousCharacterInspector();
    const inspector=$('inspector');for(const section of inspector.querySelectorAll(':scope > .property-section')){
      if(section.classList.contains('library-inspector-save')||section.classList.contains('mesh-parts-panel'))section.hidden=true;
    }
  }
};
const previousCharacterMode=setMode;
const originalCharacterModal=modal;
modal=function(...args){$('modal')._characterCleanup?.();return originalCharacterModal(...args);};
setMode=function(mode){if(mode!=='retopo'&&!busy&&!gesture)studio.retopo=null;const brush=state.brush.mode;previousCharacterMode(mode);if(mode==='sculpt'&&state.mode==='sculpt'){state.brush.mode=brush||studio.lastBrush;update();if(studio.space==='character'){for(const t of [...$('toastArea').children])if(/points|vertices/i.test(t.textContent))t.remove();}}};
const originalCharacterRestore=restore;
restore=function(s){studio.retopo=null;studio.faces=[];studio.hit=null;studio.posePreview=null;originalCharacterRestore(s);};
const originalVertexDeform=FVertexEdit.deform,vertexMirrorCache=new WeakMap();
FVertexEdit.deform=function(base,ids,delta,model,radius=0){
  let result=originalVertexDeform(base,ids,delta,model,radius);
  if(studio.space==='character'&&studio.symmetry){const axis=studio.axis,plane=base.geo.bounds.center[axis];let cache=vertexMirrorCache.get(base.geo);if(!cache||cache.axis!==axis){cache={axis,map:FCharacter.mirrors(base.topo,axis,plane)};vertexMirrorCache.set(base.geo,cache);}
    const points=result.vertices.map(v=>v.slice()),original=base.topo.vertices;
    for(let i=0;i<points.length;i++){const j=cache.map[i];if(j<0||j<i)continue;if(i===j){points[i][axis]=plane;continue;}const a=FM.sub(points[i],original[i]),b=FM.sub(points[j],original[j]),from=FM.len(a)>=FM.len(b)?i:j,to=from===i?j:i,d=FM.sub(points[from],original[from]);d[axis]*=-1;points[to]=FM.add(original[to],d).map(Math.fround);}
    const p=base.geo.positions.slice();for(let i=0;i<points.length;i++)for(const off of base.topo.occ[i])p.set(points[i],off);
    for(const f of base.topo.faces){const [a,b,c]=f.map(i=>original[i]),[A,B,C]=f.map(i=>points[i]),n=FM.cross(FM.sub(b,a),FM.sub(c,a)),N=FM.cross(FM.sub(B,A),FM.sub(C,A));if(FM.dot(n,N)<=0)throw Error(ch('Réduisez le déplacement symétrique : un triangle se replie.','Reduce the symmetric movement: a triangle folds over.'));}
    result={...result,geo:FG.geometry(p),vertices:points};
  }
  if(base.geo.mask)result.geo.mask=base.geo.mask.slice();if(base.geo.colors)result.geo.colors=base.geo.colors.slice();return result;
};
function syncBrushFields(){for(const id of ['charRadius','charRadiusRange'])if($(id))$(id).value=state.brush.radius;for(const id of ['charStrength','charStrengthRange'])if($(id))$(id).value=state.brush.strength;}
function characterClearMask(invert=false){const o=single();commit(ch(invert?'Inverser le masque':'Effacer le masque',invert?'Invert mask':'Clear mask'),()=>{const g=FG.geometry(o.geo.positions.slice());if(o.geo.colors)g.colors=o.geo.colors.slice();if(invert)g.mask=Float32Array.from(o.geo.mask||new Float32Array(g.positions.length/3),v=>1-v);o.geo=g;});}
function characterNumber(id){const e=$(id);if(!e||!e.checkValidity())throw Error(ch('Vérifiez les valeurs saisies.','Check the entered values.'));return +e.value;}
function characterBaseDialog(kind='body') {
  modal(ch('Créer une base de personnage','Create a character base'),ch('Volume continu et fermé · dimensions en mm','Continuous closed volume · dimensions in mm'),`<div class="character-form"><label class="field"><span>${ch('Base','Base')}</span><select id="charBaseKind">${[['head',ch('Tête','Head')],['bust',ch('Buste','Bust')],['body',ch('Corps','Body')]].map(([id,label])=>`<option value="${id}" ${id===kind?'selected':''}>${label}</option>`).join('')}</select></label>${charField('charHeight',ch('Hauteur totale · mm','Total height · mm'),kind==='head'?60:kind==='bust'?100:170,10,1000)}${charField('charWidth',ch('Largeur relative','Relative width'),1,.6,1.5,.05)}${charField('charHead',ch('Proportion de la tête','Head proportion'),1,.7,1.4,.05)}<label class="field"><span>${ch('Détail initial','Initial detail')}</span><select id="charBaseDetail"><option value="32">${ch('Léger','Light')}</option><option value="48" selected>${ch('Équilibré','Balanced')}</option><option value="64">${ch('Fin','Fine')}</option></select></label></div><p class="note">${ch('Mannequin stylisé en pose A. Les doigts, les traits du visage et les vêtements se sculptent ensuite.','Stylized A-pose mannequin. Sculpt fingers, facial features and clothes afterwards.')}</p>`,[{label:ch('Créer la base','Create base'),primary:true,id:'createCharacterBase',action:async()=>{
    const args={kind:$('charBaseKind').value,height:characterNumber('charHeight'),width:characterNumber('charWidth'),head:characterNumber('charHead'),detail:+$('charBaseDetail').value};$('modal').close();
    const r=await characterJob('characterBase',args,ch('Construction du personnage','Building character'));const g=FG.geometry(r.positions),o=makeObject(g,{name:({head:ch('Tête','Head'),bust:ch('Buste','Bust'),body:ch('Personnage','Character')})[args.kind],color:'#c0a48f',smooth:true,character:{base:args}});checkMeshPartsBudget([o]);
    commit(ch('Créer une base de personnage','Create character base'),()=>{state.objects.push(o);state.selected=[o.id];});if(studio.space!=='character')setStudioSpace('character');setCharacterBrush('grab');state.brush.radius=Math.max(1,args.height*.065);renderer.viewPreset('front');renderer.fit([o]);update();
  }}]);
}
function characterMeshDialog(kind) {
  const list=editable().filter(o=>!o.hole);if(!list.length)throw Error(ch('Sélectionnez un solide.','Select a solid.'));if(kind==='loop'&&list.length!==1)throw Error(ch('Sélectionnez un seul objet.','Select one object.'));
  modal(kind==='loop'?ch('Subdivision avec lissage','Smooth subdivision'):ch('Remeshing des volumes','Volume remeshing'),ch('Une copie de l’original est conservée et masquée.','A copy of the original is preserved and hidden.'),kind==='loop'?`<p>${ch('Subdivision Loop : chaque triangle devient quatre triangles et la silhouette s’arrondit. Les volumes peuvent diminuer.','Loop subdivision: every triangle becomes four triangles and the silhouette becomes rounder. Volumes can shrink.')}</p><p class="note">${ch('Maximum en entrée : 28 000 triangles. Masque et squelette devront être recréés sur le nouveau maillage.','Input limit: 28,000 triangles. Recreate masks and skeleton on the new mesh.')}</p>`:`<label class="field"><span>${ch('Résolution sur le plus grand axe','Resolution along the longest axis')}</span><select id="charRemeshResolution"><option value="32">32 · ${ch('rapide','fast')}</option><option value="48" selected>48 · ${ch('équilibré','balanced')}</option><option value="64">64 · ${ch('fin','fine')}</option><option value="96">96 · ${ch('très fin','very fine')}</option></select></label><p>${ch('Les solides sélectionnés sont réunis sur une grille volumique puis lissés. Les détails plus petits que quelques cellules peuvent disparaître.','Selected solids are joined on a volume grid then smoothed. Details smaller than a few cells may disappear.')}</p><p class="note">${ch('Ce remeshing produit des triangles. Il ne crée pas de boucles de quadrilatères adaptées à l’animation. Masques, UV et squelette sont réinitialisés sur le résultat.','This remeshing produces triangles. It does not create animation-ready quad edge loops. Masks, UVs and skeleton are reset on the result.')}</p>`,[{label:ch('Créer une copie modifiée','Create modified copy'),primary:true,id:'applyCharacterMesh',action:async()=>{const resolution=+$('charRemeshResolution')?.value||48;$('modal').close();await characterApplyMesh(kind,resolution,list);}}]);
}
async function characterApplyMesh(kind,resolution=48,list=editable().filter(o=>!o.hole)) {
  if(!['loop','remesh','refine'].includes(kind)||!list.length||list.some(o=>o.locked||!o.visible))throw Error(ch('Sélection invalide.','Invalid selection.'));
  const title=kind==='loop'?ch('Subdivision lissée','Smooth subdivision'):kind==='refine'?ch('Ajouter du détail','Add detail'):ch('Remeshing','Remeshing'),source=kind==='remesh'?null:world(list[0]),r=await characterJob(kind==='loop'?'characterLoop':kind==='refine'?'characterRefine':'characterRemesh',source?{positions:source.positions,...(source.colors?{colors:source.colors}:{})}:{meshes:list.map(o=>world(o).positions),resolution},title),result=FG.geometry(r.positions);if(r.colors)result.colors=r.colors;const n=makeObject(result,{name:list[0].name+' · '+title,color:list[0].color,smooth:kind==='refine'?list[0].smooth:true,material:list[0].material?{...list[0].material}:null});
  replaceWorld(n,n.geo);checkMeshPartsBudget([n]);n.construction=FModel.capture(list,n,title);
  commit(title,()=>{list.forEach(o=>o.visible=false);state.objects.push(n);state.selected=[n.id];});studio.metrics=r;renderer.fit([n]);toast(ch('Copie créée. Les originaux restent dans Gérer les objets.','Copy created. Originals remain in Manage objects.')+(r.voxel?' · '+ch('Cellule : ','Cell: ')+r.voxel.toFixed(2)+' mm':''));return n;
}
const originalCharacterModifyMesh=modifyMesh;
modifyMesh=async function(action){if(action==='subdivide'&&editable().length===1&&editable()[0].geo.colors)return characterApplyMesh('refine');return originalCharacterModifyMesh(action);};

// Each gesture edits fresh arrays; history and source geometry remain immutable.
startSculpt=function(g,hit){
  const o=hit.object;if(o.locked||!o.visible||o.hole)throw Error(ch('Choisissez un solide déverrouillé.','Choose an unlocked solid.'));
  g.before=snapshot();const original=o.geo,geo=FG.geometry(original.positions.slice());if(original.mask)geo.mask=original.mask.slice();if(original.colors)geo.colors=original.colors.slice();
  studio.bvh.delete(original);studio.maskMeshes.delete(original);
  o.geo=geo;o.param=null;o.smooth=true;if(o.construction)o.construction={...o.construction,edited:true};
  g.obj=o;g.type='sculpt';g.changed=false;g.affected=0;g.meshTopology=FG.topology(geo);g.normalData=FCharacter.normals(g.meshTopology);g.model=matrix(o);g.inverse=FM.inverse(g.model);g.minScale=Math.min(...o.scale);g.startHit=hit;g.planeNormal=FM.sub(renderer.camera.target,renderer.eye);g.planePoint=hit.point;g.startPlane=FM.rayPlane(renderer.ray(...g.start),g.planeNormal,g.planePoint);g.localRadius=state.brush.radius/g.minScale;g.index=new FCharacter.Spatial(g.meshTopology.vertices,g.localRadius);g.mask=new Float32Array(g.meshTopology.vertices.length);
  g.meshTopology.occ.forEach((offsets,i)=>g.mask[i]=original.mask?.[offsets[0]/3]||0);
  g.symmetry=studio.symmetry;g.axis=studio.axis;g.center=original.bounds.center[g.axis];g.seam=Math.max(...original.bounds.size)*.00001;
  g.tree=characterBVH(geo);g.baseVertices=g.meshTopology.vertices.map(v=>v.slice());g.baseIndex=new FCharacter.Spatial(g.baseVertices,g.localRadius);g.lastStamp=null;g.totalMs=0;g.stamps=0;g.candidates=0;
  geo.characterNormals=new Float32Array(geo.positions.length);for(let i=0;i<g.normalData.sum.length;i++){const n=FM.norm(g.normalData.sum[i]);for(const off of g.meshTopology.occ[i])geo.characterNormals.set(n,off);}
  lastPaint=0;
};
function updateSculptBuffers(g,changed) {
  const {obj:o,meshTopology:t,normalData:n}=g,faces=new Set(),vertices=new Set();
  for(const i of changed)for(const f of n.adj[i])faces.add(f);
  for(const f of faces){const ids=t.faces[f],old=n.face[f],next=FM.cross(FM.sub(t.vertices[ids[1]],t.vertices[ids[0]]),FM.sub(t.vertices[ids[2]],t.vertices[ids[0]]));n.face[f]=next;for(const i of ids){n.sum[i]=FM.add(n.sum[i],FM.sub(next,old));vertices.add(i);}}
  for(const i of vertices){const normal=FM.norm(n.sum[i]);for(const off of t.occ[i])o.geo.characterNormals.set(normal,off);}
  for(const i of changed){for(const off of t.occ[i])o.geo.positions.set(t.vertices[i],off);g.index.put(i,t.vertices[i]);}
  g.tree.refit(faces);o.geo.bounds={min:g.tree.root.min.slice(),max:g.tree.root.max.slice(),center:FM.mul(FM.add(g.tree.root.min,g.tree.root.max),.5),size:FM.sub(g.tree.root.max,g.tree.root.min)};
  const c=renderer.cache.get(o.geo.id);if(c){const gl=renderer.gl;const ranges=new Set();for(const i of vertices)for(const off of t.occ[i])ranges.add(off);const sorted=[...ranges].sort((a,b)=>a-b);gl.bindBuffer(gl.ARRAY_BUFFER,c.n);uploadRanges(gl,o.geo.characterNormals,sorted);const pos=[];for(const i of changed)pos.push(...t.occ[i]);gl.bindBuffer(gl.ARRAY_BUFFER,c.p);uploadRanges(gl,o.geo.positions,pos.sort((a,b)=>a-b));
    if(c.edges){gl.deleteBuffer(c.edges);c.edges=null;}if(c.features){gl.deleteBuffer(c.features);c.features=null;}
  }
  studio.maskMeshes.delete(o.geo);
}
function uploadRanges(gl,array,offsets){if(!offsets.length)return;let start=offsets[0],end=start+3;const send=()=>gl.bufferSubData(gl.ARRAY_BUFFER,start*4,array.subarray(start,end));for(let k=1;k<offsets.length;k++){const off=offsets[k];if(off<=end+12)end=Math.max(end,off+3);else{send();start=off;end=off+3;}}send();}
sculptAt=function(g,p,shift=false){
  const now=performance.now(),mode=shift?'smooth':state.brush.mode,evt=studio.event,pressure=studio.pressure&&evt?.pointerType==='pen'?FM.clamp(evt.pressure,.02,1):1;
  if(now-lastPaint<16&&mode!=='grab')return;
  const hit=mode==='grab'?g.startHit:renderer.pick(...p,o=>o.id===g.obj.id);if(!hit)return;
  const radius=state.brush.radius,strength=state.brush.strength*pressure,t=g.meshTopology,o=g.obj,local=FM.point(g.inverse,hit.point),mirror=local.slice();mirror[g.axis]=2*g.center-local[g.axis];
  const centers=[local];if(g.symmetry)centers.push(mirror);
  if(g.lastStamp&&mode!=='grab'&&FM.len(FM.sub(hit.point,g.lastStamp))<radius*.035)return;g.lastStamp=hit.point.slice();lastPaint=now;
  const candidates=new Set(centers.flatMap(c=>(mode==='grab'?g.baseIndex:g.index).query(c,radius/g.minScale))),updates=[],maskChanged=[],view=FM.norm(FM.sub(renderer.eye,hit.point)),inverse=!!(evt?.ctrlKey||evt?.metaKey);
  let grab=[0,0,0];if(mode==='grab'){const q=FM.rayPlane(renderer.ray(...p),g.planeNormal,g.planePoint);if(!q||!g.startPlane)return;grab=FM.direction(g.inverse,FM.sub(q,g.startPlane));}
  const dt=Math.min(2,Math.max(.25,(now-(g.paintTime||now-16))/16));g.paintTime=now;
  for(const i of candidates){const v=mode==='grab'?g.baseVertices[i]:t.vertices[i],worldV=FM.point(g.model,v),ds=centers.map(c=>FM.len(FM.sub(worldV,FM.point(g.model,c)))),which=ds.length===2&&ds[1]<ds[0]?1:0,dist=ds[which];if(dist>=radius)continue;
    const normal=FM.norm(g.normalData.sum[i]),worldNormal=FM.norm([g.inverse[0]*normal[0]+g.inverse[1]*normal[1]+g.inverse[2]*normal[2],g.inverse[4]*normal[0]+g.inverse[5]*normal[1]+g.inverse[6]*normal[2],g.inverse[8]*normal[0]+g.inverse[9]*normal[1]+g.inverse[10]*normal[2]]);
    if(studio.frontOnly&&FM.dot(worldNormal,view)<=0)continue;
    const x=1-dist/radius,falloff=x*x*(3-2*x),masked=g.mask[i];
    if(mode==='mask'){const next=FM.clamp(masked+(inverse?-1:1)*strength*.30*falloff*dt,0,1);if(next!==masked){g.mask[i]=next;maskChanged.push(i);}continue;}
    const f=falloff*(1-masked);if(f<=1e-5)continue;let next;
    if(mode==='grab'){let d=grab.slice();if(which)d[g.axis]*=-1;next=FM.add(v,FM.mul(d,f));}
    else if(mode==='smooth'){let avg=[0,0,0];for(const j of t.adj[i])avg=FM.add(avg,t.vertices[j]);next=FM.lerp(v,FM.mul(avg,1/(t.adj[i].size||1)),Math.min(.55,strength*.17*dt)*f);}
    else if(mode==='flatten'){let n=FM.direction(g.inverse,hit.normal);if(which)n[g.axis]*=-1;n=FM.norm(n);next=FM.sub(v,FM.mul(n,FM.dot(FM.sub(v,centers[which]),n)*Math.min(.8,strength*.25*dt)*f));}
    else if(mode==='pinch'){const d=FM.sub(centers[which],v),tangent=FM.sub(d,FM.mul(normal,FM.dot(d,normal)));next=FM.add(v,FM.mul(tangent,strength*.12*dt*f*(inverse?-1:1)));}
    else{const sign=(mode==='deflate'?-1:1)*(inverse?-1:1);next=FM.add(v,FM.direction(g.inverse,FM.mul(worldNormal,sign*strength*radius*.018*dt*f)));}
    if(g.symmetry&&Math.abs(v[g.axis]-g.center)<g.seam)next[g.axis]=g.center;
    if(next.every(Number.isFinite)&&FM.len(FM.sub(next,t.vertices[i]))>1e-9)updates.push([i,next.map(Math.fround)]);
  }
  if(updates.length){for(const [i,v] of updates)t.vertices[i]=v;updateSculptBuffers(g,updates.map(x=>x[0]));}
  if(maskChanged.length){o.geo.mask ||=new Float32Array(o.geo.positions.length/3);for(const i of maskChanged)for(const off of t.occ[i])o.geo.mask[off/3]=g.mask[i];studio.maskMeshes.delete(o.geo);}
  if(updates.length||maskChanged.length){g.changed=true;g.affected+=updates.length+maskChanged.length;renderer.request();}
  g.stamps++;g.candidates+=candidates.size;g.totalMs+=performance.now()-now;studio.metrics={stamps:g.stamps,averageMs:g.totalMs/g.stamps,averageCandidates:g.candidates/g.stamps,vertices:t.vertices.length};
};
const originalCharacterPointerDown=pointerDown;
pointerDown=function(e){
  if(studio.retopo&&e.button===0&&!e.altKey&&!busy&&!gesture&&!$('modal').open){characterRetopoPoint(e);return;}
  if(studio.topology==='faces'&&isPointMode()&&e.button===0&&!e.altKey&&!busy&&!gesture&&!$('modal').open){renderer.matrices();const p=pointerPosition(e),hit=renderer.pick(...p);if(hit){if(studio.faceObject!==hit.object.id){studio.faceObject=hit.object.id;studio.faces=[];choose([hit.object.id]);}studio.faces=e.shiftKey?(studio.faces.includes(hit.face)?studio.faces.filter(i=>i!==hit.face):[...studio.faces,hit.face]):[hit.face];renderer.request();renderer.canvas.focus();return;}}
  return originalCharacterPointerDown(e);
};
const originalCharacterPointerUp=pointerUp;
pointerUp=async function(e){const g=gesture;if(g?.type==='sculpt'&&e.pointerId===g.pointerId){
    if(!g.moved&&state.brush.mode!=='grab')sculptAt(g,g.start,e.shiftKey);
    if(g.changed){const report=FG.analyze(g.obj.geo);if(report.degenerate||report.nonManifold||report.inconsistent){gesture=null;restore(g.before);toast(ch('Geste annulé : des triangles se replient. Réduisez l’intensité.','Stroke cancelled: triangles fold over. Reduce strength.'),'warn');try{renderer.canvas.releasePointerCapture(e.pointerId);}catch{}return;}
      delete g.obj.geo.characterNormals;
      // Pose rest positions no longer match a sculpted surface: keep bones but
      // clear rotations, allowing a new approximate weight binding at export.
      if(g.obj.character?.bones)g.obj.character={...g.obj.character,bones:g.obj.character.bones.map(b=>({...b,rotation:[0,0,0]}))};
    }
  }return originalCharacterPointerUp(e);};
const originalCharacterOverlay=drawOverlay;
drawOverlay=function(){originalCharacterOverlay();if(!studio.initialized)return;const ctx=renderer.overlay.getContext('2d');drawCharacterReferences(ctx);
  if(studio.retopo){const r=studio.retopo;ctx.save();ctx.strokeStyle='#247bba';ctx.fillStyle='#247bba';ctx.lineWidth=2;for(const f of r.quads){ctx.beginPath();f.forEach((i,k)=>{const p=renderer.project(r.vertices[i]);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.closePath();ctx.stroke();}ctx.beginPath();r.pending.forEach((v,k)=>{const p=renderer.project(v.p);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.stroke();for(const v of r.pending){const p=renderer.project(v.p);ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fill();}ctx.restore();}
  const o=editable().length===1?editable()[0]:null;
  if(studio.space==='character'&&o&&studio.symmetry){const b=o.geo.bounds,a=studio.axis,axes=[0,1,2].filter(i=>i!==a),points=[[0,0],[1,0],[1,1],[0,1]].map(q=>{const p=b.center.slice();p[axes[0]]=q[0]?b.max[axes[0]]:b.min[axes[0]];p[axes[1]]=q[1]?b.max[axes[1]]:b.min[axes[1]];return renderer.project(FM.point(matrix(o),p));});ctx.save();ctx.strokeStyle='#4279c477';ctx.setLineDash([4,5]);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.stroke();ctx.restore();}
  if(studio.topology==='faces'&&o&&o.id===studio.faceObject){ctx.save();ctx.fillStyle='#ecaa3260';ctx.strokeStyle='#c58a1c';for(const f of studio.faces){const p=o.geo.positions;if(f*9+8>=p.length)continue;ctx.beginPath();for(let k=0;k<3;k++){const q=renderer.project(FM.point(matrix(o),p.subarray(f*9+k*3,f*9+k*3+3)));k?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);}ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();}
  if(state.mode==='sculpt'&&!isPointMode()&&hover){const hit=gesture?.type==='sculpt'&&state.brush.mode==='grab'?gesture.startHit:studio.hit;if(hit){const n=hit.normal,ref=Math.abs(n[2])>.8?[1,0,0]:[0,0,1],u=FM.norm(FM.cross(n,ref)),v=FM.cross(n,u),radius=state.brush.radius;ctx.save();ctx.strokeStyle=state.brush.mode==='mask'?'#365b91':'#a5692b';ctx.lineWidth=1.7;ctx.beginPath();for(let k=0;k<=48;k++){const a=k*Math.PI/24,p=renderer.project(FM.add(hit.point,FM.mul(FM.add(FM.mul(u,Math.cos(a)),FM.mul(v,Math.sin(a))),radius)));k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}ctx.stroke();ctx.restore();}}
  if(studio.posePreview?.bones&&o){ctx.save();ctx.strokeStyle='#4478cc';ctx.fillStyle='#fff';ctx.lineWidth=2;const bones=studio.posePreview.bones,ms=FCharacter.poseMatrices(bones);bones.forEach((b,i)=>{const p=renderer.project(FM.point(matrix(o),FM.point(ms[i],b.p)));if(b.parent>=0){const parent=bones[b.parent],q=renderer.project(FM.point(matrix(o),FM.point(ms[b.parent],parent.p)));ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();}ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fill();ctx.stroke();});ctx.restore();}
};

function characterReferenceDialog() {
  const config=structuredClone(characterConfig());config.references ||= {};
  modal(ch('Références face et profil','Front and side references'),ch('Images locales intégrées au projet · affichées dans les vues orthographiques','Local images embedded in the project · shown in orthographic views'),`<div class="reference-grid">${['front','right'].map(view=>{const r=config.references[view];return `<section><h3>${view==='front'?ch('Face','Front'):ch('Profil droit','Right side')}</h3><label class="field"><span>${ch('Image PNG, JPEG ou WebP','PNG, JPEG or WebP image')}</span><input type="file" id="charRef-${view}" accept="image/png,image/jpeg,image/webp"></label><div id="charRefPreview-${view}" class="reference-preview">${r?`<img src="${esc(r.data)}" alt="${ch('Référence','Reference')}">`:ch('Aucune image','No image')}</div>${charField('charRefHeight-'+view,ch('Hauteur dans la scène · mm','Scene height · mm'),r?.height||170,.1,10000,.1)}${charField('charRefX-'+view,ch('Décalage horizontal · mm','Horizontal offset · mm'),r?.x||0,-10000,10000,.1)}${charField('charRefZ-'+view,ch('Décalage vertical · mm','Vertical offset · mm'),r?.z||85,-10000,10000,.1)}<label class="field"><span>${ch('Opacité','Opacity')}</span><input id="charRefOpacity-${view}" type="range" min="0.05" max="0.8" step="0.05" value="${r?.opacity||.25}"></label>${charButton('removeRef-'+view,ch('Retirer l’image','Remove image'))}</section>`;}).join('')}</div><p class="note">${ch('Les images ne font pas partie des exports STL / GLB. Elles apparaissent derrière le modèle.','Images are excluded from STL / GLB exports. They appear behind the model.')}</p>`,[{label:ch('Enregistrer les références','Save references'),primary:true,id:'saveCharacterReferences',action:()=>{for(const view of ['front','right'])if(config.references[view])Object.assign(config.references[view],{height:characterNumber('charRefHeight-'+view),x:characterNumber('charRefX-'+view),z:characterNumber('charRefZ-'+view),opacity:+$('charRefOpacity-'+view).value});setCharacterConfig(config,ch('Images de référence','Reference images'));$('modal').close();renderer.request();}}]);
  for(const view of ['front','right']){
    $('charRef-'+view).onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error(ch('Image PNG, JPEG ou WebP · 8 Mio maximum.','PNG, JPEG or WebP image · maximum 8 MiB.'));
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error(ch('Lecture impossible.','Cannot read image.')));r.readAsDataURL(file);});
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error(ch('Image invalide.','Invalid image.')));img.src=data;});
      const canvas=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(img.width,img.height));canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const embedded=canvas.toDataURL('image/webp',.88);config.references[view]={data:embedded,height:170,x:0,z:85,opacity:.25};const preview=$('charRefPreview-'+view);preview.textContent='';const thumb=document.createElement('img');thumb.src=embedded;thumb.alt=ch('Référence','Reference');preview.appendChild(thumb);
    }catch(error){$('dialogError').textContent=characterMessage(error);}};
    document.querySelector(`[data-character="removeRef-${view}"]`).onclick=()=>{delete config.references[view];$('charRefPreview-'+view).textContent=ch('Aucune image','No image');};
  }
}
function drawCharacterReferences(ctx) {
  const config=characterConfig(),camera=renderer.camera;if(!camera.ortho)return;
  const yaw=Math.atan2(Math.sin(camera.yaw),Math.cos(camera.yaw)),front=Math.abs(yaw+Math.PI/2)<.0001&&Math.abs(camera.pitch)<.0001,right=Math.abs(yaw)<.0001&&Math.abs(camera.pitch)<.0001,view=front?'front':right?'right':null,r=view&&config.references?.[view];if(!r)return;
  let img=studio.references.get(r.data);if(!img){img=new Image();img.onload=()=>renderer.request();img.src=r.data;studio.references.set(r.data,img);}if(!img.complete||!img.naturalWidth)return;
  const world=view==='front'?[r.x,0,r.z]:[0,r.x,r.z],center=renderer.project(world),top=renderer.project(FM.add(world,[0,0,r.height/2])),height=Math.abs(center[1]-top[1])*2,width=height*img.naturalWidth/img.naturalHeight;
  // Composite only onto the background. The opaque WebGL viewport itself is
  // drawn beneath this overlay; destination-over alone cannot occlude models.
  // A tiny offscreen depth mask from projected model triangles clips references.
  let layer=studio.referenceLayer;if(!layer){layer=document.createElement('canvas');studio.referenceLayer=layer;}layer.width=Math.ceil(renderer.w);layer.height=Math.ceil(renderer.h);const c=layer.getContext('2d');c.globalAlpha=r.opacity;c.drawImage(img,center[0]-width/2,center[1]-height/2,width,height);c.globalAlpha=1;c.globalCompositeOperation='destination-out';c.fillStyle='#000';
  for(const o of renderer.objects){if(!o.visible||o.hole)continue;const positions=(renderer.previewObject?.id===o.id?renderer.previewObject:o).geo.positions,m=matrix(o);for(let i=0;i<positions.length;i+=9){const p=[];for(let k=0;k<3;k++)p.push(renderer.project(FM.point(m,positions.subarray(i+k*3,i+k*3+3))));c.beginPath();c.moveTo(p[0][0],p[0][1]);c.lineTo(p[1][0],p[1][1]);c.lineTo(p[2][0],p[2][1]);c.closePath();c.fill();}}c.globalCompositeOperation='source-over';ctx.save();ctx.globalCompositeOperation='destination-over';ctx.drawImage(layer,0,0);ctx.restore();
}
function characterUVDialog() {
  const o=single(),mode=o.character?.uv||'cylindrical';
  modal(ch('Projection UV','UV projection'),ch('Coordonnées de texture par projection · exportées dans le GLB','Projected texture coordinates · exported in GLB'),`<label class="field"><span>${ch('Projection','Projection')}</span><select id="charUVMode">${[['cylindrical',ch('Cylindrique','Cylindrical')],['spherical',ch('Sphérique','Spherical')],['planar',ch('Plane · face','Planar · front')]].map(([k,v])=>`<option value="${k}" ${k===mode?'selected':''}>${v}</option>`).join('')}</select></label><canvas id="charUVPreview" width="600" height="400" aria-label="${ch('Aperçu du dépliage UV','UV layout preview')}"></canvas><p class="note">${ch('Projection simple avec couture. Des chevauchements sont possibles, notamment sur les membres. Ce panneau ne fait pas de dépliage anatomique ni de peinture de texture.','Simple projection with a seam. Overlaps are possible, particularly on limbs. This panel does not provide anatomical unwrapping or texture painting.')}</p>`,[{label:ch('Enregistrer les UV','Save UVs'),primary:true,action:()=>{const uv=$('charUVMode').value;commit(ch('Projection UV','UV projection'),()=>o.character={...o.character,uv});$('modal').close();}}]);
  function paint(){const canvas=$('charUVPreview'),c=canvas.getContext('2d'),uv=FCharacter.uv(o.geo,$('charUVMode').value);c.fillStyle='#f5f7fb';c.fillRect(0,0,600,400);c.strokeStyle='#e0e6ef';for(let x=0;x<=600;x+=30){c.beginPath();c.moveTo(x,0);c.lineTo(x,400);c.stroke();}for(let y=0;y<=400;y+=20){c.beginPath();c.moveTo(0,y);c.lineTo(600,y);c.stroke();}c.strokeStyle='#4c71b655';c.lineWidth=.5;const stride=Math.max(1,Math.ceil(o.geo.positions.length/9/16000));for(let i=0;i<uv.length;i+=6*stride){c.beginPath();for(let k=0;k<3;k++){const x=uv[i+k*2]*540+30,y=370-uv[i+k*2+1]*340;k?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.stroke();}}
  $('charUVMode').onchange=paint;paint();
}
function characterRigDialog() {
  const o=single(),bones=structuredClone(o.character?.bones||FCharacter.skeleton(o.geo.bounds)),rest=o.geo;let selectedBone=0,sequence=0,closed=false,timer,previewJob=null;
  modal(ch('Squelette et pose','Skeleton and pose'),ch('Placement manuel ajustable · pondération automatique approximative','Adjustable manual placement · approximate automatic weights'),`<label class="field"><span>${ch('Articulation','Joint')}</span><select id="charBone">${bones.map((b,i)=>`<option value="${i}">${b.name}</option>`).join('')}</select></label><div class="section-label">${ch('Position au repos · coordonnées locales (mm)','Rest position · local coordinates (mm)')}</div><div class="fields3">${['X','Y','Z'].map((a,i)=>charField('charBoneP'+i,a,0,-100000,100000,'any')).join('')}</div><div class="section-label">${ch('Rotation · degrés','Rotation · degrees')}</div><div class="fields3">${['X','Y','Z'].map((a,i)=>charField('charBoneR'+i,a,0,-180,180,'any')).join('')}</div><p id="charPoseStatus" class="note"></p><div class="mini-actions">${charButton('resetPose',ch('Remettre au repos','Reset pose'))}${charButton('viewSkeleton',ch('Voir dans la scène','View in scene'))}</div><p class="note">${ch('Prévu pour un humanoïde debout en pose A. Ajustez les articulations à votre modèle. Les poids sont calculés par proximité ; les doigts et les déformations complexes nécessitent un travail complémentaire. « Appliquer la pose » fige la géométrie et retire le squelette.','Designed for an upright A-pose humanoid. Adjust joints to your model. Weights are based on proximity; fingers and complex deformations need further work. Apply pose bakes geometry and removes the skeleton.')}</p>`,[
    {label:ch('Appliquer la pose au maillage','Apply pose to mesh'),id:'bakeCharacterPose',action:async()=>{read();const r=await characterJob('characterPose',{positions:rest.positions,bones},ch('Calcul de la pose','Computing pose'));commit(ch('Appliquer la pose','Apply pose'),()=>{o.geo=FG.geometry(r.positions);if(rest.colors)o.geo.colors=rest.colors.slice();o.character={...o.character,bones:null};});$('modal').close();}},
    {label:ch('Conserver le squelette','Keep skeleton'),primary:true,id:'saveCharacterRig',action:()=>{read();commit(ch('Squelette de personnage','Character skeleton'),()=>o.character={...o.character,bones:structuredClone(bones)});$('modal').close();}}
  ]);
  function read(){const b=bones[selectedBone];b.p=[0,1,2].map(i=>characterNumber('charBoneP'+i));b.rotation=[0,1,2].map(i=>characterNumber('charBoneR'+i));}
  function fields(){const b=bones[selectedBone];b.p.forEach((v,i)=>$('charBoneP'+i).value=+v.toFixed(3));b.rotation.forEach((v,i)=>$('charBoneR'+i).value=v);}
  async function preview(){if(closed||busy)return;read();const n=++sequence;try{const promise=characterJob('characterPose',{positions:rest.positions,bones},ch('Aperçu de pose','Pose preview'));previewJob=jobId;const r=await promise;if(closed||n!==sequence)return;studio.posePreview={bones};renderer.previewObject={...o,geo:FG.geometry(r.positions)};if(rest.colors)renderer.previewObject.geo.colors=rest.colors;renderer.request();$('charPoseStatus').textContent=ch('Aperçu temporaire. Fermer annule les changements.','Temporary preview. Closing discards changes.');}catch(error){if(!closed)$('charPoseStatus').textContent=characterMessage(error);}finally{previewJob=null;}}
  function cleanup(force=false){if(force!==true&&$('modal').open)return;closed=true;clearTimeout(timer);if(previewJob!==null&&busy&&jobId===previewJob)cancelJob();studio.posePreview=null;renderer.previewObject=null;renderer.request();$('modal').removeEventListener('close',cleanup);if($('modal')._characterCleanup===forceCleanup)delete $('modal')._characterCleanup;}
  const forceCleanup=()=>cleanup(true);$('modal')._characterCleanup=forceCleanup;
  $('modal').addEventListener('close',cleanup);$('charBone').onchange=e=>{read();selectedBone=+e.target.value;fields();};for(let i=0;i<3;i++)for(const k of ['P','R'])$('charBone'+k+i).onchange=()=>{read();clearTimeout(timer);timer=setTimeout(preview,180);};
  document.querySelector('[data-character="resetPose"]').onclick=()=>{bones.forEach(b=>b.rotation=[0,0,0]);fields();preview();};document.querySelector('[data-character="viewSkeleton"]').onclick=()=>{read();studio.posePreview={bones};renderer.request();};fields();studio.posePreview={bones};renderer.request();
}
function characterExportGLB() {
  const list=editable().filter(o=>!o.hole);if(!list.length)throw Error(ch('Sélectionnez les objets à exporter.','Select objects to export.'));
  // glTF uses metres. Rotate the root from FORMA's Z up to glTF's Y up.
  const exportObjects=list.map(o=>{const geo=FG.geometry(Float32Array.from(o.geo.positions,v=>v/1000)),character=o.character?structuredClone(o.character):null;if(character?.bones)character.bones.forEach(b=>b.p=b.p.map(v=>v/1000));if(o.geo.colors)geo.colors=o.geo.colors.slice();return {...o,geo,character,position:o.position.map(v=>v/1000)};});
  const raw=FCharacter.glb(exportObjects,true),dv=new DataView(raw),length=dv.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,length))),binOffset=28+length,bin=new Uint8Array(raw,binOffset);const root=json.nodes.length;json.nodes.push({name:'FORMA Z-up to Y-up',rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2],children:json.scenes[0].nodes});json.scenes[0].nodes=[root];
  const enc=new TextEncoder().encode(JSON.stringify(json)),size=Math.ceil(enc.length/4)*4,out=new ArrayBuffer(28+size+bin.length),outDV=new DataView(out),bytes=new Uint8Array(out);outDV.setUint32(0,0x46546c67,true);outDV.setUint32(4,2,true);outDV.setUint32(8,out.byteLength,true);outDV.setUint32(12,size,true);outDV.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+size);bytes.set(enc,20);outDV.setUint32(20+size,bin.length,true);outDV.setUint32(24+size,0x004e4942,true);bytes.set(bin,28+size);download(out,safeName(state.name)+'.glb','model/gltf-binary');toast(ch('GLB exporté en mètres : couleurs, normales, UV et squelette si présent.','GLB exported in metres: colors, normals, UVs and skeleton when present.'));return out;
}
function characterTopologyAction(kind) {
  const o=single(),ids=kind==='splitEdge'?pointEdit.ids:studio.faces,amount=kind==='extrudeFaces'?characterNumber('charExtrude'):0,g=FCharacter.edit(o.geo,kind,ids,amount);
  commit(ch('Édition du maillage','Mesh edit'),()=>{o.geo=g;o.param=null;o.character={...o.character,bones:null};});resetPoints();studio.faces=[];update();
}
function characterStartRetopo() {
  if(busy||gesture||$('modal').open)throw Error(ch('Terminez l’action en cours.','Finish the current action.'));
  const o=single();if(o.hole)throw Error(ch('Choisissez une surface pleine.','Choose a solid surface.'));
  if(studio.space!=='character')setStudioSpace('character');
  studio.retopo={sourceId:o.id,targetId:null,vertices:[],quads:[],pending:[]};state.mode='retopo';update();renderer.request();
}
function characterRetopoPoint(e) {
  const r=studio.retopo,source=state.objects.find(o=>o.id===r.sourceId);if(!source||!source.visible||source.locked){studio.retopo=null;update();return;}
  renderer.matrices();const screen=pointerPosition(e),hit=renderer.pick(...screen,o=>o.id===r.sourceId);if(!hit)return;
  let p=hit.point.slice(),near=-1,distance=12;for(let i=0;i<r.vertices.length;i++){const q=renderer.project(r.vertices[i]),d=Math.hypot(q[0]-screen[0],q[1]-screen[1]);if(d<distance&&Math.abs(q[2]-renderer.project(p)[2])<.002){distance=d;near=i;}}
  if(near>=0)p=r.vertices[near].slice();if(r.pending.some(v=>FM.len(FM.sub(v.p,p))<1e-5))return;
  r.pending.push({p,id:near,normal:hit.normal});
  if(r.pending.length===4){
    try{if(r.quads.length>=10000)throw Error(ch('Limite : 10 000 quadrilatères.','Limit: 10,000 quads.'));
      const vertices=r.vertices.map(v=>v.slice()),quad=r.pending.map(v=>{if(v.id>=0)return v.id;const i=vertices.length;vertices.push(v.p.slice());return i;}),n=FM.cross(FM.sub(vertices[quad[1]],vertices[quad[0]]),FM.sub(vertices[quad[2]],vertices[quad[0]]));if(FM.len(n)<1e-7)throw Error(ch('Quadrilatère trop petit ou aligné.','Quad is too small or collinear.'));
      if(FM.dot(n,r.pending[0].normal)<0)quad.reverse();const quads=[...r.quads,quad],positions=[];for(const [a,b,c,d] of quads){FG.tri(positions,vertices[a],vertices[b],vertices[c]);FG.tri(positions,vertices[a],vertices[c],vertices[d]);}
      const g=FG.geometry(positions),report=FG.analyze(g);if(report.nonManifold||report.inconsistent||report.degenerate)throw Error(ch('Ce patch chevauche une arête existante ou son orientation est incompatible.','This patch overlaps an existing edge or has an incompatible orientation.'));
      let target=state.objects.find(o=>o.id===r.targetId);
      if(!target){target=makeObject(g,{name:source.name+' · '+ch('retopologie','retopology'),smooth:true,color:'#70b6ca'});checkMeshPartsBudget([target]);}
      commit(ch('Créer un quadrilatère','Create quad'),()=>{target.geo=g;target.character={...target.character,retopology:{vertices:vertices.map(v=>v.slice()),quads:quads.map(q=>q.slice())}};if(!r.targetId)state.objects.push(target);state.selected=[target.id];});
      r.targetId=target.id;r.vertices=vertices;r.quads=quads;r.pending=[];
    }catch(error){r.pending.pop();toast(characterMessage(error),'error');}
  }update();renderer.request();
}
async function characterThicknessDialog() {
  const o=single();modal(ch('Inspection des épaisseurs','Wall thickness inspection'),ch('Mesures échantillonnées le long des normales intérieures','Sampled measurements along inward surface normals'),`${charField('charWallThreshold',ch('Seuil à vérifier · mm','Threshold to check · mm'),1,.01,1000,.01)}<p class="note">${ch('Environ 1 200 rayons. Le minimum échantillonné ne garantit pas l’absence de parois plus fines entre les mesures. Le résultat dépend de l’orientation du maillage.','About 1,200 rays. The sampled minimum cannot rule out thinner walls between samples. Results depend on mesh orientation.')}</p><div id="charWallResult" class="property-result"></div>`,[{label:ch('Mesurer','Measure'),primary:true,action:async()=>{const threshold=characterNumber('charWallThreshold'),result=await characterJob('characterThickness',{positions:world(o).positions,threshold},ch('Inspection des épaisseurs','Wall thickness inspection'));$('charWallResult').textContent=ch('Minimum mesuré : ','Sampled minimum: ')+result.minimum.toFixed(3)+' mm · '+result.thin.length+' / '+result.sampleCount+' '+ch('mesures sous le seuil','samples below threshold');}}]);
}
function characterSearch() {
  const commands=[
    ...FCharacterModels.catalog.map(p=>[ch('Modèle : ','Model: ')+ch(p.fr,p.en),()=>characterInsertModel(p.id)]),
    [ch('Créer une tête','Create a head'),()=>characterBaseDialog('head')],[ch('Créer un buste','Create a bust'),()=>characterBaseDialog('bust')],[ch('Créer un personnage','Create a character'),()=>characterBaseDialog('body')],
    ...brushNames().map(([key,label])=>[ch('Pinceau : ','Brush: ')+label,()=>{if(studio.space!=='character')setStudioSpace('character');setCharacterBrush(key);}]),
    [ch('Subdivision lissée','Smooth subdivision'),()=>characterMeshDialog('loop')],[ch('Remesher les volumes','Remesh volumes'),()=>characterMeshDialog('remesh')],[ch('Références face et profil','Front and side references'),characterReferenceDialog],[ch('Squelette et pose','Skeleton and pose'),characterRigDialog],[ch('Projection UV','UV projection'),characterUVDialog],[ch('Exporter GLB','Export GLB'),characterExportGLB],
    [ch('Symétrie en direct · activer / désactiver','Live symmetry · enable / disable'),()=>{studio.symmetry=!studio.symmetry;update();}],
    [ch('Retopologie manuelle · quadrilatères','Manual retopology · quads'),characterStartRetopo],[ch('Inspection des épaisseurs','Wall thickness inspection'),characterThicknessDialog],
    ...SHAPES.map(([type,label])=>[ch('Ajouter : ','Add: ')+label,()=>addShape(type)]),
    ...[['import',ch('Importer STL','Import STL')],['export',ch('Exporter STL','Export STL')],['save',ch('Enregistrer le projet','Save project')],['objectManager',ch('Gérer les objets','Manage objects')],['analyze',ch('Analyser le maillage','Analyze mesh')],['cut',ch('Découper par un plan','Cut by plane')],['operations',ch('Opérations sur les solides','Solid operations')],['mirror',ch('Miroir · options de symétrie','Mirror · symmetry options')],['array',ch('Répétition linéaire, grille ou circulaire','Linear, grid or circular pattern')],['align',ch('Aligner les objets','Align objects')],['copy',ch('Copier la sélection','Copy selection')],['paste',ch('Coller les objets','Paste objects')]].map(([action,label])=>[label,()=>dispatch(action,document.querySelector('[data-action=more]'))]),
    ...[['translate',ch('Déplacer','Move')],['rotate',ch('Tourner','Rotate')],['scale',ch('Redimensionner','Resize')],['face',ch('Extrusion de face plane','Planar face extrusion')],['round',ch('Arrondir les arêtes','Round edges')],['thin',ch('Amincir une zone','Thin a region')],['measure',ch('Mesurer','Measure')]].map(([mode,label])=>[label,()=>setMode(mode)])
  ];
  modal(ch('Rechercher une commande','Search commands'),ch('Tapez un outil ou une action. ↑ ↓ pour choisir, Entrée pour exécuter.','Type a tool or action. ↑ ↓ to choose, Enter to run.'),`<input type="search" id="charCommandSearch" class="command-search" placeholder="${ch('Ex. : lisser, miroir, référence…','E.g. smooth, mirror, reference…')}" autocomplete="off"><div id="charCommandResults" class="command-results" role="listbox"></div>`);let items=commands,index=0;
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function paint(){const q=normalize($('charCommandSearch').value);items=commands.filter(c=>normalize(c[0]).includes(q));index=Math.min(index,items.length-1);$('charCommandResults').innerHTML=items.length?items.map((c,i)=>`<button type="button" role="option" aria-selected="${i===index}" data-command="${i}">${esc(c[0])}</button>`).join(''):`<p class="note">${ch('Aucune commande trouvée.','No commands found.')}</p>`;}
  async function run(i){if(!items[i])return;const fn=items[i][1];$('modal').close();try{await fn();}catch(error){toast(characterMessage(error),'error');}}
  $('charCommandSearch').oninput=()=>{index=0;paint();};$('charCommandResults').onclick=e=>{const b=e.target.closest('[data-command]');if(b)run(+b.dataset.command);};$('charCommandSearch').onkeydown=e=>{if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Enter')run(index);else{index=FM.clamp(index+(e.key==='ArrowDown'?1:-1),0,items.length-1);paint();document.querySelector('[data-command="'+index+'"]')?.scrollIntoView({block:'nearest'});}}};paint();queueMicrotask(()=>$('charCommandSearch')?.focus());
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-character]');if(!b||b.disabled)return;const action=b.dataset.character;
  try{if(action==='piece'||action==='character')setStudioSpace(action);
    else if(action.startsWith('brush-'))setCharacterBrush(action.slice(6));
    else if(action.startsWith('base-'))characterBaseDialog(action.slice(5));
    else if(action==='modelLibrary'||action==='customBase'){document.body.classList.remove('library-collapsed');if(innerWidth<=740)$('leftPanel').classList.add('open');if(action==='customBase')document.querySelector('.character-custom-bases').open=true;update();renderer.resize();(action==='customBase'?document.querySelector('.character-custom-bases'):$('characterModelSearch')).scrollIntoView({block:'nearest'});if(action==='modelLibrary')$('characterModelSearch').focus();}
    else if(action==='resetModels'){$('characterModelSearch').value='';$('characterModelCategory').value='all';renderCharacterModels();}
    else if(action.startsWith('axis-')){studio.axis=+action.slice(5);update();}
    else if(action==='libraryToggle'){if(innerWidth<=740)$('leftPanel').classList.toggle('open');else document.body.classList.toggle('library-collapsed');update();renderer.resize();}
    else if(action==='historyToggle'||action==='historyFold'){document.body.classList.toggle('history-collapsed');update();}
    else if(action==='objects')objectManager();else if(action==='search')characterSearch();else if(action==='references')characterReferenceDialog();
    else if(action==='clearMask'||action==='invertMask')characterClearMask(action==='invertMask');
    else if(action==='loop'||action==='remesh')characterMeshDialog(action);
    else if(action==='rig')characterRigDialog();else if(action==='uv')characterUVDialog();else if(action==='exportGLB')characterExportGLB();
    else if(action==='retopo')characterStartRetopo();else if(action==='retopoFinish'){studio.retopo=null;setMode('sculpt');update();}
    else if(action==='retopoUndo'){studio.retopo?.pending.pop();update();renderer.request();}
    else if(action==='thickness')await characterThicknessDialog();
    else if(action==='vertices'||action==='faces'){studio.topology=action;studio.faces=[];renderer.request();}
    else if(action==='splitEdge'||action==='extrudeFaces')characterTopologyAction(action);
    else if(action==='select'){setMode('select');renderer.canvas.focus();}
  }catch(error){toast(characterMessage(error),'error');}
});
document.addEventListener('input',e=>{const id=e.target.id;try{if(['charRadius','charRadiusRange','charStrength','charStrengthRange'].includes(id)){const radius=id.startsWith('charRadius'),value=+e.target.value;if(!Number.isFinite(value)||value<.01||value>(radius?1000:3))return;state.brush[radius?'radius':'strength']=value;syncBrushFields();renderer.request();}}catch(error){toast(characterMessage(error),'error');}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-character-model]');if(b&&!b.disabled)characterInsertModel(b.dataset.characterModel).catch(error=>toast(characterMessage(error),'error'));});
document.addEventListener('change',e=>{const id=e.target.id;if(id==='charSymmetry')studio.symmetry=e.target.checked;if(id==='charFront')studio.frontOnly=e.target.checked;if(id==='charPressure')studio.pressure=e.target.checked;if(['charSymmetry','charFront','charPressure'].includes(id))renderer.request();});
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||e.target.closest('input,select,textarea,[contenteditable=true]')||$('modal').open||busy)return;
  if(!gesture&&e.code==='Space'){e.preventDefault();e.stopImmediatePropagation();characterSearch();return;}
  if(!gesture&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='v'){e.preventDefault();e.stopImmediatePropagation();setMode('select');return;}
  if(state.mode==='sculpt'&&!isPointMode()&&['[',']'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();state.brush.radius=FM.clamp(state.brush.radius*(e.key==='['?.85:1/.85),.1,1000);syncBrushFields();renderer.request();}
},true);
