'use strict';
const core=require('./elo-core');

const NONCE=/^[A-Za-z0-9]{10,40}$/;
const ROOM=/^[A-Za-z0-9_-]{1,40}$/;
const PUZZLE_ID=/^[A-Za-z0-9]{3,12}$/;
const RESUME_MS=12*3600*1000;
const GRACE_MS=4000;
const HISTORY=40;
const SEEN=300;
const BROWSE_MAX=40;

function makeApi(deps){
 const db=deps.db;
 const HttpsError=deps.HttpsError;
 const now=deps.now||Date.now;
 const rng=deps.random||Math.random;
 const bank=()=>core.loadBank(deps.bankDir);
 const bad=m=>new HttpsError('invalid-argument',m);
 const denied=m=>new HttpsError('permission-denied',m);
 const missing=m=>new HttpsError('not-found',m);
 const precond=m=>new HttpsError('failed-precondition',m);

 const statsRef=uid=>db.collection('eloStats').doc(uid);
 const attemptRef=id=>db.collection('eloAttempts').doc(id);
 const sessionRef=id=>db.collection('eloSessions').doc(id);
 const playerRef=(sid,uid)=>sessionRef(sid).collection('players').doc(uid);
 const roomRef=id=>db.collection('rooms').doc(id);

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
   elo:core.START_ELO,games:0,solved:0,streak:0,best:core.START_ELO,history:[core.START_ELO],seen:[],active:null,createdAt:t,updatedAt:t,lastAt:0
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
   attemptId:a.id,n:a.lastN||0,fen:p.fen,first:p.moves[0],played:p.moves.slice(1,a.idx),color:core.playerColor(p),
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
  return db.runTransaction(async tx=>{
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
   const p=core.pickNear(bank().list,st.seen,st.elo,rng);
   const ident=identity(uid,user);
   const a={id:id,uid:uid,teacherId:ident.teacherId,classCode:ident.classCode,sessionId:null,puzzleId:p.id,idx:1,mistakes:0,hintLevel:0,lastN:0,lastReq:null,status:'active',startedAt:t,updatedAt:t,result:null};
   st=Object.assign({},st,ident,{active:id,updatedAt:t});
   tx.set(attemptRef(id),a);
   tx.set(statsRef(uid),st);
   return view(a,p,st,null,t);
  });
 }

 function startSession(uid,user,sid){
  return db.runTransaction(async tx=>{
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
   tx.set(attemptRef(id),a);
   if(!stSnap.exists)tx.set(statsRef(uid),st);
   tx.set(playerRef(sid,uid),{uid:uid,teacherId:s.teacherId,name:ident.name,classCode:ident.classCode,status:'active',mistakes:0,hintLevel:0,idx:1,startedAt:t,doneAt:null,clean:false,delta:0,updatedAt:t});
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
  tx.update(attemptRef(a.id),{status:'expired',result:{outcome:'expired',finishedAt:t},updatedAt:t});
  if(a.sessionId)tx.update(playerRef(a.sessionId,uid),{status:'expired',doneAt:t,updatedAt:t});
  return resp;
 }

 function finalize(tx,uid,ctx,outcome,n,t,extra){
  const a=ctx.a,p=ctx.p,st=ctx.st;
  const solved=outcome==='solved';
  const clean=solved&&a.mistakes===0&&(a.hintLevel||0)===0;
  const score=clean?1:(solved?0.3:0);
  const delta=core.calcDelta(st.elo,st.games,p.rating,score,clean);
  const elo=st.elo+delta;
  const next=Object.assign({},st,{
   elo:elo,games:st.games+1,solved:st.solved+(clean?1:0),streak:clean?st.streak+1:0,best:Math.max(st.best,elo),
   history:(st.history||[]).concat(elo).slice(-HISTORY),seen:(st.seen||[]).concat(p.id).slice(-SEEN),
   lastAt:t,updatedAt:t,active:a.sessionId?st.active:null
  });
  const result={outcome:outcome,clean:clean,delta:delta,elo:elo,games:next.games,solved:next.solved,streak:next.streak,best:next.best,mistakes:a.mistakes,hints:a.hintLevel||0,moves:p.moves,finishedAt:t};
  const resp=Object.assign({done:true,status:outcome,result:result,stats:publicStats(next)},extra||{});
  tx.update(attemptRef(a.id),{status:outcome,result:result,idx:extra&&extra.idx!=null?extra.idx:a.idx,lastN:n,lastReq:{n:n,resp:resp},updatedAt:t});
  tx.set(statsRef(uid),next);
  if(a.sessionId)tx.update(playerRef(a.sessionId,uid),{status:outcome,clean:clean,delta:delta,mistakes:a.mistakes,hintLevel:a.hintLevel||0,doneAt:t,updatedAt:t});
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
  return db.runTransaction(async tx=>{
   const t=now();
   const ctx=await loadStep(tx,uid,step.id);
   const a=ctx.a;
   const idem=idempotent(a,step.n);
   if(idem)return idem;
   const g=guard(ctx,t);
   if(g==='expire')return expire(tx,uid,a,t);
   if(g)return g;
   const j=core.judge(ctx.p,a.idx,from,to,promotion);
   if(!j.legal)throw bad('Nước đi không hợp lệ.');
   if(!j.correct){
    const mistakes=a.mistakes+1;
    const resp={correct:false,mistakes:mistakes};
    tx.update(attemptRef(a.id),{mistakes:mistakes,lastN:step.n,lastReq:{n:step.n,resp:resp},updatedAt:t});
    if(a.sessionId)tx.update(playerRef(a.sessionId,uid),{mistakes:mistakes,updatedAt:t});
    return resp;
   }
   if(j.done){
    return finalize(tx,uid,ctx,'solved',step.n,t,{correct:true,reply:null,idx:ctx.p.moves.length});
   }
   const resp={correct:true,done:false,reply:j.reply,idx:j.nextIdx};
   tx.update(attemptRef(a.id),{idx:j.nextIdx,lastN:step.n,lastReq:{n:step.n,resp:resp},updatedAt:t});
   if(a.sessionId)tx.update(playerRef(a.sessionId,uid),{idx:j.nextIdx,updatedAt:t});
   return resp;
  });
 }

 async function hint(data,uid){
  const step=parseStep(data);
  await loadUser(uid);
  return db.runTransaction(async tx=>{
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
   tx.update(attemptRef(a.id),{hintLevel:lvl,lastN:step.n,lastReq:{n:step.n,resp:resp},updatedAt:t});
   if(a.sessionId)tx.update(playerRef(a.sessionId,uid),{hintLevel:lvl,updatedAt:t});
   return resp;
  });
 }

 async function giveUp(data,uid){
  const step=parseStep(data);
  await loadUser(uid);
  return db.runTransaction(async tx=>{
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
  const num=(v,def)=>{const x=Number(v);return Number.isFinite(x)?Math.max(0,Math.min(3000,Math.round(x))):def;};
  const minElo=num(data.minElo,0);
  const maxElo=num(data.maxElo,3000);
  if(minElo>maxElo)throw bad('Khoảng Elo không hợp lệ.');
  const known=bank().themes;
  const themes=Array.isArray(data.themes)?data.themes.map(String).filter(x=>known.has(x)).slice(0,8):[];
  return {minElo:minElo,maxElo:maxElo,themes:themes};
 }

 function puzzleView(p){
  return {id:p.id,fen:p.fen,rating:p.rating,themes:p.themes,moves:p.moves,color:core.playerColor(p)};
 }

 async function sessionBrowse(data,uid){
  requireTeacher(await loadUser(uid));
  const f=parseFilter(data);
  const pool=core.filterBank(bank().list,f.minElo,f.maxElo,f.themes);
  const total=pool.length;
  const picked=[];
  if(total<=BROWSE_MAX)pool.forEach(p=>picked.push(p));
  else{
   const taken=new Set();
   while(picked.length<BROWSE_MAX){
    const i=Math.floor(rng()*total);
    if(taken.has(i))continue;
    taken.add(i);picked.push(pool[i]);
   }
   picked.sort((a,b)=>a.rating-b.rating);
  }
  return {total:total,items:picked.map(puzzleView)};
 }

 async function setPointer(room,sid,pointer){
  const snap=await roomRef(room).get();
  if(!snap.exists)return false;
  const cur=snap.data().eloSession;
  if(pointer.active===false&&cur&&cur.sid!==sid)return false;
  await roomRef(room).update({eloSession:pointer});
  return true;
 }

 async function endInternal(sid,t){
  const ref=sessionRef(sid);
  let sess=null;
  await db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists)return;
   const s=snap.data();
   if(s.status!=='active')return;
   sess=s;
   tx.update(ref,{status:'ended',endedAt:t});
  });
  if(!sess)return false;
  const players=await ref.collection('players').where('status','==','active').get();
  const batch=db.batch();
  players.docs.forEach(d=>batch.update(d.ref,{status:'expired',doneAt:t,updatedAt:t}));
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
  const B=bank();
  const existing=await sessionRef(sid).get();
  if(existing.exists){
   const s=existing.data();
   if(s.teacherId!==uid)throw denied('Mã phiên không hợp lệ.');
   return {sid:sid,session:s,puzzle:puzzleView(puzzleOf(s.puzzleId))};
  }
  let p=null;
  if(data.puzzleId!=null&&data.puzzleId!==''){
   const pid=String(data.puzzleId);
   if(!PUZZLE_ID.test(pid)||!B.byId.has(pid))throw bad('Câu đố được chọn không có trong kho.');
   p=B.byId.get(pid);
  }else{
   const pool=core.filterBank(B.list,f.minElo,f.maxElo,f.themes);
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
  await sessionRef(sid).set(s);
  await roomRef(room).update({eloSession:{sid:sid,active:true,startedAt:t,endsAt:s.endsAt,hints:hints,timeLimitSec:limit,done:0,total:0}});
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

 return {start,move,hint,giveUp,sessionBrowse,sessionCreate,sessionGet,sessionEnd};
}

module.exports={makeApi,RESUME_MS,GRACE_MS};
