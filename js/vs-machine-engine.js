(function(){
'use strict';

const ENGINE={
 name:'Stockfish',version:'19',build:'bản lite, 1 luồng',pkg:'stockfish@19.0.1',file:'stockfish-19-lite-single',
 license:'GNU GPL v3',
 sourceEngine:'https://github.com/official-stockfish/Stockfish',
 sourceWasm:'https://github.com/nmrugg/stockfish.js',
 licenseText:'https://www.gnu.org/licenses/gpl-3.0.html'
};
const SOURCES=[
 {id:'local',base:'./lib/stockfish/',direct:true},
 {id:'jsdelivr',base:'https://cdn.jsdelivr.net/npm/'+ENGINE.pkg+'/bin/'},
 {id:'unpkg',base:'https://unpkg.com/'+ENGINE.pkg+'/bin/'}
];
const MOVE_RE=/^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SOURCE_TIMEOUT=30000;
const READY_TIMEOUT=15000;

function fail(code,message){const e=new Error(message||code);e.code=code;return e;}

async function fetchText(url,timeout){
 const ctl=typeof AbortController==='function'?new AbortController():null;
 const timer=ctl?setTimeout(()=>ctl.abort(),timeout):null;
 try{
  const res=await fetch(url,{signal:ctl?ctl.signal:undefined,credentials:'omit'});
  if(!res.ok)throw fail('http','HTTP '+res.status);
  const type=((res.headers&&res.headers.get&&res.headers.get('content-type'))||'').toLowerCase();
  if(type.indexOf('text/html')>=0)throw fail('not-js','Máy chủ trả về trang HTML thay vì mã động cơ');
  return await res.text();
 }finally{if(timer)clearTimeout(timer);}
}

async function spawnWorker(src){
 if(typeof Worker==='undefined')throw fail('no-worker','Trình duyệt không hỗ trợ Web Worker');
 if(typeof WebAssembly==='undefined')throw fail('no-wasm','Trình duyệt không hỗ trợ WebAssembly');
 const jsUrl=new URL(src.base+ENGINE.file+'.js',location.href).href;
 const wasmUrl=new URL(src.base+ENGINE.file+'.wasm',location.href).href;
 const text=await fetchText(jsUrl,SOURCE_TIMEOUT);
 if(text.length<5000||!/Stockfish/i.test(text.slice(0,800)))throw fail('bad-file','Tệp động cơ không hợp lệ');
 if(src.direct)return {worker:new Worker(jsUrl+'#'+encodeURIComponent(wasmUrl)),cleanup:null};
 const blobUrl=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
 try{return {worker:new Worker(blobUrl+'#'+encodeURIComponent(wasmUrl)),cleanup:()=>{try{URL.revokeObjectURL(blobUrl);}catch(e){}}};}
 catch(e){try{URL.revokeObjectURL(blobUrl);}catch(x){}throw e;}
}

function parseInfo(line){
 const t=line.trim().split(/\s+/);
 if(t[0]!=='info'||t[1]==='string')return null;
 let depth=null,cp=null,mate=null,pv=null;
 for(let i=1;i<t.length;i++){
  const k=t[i];
  if(k==='depth')depth=+t[++i];
  else if(k==='multipv'){if(+t[i+1]!==1)return null;i++;}
  else if(k==='score'){const kind=t[++i],v=+t[++i];if(kind==='cp')cp=v;else if(kind==='mate')mate=v;}
  else if(k==='pv'){pv=t.slice(i+1).filter(m=>MOVE_RE.test(m));break;}
 }
 if(depth===null||isNaN(depth)||(cp===null&&mate===null)||(cp!==null&&isNaN(cp))||(mate!==null&&isNaN(mate)))return null;
 return {depth,cp,mate,pv:pv||[]};
}

function createEngine(options){
 options=options||{};
 const sources=options.sources||SOURCES;
 const hashMB=Number.isFinite(options.hash)?options.hash:16;
 const onStatus=typeof options.onStatus==='function'?options.onStatus:function(){};
 let worker=null,cleanup=null,state='idle',sourceId='',advertised={},busy=false,running=null,pending=null;
 let seq=0,initPromise=null,disposed=false,curSkill=null,watch=null,hard=null,generation=0;
 let waiters=[],idleWaiters=[];

 function send(cmd){if(worker){try{worker.postMessage(cmd);}catch(e){}}}
 function has(name){return Object.prototype.hasOwnProperty.call(advertised,name);}
 function clearWatch(){if(watch){clearTimeout(watch);watch=null;}if(hard){clearTimeout(hard);hard=null;}}
 function settle(j,result){if(!j||j.done)return;j.done=true;j.resolve(result);}
 function rejectJob(j,err){if(!j||j.done)return;j.done=true;j.reject(err);}

 function expect(token,ms){
  return new Promise((resolve,reject)=>{
   const w={token,resolve,reject,timer:setTimeout(()=>{waiters=waiters.filter(x=>x!==w);reject(fail('timeout','Hết thời gian chờ động cơ ('+token+')'));},ms)};
   waiters.push(w);
  });
 }
 function rejectWaiters(err){const list=waiters;waiters=[];list.forEach(w=>{clearTimeout(w.timer);w.reject(err);});}
 function flushIdle(){const list=idleWaiters;idleWaiters=[];list.forEach(f=>f());}

 function onLine(raw){
  const line=String(raw).trim();
  if(!line)return;
  if(line.startsWith('option name ')){
   const m=/^option name (.+?) type (\w+)/.exec(line);
   if(m)advertised[m[1]]=m[2];
   return;
  }
  if(line==='uciok'||line==='readyok'){
   const i=waiters.findIndex(w=>w.token===line);
   if(i>=0){const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve();}
   return;
  }
  if(line.startsWith('info ')){
   if(running&&!running.cancelled){
    const info=parseInfo(line);
    if(info){running.info=info;if(running.opts.onInfo){try{running.opts.onInfo(info);}catch(e){}}}
   }
   return;
  }
  if(line.startsWith('bestmove')){onBestmove(line);return;}
 }

 function onBestmove(line){
  const j=running;
  running=null;busy=false;clearWatch();
  const m=/^bestmove\s+(\S+)/.exec(line);
  const mv=m?m[1]:'';
  if(j&&!j.cancelled){
   settle(j,{ok:true,id:j.id,fen:j.fen,bestmove:mv,valid:MOVE_RE.test(mv),none:mv==='(none)'||mv==='0000',info:j.info||null,source:sourceId});
  }
  flushIdle();
  pump();
 }

 function attach(spawned){
  worker=spawned.worker;cleanup=spawned.cleanup||null;advertised={};
  const myGen=++generation;
  worker.onmessage=function(ev){if(myGen!==generation)return;onLine(typeof ev.data==='string'?ev.data:(ev.data&&ev.data.data)||String(ev.data));};
  worker.onerror=function(ev){
   if(myGen!==generation)return;
   const msg=(ev&&ev.message)||'Worker lỗi';
   if(typeof ev.preventDefault==='function')ev.preventDefault();
   crash(fail('worker-error',msg));
  };
  worker.onmessageerror=function(){if(myGen===generation)crash(fail('worker-error','Worker trả về dữ liệu không đọc được'));};
 }

 function teardownWorker(){
  generation++;clearWatch();
  if(worker){try{worker.onmessage=null;worker.onerror=null;}catch(e){}try{worker.postMessage('quit');}catch(e){}try{worker.terminate();}catch(e){}}
  worker=null;
  if(cleanup){try{cleanup();}catch(e){}cleanup=null;}
  busy=false;curSkill=null;advertised={};
 }

 function crash(err){
  if(state==='loading'){rejectWaiters(err);return;}
  const r=running,p=pending;
  running=null;pending=null;
  teardownWorker();
  state=disposed?'disposed':'error';initPromise=null;
  rejectWaiters(err);
  rejectJob(r,err);rejectJob(p,err);
  flushIdle();
 }

 function configure(){
  if(has('UCI_LimitStrength'))send('setoption name UCI_LimitStrength value false');
  if(has('Threads'))send('setoption name Threads value 1');
  if(has('Hash'))send('setoption name Hash value '+hashMB);
 }

 function init(){
  if(disposed)return Promise.reject(fail('disposed','Động cơ đã được giải phóng'));
  if(initPromise)return initPromise;
  state='loading';
  const mine=initPromise=(async function(){
   let last=null;
   for(const src of sources){
    if(disposed)throw fail('disposed','Động cơ đã được giải phóng');
    try{
     onStatus('loading',src.id);
     attach(await (options.spawn?options.spawn(src):spawnWorker(src)));
     send('uci');
     await expect('uciok',SOURCE_TIMEOUT);
     configure();
     send('isready');
     await expect('readyok',READY_TIMEOUT);
     if(disposed)throw fail('disposed','Động cơ đã được giải phóng');
     sourceId=src.id;state='ready';
     return {source:src.id};
    }catch(e){
     last=e;
     teardownWorker();
     if(e&&e.code==='disposed')throw e;
    }
   }
   state='error';
   throw last||fail('init','Không tải được động cơ');
  })();
  mine.catch(()=>{if(initPromise===mine)initPromise=null;});
  return mine;
 }

 function pump(){
  if(busy||!pending||state!=='ready'||!worker)return;
  const j=pending;pending=null;
  startJob(j);
 }

 function startJob(j){
  busy=true;running=j;
  const o=j.opts;
  if(has('Skill Level')&&o.skill!==curSkill){send('setoption name Skill Level value '+o.skill);curSkill=o.skill;}
  send('position fen '+j.fen);
  send('go'+(o.depth?' depth '+o.depth:'')+(o.movetime?' movetime '+o.movetime:'')+(!o.depth&&!o.movetime?' movetime 1000':''));
  armWatch(j,(o.movetime||1000)+(o.depth?8000:0)+4000);
 }

 function armWatch(j,ms){
  clearWatch();
  watch=setTimeout(()=>{
   watch=null;
   if(running!==j)return;
   send('stop');
   hard=setTimeout(()=>{hard=null;if(busy)crash(fail('hang','Động cơ không phản hồi'));},2500);
  },ms);
 }

 function cancel(){
  const j=running;
  if(pending){settle(pending,{cancelled:true,id:pending.id,fen:pending.fen});pending=null;}
  if(j&&!j.cancelled){
   j.cancelled=true;
   settle(j,{cancelled:true,id:j.id,fen:j.fen});
   send('stop');
   clearWatch();
   hard=setTimeout(()=>{hard=null;if(busy)crash(fail('hang','Động cơ không dừng được'));},(j.opts.movetime||1000)+3000);
  }
 }

 function search(fen,opts){
  return new Promise((resolve,reject)=>{
   if(disposed){reject(fail('disposed','Động cơ đã được giải phóng'));return;}
   if(typeof fen!=='string'||fen.split(' ').length<4){reject(fail('bad-fen','FEN không hợp lệ'));return;}
   const o=Object.assign({movetime:1500,skill:20,depth:0},opts||{});
   const j={id:++seq,fen,opts:o,resolve,reject,info:null,cancelled:false,done:false};
   cancel();
   pending=j;
   init().then(()=>{if(pending===j)pump();},err=>{if(pending===j)pending=null;rejectJob(j,err);});
  });
 }

 function whenIdle(){return busy?new Promise(r=>idleWaiters.push(r)):Promise.resolve();}

 async function newGame(){
  cancel();
  if(state!=='ready'||!worker)return;
  await Promise.race([whenIdle(),new Promise(r=>setTimeout(r,4000))]);
  if(state!=='ready'||!worker||busy)return;
  send('ucinewgame');send('isready');
  try{await expect('readyok',5000);}catch(e){}
 }

 function dispose(){
  if(disposed)return;
  disposed=true;
  const r=running,p=pending;running=null;pending=null;
  teardownWorker();
  state='disposed';initPromise=null;
  rejectWaiters(fail('disposed','Động cơ đã được giải phóng'));
  settle(r,{cancelled:true,id:r&&r.id,fen:r&&r.fen});settle(p,{cancelled:true,id:p&&p.id,fen:p&&p.fen});
  flushIdle();
 }

 return {
  init,search,cancel,newGame,dispose,
  get state(){return state;},
  get source(){return sourceId;},
  get busy(){return busy||!!pending;},
  get options(){return Object.assign({},advertised);}
 };
}

window.VqcStockfish={create:createEngine,info:ENGINE,sources:SOURCES,moveRe:MOVE_RE,parseInfo};
})();
