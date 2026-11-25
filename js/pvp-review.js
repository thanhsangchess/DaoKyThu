(function(){
'use strict';
if(window.vqcPvpReview)return;
const VERSION='20261125-pvr-v2';
const FILES='abcdefgh',UCI_RE=/^[a-h][1-8][a-h][1-8][qrbn]?$/,BOARD_ID='pvpBoard',OVERLAY_ID='pvpOverlay';
const HIST_CAP=200,VW_TTL=75000,VW_REFRESH=20000,VW_DEBOUNCE=250,MAX_VM=60,MAX_MARKS=40;
const START_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SIDE={w:'Trắng',b:'Đen'},PIECE={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};
const COLORS=['yellow','red','blue','green'];
const LOCK='Chức năng này đã bị khóa với học sinh';
const $=id=>document.getElementById(id);

let tab='game',review=null,note='',busy=false,anaEpoch=0,anaEngine=null,engState='idle';
let remoteRes=[],remoteErr='',remoteAt=0,remoteBusy=false,outboxBusy=false;
let promotion=null,selected=null,annOn=false;
let lOff=null,lCode='',lRetryAt=0;
let vwRemote=null,vwIn=null,vwSeenKey='',vwSeenAt=0,vwSig='',vwSigAt=0,vwLastSig='',vwLastAt=0,vwBusy=false,vwRetryAt=0,mirrorKey='',mirrored=false;
let tyRemote=null,tySig='',tySigAt=0,tyLastSig='',tyBusy=false,tyRetryAt=0;
const savedIds=new Set();

function ov(){return $(OVERLAY_ID);}
function isOpen(){const o=ov();return !!o&&o.classList.contains('open');}
function roleNow(){try{return typeof role!=='undefined'?role:'';}catch(e){return '';}}
function hasRoom(){try{return typeof roomRef!=='undefined'&&!!roomRef;}catch(e){return false;}}
function isStudent(){return hasRoom()&&roleNow()==='student';}
function isTeacher(){return roleNow()==='teacher';}
function shared(){return hasRoom()&&typeof db!=='undefined'&&!!db&&typeof firebase!=='undefined';}
function myUid(){
 try{if(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)return auth.currentUser.uid;}catch(e){}
 const p=window.accountProfile;return (p&&(p.uid||p.id))?String(p.uid||p.id):'';
}
function myName(){const p=window.accountProfile;return (p&&(p.name||p.code))?String(p.name||p.code):'Giáo viên';}
function roomCode(){try{return roomRef?String(roomRef.id||String(roomRef.path||'').split('/').pop()||''):'';}catch(e){return '';}}
function docRef(){const c=roomCode();return c&&shared()?db.collection('rooms').doc(c+'-pvr'):null;}
function toMs(v){return v&&typeof v.toMillis==='function'?v.toMillis():(typeof v==='number'&&isFinite(v)?v:null);}
function ci(v,a,b){v=Number(v);return isFinite(v)?Math.max(a,Math.min(b,Math.round(v))):a;}
function otherSide(c){return c==='w'?'b':'w';}
function parseUci(m){return typeof m==='string'&&UCI_RE.test(m)?{from:m.slice(0,2),to:m.slice(2,4),promotion:m[4]||undefined}:null;}

function readLS(k){try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function writeLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function histKey(){return 'vqc-pvp-hist-'+(myUid()||'guest');}
function outKey(){return 'vqc-pvp-out-'+(myUid()||'guest');}

function normRec(r){
 if(!r||typeof r!=='object'||typeof Chess!=='function')return null;
 const fen0=typeof r.fen0==='string'&&r.fen0?r.fen0:START_FEN;
 if(fen0.length>110||!new Chess().load(fen0))return null;
 const moves=Array.isArray(r.moves)?r.moves.filter(x=>typeof x==='string'&&UCI_RE.test(x)).slice(0,1000):[];
 return {id:String(r.id||('n-'+moves.length)).slice(0,80),fen0,teacherColor:r.teacherColor==='b'?'b':'w',
  winner:r.winner==='w'||r.winner==='b'?r.winner:null,reason:String(r.reason||'').slice(0,300),
  teacherName:String(r.teacherName||'').slice(0,80),teacherId:String(r.teacherId||'').slice(0,128),endedAtMs:toMs(r.endedAtMs)||null,moves};
}
function resultClass(r){return r.winner?(r.winner===r.teacherColor?'win':'loss'):'draw';}
function resultText(r){return r.winner?(r.winner===r.teacherColor?'🏆 Giáo viên thắng':'🏆 Học sinh thắng'):'🤝 Hòa';}
function kindText(r){return 'Đối kháng GV – HS · Giáo viên cầm '+SIDE[r.teacherColor];}

function keepLocal(rec){
 const list=readLS(histKey()).filter(r=>r&&r.id!==rec.id);list.unshift(rec);writeLS(histKey(),list.slice(0,HIST_CAP));
}
async function writeRemote(rec,queue){
 try{
  const ref=db.collection('pvpResults').doc(rec.id);
  const ex=await ref.get();
  if(!ex.exists)await ref.set(Object.assign({},rec,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
  dropOutbox(rec.id);remoteAt=0;remoteErr='';
  paintResults();
  return true;
 }catch(e){
  if(queue){
   const q=readLS(outKey()).filter(r=>r&&r.id!==rec.id);q.push(rec);writeLS(outKey(),q.slice(-200));
   remoteErr=(e&&e.code==='permission-denied')?'Chưa lưu được lên Firebase: cần đăng bản Rules mới có pvpResults. Kết quả được giữ trên máy này và sẽ gửi lại khi được phép.':'Chưa lưu được kết quả lên Firebase (mạng?) — đã giữ trên máy này và sẽ gửi lại.';
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
  const s=await db.collection('pvpResults').where('teacherId','==',myUid()).limit(500).get();
  remoteRes=s.docs.map(d=>Object.assign({id:d.id},d.data()));remoteErr='';remoteAt=Date.now();
 }catch(e){remoteErr=(e&&e.code==='permission-denied')?'Chưa đọc được kết quả từ Firebase (Rules chưa có pvpResults) — đang hiển thị các ván lưu trên máy này.':'Chưa tải được kết quả từ Firebase — đang hiển thị các ván lưu trên máy này.';}
 finally{remoteBusy=false;paintResults();}
}
function allResults(){
 const map=new Map();
 for(const r of remoteRes)map.set(r.id,r);
 for(const r of readLS(histKey()))if(r&&r.id&&!map.has(r.id))map.set(r.id,r);
 const me=myUid();
 return [...map.values()].filter(r=>r&&r.teacherId===me).sort((a,b)=>(toMs(b.endedAtMs)||0)-(toMs(a.endedAtMs)||0));
}
function checkSave(){
 if(!isTeacher()||!hasRoom()||!myUid())return;
 try{if(typeof pvpSending!=='undefined'&&pvpSending)return;}catch(e){}
 let d=null;try{d=typeof pvpData!=='undefined'?pvpData:null;}catch(e){}
 if(!d||d.status!=='finished'||!Array.isArray(d.moves)||!d.moves.length||!d.startedAt)return;
 const id=roomCode()+'-'+d.startedAt;
 if(savedIds.has(id))return;
 savedIds.add(id);
 if(readLS(histKey()).some(r=>r&&r.id===id))return;
 const m=/(Trắng|Đen) thắng/.exec(String(d.result||''));
 const rec={id,room:roomCode().slice(0,80),teacherId:myUid(),teacherName:myName().slice(0,80),teacherColor:d.teacherColor==='b'?'b':'w',fen0:START_FEN,
  winner:m?(m[1]==='Trắng'?'w':'b'):null,reason:String(d.result||'').slice(0,300),plies:d.moves.length,moves:d.moves.filter(x=>typeof x==='string').slice(0,1000),endedAtMs:Date.now()};
 keepLocal(rec);
 writeRemote(rec,true);
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
function bottomSide(){return review?(review.bottom||review.rec.teacherColor):'w';}

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
 const o=ov();if(o)o.classList.add('vpr-reviewing');
 const mount=annApi('vqcAnnotationsMount');if(mount)try{mount();}catch(e){}
 if(isTeacher()&&shared()){
  const reg=annApi('vqcAnnotationsAdapter');
  if(reg)try{annOn=!!reg(BOARD_ID,{publish:annPublish});}catch(e){annOn=false;}
 }
 annSetOwn([]);annRemote([]);
}
function rerender(){try{if(typeof renderPvp==='function')renderPvp();}catch(e){}}
function endReview(){
 if(!review)return;
 review=null;promotion=null;selected=null;note='';busy=false;anaEpoch++;
 disposeAnaEngine();
 const reg=annApi('vqcAnnotationsAdapter');
 if(annOn&&reg)try{reg(BOARD_ID,null);}catch(e){}
 annOn=false;
 annRemote([]);annSetOwn([]);
 const o=ov();if(o)o.classList.remove('vpr-reviewing');
 syncUi();
 rerender();
}
function startReview(rec,extra){
 const was=!!review;
 review=Object.assign({rec,ply:rec.moves.length,vm:[],bottom:rec.teacherColor,marks:[],by:'',local:false,ana:null,tyBase:tyMax()},extra||{});
 promotion=null;selected=null;note='';tab='game';
 if(!was)beginReview();
 syncUi();
 rerender();
}
function openReview(id){
 if(!isTeacher())return;
 const raw=allResults().find(r=>r.id===id);if(!raw)return;
 const rec=normRec(raw);if(!rec)return;
 startReview(rec);
}
function tyMax(){
 let m=0;
 if(tyRemote)for(const k of Object.keys(tyRemote)){const e=tyRemote[k];const at=e&&typeof e==='object'?toMs(e.at):null;if(at!=null&&at>m)m=at;}
 return m;
}
function touchReview(){if(review){review.tyBase=tyMax();review.by='';}}

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
function jump(ply){
 if(!review||!isTeacher())return;
 review.ply=Math.max(0,Math.min(review.rec.moves.length,ply|0));review.vm=[];review.local=false;review.ana=null;
 selected=null;promotion=null;touchReview();annReset();paint();
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
 const board=$(BOARD_ID);if(!board)return;
 board.innerHTML='';if(!g)return;
 const flip=bottomSide()==='b';
 const squares=[];for(let i=0;i<64;i++)squares.push('abcdefgh'[i%8]+(8-Math.floor(i/8)));
 if(flip)squares.reverse();
 const legal=selected?g.moves({square:selected,verbose:true}).map(m=>m.to):[];
 const last=lastOf(),checkSq=g.in_check()?kingSquare(g,g.turn()):null,hh=anaCur();
 squares.forEach((sq,i)=>{
  const pc=g.get(sq),cell=document.createElement('div');
  cell.dataset.square=sq;
  const f=sq.charCodeAt(0)-97,r=Number(sq[1]);
  cell.className='pvp-cell '+((f+r)%2?'dark':'light');
  if(sq===selected)cell.classList.add('selected');
  if(legal.includes(sq))cell.classList.add('legal');
  if(last&&last.from===sq)cell.classList.add('vqc-last-from');
  if(last&&last.to===sq)cell.classList.add('vqc-last-to');
  if(hh&&(hh.from===sq||hh.to===sq))cell.classList.add('vpr-hint');
  if(checkSq===sq)cell.classList.add('in-check');
  if(pc&&typeof CHESS_PIECE_IMAGES!=='undefined'){const key=pc.color+pc.type.toUpperCase();const img=document.createElement('img');img.src=CHESS_PIECE_IMAGES[key];img.alt=key;img.draggable=false;cell.appendChild(img);}
  if(i%8===0){const t=document.createElement('span');t.className='pvp-coord pvp-rank';t.textContent=sq[1];cell.appendChild(t);}
  if(i>=56){const t=document.createElement('span');t.className='pvp-coord pvp-file';t.textContent=sq[0];cell.appendChild(t);}
  cell.onclick=()=>reviewCell(sq);
  board.appendChild(cell);
 });
}
function paintPromotion(){
 const el=$('vqcPvrPromo');if(!el)return;
 el.replaceChildren();el.hidden=!promotion;if(!promotion)return;
 const t=document.createElement('span');t.textContent='Tốt phong cấp thành:';el.append(t);
 for(const k of ['q','r','b','n']){
  const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',PIECE[k]);
  const key=(promotion.side==='w'?'w':'b')+k.toUpperCase();
  if(typeof CHESS_PIECE_IMAGES!=='undefined'&&CHESS_PIECE_IMAGES[key]){const img=document.createElement('img');img.src=CHESS_PIECE_IMAGES[key];img.alt=PIECE[k];img.style.cssText='width:34px;height:34px';b.append(img);}
  else b.textContent=PIECE[k];
  b.addEventListener('click',()=>choosePromotion(k));el.append(b);
 }
}
function paintHistory(){
 const box=$('pvpHistory');if(!box)return;
 const sans=mainSans();box.replaceChildren();
 if(!sans.length){box.textContent='Chưa có nước đi.';return;}
 const parts=review.rec.fen0.split(' '),startBlack=parts[1]==='b';
 let num=parseInt(parts[5],10);if(isNaN(num)||num<1)num=1;
 const cur=review.ply-1;
 sans.forEach((s,i)=>{
  const sp=document.createElement('span');
  const whiteMove=startBlack?(i%2===1):(i%2===0);
  const n=startBlack?num+Math.floor((i+1)/2):num+Math.floor(i/2);
  sp.textContent=(whiteMove?n+'. ':(i===0?n+'… ':''))+s;
  sp.className='vpr-mv'+(i===cur?' cur':'');
  box.append(sp,document.createTextNode('  '));
 });
}
function paint(){
 const o=ov();if(!o||!review)return;
 const teacher=isTeacher(),g=reviewGame(),r=review.rec;
 const st=$('pvpStatus');if(st)st.textContent=resultText(r)+(r.reason?' — '+r.reason:'')+(note?'  ·  '+note:'');
 paintBoard(g);paintPromotion();paintHistory();
 const n=r.moves.length;
 $('vqcPvrLabel').textContent='Nước '+review.ply+'/'+n;
 document.querySelectorAll('#vqcPvrBar button').forEach(b=>{b.disabled=!teacher;b.title=teacher?'':LOCK;});
 $('vqcPvrFlip').title=teacher?'Đảo bàn cờ (cả máy học sinh cũng đảo theo)':LOCK;
 const vm=review.vm||[],vb=$('vqcPvrVar');
 vb.hidden=!vm.length;
 if(vm.length){
  $('vqcPvrVarLine').textContent=(teacher?(review.by==='hs'?'Nước thử của HS: ':'Nước thử: '):(review.local?'Nước thử của em: ':(review.by==='hs'?'Nước thử của HS: ':'Nước thử của GV: ')))+varText();
  const bk=$('vqcPvrBack');bk.disabled=!teacher;bk.title=teacher?'':LOCK;
 }
 const ab=$('vqcPvrAna');
 ab.hidden=!teacher;
 ab.disabled=busy||!teacher;ab.title=teacher?'':LOCK;
 ab.textContent=busy?(engState==='loading'?'⏳ Đang tải Stockfish…':'⏳ Máy đang phân tích…'):'🤖 Máy phân tích thế cờ này';
 const cur=anaCur(),eb=$('vqcPvrEval');
 if(cur){
  eb.hidden=false;
  $('vqcPvrHintText').textContent='🤖 Máy chọn: '+(PIECE[cur.piece]||'quân')+' '+cur.from+' → '+cur.to+' ('+cur.san+')';
  $('vqcPvrEvalText').textContent=evalText(cur.ev);$('vqcPvrEvalFill').style.width=evalShare(cur.ev)+'%';$('vqcPvrEvalBar').hidden=!cur.ev;
 }else eb.hidden=true;
 syncUi();
}

function syncUi(){
 const o=ov(),tabs=$('vqcPvrTabs');if(!o||!tabs)return;
 const teacher=isTeacher();
 if(!teacher&&tab==='results')tab='game';
 const rt=tabs.querySelector('[data-tab="results"]'),gt=tabs.querySelector('[data-tab="game"]');
 rt.disabled=!teacher;rt.title=teacher?'':LOCK;
 const showRes=tab==='results'&&!review;
 gt.setAttribute('aria-selected',String(!showRes));rt.setAttribute('aria-selected',String(showRes));
 o.classList.toggle('vpr-results-tab',showRes);
 o.classList.toggle('vpr-reviewing',!!review);
 $('vqcPvrResults').hidden=!showRes;
 const box=$('vqcPvrBox');if(box)box.hidden=!review;
 if(!review){const v=$('vqcPvrVar');if(v)v.hidden=true;const p=$('vqcPvrPromo');if(p)p.hidden=true;}
}
function fmtDate(ms){
 if(!ms)return '';
 const d=new Date(ms),p=n=>(n<10?'0':'')+n;
 return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function paintResults(){
 const box=$('vqcPvrList');if(!box)return;
 const err=$('vqcPvrErr');if(err){err.textContent=remoteErr;err.hidden=!remoteErr;}
 if(!isTeacher()){box.replaceChildren();return;}
 const list=allResults();box.replaceChildren();
 if(!list.length){const p=document.createElement('p');p.className='vpr-empty';p.textContent='Chưa có ván nào được lưu. Ván đối kháng kết thúc sẽ tự động lưu ở đây.';box.append(p);return;}
 for(const raw of list){
  const r=normRec(raw);if(!r)continue;
  const b=document.createElement('button');b.type='button';b.className='vpr-row '+resultClass(r);b.dataset.id=r.id;
  const t=document.createElement('b');t.textContent=resultText(r)+' · '+kindText(r);
  const s=document.createElement('small');
  s.textContent=[fmtDate(r.endedAtMs),r.moves.length+' nước',r.reason].filter(Boolean).join(' · ');
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

function vwRec(r){return {id:r.id,fen0:r.fen0,teacherColor:r.teacherColor,winner:r.winner,reason:r.reason,teacherName:r.teacherName,moves:r.moves.slice(0,1000)};}
function vwDesired(){
 if(!isTeacher()||!shared()||!isOpen()||!review||!myUid())return null;
 return {teacherId:myUid(),ply:Math.max(0,Math.min(review.rec.moves.length,review.ply|0)),bottom:bottomSide(),marks:(review.marks||[]).slice(0,MAX_MARKS),vm:(review.vm||[]).slice(0,MAX_VM),by:review.by==='hs'?'hs':'gv',rec:vwRec(review.rec)};
}
function vwSigOf(o){return o?o.rec.id+'|'+o.ply+'|'+o.bottom+'|'+JSON.stringify(o.marks)+'|'+o.vm.join(',')+'|'+o.by:'';}
async function vwWrite(o){
 const ref=docRef();if(!ref)return false;
 try{
  const body=o?{pvrView:Object.assign({},o,{at:firebase.firestore.FieldValue.serverTimestamp()})}:{pvrView:null};
  await ref.set(body,{merge:true});
  return true;
 }catch(e){console.info('Đối kháng: chưa đồng bộ được phần xem lại sang máy học sinh:',e&&e.code||e);return false;}
}
function vwTick(){
 if(!isTeacher()||!shared())return;
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
 if(!isStudent())return;
 const v=shared()&&isOpen()&&vwIn&&Date.now()-vwSeenAt<VW_TTL?vwIn:null;
 if(v){
  const k=v.rec.id+'|'+v.ply+'|'+v.bottom+'|'+JSON.stringify(v.marks)+'|'+v.vm.join(',');
  if(mirrorKey===k&&review)return;
  const first=!mirrored||!review||review.rec.id!==v.rec.id;
  mirrorKey=k;mirrored=true;
  const before=review&&!first?bottomSide():null;
  if(first)startReview(v.rec,{ply:v.ply,bottom:v.bottom||v.rec.teacherColor});else{review.ply=v.ply;if(v.bottom)review.bottom=v.bottom;}
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
 if(!isStudent()||!shared()||!isOpen()||!review||!mirrored||!review.local||!(review.vm||[]).length||!myUid())return null;
 return {rid:review.rec.id,ply:review.ply|0,vm:review.vm.slice(0,MAX_VM)};
}
function tyTick(){
 if(!isStudent())return;
 const w=tyWant(),sig=w?w.rid+'|'+w.ply+'|'+w.vm.join(','):'',now=Date.now();
 if(sig!==tySig){tySig=sig;tySigAt=now;}
 if(!w){tyLastSig='';return;}
 if(sig===tyLastSig||tyBusy||now<tyRetryAt||now-tySigAt<200)return;
 const ref=docRef();if(!ref)return;
 tyBusy=true;
 ref.set({pvrTry:{[myUid()]:Object.assign({},w,{at:firebase.firestore.FieldValue.serverTimestamp()})}},{merge:true})
  .then(()=>{tyBusy=false;tyLastSig=sig;})
  .catch(e=>{tyBusy=false;tyRetryAt=Date.now()+6000;console.info('Đối kháng: chưa gửi được nước đi thử sang máy giáo viên:',e&&e.code||e);});
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
 vwRemote=d&&d.pvrView&&typeof d.pvrView==='object'?d.pvrView:null;
 tyRemote=d&&d.pvrTry&&typeof d.pvrTry==='object'?d.pvrTry:null;
 if(isStudent()){
  vwIn=vwRemote?normView(vwRemote):null;
  const key=vwRemote?String(toMs(vwRemote.at)||'')+'|'+(vwRemote.rec&&vwRemote.rec.id||''):'';
  if(key!==vwSeenKey){vwSeenKey=key;vwSeenAt=Date.now();}
  applyView();
 }
}
function listen(){
 const want=isOpen()&&shared()?roomCode():'';
 if(want===lCode)return;
 if(want&&Date.now()<lRetryAt)return;
 if(lOff){try{lOff();}catch(e){}lOff=null;}
 lCode=want;vwRemote=null;tyRemote=null;vwIn=null;
 if(!want)return;
 const ref=docRef();if(!ref){lCode='';return;}
 try{
  lOff=ref.onSnapshot(s=>{if(lCode!==want)return;onDoc(s&&s.exists?s.data():null);},()=>{lOff=null;if(lCode===want){lCode='';lRetryAt=Date.now()+8000;}});
 }catch(e){lOff=null;lCode='';lRetryAt=Date.now()+8000;}
}
function tick(){
 if(review&&!isOpen()){mirrored=false;mirrorKey='';endReview();}
 if(!isOpen()&&tab!=='game'){tab='game';syncUi();}
 listen();
 checkSave();
 if(isStudent()){applyView();tyTick();}
 else{vwTick();tyApply();}
}

function css(){
 if($('vqcPvrCss'))return;
 const s=document.createElement('style');s.id='vqcPvrCss';
 s.textContent='#vqcPvrTabs{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
  '#pvpOverlay #vqcPvrTabs button{min-height:40px;border:1px solid #bfdcf3;border-radius:12px;background:#eef7ff;color:#264c70;font:inherit;font-weight:800;cursor:pointer;padding:6px 10px;width:auto}'+
  '#pvpOverlay #vqcPvrTabs button[aria-selected="true"]{background:#d9edff;border-color:#4b9be0;box-shadow:inset 0 0 0 1px #4b9be0}'+
  '#pvpOverlay #vqcPvrTabs button:disabled{opacity:.55;cursor:not-allowed}'+
  '#vqcPvrResults[hidden],#vqcPvrBox[hidden],#vqcPvrVar[hidden],#vqcPvrEval[hidden],#vqcPvrErr[hidden],#vqcPvrPromo[hidden]{display:none}'+
  '#vqcPvrResults{display:grid;gap:8px}#vqcPvrResults h3{margin:0;font-size:15px;color:#264c70}'+
  '#vqcPvrErr{margin:0;padding:8px 10px;border-radius:10px;background:#fff4d6;color:#6a4a00;font-size:13px;font-weight:700}'+
  '#pvpOverlay .vpr-row{display:grid;gap:2px;text-align:left;width:100%;border:1px solid #bfdcf3;border-radius:12px;background:#fff;color:#264c70;font:inherit;padding:9px 12px;cursor:pointer}'+
  '.vpr-row.win{border-left:5px solid #31985f}.vpr-row.loss{border-left:5px solid #df4848}.vpr-row.draw{border-left:5px solid #e5a400}'+
  '.vpr-row b{font-weight:800}.vpr-row small{font-weight:600;color:#5b7690;font-size:12.5px}.vpr-empty{margin:6px 0;color:#5b7690;font-weight:650}'+
  '#pvpOverlay #vqcPvrRefresh{justify-self:start;min-height:36px;border:1px solid #bfdcf3;border-radius:10px;background:#eef7ff;color:#264c70;font:inherit;font-weight:750;cursor:pointer;padding:4px 12px;width:auto}'+
  '#vqcPvrBox{display:grid;gap:8px}'+
  '.vpr-bar{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px}'+
  '#pvpOverlay .vpr-bar button,#pvpOverlay .vpr-var button,#pvpOverlay #vqcPvrAna,#pvpOverlay #vqcPvrPromo button{min-height:38px;min-width:42px;border:1px solid #bfdcf3;border-radius:11px;background:#eef7ff;color:#264c70;font:inherit;font-weight:750;cursor:pointer;padding:4px 9px;width:auto}'+
  '#pvpOverlay #vqcPvrAna{width:100%}'+
  '.vpr-bar span{font-weight:750;font-size:14px;color:#3d5e7c;min-width:80px;text-align:center}'+
  '#pvpOverlay .vpr-bar button:disabled,#pvpOverlay .vpr-var button:disabled,#pvpOverlay #vqcPvrAna:disabled{opacity:.55;cursor:not-allowed}'+
  '.vpr-var{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;font-weight:700;font-size:14px;color:#6a4a00}'+
  '#pvpOverlay .vpr-var button{background:#fff4d6;border-color:#f0c978;color:#6a4a00}'+
  '#vqcPvrPromo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-weight:700;color:#264c70}'+
  '#vqcPvrEval{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:#eef7ff;border:1px solid #bfdcf3;color:#264c70;font-weight:700}'+
  '#vqcPvrEval p{margin:0}#vqcPvrEvalBar{height:12px;border-radius:7px;background:#2d3b4a;overflow:hidden}#vqcPvrEvalBar span{display:block;height:100%;background:#fff;transition:width .3s}'+
  '.vpr-mv.cur{background:#ffe08a;border-radius:6px;padding:0 3px;font-weight:800}.pvp-cell.vpr-hint{box-shadow:inset 0 0 0 4px #31985f}'+
  '#pvpOverlay .pvp-side>#vqcPvrTabs,#pvpOverlay .pvp-side>#vqcPvrResults,#pvpOverlay .pvp-side>#vqcPvrBox{grid-column:1/-1}'+
  '#pvpOverlay.vpr-results-tab .pvp-side>*:not(#vqcPvrTabs):not(#vqcPvrResults){display:none!important}'+
  '#pvpOverlay.vpr-reviewing .pvp-side>label,#pvpOverlay.vpr-reviewing .pvp-side>select,#pvpOverlay.vpr-reviewing .pvp-side>button,#pvpOverlay.vpr-reviewing .pvp-side>small{display:none!important}';
 document.head.appendChild(s);
}
function mount(){
 const o=ov();if(!o)return false;
 if($('vqcPvrTabs'))return true;
 const side=o.querySelector('.pvp-side');if(!side)return false;
 css();
 const tabs=document.createElement('div');tabs.id='vqcPvrTabs';tabs.setAttribute('role','tablist');
 tabs.innerHTML='<button type="button" data-tab="game">▶ Ván đấu</button><button type="button" data-tab="results">📚 Kết quả ván đấu</button>';
 side.insertBefore(tabs,side.firstChild);
 const res=document.createElement('div');res.id='vqcPvrResults';res.hidden=true;
 res.innerHTML='<h3>📚 Kết quả ván đối kháng</h3><button type="button" id="vqcPvrRefresh">↻ Làm mới</button><p id="vqcPvrErr" hidden></p><div id="vqcPvrList"></div>';
 tabs.insertAdjacentElement('afterend',res);
 const box=document.createElement('div');box.id='vqcPvrBox';box.hidden=true;
 box.innerHTML='<div id="vqcPvrBar" class="vpr-bar"><button type="button" data-step="-Infinity" aria-label="Về đầu">⏮</button><button type="button" data-step="-1" aria-label="Lùi một nước">◀</button><span id="vqcPvrLabel"></span><button type="button" data-step="1" aria-label="Tiến một nước">▶</button><button type="button" data-step="Infinity" aria-label="Đến cuối">⏭</button></div>'+
  '<div class="vpr-bar"><button type="button" id="vqcPvrFlip">🔄 Đảo bàn cờ</button><button type="button" id="vqcPvrExit">✕ Thoát xem lại</button></div>'+
  '<div id="vqcPvrVar" class="vpr-var" hidden><span id="vqcPvrVarLine"></span><button type="button" id="vqcPvrBack">↩ Về thế cờ hiện tại</button></div>'+
  '<div id="vqcPvrPromo" hidden></div>'+
  '<button type="button" id="vqcPvrAna">🤖 Máy phân tích thế cờ này</button>'+
  '<div id="vqcPvrEval" hidden><p id="vqcPvrHintText"></p><div id="vqcPvrEvalBar" aria-hidden="true"><span id="vqcPvrEvalFill"></span></div><p id="vqcPvrEvalText"></p></div>';
 res.insertAdjacentElement('afterend',box);
 tabs.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
 $('vqcPvrRefresh').addEventListener('click',()=>{loadRemote(true);flushOutbox();});
 box.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{if(!isTeacher())return;reviewStep(Number(b.dataset.step));}));
 $('vqcPvrFlip').addEventListener('click',()=>{if(!isTeacher())return;flipReview();});
 $('vqcPvrExit').addEventListener('click',()=>{if(!isTeacher())return;endReview();});
 $('vqcPvrBack').addEventListener('click',()=>{if(!isTeacher())return;reviewBack();});
 $('vqcPvrAna').addEventListener('click',()=>{if(!isTeacher())return;analyse();});
 syncUi();
 return true;
}
function init(){
 mount();
 setInterval(()=>{mount();tick();},500);
 window.addEventListener('pagehide',disposeAnaEngine);
}
window.vqcPvpReview={version:VERSION,active:()=>!!review&&isOpen(),paint,jump,
 info:()=>review?{rec:review.rec,ply:review.ply,teacher:isTeacher(),vm:(review.vm||[]).length}:null,
 state:()=>({tab,review:review?{id:review.rec.id,ply:review.ply,vm:(review.vm||[]).slice(),bottom:review.bottom,marks:(review.marks||[]).slice(),by:review.by,local:review.local,n:review.rec.moves.length}:null}),
 _open:openReview,_end:endReview};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
