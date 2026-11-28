(function(){
'use strict';
if(window.vqcEloClass)return;
const FILES='abcdefgh';
const LIMITS=[[0,'Không giới hạn'],[60,'1 phút'],[120,'2 phút'],[180,'3 phút'],[300,'5 phút'],[600,'10 phút']];
const MAIN_THEMES=['mateIn1','mateIn2','mateIn3','fork','pin','skewer','discoveredAttack','hangingPiece','backRankMate','promotion','trappedPiece','sacrifice','defensiveMove','endgame','middlegame','opening'];
const DONE=['solved','failed'];

let view='';
let unsubs=[];
let timers=[];
let rosterDoc=[];
let roster=[],statsMap=new Map(),rosterLoaded=false;
let cfg={min:600,max:1000,themes:new Set(),pick:null,pickMode:'random',hints:true,limit:180,list:null,listTotal:0};
let live=null;
let pointerTick=0,lastPointer='';
let ending=false;

function S(){return window.vqcEloPuzzles&&window.vqcEloPuzzles.shared;}
function $(id){return document.getElementById(id);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function myUid(){try{return auth.currentUser.uid;}catch(e){return '';}}
function host(){return $('vqcEloTeacherHost');}
function themeName(t){const m=S().THEME_VI;return m[t]||t;}
function stopAll(){
 if(live&&live.watch)closeDetail();
 unsubs.forEach(function(u){try{u();}catch(e){}});unsubs=[];
 timers.forEach(clearInterval);timers=[];
}
function roomCode(){try{return typeof room!=='undefined'&&room?String(room):'';}catch(e){return '';}}

function showHost(v){
 const h=host();if(!h)return null;
 stopAll();
 view=v;
 h.hidden=false;
 const dlg=h.closest('.vqc-elo-dialog');if(dlg)dlg.classList.add('vqc-elo-teachermode');
 h.replaceChildren();
 const bar=el('div','vqc-elo-tabs');
 const isT=S().role()==='teacher';
 const t1=el('button','vqc-elo-tab'+(v==='table'?' on':''),'🏆 Bảng xếp hạng');
 const t2=el('button','vqc-elo-tab'+(v==='session'?' on':''),'🎯 Cả lớp cùng một câu');
 const back=el('button','vqc-elo-tab back','← Về luyện tập');
 [t1,t2,back].forEach(function(b){b.type='button';});
 t1.addEventListener('click',openTable);
 t2.addEventListener('click',openSession);
 back.addEventListener('click',hide);
 if(isT)bar.append(t1,t2,back);else bar.append(t1,back);
 h.append(bar);
 const body=el('div','vqc-elo-tbody');
 h.append(body);
 return body;
}
function hide(){
 stopAll();view='';live=null;
 const h=host();
 if(h){h.hidden=true;h.replaceChildren();const dlg=h.closest('.vqc-elo-dialog');if(dlg)dlg.classList.remove('vqc-elo-teachermode');}
}

async function loadRoster(){
 const snap=await db.collection('users').where('role','==','student').where('teacherId','==',myUid()).limit(300).get();
 roster=snap.docs.map(function(d){const x=d.data()||{};return {uid:d.id,name:String(x.name||x.code||'Học sinh'),classCode:String(x.classCode||''),code:String(x.code||'')};});
 rosterLoaded=true;
 syncRosterDoc();
}
function syncRosterDoc(){
 try{
  const me=myUid();if(!me)return;
  const list=roster.map(function(r){return {u:r.uid,n:r.name.slice(0,60)};}).slice(0,500);
  const key=JSON.stringify(list);
  const ref=db.collection('eloRosters').doc(me);
  ref.get().then(function(d){
   const cur=d.exists&&Array.isArray(d.data().students)?JSON.stringify(d.data().students):'';
   if(cur===key)return null;
   return ref.set({teacherId:me,students:list,updatedAt:Date.now()});
  }).catch(function(){});
 }catch(e){}
}
async function loadRosterDoc(owner){
 try{
  const d=await db.collection('eloRosters').doc(owner).get();
  rosterDoc=d.exists&&Array.isArray(d.data().students)?d.data().students.filter(function(x){return x&&typeof x.u==='string';}):[];
 }catch(e){rosterDoc=[];}
}
async function loadStatsOnce(){
 const snap=await db.collection('eloStats').where('teacherId','==',myUid()).limit(500).get();
 statsMap=new Map();
 snap.docs.forEach(function(d){statsMap.set(d.id,d.data());});
}
function filtered(){return roster;}
function agoText(ms){
 if(!ms)return 'Chưa luyện';
 const d=Math.floor((Date.now()-ms)/86400000);
 if(d<=0)return 'Hôm nay';
 if(d===1)return 'Hôm qua';
 return d+' ngày trước';
}
function spark(values){
 const v=(values||[]).slice(-20);
 if(v.length<2)return '';
 const w=84,h=24,pad=2;
 const lo=Math.min.apply(null,v),hi=Math.max.apply(null,v),span=Math.max(10,hi-lo);
 const pts=v.map(function(x,i){return (pad+i*(w-2*pad)/(v.length-1)).toFixed(1)+','+(h-pad-(x-lo)*(h-2*pad)/span).toFixed(1);});
 return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" aria-hidden="true"><polyline fill="none" stroke="#2878cc" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="'+pts.join(' ')+'"/></svg>';
}

function tableRows(){
 let base;
 if(S().role()==='teacher'){
  base=filtered().map(function(r){return {uid:r.uid,name:r.name,st:statsMap.get(r.uid)};});
 }else{
  const seen=new Set();
  base=[];
  statsMap.forEach(function(st,uid){
   if(st&&st.role==='student'){seen.add(uid);base.push({uid:uid,name:String(st.name||st.code||'Học sinh'),st:st});}
  });
  rosterDoc.forEach(function(x){
   if(!seen.has(x.u)){seen.add(x.u);base.push({uid:x.u,name:String(x.n||'Học sinh'),st:null});}
  });
 }
 const rows=base.map(function(r){
  const st=r.st;
  const games=st?st.games|0:0;
  return {
   uid:r.uid,name:r.name,played:games>0,rank:null,
   elo:st?st.elo:null,games:games,solved:st?st.solved|0:0,
   acc:games>0?Math.round(100*(st.solved|0)/games):null,
   streak:st?st.streak|0:0,last:st?st.lastAt||0:0,history:st?st.history:null
  };
 });
 const ranked=rows.filter(function(r){return r.played;});
 const cmp=function(a,b){return b.elo-a.elo||b.acc-a.acc;};
 ranked.forEach(function(r){r.rank=1+ranked.filter(function(o){return cmp(o,r)<0;}).length;});
 rows.sort(function(a,b){
  if(a.played!==b.played)return a.played?-1:1;
  if(a.played)return cmp(a,b)||a.name.localeCompare(b.name,'vi');
  return a.name.localeCompare(b.name,'vi');
 });
 return rows;
}
function csvDownload(rows){
 const head=['Hạng','Họ và tên','Elo','Số câu','Chính xác %','Chuỗi'];
 const lines=[head].concat(rows.map(function(r){return [r.rank==null?'':r.rank,r.name,r.elo==null?'':r.elo,r.games,r.acc==null?'':r.acc,r.streak];}));
 const csv='﻿'+lines.map(function(l){return l.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
 const a=document.createElement('a');
 a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 a.download='bang-xep-hang.csv';
 document.body.append(a);a.click();
 setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}
const MEDALS={1:'🥇',2:'🥈',3:'🥉'};
function paintTable(box){
 box.replaceChildren();
 const isT=S().role()==='teacher';
 const rows=tableRows();
 const played=rows.filter(function(r){return r.played;});
 const avg=played.length?Math.round(played.reduce(function(s,r){return s+r.elo;},0)/played.length):null;
 const top=el('div','vqc-elo-toolbar');
 const sum=el('div','vqc-elo-summary');
 const cards=isT?[['Học sinh',rows.length],['Đã luyện',played.length],['Elo trung bình',avg==null?'—':avg]]:[['Số bạn có hạng',played.length],['Elo trung bình',avg==null?'—':avg]];
 if(!isT){
  const mine=rows.filter(function(r){return r.uid===myUid();})[0];
  cards.unshift(['Hạng của em',mine&&mine.rank!=null?'Hạng '+mine.rank+'/'+played.length:'Chưa có']);
 }
 cards.forEach(function(p){
  const c=el('div','vqc-elo-sumcard');c.append(el('span','',p[0]),el('b','',String(p[1])));sum.append(c);
 });
 top.append(sum);
 if(isT){
  const csv=el('button','vqc-elo-btn','⬇ Tải CSV');csv.type='button';
  csv.addEventListener('click',function(){csvDownload(rows);});
  top.append(csv);
 }
 box.append(top);
 if(!rows.length){box.append(el('p','vqc-elo-empty',isT?'Thầy/cô chưa có học sinh nào trong danh sách lớp.':'Chưa có bạn nào luyện câu đố. Em hãy là người đầu tiên nhé!'));return;}
 const wrap=el('div','vqc-elo-tablewrap');
 const table=el('table','vqc-elo-table vqc-elo-lb');
 const cols=[['rank','Hạng','c-rank'],['name','Họ và tên','c-name'],['elo','Elo','c-num'],['games','Số câu','c-num'],['acc','Chính xác','c-num'],['streak','Chuỗi','c-num'],['trend','Xu hướng','c-spark'],['last','Gần nhất','c-last']];
 const thead=el('thead'),tr=el('tr');
 cols.forEach(function(c){tr.append(el('th',c[2],c[1]));});
 thead.append(tr);table.append(thead);
 const tbody=el('tbody');
 rows.forEach(function(r){
  const cls=(r.played?'':'idle')+(r.rank&&r.rank<=3?' top'+r.rank:'')+(!isT&&r.uid===myUid()?' me':'');
  const row=el('tr',cls.trim());
  const rk=el('td','rank c-rank');
  if(r.rank!=null){
   const m=MEDALS[r.rank];
   if(m)rk.append(el('span','medal',m));
   rk.append(el('span','rk','Hạng '+r.rank));
  }else rk.textContent='—';
  const nm=el('td','name c-name',r.name);
  if(!isT&&r.uid===myUid())nm.append(el('small','mine',' (em)'));
  row.append(rk,nm,el('td','num c-num',r.played?String(r.elo):'—'),el('td','num c-num',String(r.games)),el('td','num c-num',r.acc==null?'—':r.acc+'%'),el('td','num c-num',r.played?String(r.streak):'—'));
  const t=el('td','spark c-spark');t.innerHTML=r.played?spark(r.history):'';row.append(t);
  row.append(el('td','c-last',agoText(r.last)));
  tbody.append(row);
 });
 table.append(tbody);wrap.append(table);box.append(wrap);
 box.append(el('p','vqc-elo-note','Xếp hạng theo điểm Elo; nếu bằng Elo thì xét độ chính xác. Các bạn chưa luyện câu đố chưa có hạng.'));
}
function myTeacherId(){
 try{return String(window.accountProfile.teacherId||'');}catch(e){return '';}
}
async function openTable(){
 const box=showHost('table');if(!box)return;
 box.append(el('p','vqc-elo-empty','Đang tải bảng xếp hạng…'));
 const my=view;
 const isT=S().role()==='teacher';
 const owner=isT?myUid():myTeacherId();
 if(!owner){box.replaceChildren(el('p','vqc-elo-empty','Tài khoản của em chưa thuộc lớp nào nên chưa có bảng xếp hạng.'));return;}
 if(isT){
  try{
   await loadRoster();
   await loadStatsOnce();
  }catch(e){
   if(view!==my)return;
   box.replaceChildren(el('p','vqc-elo-empty vqc-elo-err','Không tải được bảng xếp hạng: '+S().errText(e)));
   return;
  }
  if(view!==my)return;
  paintTable(box);
 }
 try{
  let q=db.collection('eloStats').where('teacherId','==',owner);
  if(!isT)q=q.where('role','==','student');
  if(!isT)await loadRosterDoc(owner);
  if(view!==my)return;
  const off=q.limit(500).onSnapshot(function(snap){
   if(view!=='table')return;
   statsMap=new Map();snap.docs.forEach(function(d){statsMap.set(d.id,d.data());});
   paintTable(box);
  },function(e){
   if(view!=='table'||isT)return;
   box.replaceChildren(el('p','vqc-elo-empty vqc-elo-err','Không tải được bảng xếp hạng: '+S().errText(e)));
  });
  unsubs.push(off);
 }catch(e){}
}

function boardOf(g,color,hl,bad){
 const flip=color==='b';
 const ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?FILES.split('').reverse():FILES.split('');
 const b=el('div','vqc-elo-mini');
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=g.get(sq);
  const c=el('div','vqc-elo-minicell '+((ri+fi)%2?'dark':'light'));
  if(hl&&hl.indexOf(sq)>=0)c.classList.add('last');
  if(bad&&bad.indexOf(sq)>=0)c.classList.add('bad');
  if(p){
   const code=p.color==='w'?p.type.toUpperCase():p.type;
   const s=el('span','vqc-elo-minipiece');
   if(typeof pieceSvgMarkup==='function')s.innerHTML=pieceSvgMarkup(code);
   else s.textContent=({K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'})[code];
   c.append(s);
  }
  b.append(c);
 }
 return b;
}
function miniBoard(fen,firstMove,color){
 const g=new Chess();
 g.load(fen);
 if(firstMove)g.move({from:firstMove.slice(0,2),to:firstMove.slice(2,4),promotion:firstMove.length>4?firstMove[4]:undefined});
 return boardOf(g,color,firstMove?[firstMove.slice(0,2),firstMove.slice(2,4)]:null,null);
}
function positionOf(puzzle,pl){
 const g=new Chess();
 g.load(puzzle.fen);
 const total=puzzle.moves.length;
 let n=1;
 if(pl)n=(pl.status==='solved'||pl.status==='failed')?total:Math.max(1,Math.min(total,pl.idx||1));
 let lastU=null;
 for(let i=0;i<n;i++){
  const u=puzzle.moves[i];
  if(!g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined}))break;
  lastU=u;
 }
 const bad=pl&&pl.status==='active'&&pl.last&&pl.last.ok===false&&pl.last.f&&pl.last.t?[pl.last.f,pl.last.t]:null;
 return {g:g,last:lastU?[lastU.slice(0,2),lastU.slice(2,4)]:null,bad:bad};
}
function positionBoard(puzzle,pl){
 const pos=positionOf(puzzle,pl);
 return boardOf(pos.g,puzzle.color,pos.last,pos.bad);
}
function solutionText(puzzle){
 const g=new Chess();
 g.load(puzzle.fen);
 const out=[];
 puzzle.moves.forEach(function(u,i){
  const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});
  if(i>0&&m)out.push(m.san);
 });
 return out.join('  ');
}

function eloOptions(sel,from,to,cur){
 for(let v=from;v<=to;v+=100){const o=el('option','',String(v));o.value=String(v);sel.append(o);}
 sel.value=String(cur);
}
function paintPickList(box){
 box.replaceChildren();
 if(!cfg.list)return;
 box.append(el('p','vqc-elo-note','Có '+cfg.listTotal+' câu phù hợp'+(cfg.listTotal>cfg.list.length?' — đang hiện '+cfg.list.length+' câu ngẫu nhiên.':'.')));
 const list=el('div','vqc-elo-picklist');
 cfg.list.forEach(function(p){
  const row=el('button','vqc-elo-pickrow'+(cfg.pick&&cfg.pick.id===p.id?' on':''));row.type='button';
  row.append(el('b','',String(p.rating)),el('span','',(p.color==='w'?'Trắng':'Đen')+' đi'),el('span','vqc-elo-pickthemes',p.themes.filter(function(t){return S().THEME_VI[t];}).slice(0,3).map(themeName).join(' · ')));
  row.addEventListener('click',function(){cfg.pick=p;cfg.pickMode='pick';paintSetupPick();});
  list.append(row);
 });
 box.append(list);
}
let setupRefs=null;
function paintSetupPick(){
 if(!setupRefs)return;
 paintPickList(setupRefs.list);
 setupRefs.prev.replaceChildren();
 if(cfg.pick){
  setupRefs.prev.append(miniBoard(cfg.pick.fen,cfg.pick.moves[0],cfg.pick.color));
  setupRefs.prev.append(el('p','vqc-elo-note','Câu đã chọn: Elo '+cfg.pick.rating+' — '+(cfg.pick.color==='w'?'Trắng':'Đen')+' đi.'));
 }
 setupRefs.random.checked=cfg.pickMode==='random';
 setupRefs.chosen.checked=cfg.pickMode==='pick';
 setupRefs.chosen.disabled=!cfg.pick;
}
async function browse(){
 const st=setupRefs.status;
 st.textContent='Đang tìm câu đố…';
 try{
  const r=await S().call('eloSessionBrowse',{minElo:cfg.min,maxElo:cfg.max,themes:Array.from(cfg.themes)});
  cfg.list=r.items||[];cfg.listTotal=r.total||0;
  if(cfg.pick&&!cfg.list.some(function(p){return p.id===cfg.pick.id;})){}
  st.textContent=cfg.listTotal?'':'Không có câu nào khớp bộ lọc. Hãy nới khoảng Elo hoặc bỏ bớt chủ đề.';
  paintSetupPick();
 }catch(e){st.textContent=S().errText(e);}
}
async function renderSetup(box){
 box.replaceChildren();
 if(!rosterLoaded){try{await loadRoster();}catch(e){}}
 try{await loadStatsOnce();}catch(e){}
 if(view!=='session')return;
 box.replaceChildren();
 const code=roomCode();
 box.append(el('p','vqc-elo-lead','Chọn câu đố rồi bấm bắt đầu: tất cả học sinh đang ở trong phòng lớp sẽ tự nhận cùng một câu trên máy của mình.'));
 if(!code)box.append(el('p','vqc-elo-empty vqc-elo-err','Thầy/cô cần tạo phòng lớp học trước (mục Vào lớp), học sinh vào phòng sẽ tự nhận câu đố.'));
 const form=el('div','vqc-elo-form');
 const r1=el('div','vqc-elo-formrow');
 const fmin=el('label','vqc-elo-field');fmin.append(el('span','','Elo từ'));const smin=el('select');eloOptions(smin,400,1900,cfg.min);fmin.append(smin);
 const fmax=el('label','vqc-elo-field');fmax.append(el('span','','đến'));const smax=el('select');eloOptions(smax,500,2000,cfg.max);fmax.append(smax);
 smin.addEventListener('change',function(){cfg.min=+smin.value;if(cfg.max<cfg.min){cfg.max=cfg.min+100;smax.value=String(Math.min(2000,cfg.max));cfg.max=+smax.value;}cfg.list=null;cfg.pick=null;cfg.pickMode='random';paintSetupPick();});
 smax.addEventListener('change',function(){cfg.max=+smax.value;if(cfg.min>cfg.max){cfg.min=cfg.max-100;smin.value=String(Math.max(400,cfg.min));cfg.min=+smin.value;}cfg.list=null;cfg.pick=null;cfg.pickMode='random';paintSetupPick();});
 const played=Array.from(statsMap.values()).filter(function(s){return s.role==='student'&&s.games>0;});
 r1.append(fmin,fmax);
 if(played.length){
  const avg=Math.round(played.reduce(function(s,x){return s+x.elo;},0)/played.length);
  const b=el('button','vqc-elo-btn','Theo Elo trung bình lớp ('+avg+')');b.type='button';
  b.addEventListener('click',function(){
   const lo=Math.max(400,Math.min(1900,Math.round((avg-150)/100)*100));
   const hi=Math.max(lo+100,Math.min(2000,Math.round((avg+150)/100)*100));
   cfg.min=lo;cfg.max=hi;smin.value=String(lo);smax.value=String(hi);cfg.list=null;cfg.pick=null;cfg.pickMode='random';paintSetupPick();
  });
  r1.append(b);
 }
 form.append(r1);
 const thWrap=el('div','vqc-elo-formrow col');
 thWrap.append(el('span','vqc-elo-flabel','Chủ đề chiến thuật (bỏ trống = mọi chủ đề)'));
 const chips=el('div','vqc-elo-chiprow');
 MAIN_THEMES.forEach(function(t){
  const c=el('button','vqc-elo-pick'+(cfg.themes.has(t)?' on':''),themeName(t));c.type='button';
  c.addEventListener('click',function(){if(cfg.themes.has(t))cfg.themes.delete(t);else cfg.themes.add(t);c.classList.toggle('on',cfg.themes.has(t));cfg.list=null;cfg.pick=null;cfg.pickMode='random';paintSetupPick();});
  chips.append(c);
 });
 thWrap.append(chips);form.append(thWrap);
 const pw=el('div','vqc-elo-formrow col');
 pw.append(el('span','vqc-elo-flabel','Câu đố'));
 const rl=el('label','vqc-elo-radio');const rr=el('input');rr.type='radio';rr.name='vqcEloPick';rr.checked=cfg.pickMode==='random';rl.append(rr,document.createTextNode(' Ngẫu nhiên theo bộ lọc'));
 const cl=el('label','vqc-elo-radio');const cr=el('input');cr.type='radio';cr.name='vqcEloPick';cr.checked=cfg.pickMode==='pick';cr.disabled=!cfg.pick;cl.append(cr,document.createTextNode(' Chọn một câu cụ thể'));
 rr.addEventListener('change',function(){if(rr.checked)cfg.pickMode='random';});
 cr.addEventListener('change',function(){if(cr.checked)cfg.pickMode='pick';});
 const bb=el('button','vqc-elo-btn','🔍 Xem các câu phù hợp');bb.type='button';
 bb.addEventListener('click',browse);
 const status=el('span','vqc-elo-fstatus');
 pw.append(rl,cl,bb,status);
 const list=el('div','vqc-elo-pickwrap');
 const prev=el('div','vqc-elo-pickprev');
 pw.append(list,prev);
 form.append(pw);
 setupRefs={list:list,prev:prev,random:rr,chosen:cr,status:status};
 const r3=el('div','vqc-elo-formrow');
 const hl=el('label','vqc-elo-radio');const hc=el('input');hc.type='checkbox';hc.checked=cfg.hints;hl.append(hc,document.createTextNode(' Cho phép gợi ý'));
 hc.addEventListener('change',function(){cfg.hints=hc.checked;});
 const fl=el('label','vqc-elo-field');fl.append(el('span','','Thời gian'));const sl=el('select');
 LIMITS.forEach(function(l){const o=el('option','',l[1]);o.value=String(l[0]);sl.append(o);});
 sl.value=String(cfg.limit);sl.addEventListener('change',function(){cfg.limit=+sl.value;});fl.append(sl);
 r3.append(hl,fl);
 form.append(r3);
 const go=el('button','vqc-elo-btn primary','▶ Bắt đầu cho cả lớp');go.type='button';
 go.disabled=!code;
 go.addEventListener('click',function(){startSession(go);});
 form.append(go);
 box.append(form);
 paintSetupPick();
}
async function startSession(btn){
 const code=roomCode();
 if(!code){S().notify('Hãy tạo phòng lớp học trước.');return;}
 btn.disabled=true;btn.textContent='Đang gửi câu đố cho cả lớp…';
 const payload={nonce:S().newNonce(),room:code,minElo:cfg.min,maxElo:cfg.max,themes:Array.from(cfg.themes),hints:cfg.hints,timeLimitSec:cfg.limit};
 if(cfg.pickMode==='pick'&&cfg.pick)payload.puzzleId=cfg.pick.id;
 try{
  const r=await S().call('eloSessionCreate',payload);
  if(view!=='session')return;
  S().notify('Đã gửi câu đố cho cả lớp.','success');
  renderLive(r);
 }catch(e){
  btn.disabled=false;btn.textContent='▶ Bắt đầu cho cả lớp';
  S().notify(S().errText(e));
 }
}

function playerLabel(p){
 if(!p)return {t:'— Chưa mở',k:'none',o:5};
 if(p.status==='active')return {t:'✏️ Đang làm',k:'active',o:4};
 if(p.status==='solved')return p.clean?{t:'✅ Đúng ngay',k:'ok',o:1}:{t:'✔️ Đúng (có sai/gợi ý)',k:'ok2',o:2};
 if(p.status==='failed')return {t:'🏳️ Xem đáp án',k:'fail',o:3};
 return {t:'⏱ Hết giờ',k:'exp',o:3};
}
function paintLive(){
 if(!live||view!=='session')return;
 const c=live.refs;
 const players=live.players;
 const rows=[];
 players.forEach(function(p,uid){
  const r=roster.find(function(x){return x.uid===uid;});
  rows.push(r||{uid:uid,name:String(p.name||'Học sinh'),classCode:String(p.classCode||''),code:''});
 });
 let done=0,working=0,none=0;
 rows.forEach(function(r){
  const p=players.get(r.uid);
  if(p.status==='active')working++;else done++;
 });
 c.counts.textContent=rows.length?'Đã xong '+done+'/'+rows.length+' • đang làm '+working:'Chưa có học sinh nào nhận câu đố. Học sinh vào phòng lớp sẽ tự nhận.';
 c.body.replaceChildren();
 const list=rows.map(function(r){return {r:r,p:players.get(r.uid)};});
 list.sort(function(a,b){return playerLabel(a.p).o-playerLabel(b.p).o||a.r.name.localeCompare(b.r.name,'vi');});
 list.forEach(function(x){
  const l=playerLabel(x.p);
  const tr=el('tr','st-'+l.k);
  tr.append(el('td','name',x.r.name),el('td','',x.r.classCode||'—'),el('td','',l.t));
  tr.append(el('td','num',x.p?String(x.p.mistakes||0):'—'),el('td','num',x.p?String(x.p.hintLevel||0):'—'));
  const secs=x.p&&x.p.doneAt&&x.p.startedAt&&x.p.status!=='expired'?Math.max(0,Math.round((x.p.doneAt-x.p.startedAt)/1000))+' giây':'—';
  tr.append(el('td','num',secs));
  const wt=el('td','');
  if(x.p){const vb=el('button','vqc-elo-btn mini','👁 Xem');vb.type='button';vb.addEventListener('click',function(){openWatch(x.r.uid);});wt.append(vb);}
  tr.append(wt);
  c.body.append(tr);
 });
 if(!list.length){const tr=el('tr');const td=el('td','vqc-elo-empty','Chưa có học sinh nào trong lớp nhận câu đố.');td.colSpan=7;tr.append(td);c.body.append(tr);}
 pushCounts(done,rows.length);
 paintExtra(list,done,working,none,rows.length);
}
function pushCounts(done,total){
 if(!live||live.ended)return;
 const key=live.sid+':'+done+':'+total;
 if(key===lastPointer)return;
 const now=Date.now();
 if(now-pointerTick<3000){
  clearTimeout(live.pt);
  live.pt=setTimeout(function(){pushCounts(done,total);},3200-(now-pointerTick));
  return;
 }
 pointerTick=now;lastPointer=key;
 try{
  if(typeof roomRef!=='undefined'&&roomRef)roomRef.update({'eloSession.done':done,'eloSession.total':total}).catch(function(){});
 }catch(e){}
}
function clockLabel(){
 const s=live.session;
 if(live.ended)return 'Đã kết thúc';
 if(s.endsAt==null)return 'Không giới hạn thời gian';
 const rem=Math.max(0,Math.ceil((s.endsAt-(Date.now()+live.offset))/1000));
 return '⏱ Còn '+Math.floor(rem/60)+':'+(rem%60<10?'0':'')+(rem%60);
}
async function endSession(auto){
 if(!live||ending)return;
 ending=true;
 try{
  await S().call('eloSessionEnd',{sid:live.sid});
  live.ended=true;
  if(!auto)S().notify('Đã kết thúc câu đố của cả lớp.','success');
 }catch(e){S().notify(S().errText(e));}
 ending=false;
 if(live&&view==='session'){live.refs.clock.textContent=clockLabel();live.refs.end.disabled=true;live.refs.again.hidden=false;}
}
function svgNode(cls){
 const n=document.createElementNS('http://www.w3.org/2000/svg','svg');
 n.setAttribute('viewBox','0 0 800 800');n.setAttribute('class','vqc-elo-ink '+cls);n.setAttribute('aria-hidden','true');
 return n;
}
function cardKey(p){return p?[p.status,p.idx,p.mistakes,p.hintLevel,p.last?p.last.f+p.last.t+p.last.ok:''].join('|'):'none';}
function paintExtra(list){
 if(!live)return;
 if(live.mode==='gallery')paintGallery(list);
 else if(live.mode==='detail')paintDetail();
}
function paintGallery(list){
 const box=live.refs.galGrid;
 live.refs.galCounts.textContent=live.refs.counts.textContent;
 const keep=new Set(),nodes=[];
 list.forEach(function(x){
  const uid=x.r.uid;keep.add(uid);
  const key=cardKey(x.p)+'|'+x.r.name+'|'+(x.r.classCode||'');
  let c=live.cards.get(uid);
  if(!c||c.key!==key){
   const l=playerLabel(x.p);
   const card=el('button','vqc-elo-card2 st-'+l.k);card.type='button';
   const head=el('div','vqc-elo-card2head');
   head.append(el('b','',x.r.name),el('span','',x.r.classCode||''));
   card.append(head);
   if(x.p)card.append(positionBoard(live.puzzle,x.p));
   else card.append(el('div','vqc-elo-card2empty','Chưa mở câu đố'));
   card.append(el('div','vqc-elo-card2foot',l.t+(x.p?' • sai '+(x.p.mistakes||0)+' • gợi ý '+(x.p.hintLevel||0):'')));
   if(x.p)card.addEventListener('click',function(){openWatch(uid);});else card.disabled=true;
   c={key:key,node:card};live.cards.set(uid,c);
  }
  nodes.push(c.node);
 });
 Array.from(live.cards.keys()).forEach(function(k){if(!keep.has(k))live.cards.delete(k);});
 box.replaceChildren.apply(box,nodes);
}
function setMode(m){
 if(!live)return;
 if(live.mode==='detail'&&m!=='detail')closeDetail();
 live.mode=m;
 const r=live.refs,w=live.watch;
 r.grid.hidden=m!=='table';r.gal.hidden=m!=='gallery';r.det.hidden=m!=='detail';
 r.tabs.table.classList.toggle('on',m==='table');
 r.tabs.gallery.classList.toggle('on',m==='gallery'||(m==='detail'&&!!w&&!!w.uid));
 r.tabs.all.classList.toggle('on',m==='detail'&&!!w&&!w.uid);
 if(m==='detail')buildDetail();
 paintLive();
}
function openWatch(uid){
 if(!live)return;
 live.watch={uid:uid||null,target:uid?'one':'all',sid:live.sid,pending:{one:null,all:null},timers:{},cur:{one:'',all:''},ed:null,refs:null,key:''};
 setMode('detail');
}
function inkError(e){
 if(e&&e.code==='not-found')return 'Em này chưa mở câu đố nên chưa vẽ riêng được. Hãy chọn "Cả lớp".';
 if(e&&e.code==='permission-denied')return 'Chưa có quyền ghi nét vẽ. Cần cập nhật luật Firestore (Rules) mới nhất.';
 return 'Chưa gửi được nét vẽ. Hãy kiểm tra mạng rồi vẽ lại.';
}
function writeInk(w,target){
 const str=w.pending[target];
 if(str==null)return;
 w.pending[target]=null;
 clearTimeout(w.timers[target]);
 const sdoc=db.collection('eloSessions').doc(w.sid);
 const ref=target==='one'?sdoc.collection('players').doc(w.uid):sdoc;
 Promise.resolve(ref.update({ink:str})).catch(function(e){S().notify(inkError(e));});
}
function queueInk(w,target,str){
 w.cur[target]=str;
 if(target==='all'&&live&&live.sid===w.sid)live.classInk=str;
 w.pending[target]=str;
 clearTimeout(w.timers[target]);
 w.timers[target]=setTimeout(function(){writeInk(w,target);},180);
 paintBase(w);
}
function paintBase(w){
 if(!w.refs||!window.vqcEloInk)return;
 const other=w.target==='one'?'all':'one';
 window.vqcEloInk.render(w.refs.base,window.vqcEloInk.parse(w.cur[other]),live&&live.puzzle.color==='b');
}
function closeDetail(){
 const w=live&&live.watch;
 if(!w)return;
 try{writeInk(w,'one');writeInk(w,'all');}catch(e){}
 if(w.ed){try{w.ed.destroy();}catch(e){}w.ed=null;}
 w.refs=null;
 live.watch=null;
}
function detailStatus(w){
 if(!w.uid)return 'Đây là thế cờ ban đầu của câu đố. Nét vẽ hiện trên bàn cờ của mọi học sinh trong phiên này.';
 const pl=live.players.get(w.uid);
 if(!pl)return 'Em này chưa mở câu đố.';
 const l=playerLabel(pl);
 let t=l.t+' • sai '+(pl.mistakes||0)+' • gợi ý '+(pl.hintLevel||0);
 if(pl.last&&pl.status==='active')t+=' • nước vừa chọn '+pl.last.f+'→'+pl.last.t+(pl.last.ok?' (đúng)':' (sai)');
 return t;
}
function paintDetail(){
 const w=live&&live.watch;
 if(!w||live.mode!=='detail'||!w.refs)return;
 const pl=w.uid?live.players.get(w.uid):null;
 const key=cardKey(pl);
 if(key!==w.key){
  w.key=key;
  w.refs.bh.replaceChildren(positionBoard(live.puzzle,pl));
 }
 w.refs.stat.textContent=detailStatus(w);
}
function buildDetail(){
 const w=live.watch,det=live.refs.det;
 det.replaceChildren();
 const I=window.vqcEloInk;
 if(!w)return;
 if(!I){det.append(el('p','vqc-elo-empty','Chưa tải được công cụ vẽ. Hãy tải lại trang (Ctrl+F5).'));return;}
 const r=w.uid?roster.find(function(x){return x.uid===w.uid;}):null;
 const flip=live.puzzle.color==='b';
 w.cur={one:w.uid?String((live.players.get(w.uid)||{}).ink||''):'',all:String(live.classInk||'')};
 const head=el('div','vqc-elo-detailhead');
 const back=el('button','vqc-elo-btn','← Danh sách');back.type='button';
 back.addEventListener('click',function(){setMode(w.uid?'gallery':'table');});
 const stat=el('span','vqc-elo-detailstat');
 head.append(back,el('b','vqc-elo-detailtitle',w.uid?'Màn hình của '+(r?r.name:'học sinh'):'Vẽ lên màn hình cả lớp'),stat);
 const body=el('div','vqc-elo-detailbody');
 const stage=el('div','vqc-elo-stage');
 const bh=el('div','vqc-elo-stageboard');
 const base=svgNode('base'),edit=svgNode('edit');
 stage.append(bh,base,edit);
 const side=el('div','vqc-elo-drawside');
 w.refs={bh:bh,stat:stat,base:base,edit:edit};
 w.ed=I.editor(edit,{initial:w.cur[w.target],flip:flip,onChange:function(str){queueInk(w,w.target,str);}});
 if(w.uid){
  const tg=el('div','vqc-elo-drawrow');
  const one=el('button','vqc-elo-btn tgl','👤 Chỉ em này'),all=el('button','vqc-elo-btn tgl','👥 Cả lớp');
  [one,all].forEach(function(b){b.type='button';});
  const sync=function(){one.classList.toggle('on',w.target==='one');all.classList.toggle('on',w.target==='all');};
  const pick=function(t){w.target=t;w.ed.setShapes(w.cur[t]);paintBase(w);sync();};
  one.addEventListener('click',function(){pick('one');});
  all.addEventListener('click',function(){pick('all');});
  sync();tg.append(one,all);
  side.append(el('p','vqc-elo-drawlabel','Vẽ cho:'),tg);
 }
 side.append(el('p','vqc-elo-drawhelp','Vẽ bằng chuột phải như các chế độ khác: kéo từ ô này sang ô khác để vẽ mũi tên, bấm một ô để khoanh tròn (bấm lại để bỏ). Màu mặc định là vàng; giữ Shift = đỏ, Ctrl = xanh dương, Alt = xanh lá. Bấm chuột trái vào bàn cờ để xoá hết. Học sinh thấy nét vẽ ngay trên bàn cờ của mình nhưng không vẽ lại được.'));
 body.append(stage,side);
 det.append(head,body);
 paintBase(w);
 w.key='';
 paintDetail();
}

function renderLive(info){
 const box=showHost('session');if(!box)return;
 const sid=info.sid,s=info.session,p=info.puzzle;
 live={sid:sid,session:s,puzzle:p,offset:(Number(info.serverNow)||Date.now())-Date.now(),players:new Map(),ended:s.status!=='active',refs:null,pt:0,mode:'table',watch:null,classInk:String(s.ink||''),cards:new Map()};
 lastPointer='';
 const top=el('div','vqc-elo-livetop');
 const info1=el('div','vqc-elo-liveinfo');
 info1.append(el('b','','Câu đố đang gửi cho cả lớp'),el('span','','Elo câu: '+p.rating+' • '+(p.color==='w'?'Trắng':'Đen')+' đi • '+(s.hints?'cho gợi ý':'không gợi ý')),el('span','',p.themes.filter(function(t){return S().THEME_VI[t];}).slice(0,3).map(themeName).join(' · ')));
 const clock=el('div','vqc-elo-liveclock',clockLabel());
 const end=el('button','vqc-elo-btn','⏹ Kết thúc');end.type='button';
 end.addEventListener('click',function(){endSession(false);});
 const again=el('button','vqc-elo-btn primary','🎯 Câu đố mới');again.type='button';again.hidden=!live.ended;
 again.addEventListener('click',function(){closeDetail();live=null;stopAll();showSetup();});
 top.append(info1,clock,end,again);
 box.append(top);
 const modes=el('div','vqc-elo-modes');
 const mTable=el('button','vqc-elo-btn tgl on','📋 Bảng kết quả'),mGal=el('button','vqc-elo-btn tgl','🖥 Màn hình học sinh'),mAll=el('button','vqc-elo-btn tgl','✏️ Vẽ cho cả lớp');
 [mTable,mGal,mAll].forEach(function(b){b.type='button';});
 mTable.addEventListener('click',function(){setMode('table');});
 mGal.addEventListener('click',function(){setMode('gallery');});
 mAll.addEventListener('click',function(){openWatch(null);});
 modes.append(mTable,mGal,mAll);
 box.append(modes);
 const grid=el('div','vqc-elo-livegrid');
 const left=el('div','vqc-elo-liveleft');
 left.append(miniBoard(p.fen,p.moves[0],p.color));
 const sol=el('p','vqc-elo-solution');sol.hidden=true;sol.textContent='Đáp án: '+solutionText(p);
 const tg=el('button','vqc-elo-btn','👁 Hiện đáp án');tg.type='button';
 tg.addEventListener('click',function(){sol.hidden=!sol.hidden;tg.textContent=sol.hidden?'👁 Hiện đáp án':'🙈 Ẩn đáp án';});
 left.append(tg,sol);
 const right=el('div','vqc-elo-liveright');
 const toolbar=el('div','vqc-elo-toolbar');
 const counts=el('span','vqc-elo-livecounts');toolbar.append(counts);
 right.append(toolbar);
 const wrap=el('div','vqc-elo-tablewrap');
 const table=el('table','vqc-elo-table');
 const thead=el('thead'),tr=el('tr');
 ['Học sinh','Lớp','Trạng thái','Sai','Gợi ý','Thời gian','Màn hình'].forEach(function(h){tr.append(el('th','',h));});
 thead.append(tr);table.append(thead);
 const body=el('tbody');table.append(body);wrap.append(table);right.append(wrap);
 grid.append(left,right);box.append(grid);
 const gal=el('div','vqc-elo-gallery');gal.hidden=true;
 const galBar=el('div','vqc-elo-toolbar');
 const galCounts=el('span','vqc-elo-livecounts');galBar.append(galCounts);
 const galGrid=el('div','vqc-elo-galgrid');
 gal.append(galBar,galGrid);box.append(gal);
 const det=el('div','vqc-elo-detail');det.hidden=true;box.append(det);
 live.refs={clock:clock,end:end,again:again,counts:counts,body:body,grid:grid,gal:gal,det:det,galGrid:galGrid,galCounts:galCounts,tabs:{table:mTable,gallery:mGal,all:mAll}};
 end.disabled=live.ended;
 (async function(){
  if(!rosterLoaded){try{await loadRoster();}catch(e){}}
  if(!live||live.sid!==sid||view!=='session')return;
  paintLive();
  try{
   unsubs.push(db.collection('eloSessions').doc(sid).collection('players').where('teacherId','==',myUid()).onSnapshot(function(snap){
    if(!live||live.sid!==sid)return;
    live.players=new Map();snap.docs.forEach(function(d){live.players.set(d.id,d.data());});
    paintLive();
   },function(){}));
   unsubs.push(db.collection('eloSessions').doc(sid).onSnapshot(function(snap){
    if(!live||live.sid!==sid||!snap.exists)return;
    if(!(live.watch&&live.watch.pending&&live.watch.pending.all!=null))live.classInk=String(snap.data().ink||'');
    if(snap.data().status!=='active'&&!live.ended){live.ended=true;live.refs.end.disabled=true;live.refs.again.hidden=false;}
    live.refs.clock.textContent=clockLabel();
   },function(){}));
  }catch(e){}
 })();
 timers.push(setInterval(function(){
  if(!live||view!=='session')return;
  live.refs.clock.textContent=clockLabel();
  if(!live.ended&&live.session.endsAt!=null&&Date.now()+live.offset>live.session.endsAt+1500)endSession(true);
 },500));
}
async function showSetup(){
 const box=showHost('session');if(!box)return;
 await renderSetup(box);
}
async function openSession(){
 const box=showHost('session');if(!box)return;
 box.append(el('p','vqc-elo-empty','Đang kiểm tra phiên câu đố…'));
 const my=view;
 try{
  const snap=await db.collection('eloSessions').where('teacherId','==',myUid()).where('status','==','active').limit(3).get();
  if(view!==my)return;
  const act=snap.docs.map(function(d){return d.data();}).filter(function(s){return s.endsAt==null||Date.now()<s.endsAt+5000;}).sort(function(a,b){return b.startedAt-a.startedAt;})[0];
  if(act){
   const info=await S().call('eloSessionGet',{sid:act.id});
   if(view!==my)return;
   renderLive({sid:act.id,session:info.session,puzzle:info.puzzle,serverNow:info.serverNow});
   return;
  }
 }catch(e){}
 if(view!==my)return;
 await renderSetup(box);
}

function activeLive(){return !!(live&&!live.ended&&view==='session');}
function endActive(){
 if(!live||live.ended||ending||view!=='session')return Promise.resolve(false);
 const sid=live.sid;
 ending=true;
 return S().call('eloSessionEnd',{sid:sid}).then(function(){S().notify('Đã kết thúc câu đố của cả lớp.','success');return true;},function(e){S().notify(S().errText(e));return false;}).then(function(r){ending=false;return r;});
}
window.vqcEloClass={openTable:openTable,openSession:openSession,hide:hide,activeLive:activeLive,endActive:endActive,version:'20261126-elo-v5'};
})();
