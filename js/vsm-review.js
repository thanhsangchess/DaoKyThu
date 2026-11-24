(function(){
'use strict';
if(window.vqcVsmReview)return;
const VERSION='20261124-vsr-v1';
const FILES='abcdefgh',UCI_RE=/^[a-h][1-8][a-h][1-8][qrbn]?$/,BOARD_ID='vqcVsmBoard';
const HIST_CAP=200,VW_TTL=75000,VW_REFRESH=20000,VW_DEBOUNCE=250,MAX_VM=60,MAX_MARKS=40;
const SIDE={w:'Trắng',b:'Đen'},PIECE={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};
const COLORS=['yellow','red','blue','green'];
const LOCK='Chức năng này đã bị khóa với học sinh';
const $=id=>document.getElementById(id);

let tab='game',review=null,note='',busy=false,anaEpoch=0,anaEngine=null,engState='idle';
let remoteRes=[],remoteErr='',remoteAt=0,remoteBusy=false,outboxBusy=false;
let promotion=null,selected=null;
let annOn=false;
let vwRemote=null,vwIn=null,vwSeenKey='',vwSeenAt=0,vwSig='',vwSigAt=0,vwLastSig='',vwLastAt=0,vwBusy=false,vwRetryAt=0,mirrorKey='',mirrored=false;
let tyRemote=null,tySig='',tySigAt=0,tyLastSig='',tyBusy=false,tyRetryAt=0;

function X(){const m=window.vqcVsMachine;return m&&m.ext?m.ext:null;}
function isOpen(){const x=X();return !!x&&x.open();}
function isStudent(){const x=X();return !!x&&x.student();}
function isTeacher(){const x=X();return !!x&&!x.student();}
function myUid(){const x=X();return x?x.uid():'';}
function toMs(v){return v&&typeof v.toMillis==='function'?v.toMillis():(typeof v==='number'&&isFinite(v)?v:null);}
function ci(v,a,b){v=Number(v);return isFinite(v)?Math.max(a,Math.min(b,Math.round(v))):a;}
function otherSide(c){return c==='w'?'b':'w';}
function parseUci(m){return typeof m==='string'&&UCI_RE.test(m)?{from:m.slice(0,2),to:m.slice(2,4),promotion:m[4]||undefined}:null;}
function levelLabel(id){const x=window.vqcVsMachine;const l=x&&x.levels&&x.levels.find(v=>v.id===id);return l?l.label:'';}
function notify(t){if(typeof vqcNotify==='function')vqcNotify(t,'warning');}

function readLS(k){try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function writeLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function histKey(){return 'vqc-vsm-hist-'+(myUid()||'guest');}
function outKey(){return 'vqc-vsm-out-'+(myUid()||'guest');}

function normRec(r){
 if(!r||typeof r!=='object'||typeof Chess!=='function')return null;
 const fen0=typeof r.fen0==='string'?r.fen0:'';
 if(!fen0||fen0.length>110||!new Chess().load(fen0))return null;
 const moves=Array.isArray(r.moves)?r.moves.filter(x=>typeof x==='string'&&UCI_RE.test(x)).slice(0,1000):[];
 const num=ci(r.num,0,1000);
 return {id:String(r.id||('n'+num+'-'+moves.length)).slice(0,80),kind:r.kind==='chernev'||r.kind==='custom'?r.kind:'standard',num,fen0,
  human:r.human==='b'?'b':'w',levelId:String(r.levelId||'').slice(0,20),result:['win','loss','draw'].includes(r.result)?r.result:'draw',
  reason:String(r.reason||'').slice(0,300),shared:r.shared===true,teacherId:String(r.teacherId||'').slice(0,128),
  teacherName:String(r.teacherName||'').slice(0,80),endedAtMs:toMs(r.endedAtMs)||null,moves};
}
function buildRecord(s){
 const x=X();
 return {id:String(s.id),teacherId:myUid(),teacherName:String(x.name()||'Giáo viên').slice(0,80),room:String(x.room()||'').slice(0,80),
  kind:s.kind,num:s.num|0,fen0:s.fen0,human:s.human,levelId:s.levelId,result:s.result,reason:String(s.reason||'').slice(0,300),
  shared:!!s.shared,plies:s.moves.length,moves:s.moves.slice(0,1000),endedAtMs:Date.now()};
}
function keepLocal(rec){
 const list=readLS(histKey()).filter(r=>r&&r.id!==rec.id);list.unshift(rec);writeLS(histKey(),list.slice(0,HIST_CAP));
}
async function writeRemote(rec,queue){
 try{
  const ref=db.collection('vsmResults').doc(rec.id);
  const ex=await ref.get();
  if(!ex.exists)await ref.set(Object.assign({},rec,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
  dropOutbox(rec.id);remoteAt=0;remoteErr='';
  paintResults();
  return true;
 }catch(e){
  if(queue){
   const q=readLS(outKey()).filter(r=>r&&r.id!==rec.id);q.push(rec);writeLS(outKey(),q.slice(-200));
   remoteErr=(e&&e.code==='permission-denied')?'Chưa lưu được lên Firebase: cần đăng bản Rules mới có vsmResults. Kết quả được giữ trên máy này và sẽ gửi lại khi được phép.':'Chưa lưu được kết quả lên Firebase (mạng?) — đã giữ trên máy này và sẽ gửi lại.';
   paintResults();
  }
  return false;
 }
}
function dropOutbox(id){const q=readLS(outKey());if(q.some(r=>r&&r.id===id))writeLS(outKey(),q.filter(r=>r&&r.id!==id));}
async function flushOutbox(){
 if(outboxBusy||!isTeacher()||!myUid()||typeof db==='undefined')return;
 const q=readLS(outKey());if(!q.length)return;
 outboxBusy=true;
 try{for(const rec of q){if(rec&&rec.teacherId===myUid()){const ok=await writeRemote(rec,false);if(!ok)break;}}}
 finally{outboxBusy=false;}
}
async function loadRemote(force){
 if(remoteBusy||typeof db==='undefined'||!myUid()||!isTeacher())return;
 if(!force&&Date.now()-remoteAt<30000)return;
 remoteBusy=true;
 try{
  const s=await db.collection('vsmResults').where('teacherId','==',myUid()).limit(500).get();
  remoteRes=s.docs.map(d=>Object.assign({id:d.id},d.data()));remoteErr='';remoteAt=Date.now();
 }catch(e){remoteErr=(e&&e.code==='permission-denied')?'Chưa đọc được kết quả từ Firebase (Rules chưa có vsmResults) — đang hiển thị các ván lưu trên máy này.':'Chưa tải được kết quả từ Firebase — đang hiển thị các ván lưu trên máy này.';}
 finally{remoteBusy=false;paintResults();}
}
function allResults(){
 const map=new Map();
 for(const r of remoteRes)map.set(r.id,r);
 for(const r of readLS(histKey()))if(r&&r.id&&!map.has(r.id))map.set(r.id,r);
 const me=myUid();
 return [...map.values()].filter(r=>r&&r.teacherId===me).sort((a,b)=>(toMs(b.endedAtMs)||0)-(toMs(a.endedAtMs)||0));
}
async function save(s){
 if(!s||!isTeacher()||!myUid()||!s.moves||!s.moves.length)return;
 const rec=buildRecord(s);
 keepLocal(rec);
 await writeRemote(rec,true);
}

function reviewGame(){
 const g=new Chess();if(!review||!g.load(review.rec.fen0))return null;
 for(let i=0;i<review.ply&&i<review.rec.moves.length;i++){const p=parseUci(review.rec.moves[i]);if(!p||!g.move({from:p.from,to:p.to,promotion:p.promotion}))break;}
 for(const u of (review.vm||[])){const p=parseUci(u);if(!p||!g.move({from:p.from,to:p.to,promotion:p.promotion}))break;}
 return g;
}
function mainSans(){
 const g=new Chess();if(!review||!g.load(review.rec.fen0))return [];
 const out=[];
 for(const u of review.rec.moves){const p=parseUci(u);const mv=p&&g.move({from:p.from,to:p.to,promotion:p.promotion});if(!mv)break;out.push(mv.san);}
 return out;
}
function varText(){
 const vm=review&&review.vm||[];if(!vm.length)return '';
 const g=new Chess();if(!g.load(review.rec.fen0))return '';
 for(let i=0;i<review.ply&&i<review.rec.moves.length;i++){const p=parseUci(review.rec.moves[i]);if(!p||!g.move({from:p.from,to:p.to,promotion:p.promotion}))break;}
 const out=[];
 for(const u of vm){
  const p=parseUci(u);if(!p)break;
  const t=g.turn(),n=g.fen().split(' ')[5],mv=g.move({from:p.from,to:p.to,promotion:p.promotion});if(!mv)break;
  out.push((t==='w'?n+'. ':(out.length?'':n+'… '))+mv.san);
 }
 return out.join(' ');
}
function cleanVm(rec,ply,vm){
 const g=new Chess();if(!g.load(rec.fen0))return [];
 for(let i=0;i<ply&&i<rec.moves.length;i++){const p=parseUci(rec.moves[i]);if(!p||!g.move({from:p.from,to:p.to,promotion:p.promotion}))break;}
 const out=[];
 for(const u of vm){const p=parseUci(u);if(!p||!g.move({from:p.from,to:p.to,promotion:p.promotion}))break;out.push(u);}
 return out;
}
function lastOf(){
 if(!review)return null;
 const vm=review.vm||[];
 const u=vm.length?vm[vm.length-1]:(review.ply>0?review.rec.moves[review.ply-1]:null);
 const p=parseUci(u);return p?{from:p.from,to:p.to}:null;
}
function bottomSide(){return review?(review.bottom||review.rec.human):'w';}

function ixToSq(i,b){const r=(i/8)|0,c=i%8;return FILES[b==='b'?7-c:c]+(b==='b'?r+1:8-r);}
function sqToIx(s,b){const f=FILES.indexOf(s[0]),k=Number(s[1]),c=b==='b'?7-f:f,r=b==='b'?k-1:8-k;return r*8+c;}
function annApi(n){return typeof window[n]==='function'?window[n]:null;}
function annOwn(){const f=annApi('vqcAnnotationsOwn');try{return f?f(BOARD_ID):[];}catch(e){return [];}}
function annSetOwn(l){const f=annApi('vqcAnnotationsSetOwn');if(f)try{f(BOARD_ID,l);}catch(e){}}
function annRemote(l){const f=annApi('vqcAnnotationsRemote');if(f)try{f(BOARD_ID,l);}catch(e){}}
function annPublish(list){
 if(!review)return;
 const b=bottomSide();
 review.marks=(list||[]).slice(0,MAX_MARKS).map(m=>({k:m.kind==='circle'?'circle':'arrow',f:ixToSq(m.from,b),t:ixToSq(m.to,b),c:COLORS.includes(m.color)?m.color:'yellow',...(m.knightPath?{n:true}:{})}));
}
function annReset(){if(review)review.marks=[];if(annOn)annSetOwn([]);}
function marksFromView(list,b){
 const out=[];
 for(const m of list||[])out.push({kind:m.k,from:sqToIx(m.f,b),to:sqToIx(m.t,b),color:m.c,...(m.n?{knightPath:true}:{})});
 return out;
}
function rotateOwn(){annSetOwn(annOwn().map(m=>({...m,from:63-m.from,to:63-m.to})));}

function beginReview(){
 const x=X();if(!x)return;
 const ov=$('vqcVsMachineOverlay');if(ov)ov.classList.add('vsr-reviewing');
 try{x.unregisterAdapter();}catch(e){}
 const mount=annApi('vqcAnnotationsMount');if(mount)try{mount();}catch(e){}
 if(isTeacher()&&x.shared()){
  const reg=annApi('vqcAnnotationsAdapter');
  if(reg)try{annOn=!!reg(BOARD_ID,{publish:annPublish});}catch(e){annOn=false;}
 }
 annSetOwn([]);annRemote([]);
}
function endReview(){
 if(!review)return;
 const x=X();
 review=null;promotion=null;selected=null;note='';busy=false;anaEpoch++;
 disposeAnaEngine();
 const reg=annApi('vqcAnnotationsAdapter');
 if(annOn&&reg)try{reg(BOARD_ID,null);}catch(e){}
 annOn=false;
 annRemote([]);annSetOwn([]);
 const ov=$('vqcVsMachineOverlay');if(ov)ov.classList.remove('vsr-reviewing');
 if(x){try{x.registerAdapter();x.refreshMarks();}catch(e){}}
 syncUi();
 if(x)try{x.render();}catch(e){}
}
function startReview(rec,extra){
 const was=!!review;
 review=Object.assign({rec,ply:rec.moves.length,vm:[],bottom:rec.human,marks:[],by:'',local:false,ana:null,tyBase:tyMax()},extra||{});
 promotion=null;selected=null;note='';tab='game';
 if(!was)beginReview();
 syncUi();
 const x=X();if(x)try{x.render();}catch(e){}
}
function openReview(id){
 if(!isTeacher())return;
 const raw=allResults().find(r=>r.id===id);if(!raw)return;
 const rec=normRec(raw);if(!rec)return;
 startReview(rec);
}
function touchReview(){if(review){review.tyBase=tyMax();review.by='';}}
function tyMax(){
 let m=0;
 if(tyRemote)for(const k of Object.keys(tyRemote)){const e=tyRemote[k];const at=e&&typeof e==='object'?toMs(e.at):null;if(at!=null&&at>m)m=at;}
 return m;
}

function reviewStep(d){
 if(!review||!isTeacher())return;
 const n=review.rec.moves.length,was=review.ply,vm=review.vm||[];
 selected=null;promotion=null;note='';touchReview();
 if(d===-1&&vm.length){review.vm=vm.slice(0,-1);review.ana=null;annReset();paint();return;}
 if(vm.length){review.vm=[];review.local=false;}
 review.ply=d===Infinity?n:d===-Infinity?0:Math.max(0,Math.min(n,review.ply+d));
 review.ana=null;
 if(review.ply!==was||vm.length)annReset();
 paint();
}
function flipReview(){
 if(!review||!isTeacher())return;
 review.bottom=otherSide(bottomSide());
 if(annOn)rotateOwn();
 paint();
}
function reviewBack(){
 if(!review||!isTeacher())return;
 selected=null;promotion=null;note='';review.vm=[];review.ana=null;touchReview();annReset();paint();
}
function reviewCell(sq){
 const g=reviewGame();if(!g||promotion)return;
 if(g.game_over()){selected=null;note='Thế cờ này đã kết thúc, không đi tiếp được.';paint();return;}
 const p=g.get(sq);note='';
 if(p&&p.color===g.turn()){selected=selected===sq?null:sq;paint();return;}
 if(!selected)return;
 const choices=g.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!choices.length){selected=null;paint();return;}
 if(choices.some(m=>m.promotion)){promotion={from:selected,to:sq,side:g.turn()};paint();return;}
 reviewPush(selected,sq,undefined);
}
function reviewPush(from,to,promo){
 if(!review)return;
 const vm=review.vm||[];
 if(vm.length>=MAX_VM){note='Đã đi thử quá nhiều nước, hãy bấm “Về thế cờ hiện tại”.';selected=null;paint();return;}
 const g=reviewGame();if(!g)return;
 if(!g.move({from,to,promotion:promo})){selected=null;paint();return;}
 review.vm=vm.concat(from+to+(promo||''));review.local=isStudent();review.localAt=Date.now();review.ana=null;
 selected=null;promotion=null;note='';touchReview();annReset();paint();
}
function choosePromotion(k){
 if(!promotion)return;
 const {from,to}=promotion;promotion=null;reviewPush(from,to,k);
}

function disposeAnaEngine(){const e=anaEngine;anaEngine=null;engState='idle';if(e){try{e.dispose();}catch(x){}}}
function evalWhite(info,turn){
 if(!info)return null;
 if(info.mate!==null&&info.mate!==undefined)return {mate:turn==='w'?info.mate:-info.mate};
 if(info.cp===null||info.cp===undefined)return null;
 return {cp:turn==='w'?info.cp:-info.cp};
}
function evalText(ev){
 if(!ev)return '';
 if(ev.mate!==undefined)return (ev.mate>0?'Trắng':'Đen')+' có thể chiếu hết sau '+Math.abs(ev.mate)+' nước';
 const a=Math.abs(ev.cp);if(a<30)return 'Thế cờ cân bằng';
 const who=ev.cp>0?'Trắng':'Đen';return a<150?who+' hơi nhỉnh hơn':a<400?who+' đang hơn':who+' hơn rất nhiều';
}
function evalShare(ev){if(!ev)return 50;if(ev.mate!==undefined)return ev.mate>0?97:3;return Math.round(50+50*Math.tanh(ev.cp/400)*0.94);}
function anaCur(){
 if(!review||!review.ana)return null;
 const g=reviewGame();return g&&g.fen()===review.ana.fen?review.ana:null;
}
function analyse(){
 if(!review||busy||!isTeacher())return;
 const g=reviewGame();if(!g)return;
 const fen=g.fen(),turn=g.turn();
 if(g.game_over()){review.ana=null;note=g.in_checkmate()?'Thế cờ này đã bị chiếu hết.':'Thế cờ này đã kết thúc (hòa).';paint();return;}
 const ep=++anaEpoch;
 busy=true;review.ana=null;note='';paint();
 let eng;
 try{
  if(!window.VqcStockfish)throw new Error('Chưa tải được mô-đun động cơ Stockfish.');
  if(!anaEngine)anaEngine=window.VqcStockfish.create({onStatus:s=>{if(s==='loading'){engState='loading';paint();}}});
  eng=anaEngine;
 }catch(e){busy=false;note='⚠️ '+e.message;paint();return;}
 eng.search(fen,{movetime:1000,skill:20}).then(res=>{
  if(ep!==anaEpoch)return;
  busy=false;engState=anaEngine?anaEngine.state:'idle';
  if(res.cancelled||!review){paint();return;}
  const probe=new Chess();probe.load(fen);
  const p=res.valid&&!res.none?parseUci(res.bestmove):null;
  const legal=p&&probe.moves({verbose:true}).find(m=>m.from===p.from&&m.to===p.to&&(m.promotion||undefined)===p.promotion);
  const made=legal?probe.move({from:legal.from,to:legal.to,promotion:legal.promotion}):null;
  review.ana={fen,turn,san:made?made.san:'',from:made?made.from:'',to:made?made.to:'',piece:made?made.piece:'',ev:evalWhite(res.info,turn)};
  paint();
 }).catch(()=>{
  if(ep!==anaEpoch)return;
  busy=false;disposeAnaEngine();note='⚠️ Chưa tải được động cơ Stockfish (có thể do mạng hoặc trình duyệt cũ).';paint();
 });
}

function kingSquare(g,color){
 for(const f of FILES)for(let r=1;r<=8;r++){const p=g.get(f+r);if(p&&p.type==='k'&&p.color===color)return f+r;}
 return null;
}
function paintBoard(g){
 const board=$('vqcVsmBoard');if(!board)return;
 board.replaceChildren();if(!g)return;
 const bottom=bottomSide(),flip=bottom==='b';
 const ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?[...FILES].reverse():[...FILES];
 const legal=selected?g.moves({square:selected,verbose:true}).map(m=>m.to):[];
 const last=lastOf(),checkSq=g.in_check()?kingSquare(g,g.turn()):null,hh=anaCur();
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=g.get(sq),b=document.createElement('button');
  b.type='button';b.dataset.square=sq;b.className='vqc-vsm-cell '+((ri+fi)%2?'dark':'light');
  if(selected===sq)b.classList.add('selected');
  if(legal.includes(sq))b.classList.add('legal');
  if(last&&last.from===sq)b.classList.add('vqc-last-from');
  if(last&&last.to===sq)b.classList.add('vqc-last-to');
  if(hh&&hh.from===sq)b.classList.add('hint-from');
  if(hh&&hh.to===sq)b.classList.add('hint-to');
  if(checkSq===sq)b.classList.add('in-check');
  b.setAttribute('aria-label','Ô '+sq+(p?' '+(p.color==='w'?'trắng ':'đen ')+(PIECE[p.type]||''):''));
  if(p){
   const s=document.createElement('span');s.className='vqc-vsm-piece';
   if(typeof pieceSvgMarkup==='function')s.innerHTML=pieceSvgMarkup(p.color==='w'?p.type.toUpperCase():p.type);
   else s.textContent=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[p.color]||{})[p.type]||'';
   b.append(s);
  }
  if(fi===0){const t=document.createElement('span');t.className='vqc-vsm-rank';t.textContent=sq[1];b.append(t);}
  if(ri===7){const t=document.createElement('span');t.className='vqc-vsm-file';t.textContent=sq[0];b.append(t);}
  b.addEventListener('click',()=>reviewCell(sq));
  board.append(b);
 }
}
function paintPromotion(){
 const el=$('vqcVsmPromo');if(!el)return;
 el.replaceChildren();el.hidden=!promotion;if(!promotion)return;
 const t=document.createElement('p');t.textContent='Tốt phong cấp thành:';el.append(t);
 const row=document.createElement('div');row.className='vqc-vsm-promo-row';
 for(const k of ['q','r','b','n']){
  const b=document.createElement('button');b.type='button';b.dataset.promo=k;b.setAttribute('aria-label',PIECE[k]);
  const glyph=typeof pieceSvgMarkup==='function'?pieceSvgMarkup(promotion.side==='w'?k.toUpperCase():k):'';
  b.innerHTML='<span class="vqc-vsm-promo-piece">'+glyph+'</span><span>'+PIECE[k]+'</span>';
  b.addEventListener('click',()=>choosePromotion(k));row.append(b);
 }
 el.append(row);
}
function paintHistory(){
 const box=$('vqcVsmHistory');if(!box)return;
 const sans=mainSans();box.replaceChildren();
 if(!sans.length){const p=document.createElement('p');p.className='vqc-vsm-empty';p.textContent='Chưa có nước đi nào.';box.append(p);return;}
 const parts=review.rec.fen0.split(' '),startBlack=parts[1]==='b';
 let num=parseInt(parts[5],10);if(isNaN(num)||num<1)num=1;
 const rows=[];let i=0,n=num;
 if(startBlack){rows.push({n,w:'…',b:sans[0]});i=1;n++;}
 for(;i<sans.length;i+=2,n++)rows.push({n,w:sans[i],b:sans[i+1]||''});
 const last=review.ply-1;
 rows.forEach((r,ri)=>{
  const row=document.createElement('div');row.className='vqc-vsm-hrow';
  const a=document.createElement('span');a.className='vqc-vsm-hnum';a.textContent=r.n+'.';
  const w=document.createElement('span');w.textContent=r.w;const b=document.createElement('span');b.textContent=r.b;
  const wi=startBlack?(ri===0?-1:2*ri-1):2*ri,bi=startBlack?(ri===0?0:2*ri):2*ri+1;
  if(wi===last)w.className='cur';if(bi===last)b.className='cur';
  row.append(a,w,b);box.append(row);
 });
}
function paintPlayers(){
 const bottom=bottomSide(),top=otherSide(bottom),r=review.rec;
 const mk=(id,color)=>{
  const el=$(id);if(!el)return;
  const human=color===r.human;
  el.classList.remove('turn');
  el.querySelector('.vqc-vsm-avatar').textContent=human?(r.shared?'👥':'🙂'):'🤖';
  el.querySelector('.vqc-vsm-pname').textContent=human?(r.shared?'Cả lớp (giáo viên & học sinh)':'Người chơi'):'Máy Stockfish';
  el.querySelector('.vqc-vsm-pside').textContent=(color==='w'?'⚪ ':'⚫ ')+SIDE[color]+(human?'':(levelLabel(r.levelId)?' · '+levelLabel(r.levelId):''));
  el.querySelector('.vqc-vsm-turn').textContent='';
 };
 mk('vqcVsmTop',top);mk('vqcVsmBottom',bottom);
}
function kindText(r){return r.kind==='chernev'?'Cờ tàn Chernev · Bài '+r.num:(r.kind==='custom'?'Thế cờ tùy chọn':'Ván cờ đầy đủ luật');}
function resultText(r){return (r.result==='win'?(r.shared?'🏆 Cả lớp thắng':'🏆 Thắng'):r.result==='loss'?'😅 Máy thắng':'🤝 Hòa');}
function paint(){
 const ov=$('vqcVsMachineOverlay');if(!ov||!review)return;
 const teacher=isTeacher(),g=reviewGame(),r=review.rec;
 $('vqcVsmTitle').textContent='📚 Xem lại ván đấu với máy';
 $('vqcVsmSubtitle').textContent=kindText(r)+' · '+resultText(r)+(levelLabel(r.levelId)?' · Mức: '+levelLabel(r.levelId):'');
 const st=$('vqcVsmStatus');st.textContent=resultText(r)+(r.reason?' — '+r.reason:'');st.className='vqc-vsm-status '+r.result;
 const nt=$('vqcVsmNotice');nt.textContent=note;nt.hidden=!note;
 paintBoard(g);paintPromotion();paintHistory();paintPlayers();
 const n=r.moves.length;
 $('vqcVsrLabel').textContent='Nước '+review.ply+'/'+n;
 document.querySelectorAll('#vqcVsrBar button').forEach(b=>{b.disabled=!teacher;b.title=teacher?'':LOCK;});
 $('vqcVsrFlip').title=teacher?'Đảo bàn cờ (cả máy học sinh cũng đảo theo)':LOCK;
 const vm=review.vm||[],vb=$('vqcVsrVar');
 vb.hidden=!vm.length;
 if(vm.length){
  $('vqcVsrVarLine').textContent=(teacher?(review.by==='hs'?'Nước thử của HS: ':'Nước thử: '):(review.local?'Nước thử của em: ':(review.by==='hs'?'Nước thử của HS: ':'Nước thử của GV: ')))+varText();
  const bk=$('vqcVsrBack');bk.disabled=!teacher;bk.title=teacher?'':LOCK;
 }
 const ab=$('vqcVsrAna');
 ab.disabled=busy||!teacher;
 ab.title=teacher?'':LOCK;
 ab.textContent=busy?(engState==='loading'?'⏳ Đang tải Stockfish…':'⏳ Máy đang phân tích…'):'🤖 Máy phân tích thế cờ này';
 const cur=anaCur(),eb=$('vqcVsrEval');
 if(cur){
  eb.hidden=false;
  $('vqcVsrHintText').textContent='🤖 Máy chọn: '+(PIECE[cur.piece]||'quân')+' '+cur.from+' → '+cur.to+' ('+cur.san+')';
  $('vqcVsrEvalText').textContent=evalText(cur.ev);$('vqcVsrEvalFill').style.width=evalShare(cur.ev)+'%';$('vqcVsrEvalBar').hidden=!cur.ev;
 }else eb.hidden=true;
 syncUi();
}

function syncUi(){
 const ov=$('vqcVsMachineOverlay');if(!ov)return;
 const tabs=$('vqcVsrTabs');if(!tabs)return;
 const teacher=isTeacher();
 if(!teacher&&tab==='results')tab='game';
 const rt=tabs.querySelector('[data-tab="results"]'),gt=tabs.querySelector('[data-tab="game"]');
 rt.disabled=!teacher;rt.title=teacher?'':LOCK;
 const showRes=tab==='results'&&!review;
 gt.setAttribute('aria-selected',String(!showRes));rt.setAttribute('aria-selected',String(showRes));
 ov.classList.toggle('vsr-results-tab',showRes);
 ov.classList.toggle('vsr-reviewing',!!review);
 $('vqcVsrResults').hidden=!showRes;
 $('vqcVsrBar').hidden=!review;
 if(!review){$('vqcVsrVar').hidden=true;}
 const box=$('vqcVsrBox');if(box)box.hidden=!review;
}

function fmtDate(ms){
 if(!ms)return '';
 const d=new Date(ms),p=n=>(n<10?'0':'')+n;
 return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function paintResults(){
 const box=$('vqcVsrList');if(!box)return;
 const err=$('vqcVsrErr');if(err){err.textContent=remoteErr;err.hidden=!remoteErr;}
 if(!isTeacher()){box.replaceChildren();return;}
 const list=allResults();box.replaceChildren();
 if(!list.length){const p=document.createElement('p');p.className='vsr-empty';p.textContent='Chưa có ván nào được lưu. Ván đấu với máy kết thúc sẽ tự động lưu ở đây.';box.append(p);return;}
 for(const raw of list){
  const r=normRec(raw);if(!r)continue;
  const b=document.createElement('button');b.type='button';b.className='vsr-row '+r.result;b.dataset.id=r.id;
  const t=document.createElement('b');t.textContent=resultText(r)+' · '+kindText(r);
  const s=document.createElement('small');
  s.textContent=[fmtDate(r.endedAtMs),levelLabel(r.levelId)?'Mức: '+levelLabel(r.levelId):'',r.moves.length+' nước',r.reason].filter(Boolean).join(' · ');
  b.append(t,s);
  b.addEventListener('click',()=>openReview(r.id));
  box.append(b);
 }
}
function setTab(t){
 if(t==='results'&&!isTeacher())return;
 if(review&&t==='results')endReview();
 tab=t;
 if(t==='results'){loadRemote(true);flushOutbox();paintResults();}
 syncUi();
}

function vwRec(r){return {id:r.id,kind:r.kind,num:r.num,fen0:r.fen0,human:r.human,levelId:r.levelId,result:r.result,reason:r.reason,shared:r.shared,moves:r.moves.slice(0,1000)};}
function vwDesired(){
 const x=X();
 if(!x||!isTeacher()||!x.shared()||!x.open()||!review||!myUid())return null;
 return {teacherId:myUid(),ply:Math.max(0,Math.min(review.rec.moves.length,review.ply|0)),bottom:bottomSide(),marks:(review.marks||[]).slice(0,MAX_MARKS),vm:(review.vm||[]).slice(0,MAX_VM),by:review.by==='hs'?'hs':'gv',rec:vwRec(review.rec)};
}
function vwSigOf(o){return o?o.rec.id+'|'+o.ply+'|'+o.bottom+'|'+JSON.stringify(o.marks)+'|'+o.vm.join(',')+'|'+o.by:'';}
async function vwWrite(o){
 const x=X(),ref=x&&x.ref();if(!ref||typeof firebase==='undefined')return false;
 try{
  const body=o?{vsmView:Object.assign({},o,{at:firebase.firestore.FieldValue.serverTimestamp()})}:{vsmView:null};
  await ref.set(body,{merge:true});
  return true;
 }catch(e){console.info('Đấu với máy: chưa đồng bộ được phần xem lại sang máy học sinh:',e&&e.code||e);return false;}
}
function vwTick(){
 const x=X();if(!x||!isTeacher()||!x.shared())return;
 const now=Date.now(),want=vwDesired(),sig=want?vwSigOf(want):'';
 if(sig!==vwSig){vwSig=sig;vwSigAt=now;}
 if(vwBusy||now<vwRetryAt||now-vwSigAt<VW_DEBOUNCE)return;
 const r=vwRemote,mine=!!r&&r.teacherId===myUid();
 let go=false;
 if(want)go=sig!==vwLastSig||now-vwLastAt>=VW_REFRESH||(!mine&&now-vwLastAt>4000);
 else if(mine)go=now-vwLastAt>1500;
 else vwLastSig='';
 if(!go)return;
 vwBusy=true;
 vwWrite(want).then(ok=>{vwBusy=false;if(ok){vwLastSig=sig;vwLastAt=Date.now();}else vwRetryAt=Date.now()+8000;});
}
function normView(raw){
 if(!raw||typeof raw!=='object'||typeof Chess!=='function')return null;
 const rec=normRec(raw.rec);if(!rec)return null;
 const tid=String(raw.teacherId||'');if(!tid)return null;
 const marks=[];
 if(Array.isArray(raw.marks))for(const m of raw.marks.slice(0,MAX_MARKS)){
  if(m&&typeof m==='object'&&/^[a-h][1-8]$/.test(String(m.f))&&/^[a-h][1-8]$/.test(String(m.t))&&COLORS.includes(m.c))marks.push({k:m.k==='circle'?'circle':'arrow',f:m.f,t:m.t,c:m.c,...(m.n===true?{n:true}:{})});
 }
 const vm=Array.isArray(raw.vm)?raw.vm.filter(v=>typeof v==='string'&&UCI_RE.test(v)).slice(0,MAX_VM):[];
 return {teacherId:tid,ply:ci(raw.ply,0,rec.moves.length),vm,by:raw.by==='hs'?'hs':'gv',bottom:raw.bottom==='b'?'b':raw.bottom==='w'?'w':null,marks,rec};
}
function applyView(){
 const x=X();if(!x||!x.student())return;
 const v=x.shared()&&x.open()&&vwIn&&Date.now()-vwSeenAt<VW_TTL?vwIn:null;
 if(v){
  const k=v.rec.id+'|'+v.ply+'|'+v.bottom+'|'+JSON.stringify(v.marks)+'|'+v.vm.join(',');
  if(mirrorKey===k&&review)return;
  const first=!mirrored||!review||review.rec.id!==v.rec.id;
  mirrorKey=k;mirrored=true;
  const before=review&&!first?bottomSide():null;
  if(first)startReview(v.rec,{ply:v.ply,bottom:v.bottom||v.rec.human});else{review.ply=v.ply;if(v.bottom)review.bottom=v.bottom;}
  const pk=v.rec.id+'|'+v.ply+'|'+v.vm.join(',');
  if(first||review.posKey!==pk){
   const lv=(review.vm||[]).join(','),vv=v.vm.join(',');
   const mine=!first&&review.local&&v.ply===review.ply&&Date.now()-(review.localAt||0)<4000&&v.vm.length<(review.vm||[]).length&&(vv===''||lv.indexOf(vv)===0);
   if(!mine){review.posKey=pk;review.vm=v.vm.slice();review.local=false;review.by=v.by;review.ana=null;selected=null;promotion=null;}
  }else review.by=v.by;
  const after=bottomSide();
  if(before&&before!==after)rotateOwn();
  tab='game';
  annRemote(marksFromView(v.marks,after));
  paint();
 }else if(mirrored){
  mirrored=false;mirrorKey='';
  annRemote([]);
  endReview();
 }
}
function tyWant(){
 const x=X();
 if(!x||!x.student()||!x.shared()||!x.open()||!review||!mirrored||!review.local||!(review.vm||[]).length||!myUid())return null;
 return {rid:review.rec.id,ply:review.ply|0,vm:review.vm.slice(0,MAX_VM)};
}
function tyTick(){
 const x=X();if(!x||!x.student())return;
 const w=tyWant(),sig=w?w.rid+'|'+w.ply+'|'+w.vm.join(','):'',now=Date.now();
 if(sig!==tySig){tySig=sig;tySigAt=now;}
 if(!w){tyLastSig='';return;}
 if(sig===tyLastSig||tyBusy||now<tyRetryAt||now-tySigAt<200)return;
 const ref=x.ref();if(!ref||typeof firebase==='undefined')return;
 tyBusy=true;
 ref.set({vsmTry:{[myUid()]:Object.assign({},w,{at:firebase.firestore.FieldValue.serverTimestamp()})}},{merge:true})
  .then(()=>{tyBusy=false;tyLastSig=sig;})
  .catch(e=>{tyBusy=false;tyRetryAt=Date.now()+6000;console.info('Đấu với máy: chưa gửi được nước đi thử sang máy giáo viên:',e&&e.code||e);});
}
function tyApply(){
 if(!isTeacher()||!review||!tyRemote)return;
 const me=myUid();let best=null;
 for(const uid of Object.keys(tyRemote)){
  if(uid===me)continue;
  const e=tyRemote[uid];if(!e||typeof e!=='object')continue;
  const at=toMs(e.at);
  if(at==null||String(e.rid)!==review.rec.id||(e.ply|0)!==review.ply)continue;
  if(at<=(review.tyBase||0)||at<=(review.tyAt||0))continue;
  if(!best||at>best.at)best={at,vm:Array.isArray(e.vm)?e.vm.filter(v=>typeof v==='string'&&UCI_RE.test(v)).slice(0,MAX_VM):[]};
 }
 if(!best)return;
 review.tyAt=best.at;
 const vm=cleanVm(review.rec,review.ply,best.vm);
 if(!vm.length||vm.join(',')===(review.vm||[]).join(','))return;
 review.vm=vm;review.by='hs';review.ana=null;selected=null;promotion=null;annReset();paint();
}
function onDoc(d){
 vwRemote=d&&d.vsmView&&typeof d.vsmView==='object'?d.vsmView:null;
 tyRemote=d&&d.vsmTry&&typeof d.vsmTry==='object'?d.vsmTry:null;
 if(isStudent()){
  vwIn=vwRemote?normView(vwRemote):null;
  const key=vwRemote?String(toMs(vwRemote.at)||'')+'|'+(vwRemote.rec&&vwRemote.rec.id||''):'';
  if(key!==vwSeenKey){vwSeenKey=key;vwSeenAt=Date.now();}
  applyView();
 }
}
function tick(){
 const x=X();if(!x)return;
 if(review&&!x.open()){mirrored=false;mirrorKey='';endReview();}
 if(!x.open()&&tab!=='game'){tab='game';syncUi();}
 if(x.student()){applyView();tyTick();}
 else{vwTick();tyApply();}
}

function css(){
 if($('vqcVsrCss'))return;
 const s=document.createElement('style');s.id='vqcVsrCss';
 s.textContent='#vqcVsrTabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px}'+
  '#vqcVsrTabs button{min-height:42px;border:1px solid #bfdcf3;border-radius:12px;background:#eef7ff;color:#264c70;font:inherit;font-weight:800;cursor:pointer;padding:6px 10px}'+
  '#vqcVsrTabs button[aria-selected="true"]{background:#d9edff;border-color:#4b9be0;box-shadow:inset 0 0 0 1px #4b9be0}'+
  '#vqcVsrTabs button:disabled{opacity:.55;cursor:not-allowed}'+
  '#vqcVsrResults[hidden],#vqcVsrBar[hidden],#vqcVsrVar[hidden],#vqcVsrBox[hidden],#vqcVsrEval[hidden],#vqcVsrErr[hidden]{display:none}'+
  '#vqcVsrResults{display:grid;gap:8px}'+
  '#vqcVsrResults h3{margin:0;font-size:15px;color:#264c70}'+
  '#vqcVsrErr{margin:0;padding:8px 10px;border-radius:10px;background:#fff4d6;color:#6a4a00;font-size:13px;font-weight:700}'+
  '.vsr-row{display:grid;gap:2px;text-align:left;width:100%;border:1px solid #bfdcf3;border-radius:12px;background:#fff;color:#264c70;font:inherit;padding:9px 12px;cursor:pointer}'+
  '.vsr-row.win{border-left:5px solid #31985f}.vsr-row.loss{border-left:5px solid #df4848}.vsr-row.draw{border-left:5px solid #e5a400}'+
  '.vsr-row b{font-weight:800}.vsr-row small{font-weight:600;color:#5b7690;font-size:12.5px}'+
  '.vsr-empty{margin:6px 0;color:#5b7690;font-weight:650}'+
  '#vqcVsrRefresh{justify-self:start;min-height:36px;border:1px solid #bfdcf3;border-radius:10px;background:#eef7ff;color:#264c70;font:inherit;font-weight:750;cursor:pointer;padding:4px 12px}'+
  '.vsr-bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:7px;padding:6px 4px}'+
  '.vsr-bar button,.vsr-var button,#vqcVsrAna{min-height:40px;min-width:44px;border:1px solid #bfdcf3;border-radius:11px;background:#eef7ff;color:#264c70;font:inherit;font-weight:750;cursor:pointer;padding:4px 10px}'+
  '.vsr-bar span{font-weight:750;font-size:14px;color:#3d5e7c;min-width:84px;text-align:center}'+
  '.vsr-bar button:disabled,.vsr-var button:disabled,#vqcVsrAna:disabled{opacity:.55;cursor:not-allowed}'+
  '.vsr-var{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:4px 6px;font-weight:700;font-size:14px;color:#6a4a00}'+
  '.vsr-var button{background:#fff4d6;border-color:#f0c978;color:#6a4a00}'+
  '#vqcVsrBox{display:grid;gap:8px;margin:0 0 10px}#vqcVsrAna{width:100%}'+
  '#vqcVsrEval{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:#eef7ff;border:1px solid #bfdcf3;color:#264c70;font-weight:700}'+
  '#vqcVsrEval p{margin:0}#vqcVsrEvalBar{height:12px;border-radius:7px;background:#2d3b4a;overflow:hidden}#vqcVsrEvalBar span{display:block;height:100%;background:#fff;transition:width .3s}'+
  '#vqcVsMachineOverlay.vsr-results-tab .vqc-vsm-side>*:not(#vqcVsrTabs):not(#vqcVsrResults){display:none!important}'+
  '#vqcVsMachineOverlay.vsr-reviewing .vqc-vsm-controls,#vqcVsMachineOverlay.vsr-reviewing .vqc-vsm-setup,#vqcVsMachineOverlay.vsr-reviewing #vqcVsmRetry,#vqcVsMachineOverlay.vsr-reviewing #vqcVsmNextProblem,#vqcVsMachineOverlay.vsr-reviewing #vqcVsmLockNote,#vqcVsMachineOverlay.vsr-reviewing #vqcVsmEval{display:none!important}';
 document.head.appendChild(s);
}
function mount(){
 const ov=$('vqcVsMachineOverlay');if(!ov||$('vqcVsrTabs'))return !!$('vqcVsrTabs');
 const side=ov.querySelector('.vqc-vsm-side'),col=ov.querySelector('.vqc-vsm-boardcol');
 if(!side||!col)return false;
 css();
 const tabs=document.createElement('div');tabs.id='vqcVsrTabs';tabs.setAttribute('role','tablist');
 tabs.innerHTML='<button type="button" data-tab="game">▶ Ván đấu</button><button type="button" data-tab="results">📚 Kết quả ván đấu</button>';
 side.insertBefore(tabs,side.firstChild);
 const res=document.createElement('div');res.id='vqcVsrResults';res.hidden=true;
 res.innerHTML='<h3>📚 Kết quả ván đấu với máy</h3><button type="button" id="vqcVsrRefresh">↻ Làm mới</button><p id="vqcVsrErr" hidden></p><div id="vqcVsrList"></div>';
 tabs.insertAdjacentElement('afterend',res);
 const box=document.createElement('div');box.id='vqcVsrBox';box.hidden=true;
 box.innerHTML='<button type="button" id="vqcVsrAna">🤖 Máy phân tích thế cờ này</button><div id="vqcVsrEval" hidden><p id="vqcVsrHintText"></p><div id="vqcVsrEvalBar" aria-hidden="true"><span id="vqcVsrEvalFill"></span></div><p id="vqcVsrEvalText"></p></div>';
 const hw=side.querySelector('.vqc-vsm-histwrap');
 if(hw)side.insertBefore(box,hw);else side.appendChild(box);
 const bar=document.createElement('div');bar.id='vqcVsrBar';bar.className='vsr-bar';bar.hidden=true;
 bar.innerHTML='<button type="button" data-step="-Infinity" aria-label="Về đầu">⏮</button><button type="button" data-step="-1" aria-label="Lùi một nước">◀</button><span id="vqcVsrLabel"></span><button type="button" data-step="1" aria-label="Tiến một nước">▶</button><button type="button" data-step="Infinity" aria-label="Đến cuối">⏭</button><button type="button" id="vqcVsrFlip">🔄 Đảo bàn cờ</button><button type="button" id="vqcVsrExit">✕ Thoát xem lại</button>';
 const vr=document.createElement('div');vr.id='vqcVsrVar';vr.className='vsr-var';vr.hidden=true;
 vr.innerHTML='<span id="vqcVsrVarLine"></span><button type="button" id="vqcVsrBack">↩ Về thế cờ hiện tại</button>';
 col.append(bar,vr);
 tabs.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
 $('vqcVsrRefresh').addEventListener('click',()=>{loadRemote(true);flushOutbox();});
 bar.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{if(!isTeacher())return;reviewStep(Number(b.dataset.step));}));
 $('vqcVsrFlip').addEventListener('click',()=>{if(!isTeacher())return;flipReview();});
 $('vqcVsrExit').addEventListener('click',()=>{if(!isTeacher())return;endReview();});
 $('vqcVsrBack').addEventListener('click',()=>{if(!isTeacher())return;reviewBack();});
 $('vqcVsrAna').addEventListener('click',()=>{if(!isTeacher())return;analyse();});
 syncUi();
 return true;
}
function init(){
 mount();
 setInterval(()=>{mount();tick();},500);
 window.addEventListener('pagehide',disposeAnaEngine);
}
window.vqcVsmReview={version:VERSION,active:()=>!!review&&isOpen(),paint,onDoc,save,
 state:()=>({tab,review:review?{id:review.rec.id,ply:review.ply,vm:(review.vm||[]).slice(),bottom:review.bottom,marks:(review.marks||[]).slice(),by:review.by,local:review.local,n:review.rec.moves.length}:null}),
 _open:openReview,_end:endReview};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
