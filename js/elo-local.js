(function(){
'use strict';
const isNode=typeof module==='object'&&module&&typeof module.exports==='object';
const root=typeof window!=='undefined'?window:globalThis;
const SCRIPT_SRC=(typeof document!=='undefined'&&document.currentScript&&document.currentScript.src)||'';

const START_ELO=600;
const MIN_ELO=200;
const MAX_ELO=2200;
const SQ=/^[a-h][1-8]$/;
const NONCE=/^[A-Za-z0-9]{10,40}$/;
const ROOM=/^[A-Za-z0-9_-]{1,40}$/;
const PUZZLE_ID=/^[A-Za-z0-9]{3,12}$/;
const RESUME_MS=12*3600*1000;
const GRACE_MS=4000;
const HISTORY=40;
const SEEN=300;
const BROWSE_MAX=40;
const VERSION=1;

class EloError extends Error{constructor(code,message){super(message);this.code=code;}}

function ChessCtor(){
 if(root.Chess)return root.Chess;
 if(isNode)return require('chess.js').Chess;
 throw new EloError('unavailable','Chưa tải được thư viện cờ vua.');
}
function newGame(){const C=ChessCtor();return new C();}

function clean(v){
 if(Array.isArray(v))return v.map(clean);
 if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype){
  const o={};
  for(const k of Object.keys(v)){if(v[k]!==undefined)o[k]=clean(v[k]);}
  return o;
 }
 return v;
}

function buildBank(files){
 const list=[];
 const byId=new Map();
 const themes=new Set();
 for(const j of files){
  for(const it of j.p){
   const p={id:String(it[0]),fen:String(it[1]),moves:String(it[2]).split(' '),rating:Number(it[3]),themes:String(it[4]||'').split(' ').filter(Boolean)};
   p.themes.forEach(function(t){themes.add(t);});
   list.push(p);
   byId.set(p.id,p);
  }
 }
 list.sort(function(a,b){return a.rating-b.rating||(a.id<b.id?-1:1);});
 return {list:list,byId:byId,themes:themes};
}

const bankCache={};
function loadBank(base,fetchJson){
 if(!bankCache[base]){
  bankCache[base]=fetchJson(base+'manifest.json')
   .then(function(m){return Promise.all(m.bands.map(function(b){return fetchJson(base+b.file);}));})
   .then(buildBank)
   .catch(function(e){
    delete bankCache[base];
    if(e instanceof EloError)throw e;
    throw new EloError('unavailable','Không tải được kho câu đố. Em kiểm tra Internet rồi thử lại nhé.');
   });
 }
 return bankCache[base];
}

function clampElo(v){return Math.max(MIN_ELO,Math.min(MAX_ELO,Math.round(v)));}

function calcDelta(elo,games,puzzleRating,score,clean_){
 const expected=1/(1+Math.pow(10,(puzzleRating-elo)/400));
 const k=games<10?48:32;
 let d=Math.round(k*(score-expected));
 if(clean_&&d<1)d=1;
 return clampElo(elo+d)-elo;
}

function applyUci(game,uci){
 if(typeof uci!=='string'||uci.length<4)return null;
 try{return game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci.length>4?uci[4]:undefined});}
 catch(e){return null;}
}

function replay(puzzle,idx){
 const g=newGame();
 if(!g.load(puzzle.fen))return null;
 for(let i=0;i<idx;i++){if(!applyUci(g,puzzle.moves[i]))return null;}
 return g;
}

function playerColor(puzzle){
 const g=newGame();
 g.load(puzzle.fen);
 return g.turn()==='w'?'b':'w';
}

function judge(puzzle,idx,from,to,promotion){
 if(!SQ.test(String(from))||!SQ.test(String(to)))return {legal:false};
 if(promotion!=null&&!/^[qrbn]$/.test(String(promotion)))return {legal:false};
 const g=replay(puzzle,idx);
 if(!g)return {legal:false};
 let m=null;
 try{m=g.move({from:from,to:to,promotion:promotion||undefined});}catch(e){m=null;}
 if(!m)return {legal:false};
 const uci=from+to+(m.promotion||'');
 const expected=puzzle.moves[idx];
 if(uci===expected){
  const next=idx+1;
  if(next>=puzzle.moves.length)return {legal:true,correct:true,done:true,reply:null,nextIdx:next};
  return {legal:true,correct:true,done:false,reply:puzzle.moves[next],nextIdx:next+1};
 }
 if(g.in_checkmate())return {legal:true,correct:true,done:true,reply:null,nextIdx:puzzle.moves.length,alt:true};
 return {legal:true,correct:false};
}

function pickNear(list,seen,elo,rng){
 const seenSet=new Set(seen||[]);
 let pool=list.filter(function(p){return !seenSet.has(p.id);});
 if(pool.length<15)pool=list.slice();
 pool.sort(function(a,b){return Math.abs(a.rating-elo)-Math.abs(b.rating-elo)||(a.id<b.id?-1:1);});
 const top=pool.slice(0,15);
 return top[Math.floor((rng||Math.random)()*top.length)];
}

function filterBank(list,minElo,maxElo,themes){
 return list.filter(function(p){
  if(p.rating<minElo||p.rating>maxElo)return false;
  if(themes&&themes.length&&!themes.some(function(t){return p.themes.includes(t);}))return false;
  return true;
 });
}

const core={START_ELO:START_ELO,MIN_ELO:MIN_ELO,MAX_ELO:MAX_ELO,buildBank:buildBank,loadBank:loadBank,clampElo:clampElo,calcDelta:calcDelta,applyUci:applyUci,replay:replay,playerColor:playerColor,judge:judge,pickNear:pickNear,filterBank:filterBank};

function makeApi(deps){
 const db=deps.db;
 const HttpsError=deps.HttpsError||EloError;
 const now=deps.now||Date.now;
 const rng=deps.random||Math.random;
 const serverTs=deps.serverTs||function(){return Date.now();};
 let B=null;
 const bank=function(){return B;};
 async function ready(){
  if(!B)B=await loadBank(deps.bankBase,deps.fetchJson);
  if(deps.syncClock)await deps.syncClock();
 }
 const bad=function(m){return new HttpsError('invalid-argument',m);};
 const denied=function(m){return new HttpsError('permission-denied',m);};
 const missing=function(m){return new HttpsError('not-found',m);};
 const precond=function(m){return new HttpsError('failed-precondition',m);};

 const statsRef=function(uid){return db.collection('eloStats').doc(uid);};
 const attemptRef=function(id){return db.collection('eloAttempts').doc(id);};
 const sessionRef=function(id){return db.collection('eloSessions').doc(id);};
 const playerRef=function(sid,uid){return sessionRef(sid).collection('players').doc(uid);};
 const roomRef=function(id){return db.collection('rooms').doc(id);};
 const put=function(tx,ref,d){return tx.set(ref,clean(d));};
 const patch=function(tx,ref,d){return tx.update(ref,clean(d));};

 function puzzleOf(id){
  const p=bank().byId.get(id);
  if(!p)throw missing('Không tìm thấy câu đố.');
  return p;
 }

 async function loadUser(uid){
  const snap=await db.collection('users').doc(uid).get();
  const u=snap.exists?snap.data():null;
  if(!u||u.active!==true||(u.role!=='student'&&u.role!=='teacher'))throw denied('Tài khoản chưa được kích hoạt.');
  return u;
 }

 function identity(uid,user){
  return {
   uid:uid,
   role:user.role,
   name:String(user.name||user.code||'').slice(0,80),
   teacherId:user.role==='teacher'?uid:String(user.teacherId||''),
   classCode:String(user.classCode||'')
  };
 }

 function freshStats(uid,user,t){
  return Object.assign(identity(uid,user),{
   elo:START_ELO,games:0,solved:0,streak:0,best:START_ELO,history:[START_ELO],seen:[],active:null,createdAt:t,updatedAt:t,lastAt:0,lastAtTs:serverTs()
  });
 }

 function publicStats(st){
  return {elo:st.elo,games:st.games,solved:st.solved,streak:st.streak,best:st.best,history:st.history||[]};
 }

 function sessionOpen(s,t){
  return !!s&&s.status==='active'&&(s.endsAt==null||t<=s.endsAt+GRACE_MS);
 }

 function view(a,p,st,s,t){
  const lvl=a.hintLevel||0;
  const exp=p.moves[a.idx];
  const v={
   attemptId:a.id,n:a.lastN||0,fen:p.fen,first:p.moves[0],played:p.moves.slice(1,a.idx),color:playerColor(p),
   puzzleRating:p.rating,themes:p.themes,mistakes:a.mistakes,hintLevel:lvl,status:a.status,stats:publicStats(st),serverNow:t
  };
  if(lvl>=1&&a.status==='active'&&exp)v.hint={from:exp.slice(0,2),to:lvl>=2?exp.slice(2,4):null};
  if(a.status!=='active'||a.result)v.result=a.result||null;
  if(s)v.session={id:s.id,hints:s.hints!==false,startedAt:s.startedAt,endsAt:s.endsAt,timeLimitSec:s.timeLimitSec,open:sessionOpen(s,t)};
  return v;
 }

 async function start(data,uid){
  data=data||{};
  const user=await loadUser(uid);
  const rawSid=data.sessionId==null||data.sessionId===''?null:String(data.sessionId);
  if(rawSid!==null){
   if(!NONCE.test(rawSid))throw bad('Mã phiên không hợp lệ.');
   return startSession(uid,user,rawSid);
  }
  const nonce=String(data.nonce||'');
  if(!NONCE.test(nonce))throw bad('Thiếu mã lượt.');
  return startSolo(uid,user,nonce);
 }

 function startSolo(uid,user,nonce){
  return db.runTransaction(async function(tx){
   const t=now();
   const id=uid+'_'+nonce;
   const stSnap=await tx.get(statsRef(uid));
   const idSnap=await tx.get(attemptRef(id));
   let st=stSnap.exists?stSnap.data():freshStats(uid,user,t);
   if(idSnap.exists){
    const a=idSnap.data();
    if(a.uid!==uid)throw denied('Lượt không thuộc về em.');
    return view(a,puzzleOf(a.puzzleId),st,null,t);
   }
   let resume=null;
   if(st.active&&st.active!==id){
    const old=await tx.get(attemptRef(st.active));
    if(old.exists){
     const a=old.data();
     if(a.uid===uid&&a.status==='active'&&!a.sessionId&&t-a.startedAt<RESUME_MS)resume=a;
    }
   }
   if(resume)return view(resume,puzzleOf(resume.puzzleId),st,null,t);
   const p=pickNear(bank().list,st.seen,st.elo,rng);
   const ident=identity(uid,user);
   const a={id:id,uid:uid,teacherId:ident.teacherId,classCode:ident.classCode,sessionId:null,puzzleId:p.id,idx:1,mistakes:0,hintLevel:0,lastN:0,lastReq:null,status:'active',startedAt:t,updatedAt:t,result:null};
   st=Object.assign({},st,ident,{active:id,updatedAt:t});
   put(tx,attemptRef(id),a);
   put(tx,statsRef(uid),st);
   return view(a,p,st,null,t);
  });
 }

 function startSession(uid,user,sid){
  return db.runTransaction(async function(tx){
   const t=now();
   const sSnap=await tx.get(sessionRef(sid));
   if(!sSnap.exists)throw missing('Không tìm thấy phiên câu đố.');
   const s=sSnap.data();
   if(user.role!=='student'||String(user.teacherId||'')!==s.teacherId)throw denied('Phiên này không dành cho em.');
   const id=sid+'_'+uid;
   const aSnap=await tx.get(attemptRef(id));
   const stSnap=await tx.get(statsRef(uid));
   const ident=identity(uid,user);
   const st=stSnap.exists?stSnap.data():freshStats(uid,user,t);
   if(aSnap.exists){
    const a=aSnap.data();
    return view(a,puzzleOf(a.puzzleId),st,s,t);
   }
   if(!sessionOpen(s,t)||(s.endsAt!=null&&t>s.endsAt))throw precond('Phiên câu đố đã kết thúc.');
   const p=puzzleOf(s.puzzleId);
   const a={id:id,uid:uid,teacherId:s.teacherId,classCode:ident.classCode,sessionId:sid,puzzleId:p.id,idx:1,mistakes:0,hintLevel:0,lastN:0,lastReq:null,status:'active',startedAt:t,updatedAt:t,result:null};
   put(tx,attemptRef(id),a);
   if(!stSnap.exists)put(tx,statsRef(uid),st);
   put(tx,playerRef(sid,uid),{uid:uid,teacherId:s.teacherId,name:ident.name,classCode:ident.classCode,status:'active',mistakes:0,hintLevel:0,idx:1,startedAt:t,doneAt:null,clean:false,delta:0,updatedAt:t});
   return view(a,p,st,s,t);
  });
 }

 function parseStep(data){
  data=data||{};
  const id=String(data.attemptId||'');
  if(!id||id.length>120)throw bad('Mã lượt không hợp lệ.');
  const n=Number(data.n);
  if(!Number.isInteger(n)||n<1||n>1000)throw bad('Số thứ tự không hợp lệ.');
  return {id:id,n:n};
 }

 async function loadStep(tx,uid,id){
  const aSnap=await tx.get(attemptRef(id));
  if(!aSnap.exists||aSnap.data().uid!==uid)throw missing('Không tìm thấy lượt câu đố.');
  const a=aSnap.data();
  const stSnap=await tx.get(statsRef(uid));
  if(!stSnap.exists)throw missing('Chưa có hồ sơ Elo.');
  let s=null;
  if(a.sessionId){
   const ss=await tx.get(sessionRef(a.sessionId));
   s=ss.exists?ss.data():null;
  }
  return {a:a,st:stSnap.data(),s:s,p:puzzleOf(a.puzzleId)};
 }

 function idempotent(a,n){
  if(a.lastReq&&n<=a.lastReq.n){
   if(n===a.lastReq.n)return a.lastReq.resp;
   throw precond('Yêu cầu cũ, hãy tải lại câu đố.');
  }
  return null;
 }

 function expire(tx,uid,a,t){
  const resp={expired:true,status:'expired'};
  patch(tx,attemptRef(a.id),{status:'expired',result:{outcome:'expired',finishedAt:t},updatedAt:t});
  if(a.sessionId)patch(tx,playerRef(a.sessionId,uid),{status:'expired',doneAt:t,updatedAt:t});
  return resp;
 }

 function finalize(tx,uid,ctx,outcome,n,t,extra){
  const a=ctx.a,p=ctx.p,st=ctx.st;
  const solved=outcome==='solved';
  const isClean=solved&&a.mistakes===0&&(a.hintLevel||0)===0;
  const score=isClean?1:(solved?0.3:0);
  const delta=calcDelta(st.elo,st.games,p.rating,score,isClean);
  const elo=st.elo+delta;
  const next=Object.assign({},st,{
   elo:elo,games:st.games+1,solved:st.solved+(isClean?1:0),streak:isClean?st.streak+1:0,best:Math.max(st.best,elo),
   history:(st.history||[]).concat(elo).slice(-HISTORY),seen:(st.seen||[]).concat(p.id).slice(-SEEN),
   lastAt:t,lastAtTs:serverTs(),updatedAt:t,active:a.sessionId?st.active:null
  });
  const result={outcome:outcome,clean:isClean,delta:delta,elo:elo,games:next.games,solved:next.solved,streak:next.streak,best:next.best,mistakes:a.mistakes,hints:a.hintLevel||0,moves:p.moves,finishedAt:t};
  const resp=Object.assign({done:true,status:outcome,result:result,stats:publicStats(next)},extra||{});
  patch(tx,attemptRef(a.id),{status:outcome,result:result,idx:extra&&extra.idx!=null?extra.idx:a.idx,lastN:n,lastReq:{n:n,resp:resp},updatedAt:t});
  put(tx,statsRef(uid),next);
  if(a.sessionId)patch(tx,playerRef(a.sessionId,uid),{status:outcome,clean:isClean,delta:delta,mistakes:a.mistakes,hintLevel:a.hintLevel||0,doneAt:t,updatedAt:t});
  return resp;
 }

 function guard(ctx,t){
  if(ctx.a.status!=='active')return {done:true,status:ctx.a.status,result:ctx.a.result||null,stats:publicStats(ctx.st)};
  if(ctx.a.sessionId&&!sessionOpen(ctx.s,t))return 'expire';
  return null;
 }

 async function move(data,uid){
  const step=parseStep(data);
  data=data||{};
  await loadUser(uid);
  const from=String(data.from||''),to=String(data.to||''),promotion=data.promotion==null||data.promotion===''?null:String(data.promotion);
  return db.runTransaction(async function(tx){
   const t=now();
   const ctx=await loadStep(tx,uid,step.id);
   const a=ctx.a;
   const idem=idempotent(a,step.n);
   if(idem)return idem;
   const g=guard(ctx,t);
   if(g==='expire')return expire(tx,uid,a,t);
   if(g)return g;
   const j=judge(ctx.p,a.idx,from,to,promotion);
   if(!j.legal)throw bad('Nước đi không hợp lệ.');
   if(!j.correct){
    const mistakes=a.mistakes+1;
    const resp={correct:false,mistakes:mistakes};
    patch(tx,attemptRef(a.id),{mistakes:mistakes,lastN:step.n,lastReq:{n:step.n,resp:resp},updatedAt:t});
    if(a.sessionId)patch(tx,playerRef(a.sessionId,uid),{mistakes:mistakes,updatedAt:t});
    return resp;
   }
   if(j.done){
    return finalize(tx,uid,ctx,'solved',step.n,t,{correct:true,reply:null,idx:ctx.p.moves.length});
   }
   const resp={correct:true,done:false,reply:j.reply,idx:j.nextIdx};
   patch(tx,attemptRef(a.id),{idx:j.nextIdx,lastN:step.n,lastReq:{n:step.n,resp:resp},updatedAt:t});
   if(a.sessionId)patch(tx,playerRef(a.sessionId,uid),{idx:j.nextIdx,updatedAt:t});
   return resp;
  });
 }

 async function hint(data,uid){
  const step=parseStep(data);
  await loadUser(uid);
  return db.runTransaction(async function(tx){
   const t=now();
   const ctx=await loadStep(tx,uid,step.id);
   const a=ctx.a;
   const idem=idempotent(a,step.n);
   if(idem)return idem;
   const g=guard(ctx,t);
   if(g==='expire')return expire(tx,uid,a,t);
   if(g)return g;
   if(ctx.s&&ctx.s.hints===false)throw precond('Giáo viên không cho dùng gợi ý ở câu này.');
   const lvl=Math.min(2,(a.hintLevel||0)+1);
   const exp=ctx.p.moves[a.idx];
   const resp={hintLevel:lvl,from:exp.slice(0,2),to:lvl>=2?exp.slice(2,4):null};
   patch(tx,attemptRef(a.id),{hintLevel:lvl,lastN:step.n,lastReq:{n:step.n,resp:resp},updatedAt:t});
   if(a.sessionId)patch(tx,playerRef(a.sessionId,uid),{hintLevel:lvl,updatedAt:t});
   return resp;
  });
 }

 async function giveUp(data,uid){
  const step=parseStep(data);
  await loadUser(uid);
  return db.runTransaction(async function(tx){
   const t=now();
   const ctx=await loadStep(tx,uid,step.id);
   const idem=idempotent(ctx.a,step.n);
   if(idem)return idem;
   const g=guard(ctx,t);
   if(g==='expire')return expire(tx,uid,ctx.a,t);
   if(g)return g;
   return finalize(tx,uid,ctx,'failed',step.n,t,null);
  });
 }

 function requireTeacher(user){
  if(user.role!=='teacher')throw denied('Chỉ giáo viên được dùng chức năng này.');
 }

 function parseFilter(data){
  data=data||{};
  const num=function(v,def){const x=Number(v);return Number.isFinite(x)?Math.max(0,Math.min(3000,Math.round(x))):def;};
  const minElo=num(data.minElo,0);
  const maxElo=num(data.maxElo,3000);
  if(minElo>maxElo)throw bad('Khoảng Elo không hợp lệ.');
  const known=bank().themes;
  const themes=Array.isArray(data.themes)?data.themes.map(String).filter(function(x){return known.has(x);}).slice(0,8):[];
  return {minElo:minElo,maxElo:maxElo,themes:themes};
 }

 function puzzleView(p){
  return {id:p.id,fen:p.fen,rating:p.rating,themes:p.themes,moves:p.moves,color:playerColor(p)};
 }

 async function sessionBrowse(data,uid){
  requireTeacher(await loadUser(uid));
  const f=parseFilter(data);
  const pool=filterBank(bank().list,f.minElo,f.maxElo,f.themes);
  const total=pool.length;
  const picked=[];
  if(total<=BROWSE_MAX)pool.forEach(function(p){picked.push(p);});
  else{
   const taken=new Set();
   while(picked.length<BROWSE_MAX){
    const i=Math.floor(rng()*total);
    if(taken.has(i))continue;
    taken.add(i);picked.push(pool[i]);
   }
   picked.sort(function(a,b){return a.rating-b.rating;});
  }
  return {total:total,items:picked.map(puzzleView)};
 }

 async function setPointer(room,sid,pointer){
  const snap=await roomRef(room).get();
  if(!snap.exists)return false;
  const cur=snap.data().eloSession;
  if(pointer.active===false&&cur&&cur.sid!==sid)return false;
  await roomRef(room).update(clean({eloSession:pointer}));
  return true;
 }

 async function endInternal(sid,t){
  const ref=sessionRef(sid);
  let sess=null;
  await db.runTransaction(async function(tx){
   const snap=await tx.get(ref);
   if(!snap.exists)return;
   const s=snap.data();
   if(s.status!=='active')return;
   sess=s;
   patch(tx,ref,{status:'ended',endedAt:t});
  });
  if(!sess)return false;
  const players=await ref.collection('players').where('teacherId','==',sess.teacherId).where('status','==','active').get();
  const batch=db.batch();
  players.docs.forEach(function(d){batch.update(d.ref,clean({status:'expired',doneAt:t,updatedAt:t}));});
  if(players.docs.length)await batch.commit();
  await setPointer(sess.room,sid,{sid:sid,active:false,endedAt:t});
  return true;
 }

 async function sessionCreate(data,uid){
  data=data||{};
  const user=await loadUser(uid);
  requireTeacher(user);
  const sid=String(data.nonce||'');
  if(!NONCE.test(sid))throw bad('Thiếu mã phiên.');
  const room=String(data.room||'');
  if(!ROOM.test(room))throw bad('Hãy tạo hoặc vào phòng lớp học trước.');
  const f=parseFilter(data);
  const hints=data.hints!==false;
  let limit=Number(data.timeLimitSec);
  if(!Number.isFinite(limit)||limit<=0)limit=0;
  else limit=Math.max(30,Math.min(3600,Math.round(limit)));
  const roomSnap=await roomRef(room).get();
  if(!roomSnap.exists)throw missing('Không tìm thấy phòng lớp học.');
  const owner=roomSnap.data().teacherId;
  if(owner&&owner!==uid)throw denied('Phòng này không thuộc về thầy/cô.');
  const Bk=bank();
  const existing=await sessionRef(sid).get();
  if(existing.exists){
   const s=existing.data();
   if(s.teacherId!==uid)throw denied('Mã phiên không hợp lệ.');
   return {sid:sid,session:s,puzzle:puzzleView(puzzleOf(s.puzzleId)),serverNow:now()};
  }
  let p=null;
  if(data.puzzleId!=null&&data.puzzleId!==''){
   const pid=String(data.puzzleId);
   if(!PUZZLE_ID.test(pid)||!Bk.byId.has(pid))throw bad('Câu đố được chọn không có trong kho.');
   p=Bk.byId.get(pid);
  }else{
   const pool=filterBank(Bk.list,f.minElo,f.maxElo,f.themes);
   if(!pool.length)throw missing('Không có câu đố nào khớp bộ lọc.');
   p=pool[Math.floor(rng()*pool.length)];
  }
  const t=now();
  const active=await db.collection('eloSessions').where('teacherId','==',uid).where('status','==','active').get();
  for(const d of active.docs){if(d.id!==sid)await endInternal(d.id,t);}
  const s={
   id:sid,teacherId:uid,teacherName:String(user.name||'').slice(0,80),room:room,minElo:f.minElo,maxElo:f.maxElo,themes:f.themes,
   puzzleId:p.id,puzzleRating:p.rating,hints:hints,timeLimitSec:limit,status:'active',startedAt:t,endsAt:limit?t+limit*1000:null,endedAt:null,createdAt:t
  };
  await sessionRef(sid).set(clean(s));
  await roomRef(room).update(clean({eloSession:{sid:sid,active:true,startedAt:t,endsAt:s.endsAt,hints:hints,timeLimitSec:limit,done:0,total:0}}));
  return {sid:sid,session:s,puzzle:puzzleView(p),serverNow:t};
 }

 async function sessionGet(data,uid){
  requireTeacher(await loadUser(uid));
  const sid=String((data||{}).sid||'');
  if(!NONCE.test(sid))throw bad('Mã phiên không hợp lệ.');
  const snap=await sessionRef(sid).get();
  if(!snap.exists||snap.data().teacherId!==uid)throw missing('Không tìm thấy phiên.');
  const s=snap.data();
  return {session:s,puzzle:puzzleView(puzzleOf(s.puzzleId)),serverNow:now()};
 }

 async function sessionEnd(data,uid){
  requireTeacher(await loadUser(uid));
  const sid=String((data||{}).sid||'');
  if(!NONCE.test(sid))throw bad('Mã phiên không hợp lệ.');
  const snap=await sessionRef(sid).get();
  if(!snap.exists||snap.data().teacherId!==uid)throw missing('Không tìm thấy phiên.');
  const ended=await endInternal(sid,now());
  return {ok:true,ended:ended};
 }

 const wrap=function(fn){return async function(data,uid){await ready();return fn(data,uid);};};
 return {start:wrap(start),move:wrap(move),hint:wrap(hint),giveUp:wrap(giveUp),sessionBrowse:wrap(sessionBrowse),sessionCreate:wrap(sessionCreate),sessionGet:wrap(sessionGet),sessionEnd:wrap(sessionEnd)};
}

const NAMES={eloPuzzleStart:'start',eloPuzzleMove:'move',eloPuzzleHint:'hint',eloPuzzleGiveUp:'giveUp',eloSessionBrowse:'sessionBrowse',eloSessionCreate:'sessionCreate',eloSessionGet:'sessionGet',eloSessionEnd:'sessionEnd'};

let inst=null;
function instance(){
 if(inst)return inst;
 const base=new URL('../data/puzzles/',SCRIPT_SRC||(typeof document!=='undefined'?document.baseURI:'http://localhost/js/')).href;
 let offset=0,lastSync=0;
 const fetchJson=function(url){
  return fetch(url,{credentials:'same-origin'}).then(function(r){
   if(!r.ok)throw new EloError('unavailable','Không tải được kho câu đố ('+r.status+').');
   return r.json();
  });
 };
 const syncClock=async function(){
  if(Date.now()-lastSync<20*60000)return;
  lastSync=Date.now();
  try{
   const t0=Date.now();
   const r=await fetch(base+'manifest.json',{method:'HEAD',cache:'no-store'});
   const t1=Date.now();
   const h=r.headers.get('date');
   const s=h?Date.parse(h):NaN;
   if(isFinite(s))offset=s+500-(t0+t1)/2;
  }catch(e){}
 };
 const fv=function(){
  const f=root.firebase&&root.firebase.firestore&&root.firebase.firestore.FieldValue;
  return f&&typeof f.serverTimestamp==='function'?f.serverTimestamp():Date.now();
 };
 const database=typeof db!=='undefined'?db:root.db;
 inst=makeApi({db:database,now:function(){return Math.round(Date.now()+offset);},serverTs:fv,fetchJson:fetchJson,bankBase:base,syncClock:syncClock});
 return inst;
}

async function call(name,payload){
 const fn=NAMES[name];
 if(!fn)throw new EloError('invalid-argument','Chức năng không tồn tại.');
 const a=typeof auth!=='undefined'?auth:root.auth;
 const u=a&&a.currentUser;
 if(!u)throw new EloError('unauthenticated','Cần đăng nhập.');
 const api=instance();
 return api[fn](payload,u.uid);
}

const out={version:VERSION,call:call,makeApi:makeApi,core:core,EloError:EloError,GRACE_MS:GRACE_MS,RESUME_MS:RESUME_MS,reset:function(){inst=null;}};
if(isNode)module.exports=out;
else root.vqcEloLocal=out;
})();
