/* Optional development server: built-in Node.js only, loopback by default. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const french=/^fr/i.test(process.env.FORMA_LANG||process.env.LC_ALL||process.env.LC_MESSAGES||process.env.LANG||'en');
const tr=(en,fr)=>french?fr:en;
const port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw Error(tr('PORT must be between 1 and 65535.','PORT doit être compris entre 1 et 65535.'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.forma3d':'application/json','.stl':'application/octet-stream','.png':'image/png','.md':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const stat=fs.statSync(file);if(!stat.isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404);res.end(tr('File not found.','Fichier introuvable.'));}
});
server.on('error',e=>{console.error(tr('Unable to start:','Démarrage impossible :'),e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`FORMA 3D — http://127.0.0.1:${port}\n${tr('Ctrl+C to stop. No external network access required.','Ctrl+C pour arrêter. Aucun accès réseau externe requis.')}`));
