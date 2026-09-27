/* Language resolution, storage fallback and main/worker error parity. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
function runtime(options={}){
 const context=vm.createContext({console,...options});
 for(const file of ['locales','i18n','math','geometry','csg','storage'])vm.runInContext(fs.readFileSync(path.join(root,'src',file+'.js'),'utf8'),context);
 return context;
}
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
test('Every catalogue entry has an English translation',()=>{
 const c=runtime();assert(Object.keys(c.FORMA_EN).length>400);
 for(const [key,value] of Object.entries(c.FORMA_EN)){assert(key.trim());assert.equal(typeof value,'string');assert(value.trim());}
});
test('English fallback and unknown keys',()=>{
 const {FI}=runtime();assert.equal(FI.language,'en');assert.equal(FI.t('Sélectionnez un objet.'),'Select an object.');assert.equal(FI.t('My custom name'),'My custom name');assert.equal(FI.t(' Ajouter '),' Add ');assert.equal(FI.setLanguage('de'),false);
});
test('French messages and validation errors',()=>{
 const {FI,FG}=runtime();FI.setLanguage('fr',false);assert.equal(FI.t('Sélectionnez un objet.'),'Sélectionnez un objet.');assert.throws(()=>FG.geometry([]),/Le maillage est vide/);FI.setLanguage('en',false);assert.throws(()=>FG.geometry([]),/The mesh is empty/);
});
test('Saved preference takes precedence and persists changes',()=>{
 const saved=new Map([['forma3d-language','fr']]);const {FI}=runtime({localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}});
 assert.equal(FI.language,'fr');FI.setLanguage('en');assert.equal(saved.get('forma3d-language'),'en');
});
test('Unavailable browser storage does not block language switching',()=>{
 const {FI}=runtime({localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});FI.setLanguage('fr');assert.equal(FI.language,'fr');FI.setLanguage('en');assert.equal(FI.language,'en');
});
test('Worker receives language for each job and returns localized errors',()=>{
 const messages=[],context=runtime({self:{postMessage:m=>messages.push(m)}});
 vm.runInContext(fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),context);
 for(const language of ['en','fr'])context.self.onmessage({data:{id:language,op:'unknown',args:{},language}});
 assert.equal(messages[0].error,'Unknown job.');assert.equal(messages[1].error,'Traitement inconnu.');
});
console.log(`${checks} localization checks passed`);
