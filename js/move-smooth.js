(function(){
 'use strict';
 if(window.vqcMoveSmooth)return;
 const VERSION='20261124-smooth-v3';
 const SKIP='.board-star,.move-hint,.capture-hint,[class*="coordinate"]';
 const BOARD_SEL='[class*="board"],[id$="Board"],[id*="Board"]';
 const MAX_CHANGED=6;
 const MAX_FLIGHTS=4;
 const CHECK_SEL='.in-check,.vqc-king-in-check,.escape-checked,.king-check,.king-in-check,.checked-king,.is-check,.is-checked,[class*="in-check"],[class*="king-check"],[class*="is-check"]';
 const GLYPH=/[♔-♟]/;
 const SQ_CLASS=/square|cell|tile|(^|[\s_-])sq($|[\s_-])/i;
 let enabled=true;
 try{if(localStorage.getItem('vqc-move-smooth')==='off')enabled=false;}catch(e){}
 function reduced(){try{return !!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){return false;}}

 let dragging=false,dragEndAt=0;
 document.addEventListener('dragstart',function(){dragging=true;},true);
 document.addEventListener('dragend',function(){dragging=false;dragEndAt=Date.now();},true);
 document.addEventListener('drop',function(){dragEndAt=Date.now();},true);
 function dragRecently(){return dragging||Date.now()-dragEndAt<500;}
 function noteDrop(){dragEndAt=Date.now();}

 const intern=new Map();
 function sigOf(v){
  const key=v.tagName==='IMG'?(v.getAttribute('src')||''):(v.ownerSVGElement||v.tagName.toLowerCase()==='svg'?v.innerHTML:(v.textContent||''));
  let id=intern.get(key);
  if(id===undefined){id=intern.size+1;intern.set(key,id);}
  return id;
 }
 function visualOf(sq){
  const list=sq.querySelectorAll('img,svg');
  for(let i=0;i<list.length;i++){if(!list[i].closest(SKIP))return list[i];}
  if(GLYPH.test(sq.textContent||'')){
   let el=sq,kids;
   for(;;){
    kids=Array.prototype.filter.call(el.children,function(c){return GLYPH.test(c.textContent||'')&&!c.closest(SKIP);});
    if(kids.length!==1)break;
    el=kids[0];
   }
   if(el!==sq)return el;
  }
  return null;
 }
 function classOf(el){const c=el.className;return c&&c.baseVal!==undefined?c.baseVal:String(c||'');}
 function squaresOf(board,depth){
  const kids=[];
  for(const c of board.children){
   if(c.classList.contains('vqc-annotation-overlay')||c.tagName==='svg'||c.tagName==='CANVAS')continue;
   kids.push(c);
  }
  if(kids.length===64)return kids;
  if(kids.length>64){const f=kids.filter(function(c){return SQ_CLASS.test(classOf(c));});if(f.length===64)return f;}
  if(kids.length===8){
   const rows=kids.map(function(r){return Array.prototype.filter.call(r.children,function(c){return c.tagName!=='svg'&&c.tagName!=='CANVAS';});});
   if(rows.every(function(r){return r.length===8;}))return [].concat.apply([],rows);
  }
  if(kids.length===1&&!(depth>0))return squaresOf(kids[0],1);
  return kids;
 }
 function snap(board){
  const sq=squaresOf(board);
  if(sq.length!==64)return null;
  const sig=new Array(64),vis=new Array(64);
  for(let i=0;i<64;i++){const v=visualOf(sq[i]);vis[i]=v;sig[i]=v?sigOf(v):0;}
  return {sq,sig,vis};
 }

 const boards=new WeakMap();
 const live=new Set();
 function attach(el){
  if(boards.has(el))return;
  const b={el,prev:snap(el),flights:new Map(),ghosts:new Set(),obs:null,check:!!el.querySelector(CHECK_SEL)};
  boards.set(el,b);live.add(b);
  b.obs=new MutationObserver(function(){onChange(b);});
  b.obs.observe(el,{childList:true,subtree:true});
 }
 function scan(){
  document.querySelectorAll(BOARD_SEL).forEach(function(el){
   if(boards.has(el))return;
   if(squaresOf(el).length===64)attach(el);
  });
  live.forEach(function(b){if(!b.el.isConnected){try{b.obs.disconnect();}catch(e){}clearBoard(b);live.delete(b);boards.delete(b.el);}});
 }
 function clearBoard(b){
  b.flights.forEach(function(f){try{f.anim.cancel();}catch(e){}});
  b.flights.clear();
  b.ghosts.forEach(function(g){try{g.remove();}catch(e){}});
  b.ghosts.clear();
 }
 function keepHidden(b,now){
  b.flights.forEach(function(f,to){const v=now.vis[to];if(v)v.style.visibility='hidden';});
 }
 function onChange(b){
  const now=snap(b.el),prev=b.prev;
  b.prev=now;
  if(!now){clearBoard(b);return;}
  if(!prev)return;
  keepHidden(b,now);
  const changed=[];
  for(let i=0;i<64;i++)if(prev.sig[i]!==now.sig[i])changed.push(i);
  if(!changed.length){checkFlag(b,false);return;}
  if(changed.length>MAX_CHANGED){clearBoard(b);checkFlag(b,true);return;}
  const r0=now.sq[changed[0]].getBoundingClientRect();
  if(!(r0.width>0&&r0.height>0)){checkFlag(b,true);return;}
  const info=classify(prev,now,changed);
  if(info)emit('vqc:board-move',b,info);
  checkFlag(b,false);
  if(!info||!enabled||reduced()||dragRecently()||typeof Element.prototype.animate!=='function')return;
  animate(b,prev,now,info);
 }
 function emit(name,b,detail){
  try{window.dispatchEvent(new CustomEvent(name,{detail:Object.assign({board:b.el},detail)}));}catch(e){}
 }
 function checkFlag(b,silent){
  const has=!!b.el.querySelector(CHECK_SEL);
  if(has&&!b.check&&!silent)emit('vqc:board-check',b,{});
  b.check=has;
 }
 function dist(a,c){return Math.max(Math.abs((a>>3)-(c>>3)),Math.abs((a&7)-(c&7)));}
 function classify(prev,now,changed){
  const lost=[],gained=[];
  for(const i of changed){if(prev.sig[i])lost.push(i);if(now.sig[i])gained.push(i);}
  const used=new Set(),moves=[];
  for(const g of gained){
   let best=-1,bd=99;
   for(const l of lost){
    if(used.has(l)||l===g||prev.sig[l]!==now.sig[g])continue;
    const d=dist(l,g);if(d<bd){bd=d;best=l;}
   }
   if(best>=0){used.add(best);moves.push({from:best,to:g,paired:true});}
  }
  const movedTo=new Set(moves.map(function(m){return m.to;}));
  for(const g of gained){
   if(movedTo.has(g)||prev.sig[g]&&!lost.includes(g))continue;
   let best=-1;
   for(const l of lost){
    if(used.has(l)||l===g)continue;
    const dr=Math.abs((l>>3)-(g>>3)),dc=Math.abs((l&7)-(g&7));
    if(dr===1&&dc<=1){best=l;break;}
   }
   if(best>=0){used.add(best);moves.push({from:best,to:g,paired:false});movedTo.add(g);}
  }
  if(!moves.length||moves.length>MAX_FLIGHTS)return null;
  const captured=lost.filter(function(l){return !used.has(l);});
  const castle=moves.length===2&&(moves[0].to>>3)===(moves[0].from>>3)&&(moves[1].to>>3)===(moves[1].from>>3)&&moves.some(function(m){return Math.abs((m.to&7)-(m.from&7))===2;});
  const promotion=moves.some(function(m){return !m.paired;});
  return {moves:moves,captured:captured,castle:castle,promotion:promotion,capture:captured.length>0,count:moves.length};
 }
 function animate(b,prev,now,info){
  const moves=info.moves,captured=info.captured;
  let size=0;
  const flown=[];
  for(const m of moves){const s=fly(b,prev,now,m);if(s){size=size||s;flown.push(m);}}
  if(!flown.length)return;
  const delay=Math.round(flown.reduce(function(a,m){return Math.max(a,m.dur);},0)*0.5);
  for(const l of captured)fade(b,prev,now,l,size,delay);
 }
 function ghostBox(rect){
  const g=document.createElement('div');
  g.className='vqc-move-ghost';
  g.setAttribute('aria-hidden','true');
  g.style.cssText='position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+
   'px;margin:0;padding:0;pointer-events:none;z-index:2147483000;will-change:transform,opacity;filter:drop-shadow(0 3px 2px rgba(0,0,0,.22))';
  return g;
 }
 function cloneVisual(v){
  const c=v.cloneNode(true);
  c.removeAttribute('id');
  c.style.cssText='display:block;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;pointer-events:none;visibility:visible;opacity:1;transform:none;animation:none;transition:none';
  if(c.tagName==='IMG'){c.draggable=false;c.style.objectFit='contain';}
  return c;
 }
 function fly(b,prev,now,m){
  const vT=now.vis[m.to];
  if(!vT)return 0;
  const rT=now.sq[m.to].getBoundingClientRect(),rF=now.sq[m.from].getBoundingClientRect(),rv=vT.getBoundingClientRect();
  if(!(rv.width>0))return 0;
  const dx=rF.left-rT.left,dy=rF.top-rT.top;
  if(!dx&&!dy)return 0;
  const d=dist(m.from,m.to),dr=Math.abs((m.from>>3)-(m.to>>3)),dc=Math.abs((m.from&7)-(m.to&7));
  const knight=(dr===1&&dc===2)||(dr===2&&dc===1);
  const dur=Math.min(260,120+d*28);
  m.dur=dur;
  const old=b.flights.get(m.to);if(old){try{old.anim.cancel();}catch(e){}}
  const g=ghostBox(rv);
  g.appendChild(cloneVisual(vT));
  document.body.appendChild(g);b.ghosts.add(g);
  vT.style.visibility='hidden';
  const frames=knight
   ?[{transform:'translate('+dx+'px,'+dy+'px) scale(1)'},{transform:'translate('+dx/2+'px,'+dy/2+'px) scale(1.16)',offset:.5},{transform:'translate(0,0) scale(1)'}]
   :[{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'translate(0,0)'}];
  let anim;
  try{anim=g.animate(frames,{duration:dur,easing:'cubic-bezier(.2,.75,.25,1)'});}catch(e){g.remove();b.ghosts.delete(g);vT.style.visibility='';return 0;}
  let finished=false;
  const end=function(){
   if(finished)return;finished=true;
   clearTimeout(guard);
   try{g.remove();}catch(e){}
   b.ghosts.delete(g);
   if(b.flights.get(m.to)&&b.flights.get(m.to).anim===anim)b.flights.delete(m.to);
   const cur=b.prev&&b.prev.vis[m.to];
   if(cur&&!b.flights.has(m.to))cur.style.visibility='';
   vT.style.visibility='';
  };
  const guard=setTimeout(end,dur+400);
  anim.onfinish=end;anim.oncancel=end;
  b.flights.set(m.to,{anim,end});
  return Math.min(rv.width,rv.height);
 }
 function fade(b,prev,now,i,size,delay){
  const v=prev.vis[i];
  if(!v)return;
  const r=now.sq[i].getBoundingClientRect();
  const s=size||Math.min(r.width,r.height)*0.88;
  const g=ghostBox({left:r.left+(r.width-s)/2,top:r.top+(r.height-s)/2,width:s,height:s});
  g.appendChild(cloneVisual(v));
  document.body.appendChild(g);b.ghosts.add(g);
  let anim;
  try{anim=g.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.55)'}],{duration:200,delay:delay,easing:'ease-in',fill:'both'});}catch(e){g.remove();b.ghosts.delete(g);return;}
  const end=function(){try{g.remove();}catch(e){}b.ghosts.delete(g);};
  anim.onfinish=end;anim.oncancel=end;
  setTimeout(end,delay+700);
 }

 setInterval(scan,1200);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
 window.addEventListener('load',scan);
 window.vqcMoveSmooth={
  version:VERSION,
  isEnabled:function(){return enabled;},
  setEnabled:function(on){enabled=!!on;try{localStorage.setItem('vqc-move-smooth',enabled?'on':'off');}catch(e){}if(!enabled)live.forEach(clearBoard);},
  scan:scan,
  noteDrop:noteDrop,
  _boards:function(){return live.size;},
  _ghosts:function(){let n=0;live.forEach(function(b){n+=b.ghosts.size;});return n;}
 };
})();
