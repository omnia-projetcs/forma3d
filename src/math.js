/* FORMA 3D — small, dependency-free vector/matrix toolkit. Column-major matrices. */
'use strict';
var FM = (() => {
  const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const mul=(a,s)=>a.map(v=>v*s), dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const len=a=>Math.hypot(...a), norm=a=>mul(a,1/(len(a)||1)), lerp=(a,b,t)=>add(a,mul(sub(b,a),t));
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)), rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
  const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function mm(a,b){const o=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
  function point(m,p){const x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];}
  const direction=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
  function inverse(m){const rows=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>m[c*4+r]),...Array.from({length:4},(_,c)=>+(r===c))]);for(let c=0;c<4;c++){let p=c;for(let r=c+1;r<4;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;if(Math.abs(rows[p][c])<1e-15)return null;[rows[c],rows[p]]=[rows[p],rows[c]];const d=rows[c][c];for(let k=0;k<8;k++)rows[c][k]/=d;for(let r=0;r<4;r++)if(r!==c){const v=rows[r][c];for(let k=0;k<8;k++)rows[r][k]-=v*rows[c][k];}}return Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);}
  const qaxis=(a,t)=>[...mul(norm(a),Math.sin(t/2)),Math.cos(t/2)];
  function qm(a,b){const [x,y,z,w]=a,[X,Y,Z,W]=b;return [w*X+x*W+y*Z-z*Y,w*Y+y*W+z*X-x*Z,w*Z+z*W+x*Y-y*X,w*W-x*X-y*Y-z*Z];}
  const qeuler=e=>qm(qm(qaxis([0,0,1],rad(e[2])),qaxis([0,1,0],rad(e[1]))),qaxis([1,0,0],rad(e[0])));
  function compose(p,q,s){const [x,y,z,w]=norm(q),x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;return [(1-yy-zz)*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-xx-zz)*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-xx-yy)*s[2],0,...p,1];}
  function euler(q){const m=compose([0,0,0],q,[1,1,1]);const y=Math.asin(clamp(-m[2],-1,1));return [deg(Math.atan2(m[6],m[10])),deg(y),deg(Math.atan2(m[1],m[0]))];}
  const rotate=(q,p)=>direction(compose([0,0,0],q,[1,1,1]),p);
  function lookAt(eye,target,up=[0,0,1]){const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];}
  function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),d=near-far;return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/d,-1,0,0,2*far*near/d,0];}
  const ortho=(l,r,b,t,n,f)=>[2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1];
  function bounds(a){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],a[i+k]);max[k]=Math.max(max[k],a[i+k]);}if(!a.length)return {min:[0,0,0],max:[0,0,0],size:[0,0,0],center:[0,0,0]};return {min,max,size:sub(max,min),center:mul(add(min,max),.5)};}
  const corners=b=>Array.from({length:8},(_,i)=>[i&1?b.max[0]:b.min[0],i&2?b.max[1]:b.min[1],i&4?b.max[2]:b.min[2]]);
  function rayBox(o,d,b){let lo=0,hi=Infinity;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-12){if(o[k]<b.min[k]||o[k]>b.max[k])return false;continue;}let a=(b.min[k]-o[k])/d[k],c=(b.max[k]-o[k])/d[k];if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return false;}return true;}
  function rayTriangle(o,d,a,b,c){const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return null;const inv=1/det,s=sub(o,a),u=inv*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=inv*dot(d,q);if(v<0||u+v>1)return null;const t=inv*dot(e2,q);return t>1e-7?t:null;}
  function rayPlane(ray,n,p){const den=dot(ray.direction,n);if(Math.abs(den)<1e-7)return null;const t=dot(sub(p,ray.origin),n)/den;return add(ray.origin,mul(ray.direction,t));}
  function segDistance(p,a,b){const v=sub(b,a),w=sub(p,a),t=clamp(dot(v,w)/(dot(v,v)||1),0,1);return len(sub(p,add(a,mul(v,t))));}
  function uid(){return (typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  return {add,sub,mul,dot,cross,len,norm,lerp,clamp,rad,deg,identity,mm,point,direction,inverse,qaxis,qm,qeuler,compose,euler,rotate,lookAt,perspective,ortho,bounds,corners,rayBox,rayTriangle,rayPlane,segDistance,uid};
})();
if(typeof module!=='undefined')module.exports=FM;
