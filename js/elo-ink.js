(function(){
'use strict';
if(window.vqcEloInk)return;
const NS='http://www.w3.org/2000/svg';
const COLORS=['#f2b52a','#df4848','#357edb','#31985f'];
const COLOR_NAMES=['Vàng','Đỏ','Xanh dương','Xanh lá'];
const MAX_SHAPES=40,MAX_PTS=60,MAX_LEN=3800;
const FILES='abcdefgh';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function sqXY(sq,flip){
 const f=FILES.indexOf(sq[0]),r=Number(sq[1])-1;
 const col=flip?7-f:f,row=flip?r:7-r;
 return [col*100+50,row*100+50];
}
function xySq(x,y,flip){
 const col=clamp(Math.floor(x/100),0,7),row=clamp(Math.floor(y/100),0,7);
 const f=flip?7-col:col,r=flip?row:7-row;
 return FILES[f]+(r+1);
}
function okSq(s){return typeof s==='string'&&/^[a-h][1-8]$/.test(s);}
function valid(s){
 if(!s||typeof s!=='object')return false;
 if(!(Number.isInteger(s.c)&&s.c>=0&&s.c<COLORS.length))return false;
 if(s.k==='a')return okSq(s.f)&&okSq(s.t)&&s.f!==s.t;
 if(s.k==='c')return okSq(s.s);
 if(s.k==='p')return Array.isArray(s.p)&&s.p.length>=4&&s.p.length<=MAX_PTS*2&&s.p.length%2===0&&s.p.every(function(n){return Number.isFinite(n)&&n>=0&&n<=800;});
 return false;
}
function parse(str){
 if(!str||typeof str!=='string')return [];
 try{
  const a=JSON.parse(str);
  return Array.isArray(a)?a.filter(valid).slice(-MAX_SHAPES):[];
 }catch(e){return [];}
}
function serialize(shapes){
 let arr=shapes.filter(valid).slice(-MAX_SHAPES);
 let str=JSON.stringify(arr);
 while(str.length>MAX_LEN&&arr.length){arr.shift();str=JSON.stringify(arr);}
 return arr.length?str:'';
}
function svgEl(tag,attrs){
 const n=document.createElementNS(NS,tag);
 Object.keys(attrs).forEach(function(k){n.setAttribute(k,String(attrs[k]));});
 return n;
}
function drawShape(svg,s,flip,ghost){
 const col=COLORS[s.c]||COLORS[0];
 const g=svgEl('g',{opacity:ghost?0.6:0.88});
 if(s.k==='a'){
  const a=sqXY(s.f,flip),b=sqXY(s.t,flip);
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len,head=34;
  const x1=a[0]+ux*14,y1=a[1]+uy*14;
  const bx=b[0]-ux*head*0.8,by=b[1]-uy*head*0.8;
  g.append(svgEl('line',{x1:x1,y1:y1,x2:bx,y2:by,stroke:col,'stroke-width':16,'stroke-linecap':'round'}));
  const hx=b[0]-ux*6,hy=b[1]-uy*6;
  const lx=hx-ux*head+(-uy)*head*0.62,ly=hy-uy*head+ux*head*0.62;
  const rx=hx-ux*head-(-uy)*head*0.62,ry=hy-uy*head-ux*head*0.62;
  g.append(svgEl('polygon',{points:hx+','+hy+' '+lx+','+ly+' '+rx+','+ry,fill:col}));
 }else if(s.k==='c'){
  const c=sqXY(s.s,flip);
  g.append(svgEl('circle',{cx:c[0],cy:c[1],r:44,fill:'none',stroke:col,'stroke-width':9}));
 }else if(s.k==='p'){
  const pts=[];
  for(let i=0;i<s.p.length;i+=2)pts.push(s.p[i]+','+s.p[i+1]);
  g.append(svgEl('polyline',{points:pts.join(' '),fill:'none',stroke:col,'stroke-width':10,'stroke-linecap':'round','stroke-linejoin':'round'}));
 }
 svg.append(g);
}
function render(svg,shapes,flip,ghost){
 if(!svg)return;
 svg.replaceChildren();
 (shapes||[]).forEach(function(s){if(valid(s))drawShape(svg,s,!!flip,false);});
 if(ghost&&valid(ghost))drawShape(svg,ghost,!!flip,true);
}
function thin(p){
 if(p.length/2<=MAX_PTS)return p;
 const n=p.length/2,step=n/MAX_PTS,out=[];
 for(let i=0;i<MAX_PTS;i++){const k=Math.min(n-1,Math.floor(i*step));out.push(p[k*2],p[k*2+1]);}
 out[out.length-2]=p[p.length-2];out[out.length-1]=p[p.length-1];
 return out;
}

function editor(svg,opt){
 let shapes=parse(opt.initial||'');
 let flip=!!opt.flip;
 let drag=null;
 const host=opt.host||svg;
 if(!opt.host)svg.style.touchAction='none';
 function point(e){
  const r=svg.getBoundingClientRect();
  return [clamp((e.clientX-r.left)/Math.max(1,r.width)*800,0,800),clamp((e.clientY-r.top)/Math.max(1,r.height)*800,0,800)];
 }
 function colorOf(e){
  if(e.shiftKey)return 1;
  if(e.ctrlKey||e.metaKey)return 2;
  if(e.altKey)return 3;
  return 0;
 }
 function ghost(){
  if(!drag)return null;
  if(drag.from!==drag.to)return {k:'a',c:drag.c,f:drag.from,t:drag.to};
  return {k:'c',c:drag.c,s:drag.from};
 }
 function paint(){render(svg,shapes,flip,ghost());}
 function commit(){if(opt.onChange)opt.onChange(serialize(shapes),shapes.slice());}
 function down(e){
  if(opt.enabled&&!opt.enabled())return;
  const mouse=e.pointerType==='mouse';
  if(opt.host){
   if(mouse&&e.button===0){if(shapes.length){shapes=[];paint();commit();}return;}
   if(!(mouse&&e.button===2))return;
  }else{
   if(mouse&&e.button===0){
    e.preventDefault();
    if(shapes.length){shapes=[];paint();commit();}
    return;
   }
   if(mouse&&e.button!==2)return;
  }
  e.preventDefault();
  try{host.setPointerCapture(e.pointerId);}catch(x){}
  const p=point(e),sq=xySq(p[0],p[1],flip);
  drag={from:sq,to:sq,c:colorOf(e),id:e.pointerId};
  paint();
 }
 function move(e){
  if(!drag||e.pointerId!==drag.id)return;
  const p=point(e);
  drag.to=xySq(p[0],p[1],flip);
  paint();
 }
 function up(e){
  if(!drag||e.pointerId!==drag.id)return;
  const d=drag;drag=null;
  try{host.releasePointerCapture(e.pointerId);}catch(x){}
  e.preventDefault();
  let s;
  if(d.from!==d.to)s={k:'a',c:d.c,f:d.from,t:d.to};
  else s={k:'c',c:d.c,s:d.from};
  const i=shapes.findIndex(function(x){
   return s.k==='a'?(x.k==='a'&&x.f===s.f&&x.t===s.t):(x.k==='c'&&x.s===s.s);
  });
  if(i>=0)shapes.splice(i,1);
  else{shapes.push(s);if(shapes.length>MAX_SHAPES)shapes=shapes.slice(-MAX_SHAPES);}
  paint();commit();
 }
 function cancel(){drag=null;paint();}
 function noMenu(e){e.preventDefault();}
 host.addEventListener('pointerdown',down);
 host.addEventListener('pointermove',move);
 host.addEventListener('pointerup',up);
 host.addEventListener('pointercancel',cancel);
 host.addEventListener('contextmenu',noMenu);
 paint();
 return {
  setFlip:function(f){flip=!!f;paint();},
  setShapes:function(str){shapes=parse(str);paint();},
  clear:function(){if(shapes.length){shapes=[];paint();commit();}},
  count:function(){return shapes.length;},
  destroy:function(){
   host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',move);
   host.removeEventListener('pointerup',up);host.removeEventListener('pointercancel',cancel);
   host.removeEventListener('contextmenu',noMenu);
  }
 };
}

window.vqcEloInk={COLORS:COLORS,COLOR_NAMES:COLOR_NAMES,MAX_LEN:MAX_LEN,parse:parse,serialize:serialize,render:render,editor:editor,sqXY:sqXY,xySq:xySq,valid:valid,version:'20261126-ink-v3'};
})();
