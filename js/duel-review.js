(function(){
 'use strict';
 if(window.vqcDuelReview)return;
 const VERSION='20261125-review-v6';
 const POLL_MS=Number(window.vqcReviewPollMs)||700;
 const BOX_ID='vqcChdReviewTools';
 let shownKey='',ctx=null,runId=0,engine=null,busy=false,lastRowId='',markPly=-1;
 const cache=Object.create(null);

 function $(id){return document.getElementById(id);}
 function D(){return window.vqcDuel||null;}
 function mkChess(){try{return typeof Chess==='function'?new Chess():null;}catch(e){return null;}}

 document.addEventListener('click',function(e){
  const r=e.target&&e.target.closest?e.target.closest('.vqc-chd-resrow[data-id]'):null;
  if(r)lastRowId=r.dataset.id||'';
 },true);
 function findRecord(id,num){
  if(!id)return null;
  try{
   for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k||k.indexOf('vqc-duel-hist-')!==0)continue;
    const list=JSON.parse(localStorage.getItem(k)||'[]');
    if(!Array.isArray(list))continue;
    const r=list.find(function(x){return x&&x.id===id;});
    if(r&&(num==null||r.num===num))return r;
   }
  }catch(e){}
  return null;
 }
 function domSans(){
  const out=[];
  document.querySelectorAll('#vqcChdHistory .vqc-chd-hrow').forEach(function(row){
   row.querySelectorAll('span').forEach(function(s){
    if(s.classList.contains('vqc-chd-hnum'))return;
    const t=(s.textContent||'').trim();
    if(t&&t!=='…'&&t!=='...')out.push(t);
   });
  });
  return out;
 }
 function domNames(){
  const o={};
  ['vqcChdTop','vqcChdBottom'].forEach(function(id){
   const el=$(id);if(!el||!el.dataset.side)return;
   const n=el.querySelector('.vqc-chd-pname');
   o[el.dataset.side]=n?String(n.textContent||'').replace(/\s*\(em\)\s*$/,'').trim():'';
  });
  return o;
 }
 function problemFen(num){
  try{const p=(D().problems()||[]).find(function(x){return x.num===num;});return p?p.fen:'';}catch(e){return '';}
 }
 function isStudentNow(){
  try{return typeof roomRef!=='undefined'&&!!roomRef&&typeof role!=='undefined'&&role==='student';}catch(e){return false;}
 }
 function vsmContext(){
  const vr=window.vqcVsmReview;
  if(!vr||typeof vr.active!=='function'||!vr.active()||typeof vr.info!=='function')return null;
  const inf=vr.info();if(!inf||!inf.rec)return null;
  const r=inf.rec,lv=(window.vqcVsMachine&&window.vqcVsMachine.levels||[]).find(function(l){return l.id===r.levelId;});
  const humanName=r.shared?'Cả lớp (giáo viên & học sinh)':(r.teacherName||'Người chơi'),aiName='Máy Stockfish'+(lv?' ('+lv.label+')':'');
  const winner=r.result==='win'?r.human:(r.result==='loss'?(r.human==='w'?'b':'w'):null);
  const rec={id:r.id,num:r.num,fen0:r.fen0,moves:r.moves,kind:r.result==='draw'?'stalemate':'manual',winner:winner,reason:r.reason,endedAtMs:r.endedAtMs};
  const c={num:r.num,live:false,rec:rec,reviewPly:inf.ply,inReview:!!inf.teacher,vsm:true,host:'vsm',varOn:!!inf.vm,reviewing:true};
  c.fen0=r.fen0;c.uci=r.moves.slice();c.sans=null;
  c.white=r.human==='w'?humanName:aiName;c.black=r.human==='w'?aiName:humanName;c.studentSide=null;
  c.event=r.kind==='chernev'?'Cờ tàn Chernev đấu với máy – bài '+r.num:'Đấu với máy';
  c.fileTag=r.kind==='chernev'?'dau-voi-may-chernev-'+r.num:'dau-voi-may';
  c.key='vsm:'+r.id;
  return c;
 }
 function pvpContext(){
  const vr=window.vqcPvpReview;
  if(!vr||typeof vr.active!=='function'||!vr.active()||typeof vr.info!=='function')return null;
  const inf=vr.info();if(!inf||!inf.rec)return null;
  const r=inf.rec;
  const rec={id:r.id,num:0,fen0:r.fen0,moves:r.moves,kind:r.winner?'manual':'stalemate',winner:r.winner,reason:r.reason,endedAtMs:r.endedAtMs};
  const c={num:0,live:false,rec:rec,reviewPly:inf.ply,inReview:!!inf.teacher,pvp:true,host:'pvp',varOn:!!inf.vm,reviewing:true};
  c.fen0=r.fen0;c.uci=r.moves.slice();c.sans=null;
  c.white=r.teacherColor==='w'?(r.teacherName||'Giáo viên'):'Học sinh';c.black=r.teacherColor==='w'?'Học sinh':(r.teacherName||'Giáo viên');c.studentSide=null;
  c.event='Đối kháng trực tuyến (giáo viên – học sinh)';c.fileTag='doi-khang-gv-hs';c.key='pvp:'+r.id;
  return c;
 }
 function context(){
  const d=D();if(!d||typeof d.state!=='function')return null;
  let st;try{st=d.state();}catch(e){return null;}
  if(!st||!st.open||st.tab!=='game')return null;
  let rec=null,num=null,live=false;
  if(st.review){
   num=st.review.num;rec=findRecord(lastRowId,num)||st.review.rec||null;
  }else if(st.match&&st.match.status==='ended'&&st.match.result&&st.match.result.kind!=='aborted'){
   const m=st.match;live=true;num=m.num;
   rec={id:m.id,num:m.num,fen0:m.fen0,moves:m.moves,sans:m.sans,studentName:m.studentName,teacherName:m.teacherName,
    studentColor:m.studentColor,teacherColor:m.teacherColor,kind:m.result.kind,winner:m.result.winner,reason:m.result.reason,endedAtMs:null};
  }else return null;
  const names=domNames();
  const c={num:num,live:live,rec:rec,reviewPly:st.review?st.review.ply:null,inReview:!!st.review,reviewing:!!st.review,varOn:!!(st.review&&st.review.vm)};
  c.fen0=(rec&&rec.fen0)||problemFen(num);
  c.uci=rec&&Array.isArray(rec.moves)&&rec.moves.length?rec.moves.slice():null;
  c.sans=c.uci?null:((rec&&Array.isArray(rec.sans)&&rec.sans.length)?rec.sans.slice():domSans());
  if(rec&&rec.studentColor){
   c.white=rec.studentColor==='w'?rec.studentName:rec.teacherName;
   c.black=rec.studentColor==='w'?rec.teacherName:rec.studentName;
   c.studentSide=rec.studentColor;
  }else{c.white=names.w||'Trắng';c.black=names.b||'Đen';c.studentSide=null;}
  c.white=String(c.white||'Trắng');c.black=String(c.black||'Đen');
  c.key=(rec&&rec.id)||('n'+num+':'+(c.uci?c.uci.join(','):(c.sans||[]).join(',')));
  return c;
 }

 function replay(c){
  if(c._rp)return c._rp;
  const g=mkChess();if(!g||!c.fen0||!g.load(c.fen0))return (c._rp={ok:false,why:'Không dựng lại được thế cờ xuất phát.'});
  const fens=[g.fen()],turns=[g.turn()],sans=[],ucis=[];
  const list=c.uci||c.sans||[];
  for(let i=0;i<list.length;i++){
   let mv=null;
   try{
    if(c.uci){
     const u=String(list[i]);mv=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});
    }else mv=g.move(String(list[i]),{sloppy:true});
   }catch(e){mv=null;}
   if(!mv)return (c._rp={ok:false,why:'Nước thứ '+(i+1)+' ("'+list[i]+'") không hợp lệ nên không dựng lại được ván.'});
   sans.push(mv.san);ucis.push(mv.from+mv.to+(mv.promotion||''));fens.push(g.fen());turns.push(g.turn());
  }
  let end=null;
  if(g.in_checkmate())end={kind:'mate',winner:g.turn()==='w'?'b':'w'};
  else if(g.in_stalemate()||g.in_draw())end={kind:'draw',winner:null};
  return (c._rp={ok:true,fens:fens,turns:turns,sans:sans,ucis:ucis,end:end});
 }

 function pgnResult(c,rp){
  const r=c.rec||{};
  const k=r.kind;
  if((k==='mate'||k==='timeout'||k==='resign'||k==='manual')&&(r.winner==='w'||r.winner==='b'))return r.winner==='w'?'1-0':'0-1';
  if(k==='stalemate'||k==='insufficient'||k==='threefold'||k==='fifty')return '1/2-1/2';
  if(rp&&rp.end){return rp.end.winner==='w'?'1-0':rp.end.winner==='b'?'0-1':'1/2-1/2';}
  return '*';
 }
 function esc(s){return String(s==null?'':s).replace(/[\r\n]+/g,' ').replace(/\\/g,'\\\\').replace(/"/g,'\\"');}
 function pad(n){return (n<10?'0':'')+n;}
 function buildPgn(c){
  const rp=replay(c);if(!rp.ok)return {ok:false,why:rp.why};
  const res=pgnResult(c,rp);
  const when=new Date((c.rec&&c.rec.endedAtMs)||Date.now());
  const date=when.getFullYear()+'.'+pad(when.getMonth()+1)+'.'+pad(when.getDate());
  const parts=String(c.fen0).split(' ');
  let n=parseInt(parts[5],10);if(isNaN(n)||n<1)n=1;
  const blackFirst=parts[1]==='b';
  const tok=[];let side=blackFirst?'b':'w',mn=n;
  rp.sans.forEach(function(s,i){
   if(side==='w'){tok.push(mn+'. '+s);}
   else{tok.push((i===0?mn+'... ':'')+s);mn++;}
   side=side==='w'?'b':'w';
  });
  const reason=c.rec&&c.rec.reason?String(c.rec.reason).replace(/[{}]/g,'').replace(/\s+/g,' ').trim():'';
  let body=tok.join(' ');
  if(reason)body+=(body?' ':'')+'{ '+reason+' }';
  body+=(body?' ':'')+res;
  const words=body.split(' ');let lines=[],cur='';
  words.forEach(function(w){if(cur&&(cur+' '+w).length>80){lines.push(cur);cur=w;}else cur=cur?cur+' '+w:w;});
  if(cur)lines.push(cur);
  const head=[
   ['Event',c.event||'Đấu cờ tàn Chernev – bài '+c.num],['Site','Đảo Kỳ Thủ'],['Date',date],['Round','-'],
   ['White',c.white],['Black',c.black],['Result',res],['SetUp','1'],['FEN',c.fen0]
  ].map(function(h){return '['+h[0]+' "'+esc(h[1])+'"]';});
  const text=head.join('\n')+'\n\n'+lines.join('\n')+'\n';
  const fname=(c.fileTag||'chernev-bai-'+c.num)+'-'+when.getFullYear()+pad(when.getMonth()+1)+pad(when.getDate())+'-'+pad(when.getHours())+pad(when.getMinutes())+'.pgn';
  return {ok:true,text:text,file:fname,result:res};
 }
 function download(text,file){
  const blob=new Blob([text],{type:'application/x-chess-pgn;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=file;a.style.display='none';
  document.body.appendChild(a);a.click();
  setTimeout(function(){try{a.remove();}catch(e){}URL.revokeObjectURL(url);},4000);
 }
 async function copyText(text){
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);return true;}}catch(e){}
  try{
   const t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;left:-999px;top:0';
   document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();return !!ok;
  }catch(e){return false;}
 }

 function whiteEval(info,turn){
  if(!info)return null;
  let v=null;
  if(typeof info.mate==='number'&&info.mate!==0){
   const m=info.mate;v=(m>0?1:-1)*(10000-Math.min(Math.abs(m),99));
  }else if(typeof info.cp==='number')v=info.cp;
  if(v==null)return null;
  return turn==='w'?v:-v;
 }
 function clampEval(v){return Math.max(-1000,Math.min(1000,v));}
 function fmtEval(v){
  if(v==null)return '?';
  if(Math.abs(v)>=9000){const m=10000-Math.abs(v);return (v>0?'+M':'-M')+m;}
  const x=v/100;return (x>0?'+':'')+x.toFixed(1);
 }
 function disposeEngine(){
  if(engine){try{engine.dispose();}catch(e){}engine=null;}
 }
  const CLS=[
  {id:'best',ch:'b',label:'Nước đi tốt nhất',icon:'★',color:'#2f9e6e'},
  {id:'excellent',ch:'e',label:'Nước đi xuất sắc',icon:'!',color:'#43a047'},
  {id:'good',ch:'g',label:'Nước đi tốt',icon:'✓',color:'#7cb342'},
  {id:'accurate',ch:'a',label:'Nước đi chính xác',icon:'○',color:'#78909c'},
  {id:'inaccuracy',ch:'i',label:'Nước đi thiếu chính xác',icon:'?!',color:'#d99a00'},
  {id:'mistake',ch:'m',label:'Sai lầm',icon:'?',color:'#ef7d1a'},
  {id:'blunder',ch:'x',label:'Sai lầm nghiêm trọng',icon:'??',color:'#e5484d'}
 ];
 const CLS_ID={},CLS_CH={};
 CLS.forEach(function(k){CLS_ID[k.id]=k;CLS_CH[k.ch]=k;});
 function winPct(v){const c=Math.max(-1000,Math.min(1000,v));return 50+50*(2/(1+Math.exp(-0.00368208*c))-1);}
 function classifyLoss(loss,playedBest){
  if(playedBest||loss<=0.5)return 'best';
  if(loss<=2)return 'excellent';
  if(loss<=5)return 'good';
  if(loss<=10)return 'accurate';
  if(loss<=20)return 'inaccuracy';
  if(loss<=30)return 'mistake';
  return 'blunder';
 }
 function moveAcc(loss){return Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*loss)-3.1669));}
 function sideAcc(moves,side){
  const xs=moves.filter(function(m){return m.side===side&&m.loss!=null;});
  if(xs.length<3)return null;
  let t=0;xs.forEach(function(m){t+=moveAcc(m.loss);});
  return Math.round(t/xs.length*10)/10;
 }
 function uciToSan(fen,u){
  if(!u||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))return '';
  const h=mkChess();if(!h||!h.load(fen))return '';
  let mv=null;try{mv=h.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){}
  return mv?mv.san:'';
 }
 function pvToSan(fen,pv,limit){
  const h=mkChess();if(!h||!h.load(fen)||!pv)return [];
  const out=[];
  for(let i=0;i<pv.length&&i<limit;i++){
   const u=pv[i];let mv=null;
   try{mv=h.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){}
   if(!mv)break;out.push(mv.san);
  }
  return out;
 }
 function mateIn(v){return 10000-Math.abs(v);}
 function explainLoss(m){
  let t='Điểm '+fmtEval(m.before)+' → '+fmtEval(m.after)+'; mất khoảng '+Math.round(m.loss)+'% cơ hội so với nước tốt nhất.';
  if(m.best)t+=' Máy chọn: '+m.best+'.';
  return t;
 }
 function keyMoments(moves,evals){
  const map=new Map();
  const put=function(m,kind,text){map.set(m.ply,{ply:m.ply,side:m.side,san:m.san,kind:kind,text:text,cls:m.cls});};
  moves.filter(function(m){return m.cls==='blunder'||m.cls==='mistake';}).sort(function(a,b){return b.loss-a.loss;}).slice(0,5).forEach(function(m){put(m,'error',explainLoss(m));});
  moves.forEach(function(m){
   if(m.before==null||m.after==null)return;
   const sg=m.side==='w'?1:-1,a=m.before*sg,b=m.after*sg;
   if(a>=9000&&b<9000)put(m,'missed','Bỏ lỡ nước chiếu hết sau '+mateIn(m.before)+' nước.'+(m.best?' Máy chọn: '+m.best+'.':''));
   else if(m.pb>=80&&m.pa<60&&m.loss>=20)put(m,'missed','Bỏ lỡ cơ hội chiến thắng: '+explainLoss(m));
   else if(b<=-9000&&a>-9000)put(m,'tactic','Nước đi này cho đối phương chiếu hết sau '+mateIn(m.after)+' nước.');
  });
  let top=null;
  moves.forEach(function(m){
   if(m.before==null||m.after==null)return;
   const wa=winPct(m.before),wb=winPct(m.after);
   if((wa-50)*(wb-50)<0||(Math.abs(wa-50)<8&&Math.abs(wb-50)>=25)){
    const sw=Math.abs(wb-wa);
    if(sw>=25&&(!top||sw>top.sw))top={m:m,sw:sw};
   }
  });
  if(top){
   const old=map.get(top.m.ply);
   put(top.m,'turning','Lợi thế đổi chiều: '+fmtEval(top.m.before)+' → '+fmtEval(top.m.after)+'.'+(old&&old.kind==='error'&&top.m.best?' Máy chọn: '+top.m.best+'.':''));
  }
  const last=moves[moves.length-1];
  if(last&&last.after!=null&&Math.abs(last.after)>=9000&&last.after*(last.side==='w'?1:-1)>0&&mateIn(last.after)===0)put(last,'tactic','Nước đi chiếu hết, kết thúc ván.');
  return Array.from(map.values()).sort(function(a,b){return a.ply-b.ply;}).slice(0,8);
 }
 function buildReport(rp,evals,best,depths,pvs){
  const moves=[];
  for(let i=0;i<rp.sans.length;i++){
   const side=rp.turns[i],a=evals[i],b=evals[i+1];
   const base={ply:i+1,side:side,san:rp.sans[i],cls:null,loss:null,pb:null,pa:null,before:a,after:b,best:''};
   if(a!=null&&b!=null){
    const wa=winPct(a),wb=winPct(b);
    base.pb=side==='w'?wa:100-wa;base.pa=side==='w'?wb:100-wb;
    base.loss=Math.max(0,base.pb-base.pa);
    const sg=side==='w'?1:-1;
    const playedBest=(best[i]&&best[i]===rp.ucis[i])||(b*sg>=9000);
    base.cls=classifyLoss(base.loss,playedBest);
    if(base.cls!=='best'&&best[i])base.best=uciToSan(rp.fens[i],best[i]);
   }
   moves.push(base);
  }
  const counts={w:{},b:{}};
  CLS.forEach(function(k){counts.w[k.id]=0;counts.b[k.id]=0;});
  moves.forEach(function(m){if(m.cls)counts[m.side][m.cls]++;});
  return {evals:evals,best:best,depths:depths,pvs:pvs,sans:rp.sans,turns:rp.turns,moves:moves,counts:counts,
   acc:{w:sideAcc(moves,'w'),b:sideAcc(moves,'b')},moments:keyMoments(moves,evals)};
 }
 function qString(res){
  let s='';
  res.moves.forEach(function(m){s+=m.cls?CLS_ID[m.cls].ch:'-';});
  return s;
 }
 function shareAnalysis(res){
  return {accW:res.acc.w,accB:res.acc.b,cnt:res.counts,q:qString(res).slice(0,600),
   moments:res.moments.slice(0,8).map(function(x){return {ply:x.ply,side:x.side,san:String(x.san).slice(0,12),kind:x.kind,text:String(x.text).slice(0,200)};})};
 }
 async function analyse(c,onProgress,id){
  const rp=replay(c);if(!rp.ok)throw new Error(rp.why);
  if(!window.VqcStockfish)throw new Error('Chưa tải được mô-đun động cơ Stockfish.');
  engine=window.VqcStockfish.create({onStatus:function(){}});
  const total=rp.fens.length,mt=total>90?150:250;
  const evals=[],best=[],depths=[],pvs=[];
  for(let i=0;i<total;i++){
   if(id!==runId)return null;
   const g=mkChess();g.load(rp.fens[i]);
   if(g.in_checkmate()){evals.push(rp.turns[i]==='w'?-10000:10000);best.push(null);depths.push(0);pvs.push([]);}
   else if(g.in_stalemate()||g.in_draw()){evals.push(0);best.push(null);depths.push(0);pvs.push([]);}
   else{
    let r=null;
    try{r=await engine.search(rp.fens[i],{movetime:mt,skill:20});}
    catch(e){if(id!==runId)return null;throw e;}
    if(id!==runId||(r&&r.cancelled))return null;
    evals.push(r&&r.valid!==false&&!r.none?whiteEval(r.info,rp.turns[i]):null);
    best.push(r&&r.bestmove&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(r.bestmove)?r.bestmove:null);
    depths.push(r&&r.info&&Number.isFinite(r.info.depth)?r.info.depth:0);
    pvs.push(r&&r.info&&Array.isArray(r.info.pv)?r.info.pv.slice(0,8):[]);
   }
   if(onProgress)onProgress(i+1,total);
  }
  return buildReport(rp,evals,best,depths,pvs);
 }

function css(){
  if($('vqcRevCss'))return;
  const st=document.createElement('style');st.id='vqcRevCss';
  st.textContent='#'+BOX_ID+'{margin:10px 0 4px;padding:10px 12px;border:1px solid rgba(120,120,120,.35);border-radius:12px;background:rgba(255,255,255,.55);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:inherit}'+
   '#'+BOX_ID+'[hidden]{display:none}#'+BOX_ID+' h3{margin:0 0 8px;font-size:15px}'+
   '#'+BOX_ID+' .vqc-rev-btns{display:flex;flex-wrap:wrap;gap:8px}'+
   '#'+BOX_ID+' button{font:inherit;font-weight:700;padding:7px 12px;border-radius:10px;border:1px solid rgba(60,60,60,.35);background:#fff;color:#222;cursor:pointer}'+
   '#'+BOX_ID+' button:hover{background:#f1f6ff}#'+BOX_ID+' button:disabled{opacity:.55;cursor:default}'+
   '#'+BOX_ID+' .vqc-rev-msg{margin:8px 0 0;min-height:1.2em;font-size:13px}#'+BOX_ID+' .vqc-rev-msg.err{color:#b3261e}'+
   '#'+BOX_ID+' .vqc-rev-chart{display:block;width:100%;height:auto;margin-top:8px;border-radius:8px;cursor:default}#'+BOX_ID+' .vqc-rev-chart.jump{cursor:pointer}'+
   '#'+BOX_ID+' ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px}'+
   '#'+BOX_ID+' li button{width:100%;text-align:left;font-weight:600;padding:6px 10px;display:block}'+
   '#'+BOX_ID+' li.sm button{cursor:default}#'+BOX_ID+' li small{display:block;font-weight:400;color:#555}'+
   '#'+BOX_ID+' .vqc-rev-sum{margin:8px 0 0;font-size:13px}';
  st.textContent+='#vqcRevStu{margin:10px 0 4px;padding:10px 12px;border:1px solid rgba(120,120,120,.35);border-radius:12px;background:rgba(255,255,255,.55);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:inherit}'+
   '#vqcRevStu[hidden],#vqcChdReviewTools .vqc-rev-notes[hidden]{display:none}#vqcRevStu h3{margin:0 0 6px;font-size:15px}'+
   '#vqcChdReviewTools h4,#vqcRevStu h4{margin:10px 0 4px;font-size:13px}.vqc-rev-gen{white-space:pre-wrap;margin:0 0 6px}'+
   '#vqcRevStu ul{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}'+
   '#vqcRevStu li button{width:100%;text-align:left;font:inherit;font-weight:600;padding:6px 10px;border-radius:10px;border:1px solid rgba(60,60,60,.25);background:#fff;color:#222;cursor:default;display:block}'+
   '#vqcRevStu li small{display:block;font-weight:400;color:#555}'+
   '#vqcChdReviewTools .vqc-rev-opts{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:13px}'+
   '#vqcChdReviewTools .vqc-rev-opts label{display:inline-flex;gap:5px;align-items:center;cursor:pointer}'+
   '.vqc-rev-keys{margin:6px 0 0;font-size:12px;color:#666}'+
   '.vqc-rev-tbl{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}'+
   '.vqc-rev-tbl th,.vqc-rev-tbl td{padding:4px 6px;border-bottom:1px solid rgba(120,120,120,.2);text-align:center}'+
   '.vqc-rev-tbl th:first-child,.vqc-rev-tbl td:first-child{text-align:left}'+
   '.vqc-rev-acc{font-weight:800;font-size:15px}'+
   '.vqc-rev-dot{display:inline-block;min-width:22px;padding:1px 5px;border-radius:11px;color:#fff;font-weight:800;font-size:11px;text-align:center}'+
   '.vqc-rev-note{margin:6px 0 0;font-size:12px;color:#666}'+
   '.vqc-rev-cur{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(47,158,110,.1)}.vqc-rev-cur:empty{display:none}'+
   '.vqc-rev-curhead{margin:0 0 4px;font-weight:800}'+
   '.vqc-rev-kind{display:inline-block;margin-left:6px;padding:0 6px;border-radius:8px;background:#e8f1fb;font-style:normal;font-size:11px;font-weight:700}'+
   '.vqc-rev-notes{margin-top:10px;border-top:1px dashed rgba(120,120,120,.4);padding-top:8px}.vqc-rev-notes summary{cursor:pointer;font-weight:800}'+
   '.vqc-rev-notes textarea,.vqc-rev-notes input[type=text]{width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(60,60,60,.3)}'+
   '.vqc-rev-nmv{display:grid;gap:6px;margin:8px 0}.vqc-rev-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}'+
   '.vqc-rev-notes [data-n="status"]{font-size:12px}.vqc-rev-notes [data-n="status"].err{color:#b3261e}'+
   '.vqc-rev-notes ul{list-style:none;margin:6px 0;padding:0;display:grid;gap:4px}.vqc-rev-notes li button{width:100%;text-align:left;font-weight:600;padding:5px 10px;display:block}'+
   'span[data-q]::after{content:attr(data-qi);margin-left:3px;font-size:.78em;font-weight:800;color:var(--qc)}'+
   '.vqc-rev-click{cursor:pointer;border-radius:4px}.vqc-rev-click:hover{background:rgba(42,123,185,.15)}'+
   ':root[data-vqc-rev-coords="off"] :is(.vqc-chd-rank,.vqc-chd-file,.vqc-vsm-rank,.vqc-vsm-file,.pvp-coord){display:none!important}';
  document.head.appendChild(st);
 }
 function makeBox(vsm){
  let box=$(BOX_ID),panel,wrap;
  if(vsm==='vsm'){panel=document.querySelector('#vqcVsMachineOverlay .vqc-vsm-side');wrap=panel&&panel.querySelector('.vqc-vsm-histwrap');}
  else if(vsm==='pvp'){panel=document.querySelector('#pvpOverlay .pvp-side');wrap=panel&&panel.querySelector('#pvpHistory');}
  else{panel=$('vqcChdPanelGame');wrap=panel&&panel.querySelector('.vqc-chd-histwrap');}
  if(!panel)return box||null;
  if(box){
   if(box.parentNode!==panel){if(wrap&&wrap.parentNode===panel&&wrap.nextSibling)panel.insertBefore(box,wrap.nextSibling);else panel.appendChild(box);}
   return box;
  }
  css();
  box=document.createElement('div');box.id=BOX_ID;box.hidden=true;
  box.innerHTML='<h3>📁 Lưu & xem lại ván</h3>'+
   '<div class="vqc-rev-btns"><button type="button" data-act="pgn">📥 Tải PGN</button><button type="button" data-act="copy">📋 Sao chép PGN</button>'+
   '<button type="button" data-act="analyse">🤖 Phân tích ván</button><button type="button" data-act="stop" hidden>⏹ Dừng</button></div>'+
   '<div class="vqc-rev-opts"><label><input type="checkbox" data-opt="arrows" checked> ➚ Mũi tên nước đi</label><label><input type="checkbox" data-opt="coords" checked> Tọa độ bàn cờ</label></div>'+
   '<p class="vqc-rev-keys">Phím tắt khi xem lại: ← lùi · → tiến · Home về đầu · End đến cuối · Space phát/tạm dừng</p>'+
   '<p class="vqc-rev-msg" role="status" aria-live="polite"></p><div class="vqc-rev-out"></div>'+
   '<details class="vqc-rev-notes" open hidden><summary>📝 Ghi chú của giáo viên</summary>'+
   '<label>Nhận xét chung về ván đấu<textarea data-n="general" rows="3" maxlength="1500" placeholder="Nhận xét cho học sinh…"></textarea></label>'+
   '<div class="vqc-rev-nmv"><b data-n="curlabel"></b><input type="text" data-n="mvtext" maxlength="200" placeholder="Ghi chú cho nước đang xem">'+
   '<div class="vqc-rev-row"><label><input type="checkbox" data-n="flag"> ⭐ Cần chú ý</label><button type="button" data-act="notemove">Lưu cho nước này</button><button type="button" data-act="notedel">Xóa</button></div></div>'+
   '<ul data-n="list"></ul>'+
   '<label class="vqc-rev-row"><input type="checkbox" data-n="shared"> Chia sẻ với học sinh (ghi chú và kết quả phân tích)</label>'+
   '<div class="vqc-rev-row"><button type="button" data-act="notesave">💾 Lưu ghi chú</button><span data-n="status" role="status"></span></div></details>';
  if(wrap&&wrap.parentNode===panel&&wrap.nextSibling)panel.insertBefore(box,wrap.nextSibling);else panel.appendChild(box);
  box.addEventListener('click',onClick);
  box.addEventListener('input',onBoxInput);
  box.addEventListener('change',function(e){onOpt(e);onBoxInput(e);});
  return box;
 }
 function msg(text,err){
  const box=$(BOX_ID);if(!box)return;
  const p=box.querySelector('.vqc-rev-msg');p.textContent=text||'';p.classList.toggle('err',!!err);
 }
 function setBusy(b){
  busy=b;
  const box=$(BOX_ID);if(!box)return;
  box.querySelector('[data-act="analyse"]').disabled=b;
  box.querySelector('[data-act="stop"]').hidden=!b;
 }
 function sideName(c,s){return s==='w'?c.white:c.black;}
 function renderChart(c,res){
  const n=res.evals.length-1,W=300,H=90,mid=H/2;
  const X=function(i){return n>0?i/n*W:0;};
  const Y=function(v){return mid-Math.max(-800,Math.min(800,v==null?0:v))/800*(mid-4);};
  let pts=[];for(let i=0;i<=n;i++)pts.push(X(i).toFixed(1)+','+Y(res.evals[i]).toFixed(1));
  const svg='<svg class="vqc-rev-chart'+(c.inReview?' jump':'')+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Đồ thị lợi thế của ván">'+
   '<rect width="'+W+'" height="'+H+'" fill="#4a4a4a"/>'+
   '<polygon points="0,'+H+' '+pts.join(' ')+' '+W+','+H+'" fill="#fafafa"/>'+
   '<line x1="0" x2="'+W+'" y1="'+mid+'" y2="'+mid+'" stroke="#e5a400" stroke-width="1" stroke-dasharray="4 3"/>'+
   '<polyline points="'+pts.join(' ')+'" fill="none" stroke="#2f9e6e" stroke-width="1.6"/>'+
   '<line class="vqc-rev-mark" x1="-5" x2="-5" y1="0" y2="'+H+'" stroke="#e5484d" stroke-width="1.5"/>'+
   '<text x="4" y="11" font-size="9" fill="#4a4a4a">⚪ tốt hơn</text><text x="4" y="'+(H-4)+'" font-size="9" fill="#fafafa">⚫ tốt hơn</text></svg>';
  return svg;
 }
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function moveLabel(c,ply,san){
  const parts=String(c.fen0).split(' '),startOff=parts[1]==='b'?1:0,fm=parseInt(parts[5],10)||1;
  const side=(ply-1+startOff)%2===0?'w':'b';
  return (fm+Math.floor((ply-1+startOff)/2))+(side==='w'?'. ':'... ')+san;
 }
 function fmtDuration(ms){
  const s=Math.round(ms/1000),m=Math.floor(s/60);
  return m>0?(m+' phút '+(s%60)+' giây'):(s+' giây');
 }
 function resultWords(c){
  const rp=replay(c),r=pgnResult(c,rp);
  if(r==='1-0')return c.white+' (⚪) thắng';
  if(r==='0-1')return c.black+' (⚫) thắng';
  if(r==='1/2-1/2')return 'Hòa';
  return 'Chưa rõ';
 }
 function durationOf(c){
  const r=c.rec||{};
  if(Number.isFinite(r.playedMs)&&r.playedMs>0)return r.playedMs;
  if(Number.isFinite(r.endedAtMs)&&Number.isFinite(r.startedAtMs)&&r.endedAtMs>r.startedAtMs)return r.endedAtMs-r.startedAtMs;
  return null;
 }
 function summaryTable(c,res){
  const wrap=el('div','vqc-rev-summary');
  const info=['Số nước đi: '+res.sans.length,'Kết quả: '+resultWords(c)];
  const d=durationOf(c);if(d)info.push('Thời lượng: '+fmtDuration(d));
  wrap.appendChild(el('p','vqc-rev-sum',info.join(' · ')));
  const t=el('table','vqc-rev-tbl');
  const head=el('tr');head.appendChild(el('th','',''));
  head.appendChild(el('th','','⚪ '+c.white));head.appendChild(el('th','','⚫ '+c.black));t.appendChild(head);
  const ar=el('tr');ar.appendChild(el('td','','Độ chính xác (ước tính)'));
  ['w','b'].forEach(function(s){ar.appendChild(el('td','vqc-rev-acc',res.acc[s]==null?'—':res.acc[s].toFixed(1)+'%'));});
  t.appendChild(ar);
  CLS.forEach(function(k){
   const tr=el('tr');const th=el('td');
   const dot=el('span','vqc-rev-dot',k.icon);dot.style.background=k.color;
   th.appendChild(dot);th.appendChild(document.createTextNode(' '+k.label));tr.appendChild(th);
   ['w','b'].forEach(function(s){tr.appendChild(el('td','',String(res.counts[s][k.id])));});
   t.appendChild(tr);
  });
  wrap.appendChild(t);
  wrap.appendChild(el('p','vqc-rev-note','Điểm và nhãn tính theo thay đổi xác suất thắng giữa thế cờ trước và sau nước đi, do Stockfish đánh giá ở thời gian ngắn nên chỉ là ước tính.'));
  return wrap;
 }
 const KIND_LABEL={error:'',missed:'Cơ hội bị bỏ lỡ',turning:'Bước ngoặt',tactic:'Tình huống chiến thuật'};
 function momentsList(c,res){
  const box=el('div','vqc-rev-moments');
  box.appendChild(el('h4','','Những thời điểm đáng chú ý'));
  if(!res.moments.length){box.appendChild(el('p','vqc-rev-sum','Máy không thấy thời điểm nào thay đổi đáng kể đánh giá thế cờ.'));return box;}
  const ul=el('ul');
  res.moments.forEach(function(m){
   const li=el('li',c.inReview?'':'sm');const b=el('button');b.type='button';
   const k=CLS_ID[m.cls];
   const lab=KIND_LABEL[m.kind]||(k?k.label:'');
   const title=moveLabel(c,m.ply,m.san)+(k?' '+k.icon:'')+' — '+sideName(c,m.side)+' ('+(m.side==='w'?'⚪':'⚫')+')';
   b.appendChild(document.createTextNode(title));
   if(lab){const tag=el('em','vqc-rev-kind',lab);b.appendChild(tag);}
   b.appendChild(el('small','',m.text));
   b.addEventListener('click',function(){if(c.inReview)jump(m.ply);});
   li.appendChild(b);ul.appendChild(li);
  });
  box.appendChild(ul);
  if(!c.inReview)box.appendChild(el('p','vqc-rev-sum','Mở ván trong tab “Kết quả đã lưu” để bấm vào từng nước và xem lại trên bàn cờ.'));
  return box;
 }
 function renderResult(c,res){
  const out=$(BOX_ID).querySelector('.vqc-rev-out');
  out.replaceChildren();
  out.appendChild(el('div','vqc-rev-cur'));
  out.appendChild(summaryTable(c,res));
  const holder=document.createElement('div');holder.innerHTML=renderChart(c,res);
  const svg=holder.firstChild;out.appendChild(svg);
  svg.addEventListener('click',function(ev){
   if(!c.inReview)return;
   const r=svg.getBoundingClientRect();if(!r.width)return;
   const n=res.evals.length-1;jump(Math.round((ev.clientX-r.left)/r.width*n));
  });
  out.appendChild(momentsList(c,res));
  markPly=-2;curKey='';updateMark();updateCur();
 }
 function updateMark(){
  const box=$(BOX_ID);if(!box||!ctx)return;
  const line=box.querySelector('.vqc-rev-mark');if(!line)return;
  const cached=cache[ctx.key];if(!cached)return;
  const ply=ctx.reviewPly;if(ply===markPly)return;markPly=ply;
  const n=cached.evals.length-1;
  const x=ply==null||n<=0?-5:(ply/n*300);
  line.setAttribute('x1',x);line.setAttribute('x2',x);
 }
 function updateCur(){
  const box=$(BOX_ID);if(!box||!ctx)return;
  const holder=box.querySelector('.vqc-rev-cur');if(!holder)return;
  const res=cache[ctx.key];if(!res){holder.replaceChildren();curKey='';return;}
  const ply=ctx.reviewPly==null?-1:ctx.reviewPly,key=ctx.key+'|'+ply+'|'+(ctx.varOn?1:0);
  if(key===curKey)return;curKey=key;
  holder.replaceChildren();
  if(ply<0)return;
  holder.appendChild(el('h4','','Phân tích nước đang xem'));
  if(ctx.varOn){holder.appendChild(el('p','vqc-rev-sum','Đang xem nước đi thử. Bấm “Về thế cờ hiện tại” để xem lại đánh giá của ván gốc.'));return;}
  const m=ply>=1?res.moves[ply-1]:null;
  if(m){
   const k=m.cls?CLS_ID[m.cls]:null;
   const head=el('p','vqc-rev-curhead');
   head.appendChild(document.createTextNode(moveLabel(ctx,ply,m.san)+' '));
   if(k){const dot=el('span','vqc-rev-dot',k.icon);dot.style.background=k.color;head.appendChild(dot);head.appendChild(document.createTextNode(' '+k.label));}
   else head.appendChild(document.createTextNode('(máy chưa đánh giá được nước này)'));
   holder.appendChild(head);
   if(m.cls&&m.cls!=='best'&&m.best&&m.loss>=2)holder.appendChild(el('p','vqc-rev-sum',explainLoss(m)));
  }else holder.appendChild(el('p','vqc-rev-sum','Thế cờ xuất phát.'));
  const ev=res.evals[ply];
  const lines=['Điểm sau nước này: '+fmtEval(ev)];
  const d=res.depths[ply],pv=res.pvs[ply],bs=res.best[ply];
  if(bs)lines.push('Nước máy đề xuất tiếp theo: '+uciToSan(replay(ctx).fens[ply],bs));
  if(d)lines.push('Độ sâu tìm kiếm: '+d);
  holder.appendChild(el('p','vqc-rev-sum',lines.join(' · ')));
  const san=pvToSan(replay(ctx).fens[ply],pv,6);
  if(san.length)holder.appendChild(el('p','vqc-rev-sum','Biến chính: '+san.join(' ')));
 }

function jump(ply){
  if(ctx&&ctx.vsm){if(window.vqcVsmReview&&window.vqcVsmReview.jump)window.vqcVsmReview.jump(ply);return;}
  if(ctx&&ctx.pvp){if(window.vqcPvpReview&&window.vqcPvpReview.jump)window.vqcPvpReview.jump(ply);return;}
  const bar=$('vqcChdReplayBar');if(!bar||bar.hidden)return;
  const first=bar.querySelector('[data-step="-Infinity"]'),next=bar.querySelector('[data-step="1"]');
  if(!first||!next)return;
  first.click();
  for(let i=0;i<ply;i++)next.click();
 }

 async function onClick(ev){
  const b=ev.target&&ev.target.closest?ev.target.closest('button[data-act]'):null;if(!b)return;
  const act=b.dataset.act;
  if(act==='stop'){runId++;disposeEngine();setBusy(false);msg('Đã dừng phân tích.');return;}
  if(act.indexOf('note')===0){noteAct(act);return;}
  if(!ctx){msg('Chưa có ván để xử lý.',true);return;}
  const c=ctx;
  if(act==='pgn'||act==='copy'){
   const p=buildPgn(c);
   if(!p.ok){msg(p.why,true);return;}
   if(act==='pgn'){download(p.text,p.file);msg('Đã tạo tệp '+p.file+' (kết quả '+p.result+').');}
   else{const ok=await copyText(p.text);msg(ok?'Đã sao chép PGN vào bộ nhớ tạm.':'Không sao chép được — hãy dùng nút “Tải PGN”.',!ok);}
   return;
  }
  if(act==='analyse'){
   if(busy)return;
   if(cache[c.key]){renderResult(c,cache[c.key]);msg('Kết quả phân tích (đã có sẵn).');return;}
   if(!window.VqcStockfish){msg('Chưa tải được động cơ Stockfish. Hãy tải lại trang (Ctrl+F5) rồi thử lại.',true);return;}
   const id=++runId;setBusy(true);msg('Đang chuẩn bị động cơ…');
   $(BOX_ID).querySelector('.vqc-rev-out').replaceChildren();
   try{
    const res=await analyse(c,function(i,t){if(id===runId)msg('Đang phân tích… '+i+'/'+t+' thế cờ');},id);
    if(id!==runId)return;
    disposeEngine();setBusy(false);
    if(!res){msg('Đã dừng phân tích.');return;}
    cache[c.key]=res;
    if(ctx&&ctx.key===c.key){renderResult(ctx,res);msg('Xong. Điểm tính theo góc nhìn của Trắng (⚪). Bấm vào nước đi hoặc thời điểm đáng chú ý để xem trên bàn cờ.');}
   }catch(e){
    if(id!==runId)return;
    disposeEngine();setBusy(false);
    msg('Không phân tích được: '+(e&&e.message?e.message:'lỗi không rõ')+'.',true);
   }
  }
 }

  const NOTES_COLL='reviewNotes',STU_ID='vqcRevStu';
 const BAR={chd:'vqcChdReplayBar',vsm:'vqcVsrBar',pvp:'vqcPvrBar'};
 const HIST={chd:'#vqcChdHistory .vqc-chd-hrow > span:not(.vqc-chd-hnum)',vsm:'#vqcVsmHistory .vqc-vsm-hrow > span:not(.vqc-vsm-hnum)',pvp:'#pvpHistory .vpr-mv'};
 const BOARD={chd:'vqcChdBoard',vsm:'vqcVsmBoard',pvp:'pvpBoard'};
 let notes=null,notesKey='',stuUnsub=null,stuKey='',stuNotes=null,stuCtx=null;
 let playing=false,playTimer=0,autoClick=false,curKey='',scrollKey='',arrowsOn=true,coordsOn=true;
 try{arrowsOn=localStorage.getItem('vqc-rev-arrows')!=='0';coordsOn=localStorage.getItem('vqc-rev-coords')!=='0';}catch(e){}
 const observed=new WeakSet();

 function hostOf(c){return c&&c.host?c.host:'chd';}
 function uidNow(){
  try{if(typeof auth!=='undefined'&&auth.currentUser&&auth.currentUser.uid)return auth.currentUser.uid;}catch(e){}
  return (window.accountProfile&&window.accountProfile.uid)||'';
 }
 function noteId(c){return hostOf(c)+'-'+String((c.rec&&c.rec.id)||c.key).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,120);}
 function lsNotesKey(){return 'vqc-rev-notes-'+(uidNow()||'anon');}
 function readLocal(id){try{const o=JSON.parse(localStorage.getItem(lsNotesKey())||'{}');return o&&o[id]||null;}catch(e){return null;}}
 function writeLocal(id,v){try{const o=JSON.parse(localStorage.getItem(lsNotesKey())||'{}')||{};o[id]=v;localStorage.setItem(lsNotesKey(),JSON.stringify(o));}catch(e){}}
 function cleanNotes(o){
  const marks={};let n=0;
  const src=o&&o.marks&&typeof o.marks==='object'?o.marks:{};
  Object.keys(src).filter(function(k){return /^\d{1,4}$/.test(k);}).sort(function(a,b){return a-b;}).forEach(function(k){
   if(n>=80)return;const m=src[k]||{};marks[k]={f:m.f?1:0,t:String(m.t||'').slice(0,200)};n++;
  });
  return {general:String((o&&o.general)||'').slice(0,1500),marks:marks,shared:!!(o&&o.shared)};
 }
 function plyCount(c){return c?(c.uci||c.sans||[]).length:0;}
 function setNoteStatus(t,err){
  const s=$(BOX_ID)&&$(BOX_ID).querySelector('[data-n="status"]');if(!s)return;
  s.textContent=t||'';s.classList.toggle('err',!!err);
 }
 async function loadNotes(c){
  const id=noteId(c);notesKey=id;
  notes=cleanNotes(readLocal(id)||{});
  paintNotes(true);
  if(typeof db==='undefined'||!uidNow())return;
  try{
   const s=await db.collection(NOTES_COLL).doc(id).get();
   if(notesKey!==id)return;
   if(s.exists){notes=cleanNotes(s.data());writeLocal(id,notes);paintNotes(true);}
  }catch(e){}
 }
 async function saveNotes(c){
  if(!notes)return;
  const id=noteId(c);
  const clean=cleanNotes(notes);notes=clean;
  writeLocal(id,clean);
  if(typeof db==='undefined'||!uidNow()){setNoteStatus('Đã lưu ghi chú trên máy này.');return;}
  const res=cache[c.key];
  const data={id:id,mode:hostOf(c),teacherId:uidNow(),gameId:String((c.rec&&c.rec.id)||c.key).slice(0,120),
   general:clean.general,marks:clean.marks,shared:clean.shared,analysis:(clean.shared&&res)?shareAnalysis(res):null,
   updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  setNoteStatus('Đang lưu…');
  try{
   await db.collection(NOTES_COLL).doc(id).set(data);
   setNoteStatus(clean.shared?(res?'Đã lưu và chia sẻ với học sinh.':'Đã lưu và chia sẻ ghi chú. Hãy bấm “Phân tích ván” rồi lưu lại để học sinh thấy cả kết quả phân tích.'):'Đã lưu ghi chú (chỉ giáo viên thấy).');
  }catch(e){
   setNoteStatus((e&&e.code==='permission-denied')?'Chưa lưu được lên Firebase: cần đăng bản Rules mới có reviewNotes. Ghi chú được giữ trên máy này.':'Chưa lưu được lên Firebase. Ghi chú được giữ trên máy này.',true);
  }
 }
 function paintNotes(force){
  const box=$(BOX_ID);if(!box)return;
  const d=box.querySelector('.vqc-rev-notes');if(!d)return;
  const on=!!(ctx&&ctx.inReview);
  d.hidden=!on;if(!on||!notes)return;
  const g=d.querySelector('[data-n="general"]');
  if(g&&(force||document.activeElement!==g)&&g.value!==notes.general)g.value=notes.general;
  const sh=d.querySelector('[data-n="shared"]');if(sh)sh.checked=!!notes.shared;
  const ply=ctx.reviewPly==null?0:ctx.reviewPly;
  const lab=d.querySelector('[data-n="curlabel"]');
  const sans=replay(ctx).ok?replay(ctx).sans:[];
  if(lab)lab.textContent=ply>=1&&sans[ply-1]?'Nước đang xem: '+moveLabel(ctx,ply,sans[ply-1]):'Nước đang xem: thế cờ xuất phát (chưa ghi chú được)';
  const mk=notes.marks[String(ply)]||null,inp=d.querySelector('[data-n="mvtext"]'),fl=d.querySelector('[data-n="flag"]');
  const key=ctx.key+'|'+ply;
  if(inp&&(force||(document.activeElement!==inp&&inp.dataset.k!==key))){inp.value=mk?mk.t:'';inp.dataset.k=key;if(fl)fl.checked=!!(mk&&mk.f);}
  const ul=d.querySelector('[data-n="list"]');
  if(ul){
   ul.replaceChildren();
   Object.keys(notes.marks).sort(function(a,b){return a-b;}).forEach(function(k){
    const m=notes.marks[k],li=el('li'),b=el('button','',(m.f?'⭐ ':'')+(sans[k-1]?moveLabel(ctx,+k,sans[k-1]):'Nước '+k)+(m.t?': '+m.t:''));
    b.type='button';b.addEventListener('click',function(){jump(+k);});li.appendChild(b);ul.appendChild(li);
   });
  }
 }
 function noteAct(act){
  if(!ctx||!ctx.inReview||!notes)return;
  const d=$(BOX_ID).querySelector('.vqc-rev-notes');if(!d)return;
  const ply=ctx.reviewPly==null?0:ctx.reviewPly;
  if(act==='notemove'||act==='notedel'){
   if(ply<1){setNoteStatus('Hãy chọn một nước đi (từ nước 1 trở đi) để ghi chú.',true);return;}
   if(act==='notedel'){delete notes.marks[String(ply)];const i=d.querySelector('[data-n="mvtext"]');if(i)i.value='';const f=d.querySelector('[data-n="flag"]');if(f)f.checked=false;}
   else{
    const t=String(d.querySelector('[data-n="mvtext"]').value||'').slice(0,200),f=d.querySelector('[data-n="flag"]').checked;
    if(!t&&!f){setNoteStatus('Hãy nhập ghi chú hoặc tick “Cần chú ý”.',true);return;}
    if(!notes.marks[String(ply)]&&Object.keys(notes.marks).length>=80){setNoteStatus('Tối đa 80 nước có ghi chú.',true);return;}
    notes.marks[String(ply)]={f:f?1:0,t:t};
   }
   paintNotes(true);setNoteStatus('Chưa lưu — bấm “Lưu ghi chú”.');return;
  }
  if(act==='notesave'){saveNotes(ctx);}
 }
 function onBoxInput(e){
  const t=e.target;if(!t||!t.dataset||!notes)return;
  if(t.dataset.n==='general'){notes.general=String(t.value||'').slice(0,1500);setNoteStatus('Chưa lưu — bấm “Lưu ghi chú”.');}
  else if(t.dataset.n==='shared'){notes.shared=!!t.checked;setNoteStatus('Chưa lưu — bấm “Lưu ghi chú”.');}
 }
 function applyOpts(){
  document.documentElement.dataset.vqcRevCoords=(coordsOn||!(ctx||stuCtx))?'on':'off';
  const box=$(BOX_ID);if(!box)return;
  const a=box.querySelector('[data-opt="arrows"]'),k=box.querySelector('[data-opt="coords"]');
  if(a)a.checked=arrowsOn;if(k)k.checked=coordsOn;
 }
 function onOpt(e){
  const t=e.target;if(!t||!t.dataset||!t.dataset.opt)return;
  if(t.dataset.opt==='arrows'){arrowsOn=!!t.checked;try{localStorage.setItem('vqc-rev-arrows',arrowsOn?'1':'0');}catch(x){}drawArrows();}
  if(t.dataset.opt==='coords'){coordsOn=!!t.checked;try{localStorage.setItem('vqc-rev-coords',coordsOn?'1':'0');}catch(x){}applyOpts();}
 }

 function stopStu(){if(stuUnsub){try{stuUnsub();}catch(e){}stuUnsub=null;}stuKey='';stuNotes=null;}
 function stuListen(c){
  const id=noteId(c);if(stuKey===id)return;
  stopStu();stuKey=id;
  if(typeof db==='undefined')return;
  try{
   stuUnsub=db.collection(NOTES_COLL).doc(id).onSnapshot(function(s){
    stuNotes=s.exists&&s.data()&&s.data().shared===true?s.data():null;paintStu();
   },function(){stuNotes=null;paintStu();});
  }catch(e){}
 }
 function makeStuBox(host){
  let box=$(STU_ID);
  const mainBox=$(BOX_ID);
  if(!mainBox)return box||null;
  if(!box){box=document.createElement('div');box.id=STU_ID;box.hidden=true;}
  if(box.parentNode!==mainBox.parentNode||box.previousSibling!==mainBox)mainBox.parentNode.insertBefore(box,mainBox.nextSibling);
  return box;
 }
 function paintStu(){
  const box=$(STU_ID);if(!box)return;
  const a=stuNotes&&stuNotes.analysis,has=stuNotes&&((stuNotes.general&&stuNotes.general.length)||(stuNotes.marks&&Object.keys(stuNotes.marks).length)||a);
  if(!stuCtx||!has){box.hidden=true;return;}
  box.hidden=false;box.replaceChildren();
  box.appendChild(el('h3','','📝 Nhận xét của giáo viên'));
  if(stuNotes.general)box.appendChild(el('p','vqc-rev-gen',stuNotes.general));
  const sans=replay(stuCtx).ok?replay(stuCtx).sans:[];
  if(a){
   const accT=function(v){return v==null?'—':Number(v).toFixed(1)+'%';};
   box.appendChild(el('p','vqc-rev-sum','Độ chính xác (ước tính) — ⚪ '+stuCtx.white+': '+accT(a.accW)+' · ⚫ '+stuCtx.black+': '+accT(a.accB)));
   const cnt=a.cnt||{};
   ['w','b'].forEach(function(s){
    const o=cnt[s];if(!o)return;
    box.appendChild(el('p','vqc-rev-sum',(s==='w'?'⚪ ':'⚫ ')+CLS.map(function(k){return k.icon+' '+(o[k.id]||0);}).join('  ·  ')));
   });
   const ms=Array.isArray(a.moments)?a.moments.filter(function(m){return m.kind!=='tactic'||m.side;}):[];
   if(ms.length){
    box.appendChild(el('h4','','Những nước cần chú ý'));
    const ul=el('ul');
    ms.forEach(function(m){
     const li=el('li','sm'),b=el('button');b.type='button';
     b.appendChild(document.createTextNode(moveLabel(stuCtx,m.ply,m.san)+(KIND_LABEL[m.kind]?' — '+KIND_LABEL[m.kind]:'')));
     b.appendChild(el('small','',String(m.text||'')));li.appendChild(b);ul.appendChild(li);
    });
    box.appendChild(ul);
   }
  }
  const mk=stuNotes.marks||{},keys=Object.keys(mk).filter(function(k){return /^\d+$/.test(k);}).sort(function(x,y){return x-y;});
  if(keys.length){
   box.appendChild(el('h4','','Giáo viên đánh dấu'));
   const ul=el('ul');
   keys.forEach(function(k){
    const m=mk[k]||{},li=el('li','sm'),b=el('button');b.type='button';
    b.appendChild(document.createTextNode((m.f?'⭐ ':'')+(sans[k-1]?moveLabel(stuCtx,+k,sans[k-1]):'Nước '+k)));
    if(m.t)b.appendChild(el('small','',String(m.t)));
    li.appendChild(b);ul.appendChild(li);
   });
   box.appendChild(ul);
  }
 }

 function histSpans(host){
  return Array.from(document.querySelectorAll(HIST[host]||HIST.chd)).filter(function(s){
   const t=(s.textContent||'').trim();return t&&t!=='…'&&t!=='...';
  });
 }
 function qChars(c,student){
  if(student){const q=stuNotes&&stuNotes.analysis&&stuNotes.analysis.q;return typeof q==='string'?q:'';}
  const r=c&&cache[c.key];return r?qString(r):'';
 }
 function decorate(c,student){
  if(!c)return;
  const host=hostOf(c),spans=histSpans(host),q=qChars(c,student),click=!student&&!!c.inReview;
  spans.forEach(function(s,i){
   const k=CLS_CH[q[i]];
   if(k){s.dataset.q=k.ch;s.dataset.qi=k.icon;s.style.setProperty('--qc',k.color);s.title=k.label;}
   else if(s.dataset.q){delete s.dataset.q;delete s.dataset.qi;s.style.removeProperty('--qc');s.removeAttribute('title');}
   s.classList.toggle('vqc-rev-click',click);
  });
  const cur=spans.find(function(s){return s.classList.contains('cur');});
  const box=cur&&cur.closest?cur.closest('#vqcChdHistory,#vqcVsmHistory,#pvpHistory'):null;
  const key=c.key+'|'+(c.reviewPly==null?'':c.reviewPly)+'|'+spans.length;
  if(box&&key!==scrollKey&&box.scrollHeight>box.clientHeight){
   scrollKey=key;
   const br=box.getBoundingClientRect(),cr=cur.getBoundingClientRect();
   box.scrollTop+=cr.top-br.top-box.clientHeight/2+cr.height/2;
  }
  if(!box)scrollKey='';
  watch(host);
 }
 function watch(host){
  const box=document.querySelector((HIST[host]||HIST.chd).split(' ')[0]);
  if(box&&!observed.has(box)){
   observed.add(box);
   new MutationObserver(function(){requestAnimationFrame(function(){decorate(ctx||stuCtx,!ctx);});}).observe(box,{childList:true,subtree:true});
  }
  const b=$(BOARD[host]||BOARD.chd);
  if(b&&!observed.has(b)){
   observed.add(b);
   new MutationObserver(function(){requestAnimationFrame(drawArrows);}).observe(b,{childList:true});
  }
 }
 document.addEventListener('click',function(e){
  const t=e.target&&e.target.closest?e.target:null;if(!t)return;
  if(t.closest('.vqc-rev-click')){
   if(!ctx||!ctx.inReview)return;
   const s=t.closest('.vqc-rev-click'),i=histSpans(hostOf(ctx)).indexOf(s);
   if(i>=0){stopPlay();jump(i+1);}
   return;
  }
  if(!autoClick&&t.closest('[data-step]')&&t.closest('#vqcChdReplayBar,#vqcVsrBar,#vqcPvrBar'))stopPlay();
 },true);

 function stepBtn(k){
  const bar=ctx&&$(BAR[hostOf(ctx)]),b=bar&&bar.querySelector('[data-step="'+k+'"]');
  if(b&&!b.disabled){autoClick=true;try{b.click();}finally{autoClick=false;}return true;}
  return false;
 }
 function haltPlay(){playing=false;clearInterval(playTimer);playTimer=0;}
 function stopPlay(){
  haltPlay();
  if(ctx)ensurePlay(hostOf(ctx),!!ctx.inReview);
 }
 function startPlay(){
  if(!ctx||!ctx.inReview)return;
  if(ctx.reviewPly>=plyCount(ctx))stepBtn('-Infinity');
  playing=true;clearInterval(playTimer);
  playTimer=setInterval(function(){
   if(!playing)return;
   if(!ctx||!ctx.inReview||ctx.reviewPly>=plyCount(ctx)){stopPlay();return;}
   stepBtn('1');
  },1200);
  ensurePlay(hostOf(ctx),true);
 }
 function togglePlay(){if(playing)stopPlay();else startPlay();}
 function ensurePlay(host,on){
  const bar=$(BAR[host]);if(!bar)return;
  let b=bar.querySelector('[data-play]');
  if(!on){if(b)b.remove();return;}
  if(!b){
   b=document.createElement('button');b.type='button';b.dataset.play='1';
   b.addEventListener('click',function(){if(ctx&&ctx.inReview)togglePlay();});
   const prev=bar.querySelector('[data-step="-1"]');
   if(prev&&prev.nextSibling)bar.insertBefore(b,prev.nextSibling);else bar.appendChild(b);
  }
  const txt=playing?'⏸ Tạm dừng':'▶ Phát';
  if(b.textContent!==txt){b.textContent=txt;b.setAttribute('aria-label',playing?'Tạm dừng phát lại':'Phát lại ván đấu');}
 }
 document.addEventListener('keydown',function(e){
  if(!ctx||!ctx.inReview||e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target,tag=t&&t.tagName?t.tagName:'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
  let k=null;
  if(e.key==='ArrowLeft')k='-1';else if(e.key==='ArrowRight')k='1';else if(e.key==='Home')k='-Infinity';else if(e.key==='End')k='Infinity';
  if(k!==null){e.preventDefault();stopPlay();stepBtn(k);return;}
  if(e.key===' '||e.code==='Space'){e.preventDefault();togglePlay();}
 });

 function arrowPath(a,b,color){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<6)return '';
  const ux=dx/len,uy=dy/len,s=a.s,head=s*0.34,w=s*0.15,px=-uy,py=ux;
  const x1=a.x+ux*s*0.25,y1=a.y+uy*s*0.25,bx=b.x-ux*head*0.85,by=b.y-uy*head*0.85;
  const tipx=b.x-ux*s*0.06,tipy=b.y-uy*s*0.06;
  return '<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+bx.toFixed(1)+'" y2="'+by.toFixed(1)+'" stroke="'+color+'" stroke-width="'+w.toFixed(1)+'" stroke-linecap="round"/>'+
   '<polygon points="'+tipx.toFixed(1)+','+tipy.toFixed(1)+' '+(bx+px*head*0.55).toFixed(1)+','+(by+py*head*0.55).toFixed(1)+' '+(bx-px*head*0.55).toFixed(1)+','+(by-py*head*0.55).toFixed(1)+'" fill="'+color+'"/>';
 }
 function drawArrows(){
  const c=ctx||stuCtx,svg0=$('vqcRevArrows');
  const board=c?$(BOARD[hostOf(c)]||BOARD.chd):null;
  if(!board||!arrowsOn){if(svg0)svg0.innerHTML='';return;}
  const wrap=board.parentNode;
  let svg=svg0;
  if(!svg||svg.parentNode!==wrap){
   if(svg&&svg.parentNode)svg.parentNode.removeChild(svg);
   svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='vqcRevArrows';
   svg.setAttribute('aria-hidden','true');
   svg.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:6;overflow:visible';
   if(getComputedStyle(wrap).position==='static')wrap.style.position='relative';
   wrap.appendChild(svg);
  }
  const wr=wrap.getBoundingClientRect();if(!wr.width){svg.innerHTML='';return;}
  svg.setAttribute('viewBox','0 0 '+wr.width.toFixed(1)+' '+wr.height.toFixed(1));
  const pt=function(el){if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left-wr.left+r.width/2,y:r.top-wr.top+r.height/2,s:r.width};};
  const cell=function(sq){return board.querySelector('[data-square="'+sq+'"]');};
  let html='';
  const lf=pt(board.querySelector('.vqc-last-from')),lt=pt(board.querySelector('.vqc-last-to'));
  if(lf&&lt)html+='<g opacity=".78">'+arrowPath(lf,lt,'#f0a30a')+'</g>';
  if(ctx&&ctx.inReview&&!ctx.varOn&&ctx.reviewPly!=null){
   const res=cache[ctx.key],u=res&&res.best[ctx.reviewPly];
   if(u){const a=pt(cell(u.slice(0,2))),b=pt(cell(u.slice(2,4)));if(a&&b)html+='<g opacity=".82">'+arrowPath(a,b,'#2f9e6e')+'</g>';}
  }
  svg.innerHTML=html;
 }
 window.addEventListener('resize',function(){requestAnimationFrame(drawArrows);});

 function tick(){
  const vc=vsmContext()||pvpContext();
  const host=vc?vc.host:'';
  const box=makeBox(host);if(!box)return;
  const any=vc||context();
  const student=isStudentNow();
  const c=student?null:any;
  makeStuBox(host);
  const show=!!(c&&c.fen0&&((c.uci&&c.uci.length)||(c.sans&&c.sans.length)));
  if(!show){
   if(!box.hidden)box.hidden=true;
   if(busy){runId++;disposeEngine();setBusy(false);}
   haltPlay();if(ctx)ensurePlay(hostOf(ctx),false);
   ctx=null;shownKey='';notes=null;notesKey='';curKey='';
  }else{
   if(c.key!==shownKey){
    if(busy){runId++;disposeEngine();setBusy(false);}
    stopPlay();
    shownKey=c.key;markPly=-1;curKey='';
    box.querySelector('.vqc-rev-out').replaceChildren();
    msg(cache[c.key]?'Ván này đã được phân tích — bấm “Phân tích ván” để xem lại kết quả.':'');
   }
   ctx=c;
   if(box.hidden)box.hidden=false;
   if(c.inReview&&notesKey!==noteId(c))loadNotes(c);
   if(!c.inReview){notes=null;notesKey='';}
   ensurePlay(hostOf(c),!!c.inReview);
   paintNotes(false);updateMark();updateCur();
  }
  stuCtx=(student&&any&&any.reviewing&&any.fen0)?any:null;
  if(stuCtx){
   if(stuKey!==noteId(stuCtx))stuListen(stuCtx);
   paintStu();
  }else{stopStu();paintStu();}
  applyOpts();
  decorate(ctx||stuCtx,!ctx);
  drawArrows();
 }

setInterval(tick,POLL_MS);
 window.addEventListener('pagehide',function(){runId++;disposeEngine();});
 window.vqcDuelReview={version:VERSION,pgn:function(){return ctx?buildPgn(ctx):null;},_tick:tick,_ctx:function(){return ctx;},_busy:function(){return busy;}};
})();
