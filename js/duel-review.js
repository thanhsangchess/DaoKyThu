(function(){
 'use strict';
 if(window.vqcDuelReview)return;
 const VERSION='20261124-review-v3';
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
 function vsmContext(){
  const vr=window.vqcVsmReview;
  if(!vr||typeof vr.active!=='function'||!vr.active()||typeof vr.info!=='function')return null;
  const inf=vr.info();if(!inf||!inf.rec)return null;
  const r=inf.rec,lv=(window.vqcVsMachine&&window.vqcVsMachine.levels||[]).find(function(l){return l.id===r.levelId;});
  const humanName=r.shared?'Cả lớp (giáo viên & học sinh)':(r.teacherName||'Người chơi'),aiName='Máy Stockfish'+(lv?' ('+lv.label+')':'');
  const winner=r.result==='win'?r.human:(r.result==='loss'?(r.human==='w'?'b':'w'):null);
  const rec={id:r.id,num:r.num,fen0:r.fen0,moves:r.moves,kind:r.result==='draw'?'stalemate':'manual',winner:winner,reason:r.reason,endedAtMs:r.endedAtMs};
  const c={num:r.num,live:false,rec:rec,reviewPly:inf.ply,inReview:!!inf.teacher,vsm:true};
  c.fen0=r.fen0;c.uci=r.moves.slice();c.sans=null;
  c.white=r.human==='w'?humanName:aiName;c.black=r.human==='w'?aiName:humanName;c.studentSide=null;
  c.event=r.kind==='chernev'?'Cờ tàn Chernev đấu với máy – bài '+r.num:'Đấu với máy';
  c.fileTag=r.kind==='chernev'?'dau-voi-may-chernev-'+r.num:'dau-voi-may';
  c.key='vsm:'+r.id;
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
  const c={num:num,live:live,rec:rec,reviewPly:st.review?st.review.ply:null,inReview:!!st.review};
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
 async function analyse(c,onProgress,id){
  const rp=replay(c);if(!rp.ok)throw new Error(rp.why);
  if(!window.VqcStockfish)throw new Error('Chưa tải được mô-đun động cơ Stockfish.');
  engine=window.VqcStockfish.create({onStatus:function(){}});
  const total=rp.fens.length,mt=total>90?150:250;
  const evals=[],best=[];
  for(let i=0;i<total;i++){
   if(id!==runId)return null;
   const g=mkChess();g.load(rp.fens[i]);
   if(g.in_checkmate()){evals.push(rp.turns[i]==='w'?-10000:10000);best.push(null);}
   else if(g.in_stalemate()||g.in_draw()){evals.push(0);best.push(null);}
   else{
    let r=null;
    try{r=await engine.search(rp.fens[i],{movetime:mt,skill:20});}
    catch(e){if(id!==runId)return null;throw e;}
    if(id!==runId||(r&&r.cancelled))return null;
    evals.push(r&&r.valid!==false&&!r.none?whiteEval(r.info,rp.turns[i]):null);
    best.push(r&&r.bestmove&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(r.bestmove)?r.bestmove:null);
   }
   if(onProgress)onProgress(i+1,total);
  }
  const errors=[];
  for(let i=0;i<rp.sans.length;i++){
   const a=evals[i],b=evals[i+1];if(a==null||b==null)continue;
   const mover=rp.turns[i];
   const drop=(mover==='w'?1:-1)*(clampEval(b)-clampEval(a));
   if(drop<=-150){
    let bestSan='';
    if(best[i]){
     const h=mkChess();h.load(rp.fens[i]);
     const u=best[i];let mv=null;try{mv=h.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){}
     if(mv)bestSan=mv.san;
    }
    errors.push({ply:i+1,side:mover,san:rp.sans[i],drop:-drop,mark:drop<=-300?'??':'?',best:bestSan&&bestSan!==rp.sans[i]?bestSan:'',before:a,after:b});
   }
  }
  return {evals:evals,errors:errors,sans:rp.sans,turns:rp.turns};
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
  document.head.appendChild(st);
 }
 function makeBox(vsm){
  let box=$(BOX_ID),panel,wrap;
  if(vsm){panel=document.querySelector('#vqcVsMachineOverlay .vqc-vsm-side');wrap=panel&&panel.querySelector('.vqc-vsm-histwrap');}
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
   '<p class="vqc-rev-msg" role="status" aria-live="polite"></p><div class="vqc-rev-out"></div>';
  if(wrap&&wrap.parentNode===panel&&wrap.nextSibling)panel.insertBefore(box,wrap.nextSibling);else panel.appendChild(box);
  box.addEventListener('click',onClick);
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
 function renderResult(c,res){
  const out=$(BOX_ID).querySelector('.vqc-rev-out');
  out.replaceChildren();
  const holder=document.createElement('div');holder.innerHTML=renderChart(c,res);
  const svg=holder.firstChild;out.appendChild(svg);
  svg.addEventListener('click',function(ev){
   if(!c.inReview)return;
   const r=svg.getBoundingClientRect();if(!r.width)return;
   const n=res.evals.length-1;jump(Math.round((ev.clientX-r.left)/r.width*n));
  });
  const sum=document.createElement('p');sum.className='vqc-rev-sum';
  const cnt={w:0,b:0};res.errors.forEach(function(e){cnt[e.side]++;});
  sum.textContent=res.errors.length?('Máy thấy '+res.errors.length+' nước đi làm giảm rõ lợi thế — '+c.white+' (⚪): '+cnt.w+', '+c.black+' (⚫): '+cnt.b+'.'):
   'Máy không thấy nước đi nào làm giảm rõ lợi thế — hai bên chơi khá chính xác.';
  out.appendChild(sum);
  if(res.errors.length){
   const ul=document.createElement('ul');
   res.errors.forEach(function(e){
    const li=document.createElement('li');if(!c.inReview)li.className='sm';
    const b=document.createElement('button');b.type='button';
    const startOff=String(c.fen0).split(' ')[1]==='b'?1:0;
    const fm=parseInt(String(c.fen0).split(' ')[5],10)||1;
    const mnum=fm+Math.floor((e.ply-1+startOff)/2);
    b.textContent=mnum+(e.side==='w'?'. ':'... ')+e.san+e.mark+'  —  '+sideName(c,e.side)+' ('+(e.side==='w'?'⚪':'⚫')+')';
    const sm=document.createElement('small');
    sm.textContent='Điểm '+fmtEval(e.before)+' → '+fmtEval(e.after)+(e.best?' · Máy chọn: '+e.best:'');
    b.appendChild(sm);
    b.addEventListener('click',function(){if(c.inReview)jump(e.ply);});
    li.appendChild(b);ul.appendChild(li);
   });
   out.appendChild(ul);
   if(!c.inReview){const p=document.createElement('p');p.className='vqc-rev-sum';p.textContent='Mở ván trong tab “Kết quả đã lưu” để bấm vào từng nước và xem lại trên bàn cờ.';out.appendChild(p);}
  }
  markPly=-2;updateMark();
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
 function jump(ply){
  if(ctx&&ctx.vsm){if(window.vqcVsmReview&&window.vqcVsmReview.jump)window.vqcVsmReview.jump(ply);return;}
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
    if(ctx&&ctx.key===c.key){renderResult(ctx,res);msg('Xong. Điểm tính theo góc nhìn của Trắng (⚪); “?” = nước đi kém, “??” = sai lầm lớn.');}
   }catch(e){
    if(id!==runId)return;
    disposeEngine();setBusy(false);
    msg('Không phân tích được: '+(e&&e.message?e.message:'lỗi không rõ')+'.',true);
   }
  }
 }

 function tick(){
  const vc=vsmContext();
  const box=makeBox(!!vc);if(!box)return;
  const c=vc||context();
  const show=!!(c&&c.fen0&&((c.uci&&c.uci.length)||(c.sans&&c.sans.length)));
  if(!show){
   if(!box.hidden)box.hidden=true;
   if(busy){runId++;disposeEngine();setBusy(false);}
   ctx=null;shownKey='';return;
  }
  if(c.key!==shownKey){
   if(busy){runId++;disposeEngine();setBusy(false);}
   shownKey=c.key;markPly=-1;
   box.querySelector('.vqc-rev-out').replaceChildren();
   msg(cache[c.key]?'Ván này đã được phân tích — bấm “Phân tích ván” để xem lại kết quả.':'');
  }
  ctx=c;
  if(box.hidden)box.hidden=false;
  updateMark();
 }
 setInterval(tick,POLL_MS);
 window.addEventListener('pagehide',function(){runId++;disposeEngine();});
 window.vqcDuelReview={version:VERSION,pgn:function(){return ctx?buildPgn(ctx):null;},_tick:tick,_ctx:function(){return ctx;},_busy:function(){return busy;}};
})();
