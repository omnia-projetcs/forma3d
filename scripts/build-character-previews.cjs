#!/usr/bin/env node
/* Render exact template geometry with FORMA's existing software rasterizer. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),zlib=require('zlib');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),html=read('FORMA3D.html');
const core=read('src/character-core.js'),models=read('src/character-models.js'),data=read('src/character-model-data.json');
const fingerprint=crypto.createHash('sha256').update(core+'\n'+models+'\n'+data).digest('hex');
if(process.argv.includes('--check')){
  const data=JSON.parse(read('src/character-model-previews.json'));
  if(data.fingerprint!==fingerprint)throw Error('Character previews are stale. Run node scripts/build-character-previews.cjs');
  console.log('Character previews: up to date');process.exit(0);
}
const context={console,performance,atob,crypto:crypto.webcrypto,self:{postMessage(){}}};vm.createContext(context);
vm.runInContext(JSON.parse(html.match(/var FORMA_WORKER_SOURCE = ("[^\n]+");/)[1]),context);
const thumbnail=html.slice(html.indexOf('var FThumbnails = (() => {'),html.indexOf("if(typeof module!=='undefined')module.exports=FThumbnails;"))
  .replace('function shade(nx,ny,nz) {','function shade(nx,ny,nz,tint=rgb) {').replace('return rgb.map(v=>v*diffuse+gloss);','return tint.map(v=>v*diffuse+gloss);')
  .replace('const flat=smooth?null:shade(...n);','const tint=geometry.colors?Array.from(geometry.colors.subarray(i,i+3),v=>v*255):rgb;const flat=geometry.colors?shade(...n,tint):smooth?null:shade(...n);');
vm.runInContext(core+'\nvar FCharacterModelData='+data+';\n'+models+'\n'+thumbnail,context);
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=buffer=>{let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function chunk(type,body){const name=Buffer.from(type),out=Buffer.alloc(body.length+12);out.writeUInt32BE(body.length);name.copy(out,4);body.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,body])),body.length+8);return out;}
function png(r){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(r.width);ihdr.writeUInt32BE(r.height,4);ihdr[8]=8;ihdr[9]=6;const rows=Buffer.alloc((r.width*4+1)*r.height);for(let y=0;y<r.height;y++)Buffer.from(r.pixels.subarray(y*r.width*4,(y+1)*r.width*4)).copy(rows,y*(r.width*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
fs.mkdirSync(path.join(root,'assets/characters'),{recursive:true});const images={};
for(const preset of vm.runInContext('FCharacterModels.catalog',context)){
  context.presetID=preset.id;
  const r=vm.runInContext(`(()=>{const p=FCharacterModels.get(presetID),g=FCharacterModels.generate(p.id);return FThumbnails.rasterize(g,{width:180,height:200,color:p.color,yaw:-1.28,pitch:.12,smooth:true});})()`,context),data=png(r);
  fs.writeFileSync(path.join(root,'assets/characters',preset.id+'.png'),data);
  images[preset.id]={src:'data:image/png;base64,'+data.toString('base64'),width:r.width,height:r.height,triangles:r.triangles};
  console.log(preset.id+': '+r.triangles+' triangles');
}
fs.writeFileSync(path.join(root,'src/character-model-previews.json'),JSON.stringify({fingerprint,images},null,2)+'\n');
