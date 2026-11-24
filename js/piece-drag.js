(function(){
 'use strict';
 if(window.vqcPieceDrag)return;
 const VERSION='20261124-drag-v2';
 const BOARD_SEL='[class*="board"],[id$="Board"],[id*="Board"]';
 const SKIP='.board-star,.move-hint,.capture-hint,[class*="coordinate"]';
 const GLYPH=/[♔-♟]/;
 const SEL_TOKEN=/(^|[\s_-])(selected|picked|chosen)($|[\s_-])/i;
 const SQ_CLASS=/square|cell|tile|(^|[\s_-])sq($|[\s_-])/i;
 const THRESH=4;
 let enabled=true;
 try{if(localStorage.getItem('vqc-piece-drag')==='off')enabled=false;}catch(e){}
 let st=null,suppressUntil=0;

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
 function boardOf(node){
  for(let el=node;el&&el!==document.body;el=el.parentElement){
   if(el.matches&&el.matches(BOARD_SEL)&&squaresOf(el).length===64)return el;
  }
  return null;
 }
 function indexOfSquare(sqs,node){
  for(let i=0;i<sqs.length;i++){if(sqs[i]===node||sqs[i].contains(node))return i;}
  return -1;
 }
 function inEditor(board){
  try{return typeof editorMode!=='undefined'&&!!editorMode&&(board.id==='board'||board.classList.contains('board'));}catch(e){return false;}
 }

 function tap(el,x,y){
  if(!el)return;
  const base={bubbles:true,cancelable:true,composed:true,view:window,clientX:x,clientY:y,button:0};
  function fire(type,ctor,extra){
   try{el.dispatchEvent(new ctor(type,Object.assign({},base,extra)));}catch(e){}
  }
  const ptr=function(b){return {pointerId:1,pointerType:'mouse',isPrimary:true,buttons:b};};
  if(typeof PointerEvent==='function')fire('pointerdown',PointerEvent,ptr(1));
  fire('mousedown',MouseEvent,{buttons:1});
  if(typeof PointerEvent==='function')fire('pointerup',PointerEvent,ptr(0));
  fire('mouseup',MouseEvent,{buttons:0});
  fire('click',MouseEvent,{buttons:0});
 }
 function isSel(sq){
  if(!sq)return false;
  if(SEL_TOKEN.test(classOf(sq)))return true;
  const d=sq.querySelectorAll('*');
  for(let i=0;i<d.length;i++){if(SEL_TOKEN.test(classOf(d[i])))return true;}
  return false;
 }
 function classSig(board){
  const all=board.querySelectorAll('*');let s=all.length+':';
  for(let i=0;i<all.length;i++){const c=classOf(all[i]);if(c)s+=c+'|';}
  return s;
 }

 window.addEventListener('pointerdown',function(e){
  if(!e.isTrusted)return;
  if(st){cancel(false);}
  if(!enabled||e.button!==0||(e.pointerType!=='mouse'&&e.pointerType!=='pen')||!e.isPrimary)return;
  const board=boardOf(e.target);
  if(!board||board.classList.contains('vqc-annotation-draw')||inEditor(board))return;
  if(e.target.closest&&e.target.closest(SKIP))return;
  const sqs=squaresOf(board),idx=indexOfSquare(sqs,e.target);
  if(idx<0)return;
  if(!visualOf(sqs[idx]))return;
  st={board:board,idx:idx,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,active:false,dead:false,weSelected:false,selBySig:false,ghost:null,hover:null,obs:null,prevCursor:''};
 },true);
 window.addEventListener('dragstart',function(e){
  if(st&&!st.dead){e.preventDefault();e.stopImmediatePropagation();}
 },true);

 function makeGhost(v,x,y){
  const r=v.getBoundingClientRect();
  const s=Math.max(r.width,r.height)*1.12;
  const g=document.createElement('div');
  g.className='vqc-drag-ghost';g.setAttribute('aria-hidden','true');
  g.style.cssText='position:fixed;left:0;top:0;width:'+s+'px;height:'+s+'px;margin:0;padding:0;pointer-events:none;z-index:2147483001;'+
   'will-change:transform;filter:drop-shadow(0 8px 6px rgba(0,0,0,.28));transform:translate('+(x-s/2)+'px,'+(y-s/2)+'px)';
  const c=v.cloneNode(true);c.removeAttribute('id');
  const glyph=v.tagName!=='IMG'&&v.tagName.toLowerCase()!=='svg';
  c.style.cssText='display:block;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;pointer-events:none;visibility:visible;opacity:1;transform:none;animation:none;transition:none'+
   (glyph?';display:flex;align-items:center;justify-content:center;font-size:'+Math.round(s*0.8)+'px;line-height:1':'');
  if(c.tagName==='IMG'){c.draggable=false;c.style.objectFit='contain';}
  g.appendChild(c);g.dataset.size=String(s);
  document.body.appendChild(g);
  return g;
 }
 function dimOrigin(){
  if(!st)return;
  const sqs=squaresOf(st.board),o=sqs[st.idx],v=o&&visualOf(o);
  if(v)v.style.opacity='0.28';
 }
 function undim(){
  if(!st)return;
  const sqs=squaresOf(st.board),o=sqs[st.idx],v=o&&visualOf(o);
  if(v)v.style.opacity='';
 }
 function activate(){
  const board=st.board;
  let sqs=squaresOf(board),o=sqs[st.idx];
  if(!o||!document.contains(board)){st.dead=true;return false;}
  const before=classSig(board);
  if(!isSel(o)){
   tap(visualOf(o)||o,st.x0,st.y0);st.weSelected=true;
  }
  sqs=squaresOf(board);o=sqs[st.idx];
  if(!o||sqs.length!==64){st.dead=true;return false;}
  if(!isSel(o)){
   if(st.weSelected&&classSig(board)!==before)st.selBySig=true;
   else{st.dead=true;return false;}
  }
  const v=visualOf(o);
  if(!v){st.dead=true;return false;}
  st.active=true;
  st.ghost=makeGhost(v,st.x,st.y);
  st.prevCursor=document.body.style.cursor;document.body.style.cursor='grabbing';
  board.classList.add('vqc-dragging');
  dimOrigin();
  st.obs=new MutationObserver(function(){dimOrigin();});
  st.obs.observe(board,{childList:true,subtree:true});
  return true;
 }
 function place(){
  if(!st||!st.ghost)return;
  const s=Number(st.ghost.dataset.size)||0;
  st.ghost.style.transform='translate('+(st.x-s/2)+'px,'+(st.y-s/2)+'px)';
  const el=document.elementFromPoint(st.x,st.y);
  const sqs=squaresOf(st.board),i=el?indexOfSquare(sqs,el):-1;
  const sq=i>=0?sqs[i]:null;
  if(sq!==st.hover){
   if(st.hover)st.hover.style.outline=st.hoverOld||'';
   st.hover=sq;
   if(sq){st.hoverOld=sq.style.outline;sq.style.outline='3px solid rgba(255,196,40,.9)';sq.style.outlineOffset='-3px';}
  }
 }
 window.addEventListener('pointermove',function(e){
  if(!e.isTrusted)return;
  if(!st||st.dead||!e.isPrimary)return;
  st.x=e.clientX;st.y=e.clientY;
  if(!st.active){
   if(Math.hypot(st.x-st.x0,st.y-st.y0)<THRESH)return;
   if(!activate())return;
  }
  e.preventDefault();
  place();
 },true);

 function cleanup(){
  if(!st)return;
  if(st.hover)st.hover.style.outline=st.hoverOld||'';
  if(st.obs){try{st.obs.disconnect();}catch(e){}}
  undim();
  if(st.ghost){try{st.ghost.remove();}catch(e){}}
  if(st.active){document.body.style.cursor=st.prevCursor;st.board.classList.remove('vqc-dragging');}
 }
 function deselect(s){
  const o=squaresOf(s.board)[s.idx];
  if(o&&(isSel(o)||s.selBySig))tap(visualOf(o)||o,s.x,s.y);
 }
 function cancel(doDeselect){
  if(!st)return;
  const s=st;cleanup();st=null;
  if(s.active){
   suppressUntil=Date.now()+350;
   if(doDeselect&&s.weSelected)deselect(s);
  }
 }
 window.addEventListener('pointerup',function(e){
  if(!e.isTrusted)return;
  if(!st||!e.isPrimary)return;
  const s=st;
  if(!s.active){st=null;return;}
  s.x=e.clientX;s.y=e.clientY;
  const el=document.elementFromPoint(s.x,s.y);
  const sqs=squaresOf(s.board),ok=el&&document.contains(s.board),target=ok?indexOfSquare(sqs,el):-1;
  cleanup();st=null;
  e.preventDefault();
  if(target>=0&&target!==s.idx){
   try{if(window.vqcMoveSmooth&&window.vqcMoveSmooth.noteDrop)window.vqcMoveSmooth.noteDrop();}catch(x){}
   tap(sqs[target].contains(el)?el:sqs[target],s.x,s.y);
  }else if(s.weSelected){
   deselect(s);
  }
  suppressUntil=Date.now()+350;
 },true);
 window.addEventListener('pointercancel',function(e){if(e.isTrusted)cancel(true);},true);
 window.addEventListener('blur',function(){cancel(true);});
 window.addEventListener('keydown',function(e){if(e.key==='Escape'&&st&&st.active){e.stopImmediatePropagation();cancel(true);}},true);
 window.addEventListener('click',function(e){
  if(Date.now()<suppressUntil&&e.isTrusted){e.preventDefault();e.stopImmediatePropagation();}
 },true);

 window.vqcPieceDrag={
  version:VERSION,
  isEnabled:function(){return enabled;},
  setEnabled:function(on){enabled=!!on;try{localStorage.setItem('vqc-piece-drag',enabled?'on':'off');}catch(e){}if(!enabled&&st)cancel(true);},
  _active:function(){return !!(st&&st.active);}
 };
})();
