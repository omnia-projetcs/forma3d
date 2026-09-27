/* No npm dependencies. node build.mjs rebuilds the distributable HTML from src/. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const worker=['locales','i18n','math','geometry','csg','worker'].map(n=>read('src/'+n+'.js')).join('\n');
const workerWrapper='var FORMA_WORKER_SOURCE = '+JSON.stringify(worker)+';\n';
fs.mkdirSync(path.join(root,'assets'),{recursive:true});fs.writeFileSync(path.join(root,'assets/worker-source.js'),workerWrapper);
const shell=read('src/shell.html'),scripts=['src/locales.js','src/i18n.js','assets/worker-source.js','assets/demo.js','src/math.js','src/geometry.js','src/renderer.js','src/storage.js','src/app.js'];
for(const f of scripts)if(!fs.existsSync(path.join(root,f)))throw Error('Missing file: '+f);
const normal=shell.replace('<!--STYLE-->','<link rel="stylesheet" href="src/ui.css">').replace('<!--SCRIPTS-->',scripts.map(f=>'<script src="'+f+'"></script>').join('\n'));
const escape=s=>s.replace(/<\/script/gi,'<\\/script');
const single=shell.replace('<!--STYLE-->','<style>\n'+read('src/ui.css')+'\n</style>').replace('<!--SCRIPTS-->',scripts.map(f=>'<script>\n'+escape(read(f))+'\n</script>').join('\n'));
fs.writeFileSync(path.join(root,'index.html'),normal);fs.writeFileSync(path.join(root,'FORMA3D.html'),single);
console.log('Built index.html and FORMA3D.html ('+(Buffer.byteLength(single)/1024).toFixed(0)+' KiB), all assets local.');
