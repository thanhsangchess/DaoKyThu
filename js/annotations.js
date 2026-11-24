(function(){
 'use strict';
 const BOARD_IDS=[
  'board','mateBoard','mate3Board','pvpBoard','captureBoard',
  'freeCaptureBoard','defenseBoard','checkOneBoard','escapeBoard',
  'pawnGameBoard','vqcMateOneBoard','vqcMateOneBasicBoard','vqcMateThreeBoard','vqcLoneMateBoard','vqcAdventureBoard','vqcReviewBoard','castlingBoard','doubleAttackBoard','castlingPracticeBoard','beginnerPuzzleBoard',
  'vqcVsmBoard','vqcChdBoard'
 ];
 const PRIVATE_BOARD_IDS=['pvpBoard','vqcChdBoard'];
 const ADAPTER_BOARD_IDS=['vqcVsmBoard'];
 const SELECTOR=BOARD_IDS.map(id=>'#'+id).join(',');
 const SVG_NS='http://www.w3.org/2000/svg';
 const ANNOTATION_COLOR='#f2b52a';
 const COLORS={green:'#31985f',red:'#df4848',blue:'#357edb',yellow:ANNOTATION_COLOR};
 const MAX_MARKS=72;
 const boards=new Map();
 const marks=new Map();
 const remoteMarks=new Map();
 const adapters=new Map();
 const layers=new Map();
 let drawingMode=false;
 let gesture=null;
 let toolbar=null;
 let visibilityQueued=false;
 let lastRemoteStamp=null;
 let remoteWasPresent=false;
 let publishTimer=null;
 let publishSerial=0;
 const svgNode=(tag,attrs={})=>{
  const n=document.createElementNS(SVG_NS,tag);
  Object.entries(attrs).forEach(([name,value])=>n.setAttribute(name,String(value)));
  return n;
 };
 function boardFromTarget(target){
  return target instanceof Element?target.closest(SELECTOR):null;
 }
 function isBoardVisible(board){
  if(!board||!board.isConnected)return false;
  const r=board.getBoundingClientRect();
  return r.width>=160&&r.height>=160;
 }
 function activeBoard(){
  const all=BOARD_IDS.map(id=>boards.get(id)).filter(isBoardVisible);
  const dialogBoard=all.find(board=>!!board.closest('.open'));
  if(dialogBoard)return dialogBoard;
  const inViewport=all.find(board=>{
   const r=board.getBoundingClientRect();
   return r.bottom>0&&r.top<window.innerHeight&&r.right>0&&r.left<window.innerWidth;
  });
  return inViewport||all[0]||null;
 }
 function annotationModeClass(){
  for(const board of boards.values())board.classList.toggle('vqc-annotation-draw',drawingMode);
 }
 function scheduleToolbar(){
  if(visibilityQueued)return;
  visibilityQueued=true;
  requestAnimationFrame(()=>{
   visibilityQueued=false;
   if(!toolbar)return;
   mountMissing();
   const visible=!!activeBoard();
   toolbar.hidden=!visible;
   if(!visible&&drawingMode){drawingMode=false;annotationModeClass();}
   updateToolbar();
  });
 }
 function updateToolbar(){
  if(!toolbar)return;
  const btn=toolbar.querySelector('[data-action="draw"]');
  btn.classList.toggle('is-active',drawingMode);
  btn.setAttribute('aria-pressed',String(drawingMode));
  btn.textContent=drawingMode?'✅ Đang vẽ':'✏️ Vẽ';
  const board=activeBoard();
  const clear=toolbar.querySelector('[data-action="clear"]');
  clear.disabled=!board||!(
   (marks.get(board.id)||[]).length||
   (canClearRemote(board.id)&&(remoteMarks.get(board.id)||[]).length)
  );
 }
 function canClearRemote(boardId){
  const adapter=adapters.get(boardId);
  try{return !!(adapter&&typeof adapter.canClearAll==='function'&&adapter.canClearAll());}
  catch(error){return false;}
 }
 function createToolbar(){
  toolbar=document.createElement('div');
  toolbar.id='vqcAnnotationToolbar';
  toolbar.className='vqc-annotation-toolbar';
  toolbar.setAttribute('role','toolbar');
  toolbar.setAttribute('aria-label','Công cụ vẽ trên bàn cờ');
  toolbar.hidden=true;
  toolbar.innerHTML=
   '<button type="button" data-action="draw" aria-pressed="false" title="Bật hoặc tắt vẽ bằng chuột trái hoặc cảm ứng">✏️ Vẽ</button>'+
   '<button type="button" data-action="clear" title="Xóa các nét vẽ trên bàn cờ này">🧹 Xóa</button>'+
   '<span class="vqc-annotation-hint" title="Chuột phải: kéo để vẽ. Mã: vẽ tiếp từ ô đích để nối các đoạn chữ L. Mặc định vàng cam · Shift: đỏ · Ctrl: xanh dương · Alt: xanh lá. Trên điện thoại, bật Vẽ.">ⓘ</span>';
  toolbar.addEventListener('pointerdown',event=>event.stopPropagation());
  toolbar.addEventListener('click',event=>{
   const button=event.target.closest('button[data-action]');
   if(!button)return;
   event.preventDefault();
   event.stopPropagation();
   if(button.dataset.action==='draw'){
    drawingMode=!drawingMode;
    annotationModeClass();
    updateToolbar();
   }else if(button.dataset.action==='clear'){
    const board=activeBoard();
    if(board)clearBoard(board.id,true,true);
   }
  });
  document.body.appendChild(toolbar);
 }
 function mountBoard(board){
  if(!board||boards.has(board.id))return;
  boards.set(board.id,board);
  if(!marks.has(board.id))marks.set(board.id,[]);
  board.classList.add('vqc-annotation-board');
  const svg=svgNode('svg',{
   class:'vqc-annotation-overlay',viewBox:'0 0 800 800',preserveAspectRatio:'none','aria-hidden':'true'
  });
  layers.set(board.id,svg);
  const ensure=()=>{
   if(!board.isConnected)return;
   if(svg.parentNode!==board)board.appendChild(svg);
  };
  const observer=new MutationObserver(ensure);
  observer.observe(board,{childList:true});
  ensure();
  if((marks.get(board.id)||[]).length||(remoteMarks.get(board.id)||[]).length)redraw(board.id);
  board.classList.toggle('vqc-annotation-draw',drawingMode);
 }
 function mountMissing(){
  for(const id of BOARD_IDS){
   if(boards.has(id))continue;
   const el=document.getElementById(id);
   if(el)mountBoard(el);
  }
 }
 function initBoards(){
  mountMissing();
  annotationModeClass();
  scheduleToolbar();
 }
 function squareAt(board,clientX,clientY){
  if(board?.id==='castlingBoard'||board?.id==='doubleAttackBoard'||board?.id==='castlingPracticeBoard'){
   const selector=board.id==='castlingBoard'?'.castling-square':board.id==='doubleAttackBoard'?'.double-attack-cell':'.castling-practice-square';
   const cells=board.querySelectorAll(':scope > '+selector);
   for(let index=0;index<cells.length;index++){
    const rect=cells[index].getBoundingClientRect();
    if(clientX>=rect.left&&clientX<rect.right&&clientY>=rect.top&&clientY<rect.bottom)return index;
   }
   return null;
  }
  const rect=board.getBoundingClientRect();
  const insetX=board.clientLeft||0,insetY=board.clientTop||0;
  const width=Math.max(1,board.clientWidth),height=Math.max(1,board.clientHeight);
  const x=(clientX-rect.left-insetX)/width;
  const y=(clientY-rect.top-insetY)/height;
  if(x<0||x>=1||y<0||y>=1)return null;
  return Math.floor(y*8)*8+Math.floor(x*8);
 }
 function center(index){
  return {x:(index%8)*100+50,y:Math.floor(index/8)*100+50};
 }
 function isKnightJump(from,to){
  const fileDelta=Math.abs((from%8)-(to%8));
  const rankDelta=Math.abs(Math.floor(from/8)-Math.floor(to/8));
  return (fileDelta===1&&rankDelta===2)||(fileDelta===2&&rankDelta===1);
 }
 function boardPieceAt(board,displayIndex){
  const square=board?.id==='castlingBoard'?board.querySelectorAll(':scope > .castling-square')[displayIndex]
   :board?.id==='doubleAttackBoard'?board.querySelectorAll(':scope > .double-attack-cell')[displayIndex]
   :board?.id==='castlingPracticeBoard'?board.querySelectorAll(':scope > .castling-practice-square')[displayIndex]
   :board?.id==='beginnerPuzzleBoard'?board.querySelectorAll(':scope > .beginner-puzzle-cell')[displayIndex]
   :board?.children?.[displayIndex];
  const known=String(square?.dataset?.piece||square?.querySelector?.('.piece')?.dataset?.piece||'');
  if(known)return known;
  if((board?.id==='vqcVsmBoard'||board?.id==='vqcChdBoard')&&/\sMã$/.test(String(square?.getAttribute?.('aria-label')||'')))return 'n';
  return '';
 }
 function drawKnightArrow(svg,a,b,color,opacity){
  const dx=b.x-a.x,dy=b.y-a.y;
  const fileDelta=Math.abs(dx),rankDelta=Math.abs(dy);
  if(!((fileDelta===100&&rankDelta===200)||(fileDelta===200&&rankDelta===100)))return;
  const corner=fileDelta===100
   ? {x:a.x,y:b.y}
   : {x:b.x,y:a.y};
  const lastDx=b.x-corner.x,lastDy=b.y-corner.y;
  const length=Math.hypot(lastDx,lastDy);
  if(length<1)return;
  const ux=lastDx/length,uy=lastDy/length;
  const tip={x:b.x-ux*5,y:b.y-uy*5};
  const base={x:tip.x-ux*42,y:tip.y-uy*42};
  const startLength=Math.hypot(corner.x-a.x,corner.y-a.y);
  const sx=(corner.x-a.x)/Math.max(1,startLength),sy=(corner.y-a.y)/Math.max(1,startLength);
  const start={x:a.x+sx*16,y:a.y+sy*16};
  const normal={x:-uy,y:ux};
  svg.appendChild(svgNode('path',{
   d:'M '+start.x+' '+start.y+' L '+corner.x+' '+corner.y+' L '+base.x+' '+base.y,
   fill:'none',stroke:color,'stroke-width':16,'stroke-opacity':opacity,'stroke-linecap':'round','stroke-linejoin':'round'
  }));
  svg.appendChild(svgNode('polygon',{
   points:[tip.x+','+tip.y,(base.x+normal.x*20)+','+(base.y+normal.y*20),(base.x-normal.x*20)+','+(base.y-normal.y*20)].join(' '),
   fill:color,'fill-opacity':opacity,'stroke-linejoin':'round'
  }));
 }
 function drawMark(svg,mark,isPreview=false,siblings=null){
  const opacity=isPreview?0.45:0.82;
  const a=center(mark.from);
  const color=COLORS[mark.color]||ANNOTATION_COLOR;
  if(mark.from===mark.to||mark.kind==='circle'){
   svg.appendChild(svgNode('circle',{
    cx:a.x,cy:a.y,r:38,fill:'none',stroke:color,'stroke-width':15,
    'stroke-opacity':opacity,'stroke-linecap':'round'
   }));
   return;
  }
  const b=center(mark.to);
  const board=svg.parentElement;
  const originPiece=boardPieceAt(board,mark.from).toLowerCase();
  const existingMarks=siblings||marks.get(board?.id)||[];
  const continuesKnightPath=existingMarks.some(previous=>
   previous!==mark&&previous.kind==='arrow'&&previous.to===mark.from&&previous.knightPath===true
  );
  if(isKnightJump(mark.from,mark.to)&&(mark.knightPath===true||originPiece==='n'||continuesKnightPath)){
   drawKnightArrow(svg,a,b,color,opacity);
   return;
  }
  const dx=b.x-a.x,dy=b.y-a.y;
  const d=Math.hypot(dx,dy);
  if(d<10)return;
  const ux=dx/d,uy=dy/d,px=-uy,py=ux;
  const tip={x:b.x-9*ux,y:b.y-9*uy};
  const base={x:tip.x-36*ux,y:tip.y-36*uy};
  svg.appendChild(svgNode('line',{
   x1:a.x+ux*10,y1:a.y+uy*10,
   x2:base.x+ux*5,y2:base.y+uy*5,
   stroke:color,'stroke-width':18,'stroke-opacity':opacity,'stroke-linecap':'round'
  }));
  svg.appendChild(svgNode('polygon',{
   points:[tip.x+','+tip.y,(base.x+px*26)+','+(base.y+py*26),(base.x-px*26)+','+(base.y-py*26)].join(' '),
   fill:color,'fill-opacity':opacity,'stroke-linejoin':'round'
  }));
 }
 function redraw(boardId,preview=null){
  const layer=layers.get(boardId);
  if(!layer)return;
  layer.replaceChildren();
  const others=remoteMarks.get(boardId)||[];
  for(const mark of others)drawMark(layer,mark,false,others);
  for(const mark of marks.get(boardId)||[])drawMark(layer,mark);
  if(preview)drawMark(layer,preview,true);
  updateToolbar();
 }
 function currentColor(event){
  if(event.shiftKey)return 'red';
  if(event.ctrlKey||event.metaKey)return 'blue';
  if(event.altKey)return 'green';
  return 'yellow';
 }
 function addMark(boardId,from,to,color){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>63||to>63)return;
  const kind=from===to?'circle':'arrow';
  const items=marks.get(boardId)||[];
  const match=items.findIndex(m=>m.kind===kind&&m.from===from&&m.to===to);
  if(match>=0)items.splice(match,1);
  else{
   const startsOnKnight=boardPieceAt(boards.get(boardId),from).toLowerCase()==='n';
   const continuesKnightPath=items.some(previous=>
    previous.kind==='arrow'&&previous.to===from&&previous.knightPath===true
   );
   const knightPath=kind==='arrow'&&isKnightJump(from,to)&&(startsOnKnight||continuesKnightPath);
   items.push({kind,from,to,color,...(knightPath?{knightPath:true}:{})});
   if(items.length>MAX_MARKS)items.shift();
  }
  marks.set(boardId,items);
  redraw(boardId);
  publish(boardId);
 }
 function clearBoard(id,broadcast=false,explicit=false){
  if(!marks.has(id))return;
  const all=explicit&&canClearRemote(id);
  const hadOwn=(marks.get(id)||[]).length>0;
  const hadRemote=all&&(remoteMarks.get(id)||[]).length>0;
  if(!hadOwn&&!hadRemote)return;
  marks.set(id,[]);
  if(all)remoteMarks.set(id,[]);
  redraw(id);
  if(broadcast)publish(id,{explicit,all});
 }
 function clearAllLocal(){
  clearTimeout(publishTimer);
  publishTimer=null;
  for(const id of boards.keys()){
   if(ADAPTER_BOARD_IDS.includes(id))continue;
   marks.set(id,[]);
   redraw(id);
  }
 }
 window.vqcAnnotationsClearAll=clearAllLocal;
 const adapterTimers=new Map();
 function publish(boardId,opts){
  if(PRIVATE_BOARD_IDS.includes(boardId))return;
  if(ADAPTER_BOARD_IDS.includes(boardId)){
   const adapter=adapters.get(boardId);
   if(!adapter)return;
   clearTimeout(adapterTimers.get(boardId));
   const list=(marks.get(boardId)||[]).slice(0,MAX_MARKS).map(m=>({...m}));
   const info={explicit:!!(opts&&opts.explicit),all:!!(opts&&opts.all)};
   adapterTimers.set(boardId,setTimeout(()=>{
    adapterTimers.delete(boardId);
    if(adapters.get(boardId)!==adapter)return;
    try{adapter.publish(list,info);}catch(error){console.warn('Không thể chia sẻ nét vẽ:',error);}
   },70));
   return;
  }
  if(typeof roomRef==='undefined'||!roomRef||
     typeof role==='undefined'||role!=='teacher')return;
  clearTimeout(publishTimer);
  const ref=roomRef;
  const data={
   boardId,marks:(marks.get(boardId)||[]).slice(0,MAX_MARKS),
   stamp:Date.now()+'-'+(++publishSerial)
  };
  publishTimer=setTimeout(()=>{
   if(typeof roomRef==='undefined'||roomRef!==ref)return;
   ref.update({boardAnnotations:data}).catch(error=>console.warn('Không thể chia sẻ nét vẽ:',error));
  },70);
 }
 function sanitizeRemote(data){
  if(!data||!BOARD_IDS.includes(data.boardId)||!Array.isArray(data.marks))return null;
  return {
   boardId:data.boardId,stamp:String(data.stamp||''),
   marks:data.marks.slice(0,MAX_MARKS).filter(m=>
    m&&['circle','arrow'].includes(m.kind)&&Number.isInteger(m.from)&&Number.isInteger(m.to)&&
    m.from>=0&&m.from<64&&m.to>=0&&m.to<64&&Object.hasOwn(COLORS,m.color))
  };
 }
 window.vqcAnnotationsReceive=function(input){
  if(typeof role!=='undefined'&&role==='teacher')return;
  if(input&&(PRIVATE_BOARD_IDS.includes(input.boardId)||ADAPTER_BOARD_IDS.includes(input.boardId)))return;
  const data=sanitizeRemote(input);
  if(!data){
   if(remoteWasPresent){remoteWasPresent=false;lastRemoteStamp=null;clearAllLocal();}
   return;
  }
  if(remoteWasPresent&&lastRemoteStamp===data.stamp)return;
  remoteWasPresent=true;
  lastRemoteStamp=data.stamp;
  clearAllLocal();
  marks.set(data.boardId,data.marks);
  redraw(data.boardId);
 };
 function handleDown(event){
  const board=boardFromTarget(event.target);
  if(!board)return;
  const right=event.button===2;
  const draw=drawingMode&&(event.button===0||event.pointerType==='touch');
  if(!right&&!draw){
   if(event.button===0&&!drawingMode)clearBoard(board.id,true);
   return;
  }
  if(!isBoardVisible(board))return;
  const sq=squareAt(board,event.clientX,event.clientY);
  if(sq===null)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  gesture={boardId:board.id,pointerId:event.pointerId,start:sq,last:sq,color:currentColor(event)};
  redraw(board.id,{from:sq,to:sq,kind:'circle',color:gesture.color});
 }
 function handleMove(event){
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  const board=boards.get(gesture.boardId);
  if(!board)return;
  const sq=squareAt(board,event.clientX,event.clientY);
  if(sq===null)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(gesture.last!==sq){
   gesture.last=sq;
   redraw(board.id,{from:gesture.start,to:sq,kind:sq===gesture.start?'circle':'arrow',color:gesture.color});
  }
 }
 function handleEnd(event){
  if(!gesture||event.pointerId!==gesture.pointerId)return;
  const {boardId,start,last,color}=gesture;
  gesture=null;
  event.preventDefault();
  event.stopImmediatePropagation();
  const board=boards.get(boardId);
  if(!board)return;
  const end=squareAt(board,event.clientX,event.clientY);
  addMark(boardId,start,end??last,color);
 }
 function handleCancel(){
  if(!gesture)return;
  const id=gesture.boardId;
  gesture=null;
  redraw(id);
 }
 function installListeners(){
  document.addEventListener('pointerdown',handleDown,true);
  document.addEventListener('pointermove',handleMove,true);
  document.addEventListener('pointerup',handleEnd,true);
  document.addEventListener('pointercancel',handleCancel,true);
  document.addEventListener('contextmenu',event=>{
   if(boardFromTarget(event.target)){event.preventDefault();event.stopPropagation();}
  },true);
  document.addEventListener('click',event=>{
   if(!drawingMode||!boardFromTarget(event.target))return;
   event.preventDefault();
   event.stopImmediatePropagation();
  },true);
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&gesture)handleCancel();
  },true);
  const request=()=>scheduleToolbar();
  document.addEventListener('click',request,true);
  window.addEventListener('resize',request);
  window.addEventListener('scroll',request,true);
  new MutationObserver(request).observe(document.body,{
   subtree:true,attributes:true,attributeFilter:['class','hidden']
  });
 }
 function cleanList(list){
  if(!Array.isArray(list))return [];
  const out=[];
  for(const m of list.slice(0,MAX_MARKS)){
   if(!m||!['circle','arrow'].includes(m.kind)||!Number.isInteger(m.from)||!Number.isInteger(m.to)||
      m.from<0||m.from>63||m.to<0||m.to>63||!Object.hasOwn(COLORS,m.color))continue;
   out.push({kind:m.kind,from:m.from,to:m.to,color:m.color,...(m.knightPath===true?{knightPath:true}:{})});
  }
  return out;
 }
 window.vqcAnnotationsAdapter=function(boardId,adapter){
  if(!ADAPTER_BOARD_IDS.includes(boardId))return false;
  mountMissing();
  clearTimeout(adapterTimers.get(boardId));
  adapterTimers.delete(boardId);
  if(adapter&&typeof adapter.publish==='function')adapters.set(boardId,adapter);
  else{
   adapters.delete(boardId);
   marks.set(boardId,[]);
   remoteMarks.set(boardId,[]);
   redraw(boardId);
  }
  updateToolbar();
  return true;
 };
 window.vqcAnnotationsRemote=function(boardId,list){
  if(!ADAPTER_BOARD_IDS.includes(boardId))return false;
  remoteMarks.set(boardId,cleanList(list));
  redraw(boardId);
  return true;
 };
 window.vqcAnnotationsSetOwn=function(boardId,list){
  if(!ADAPTER_BOARD_IDS.includes(boardId))return false;
  marks.set(boardId,cleanList(list));
  redraw(boardId);
  return true;
 };
 window.vqcAnnotationsOwn=function(boardId){
  return cleanList(marks.get(boardId));
 };
 window.vqcAnnotationsClearBoard=function(boardId){
  clearTimeout(adapterTimers.get(boardId));
  adapterTimers.delete(boardId);
  marks.set(boardId,[]);
  remoteMarks.set(boardId,[]);
  redraw(boardId);
  return true;
 };
 window.vqcAnnotationsMount=initBoards;
 function init(){
  if(!document.body)return;
  createToolbar();
  initBoards();
  installListeners();
  scheduleToolbar();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
