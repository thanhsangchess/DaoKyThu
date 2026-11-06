/* Dao Ky Thu - local Stockfish game review analysis */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const ENGINE_VERSION='19.0.1';
 let worker=null,enginePromise=null,engineReady=false,activeSearch=null,startupTimer=null,startupReject=null,startupLastMessage='';
 let runId=0,game=null,results=null,currentIndex=0,analysisRunning=false;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const isTeacher=()=>typeof role!=='undefined'&&role==='teacher';
 const dispatch=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
 function setStatus(message,type){
  const node=$('vqcReviewAnalysisStatus');
  if(!node)return;
  node.textContent=message;
  node.dataset.state=type||'info';
 }
 function setProgress(done,total){
  const bar=$('vqcReviewAnalysisProgress');
  const label=$('vqcReviewAnalysisProgressText');
  if(bar)bar.style.width=(total?Math.round(done/total*100):0)+'%';
  if(label)label.textContent=total?done+' / '+total+' vị trí':'';
 }
 function toggleButtons(running){
  analysisRunning=running;
  const start=$('vqcReviewAnalyzeStart'),stop=$('vqcReviewAnalyzeStop'),depth=$('vqcReviewAnalysisDepth');
  if(start)start.disabled=running||!game||!game.moves.length||!isTeacher();
  if(stop)stop.hidden=!running;
  if(depth)depth.disabled=running;
 }
 function cleanupWorker(){
  if(startupTimer){clearTimeout(startupTimer);startupTimer=null;}
  const rejectStartup=startupReject;startupReject=null;
  if(rejectStartup)rejectStartup(Error('Đã dừng khởi động engine.'));
  if(activeSearch){
   clearTimeout(activeSearch.timer);
   activeSearch.resolve({cancelled:true});
   activeSearch=null;
  }
  if(worker){try{worker.terminate();}catch(e){}}
  worker=null;engineReady=false;enginePromise=null;
 }
 function makeWorker(){
  /* Load a same-origin worker script; that script loads the pinned engine build. */
  startupLastMessage='';
  worker=new Worker('./js/stockfish-loader.js?v=20261106-v2');
 }
 function ensureEngine(){
  if(engineReady)return Promise.resolve();
  if(enginePromise)return enginePromise;
  enginePromise=new Promise((resolve,reject)=>{
   try{makeWorker();}catch(error){enginePromise=null;reject(error);return;}
   let settled=false;
   startupReject=error=>{if(!settled){settled=true;reject(error);}};
   startupTimer=setTimeout(()=>{
    if(!settled){
     const detail=startupLastMessage?' Phản hồi gần nhất: '+startupLastMessage.slice(0,120):'';
     settled=true;startupTimer=null;startupReject=null;enginePromise=null;cleanupWorker();
     reject(Error('Không nhận được tín hiệu khởi động từ Stockfish. Hãy tải lại trang và kiểm tra kết nối Internet.'+detail));
    }
   },35000);
   worker.onmessage=event=>{
    const line=String(event.data?.data??event.data?.message??event.data??'').trim();
    if(line)startupLastMessage=line;
    if(line.startsWith('VQC_ENGINE_LOAD_ERROR')){
     if(!settled){settled=true;if(startupTimer)clearTimeout(startupTimer);startupTimer=null;startupReject=null;enginePromise=null;cleanupWorker();reject(Error(line.replace('VQC_ENGINE_LOAD_ERROR','').trim()||'Không tải được Stockfish.'));}
     return;
    }
    if(/\\buciok\\b/.test(line)&&!settled){
     /* UCI is initialized. Lite single-threaded Stockfish ignores Threads;
        no extra option handshake is required before position/go commands. */
     settled=true;
     if(startupTimer)clearTimeout(startupTimer);
     startupTimer=null;startupReject=null;engineReady=true;
     resolve();
     return;
    }
    if(line.startsWith('VQC_ENGINE_RUNTIME_ERROR')){
     if(!settled){
      settled=true;if(startupTimer)clearTimeout(startupTimer);startupTimer=null;startupReject=null;
      enginePromise=null;cleanupWorker();
      reject(Error(line.replace('VQC_ENGINE_RUNTIME_ERROR','').trim()||'Stockfish worker gặp lỗi khi chạy WASM.'));
     }
     return;
    }
    if(activeSearch){
     const depthMatch=line.match(/\bdepth\s+(\d+)/);
     if(line.startsWith('info ')&&depthMatch){
      const scoreMatch=line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
      const pvMatch=line.match(/\bpv\s+(.+)$/);
      if(scoreMatch){
       const depth=Number(depthMatch[1]);
       if(!activeSearch.info||depth>=activeSearch.info.depth){
        activeSearch.info={
         depth,type:scoreMatch[1],value:Number(scoreMatch[2]),
         pv:pvMatch?pvMatch[1].trim():''
        };
       }
      }
     }
     if(line.startsWith('bestmove ')){
      const best=line.split(/\s+/)[1]||'';
      const search=activeSearch;activeSearch=null;clearTimeout(search.timer);
      search.resolve({bestmove:best,info:search.info||null});
     }
    }
   };
   worker.onerror=event=>{
    const error=Error(event.message||'Không thể chạy Stockfish trong trình duyệt.');
    if(!settled){settled=true;if(startupTimer)clearTimeout(startupTimer);startupTimer=null;startupReject=null;enginePromise=null;cleanupWorker();reject(error);}
    else if(activeSearch){const search=activeSearch;activeSearch=null;clearTimeout(search.timer);search.reject(error);}
   };
   worker.postMessage('uci');
  });
  return enginePromise;
 }
 function evaluatePosition(fen,depth,token){
  return new Promise((resolve,reject)=>{
   if(token!==runId){resolve({cancelled:true});return;}
   if(!worker||!engineReady){reject(Error('Engine chưa sẵn sàng.'));return;}
   if(activeSearch){reject(Error('Engine vẫn đang xử lý vị trí trước.'));return;}
   const search={resolve,reject,info:null,timer:null};
   search.timer=setTimeout(()=>{
    if(activeSearch===search){
     activeSearch=null;
     cleanupWorker();
     reject(Error('Engine không phản hồi ở một vị trí. Hãy thử mức phân tích nhanh hơn.'));
    }
   },30000);
   activeSearch=search;
   worker.postMessage('position fen '+fen);
   worker.postMessage('go depth '+depth);
  });
 }
 function scoreToWhite(score,fen){
  if(!score)return null;
  let cp=score.type==='mate'
   ? (score.value===0?3000:Math.sign(score.value)*(3000-Math.min(Math.abs(score.value),20)*50))
   : score.value;
  const side=(fen.split(/\s+/)[1]||'w');
  return side==='w'?cp:-cp;
 }
 function scoreText(cp){
  if(cp===null||!Number.isFinite(cp))return '—';
  const n=cp/100;
  return (n>0?'+':'')+n.toFixed(2);
 }
 function mateText(score,fen){
  if(!score||score.type!=='mate')return null;
  const whiteSign=(fen.split(/\s+/)[1]||'w')==='w'?1:-1;
  const whiteMate=score.value*whiteSign;
  return (whiteMate>0?'Trắng chiếu hết trong ':'Đen chiếu hết trong ')+Math.abs(whiteMate)+' nước';
 }
 function sanFromUci(fen,uci){
  if(!uci||uci==='(none)'||uci==='0000')return 'Không có nước đi';
  try{
   const chess=new Chess();
   if(!chess.load(fen))return uci;
   const move={from:uci.slice(0,2),to:uci.slice(2,4)};
   if(uci.length>4)move.promotion=uci[4].toLowerCase();
   const played=chess.move(move);
   return played?played.san:uci;
  }catch(error){return uci;}
 }
 function pvToSan(fen,pv){
  if(!pv)return '';
  try{
   const chess=new Chess();
   if(!chess.load(fen))return pv;
   const out=[];
   for(const uci of pv.split(/\s+/).slice(0,8)){
    if(!/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(uci))break;
    const move={from:uci.slice(0,2),to:uci.slice(2,4)};
    if(uci.length>4)move.promotion=uci[4].toLowerCase();
    const made=chess.move(move);if(!made)break;
    out.push(made.san);
   }
   return out.join(' ');
  }catch(error){return '';}
 }
 function gradeFor(loss){
  if(loss<=12)return {key:'best',label:'Rất tốt',short:'Tốt',icon:'★'};
  if(loss<=30)return {key:'good',label:'Tốt',short:'Tốt',icon:'✓'};
  if(loss<=65)return {key:'inaccuracy',label:'Chưa chính xác',short:'Chưa chuẩn',icon:'?!'};
  if(loss<=130)return {key:'mistake',label:'Sai lầm',short:'Sai lầm',icon:'?'};
  return {key:'blunder',label:'Blunder',short:'Blunder',icon:'??'};
 }
 function buildResults(gameData,rawScores,depth){
  const evaluations=rawScores.map((raw,index)=>({
   raw,
   cp:scoreToWhite(raw?.info,gameData.positions[index]),
   mate:mateText(raw?.info,gameData.positions[index]),
   best:raw?.bestmove||'',
   bestSan:sanFromUci(gameData.positions[index],raw?.bestmove||''),
   pv:pvToSan(gameData.positions[index],raw?.info?.pv||''),
   depth:raw?.info?.depth||depth
  }));
  const moveResults=gameData.moves.map((move,index)=>{
   const before=evaluations[index].cp,after=evaluations[index+1].cp;
   const sign=move.color==='w'?1:-1;
   const loss=before===null||after===null?null:Math.round(clamp((before-after)*sign,0,2000));
   const grade=loss===null?{key:'unknown',label:'Chưa đủ dữ liệu',short:'—',icon:'·'}:gradeFor(loss);
   return {index,move,loss,grade,bestSan:evaluations[index].bestSan,pv:evaluations[index].pv,before,after};
  });
  const average=color=>{
   const own=moveResults.filter(r=>r.move.color===color&&r.loss!==null);
   return own.length?own.reduce((sum,r)=>sum+r.loss,0)/own.length:0;
  };
  const accuracy=color=>Math.round(100*Math.exp(-average(color)/180));
  return {evaluations,moves:moveResults,depth,whiteAccuracy:accuracy('w'),blackAccuracy:accuracy('b')};
 }
 function addText(parent,tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  el.textContent=text;
  parent.appendChild(el);
  return el;
 }
 function renderMetric(container,label,value,sub){
  const card=document.createElement('div');card.className='vqc-review-analysis-metric';
  addText(card,'small','',label);
  addText(card,'strong','',value);
  if(sub)addText(card,'span','',sub);
  container.appendChild(card);
 }
 function renderGraph(){
  const svg=$('vqcReviewAnalysisGraph');if(!svg||!results)return;
  svg.replaceChildren();
  const wrap=$('vqcReviewAnalysisGraphWrap');
  wrap?.querySelectorAll('.vqc-review-analysis-axis-label').forEach(el=>el.remove());
  const ns='http://www.w3.org/2000/svg',width=600,height=128,mid=height/2;
  const line=(x1,y1,x2,y2,cls)=>{
   const el=document.createElementNS(ns,'line');
   el.setAttribute('x1',x1);el.setAttribute('y1',y1);el.setAttribute('x2',x2);el.setAttribute('y2',y2);el.setAttribute('class',cls);svg.appendChild(el);
  };
  line(0,mid,width,mid,'vqc-review-analysis-zero');
  const values=results.evaluations.map(e=>e.cp===null?0:clamp(e.cp,-600,600));
  const coords=values.map((v,i)=>{
   const x=values.length<=1?0:i/(values.length-1)*width;
   const y=mid-(v/600)*(mid-8);
   return [x,y];
  });
  const poly=document.createElementNS(ns,'polyline');
  poly.setAttribute('points',coords.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '));
  poly.setAttribute('class','vqc-review-analysis-line');svg.appendChild(poly);
  if(coords.length){
   const index=clamp(currentIndex,0,coords.length-1),point=coords[index];
   const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',point[0]);dot.setAttribute('cy',point[1]);dot.setAttribute('r','5');dot.setAttribute('class','vqc-review-analysis-current');svg.appendChild(dot);
  }
  if(wrap)addText(wrap,'span','vqc-review-analysis-axis-label','Lợi thế Trắng ↑ · Lợi thế Đen ↓');
 }
 function renderCoach(){
  const box=$('vqcReviewAnalysisCoach');if(!box||!results)return;
  box.replaceChildren();
  const heading=addText(box,'strong','', 'Gợi ý học tập');
  heading.setAttribute('aria-hidden','true');
  if(currentIndex===0){
   addText(box,'p','', 'Đây là vị trí bắt đầu. Hãy xem biểu đồ để nhận biết bên nào giành được lợi thế trong ván đấu.');
   return;
  }
  const item=results.moves[currentIndex-1];if(!item)return;
  addText(box,'p','vqc-review-analysis-coach-title',
   'Nước '+item.move.san+' của '+(item.move.color==='w'?'Trắng':'Đen')+': '+item.grade.label+'.');
  if(item.loss===null){
   addText(box,'p','', 'Engine chưa có đủ dữ liệu để so sánh vị trí trước và sau nước đi này.');
  }else if(item.loss<=30){
   addText(box,'p','', 'Nước đi này giữ được phần lớn giá trị của thế cờ. Hãy đối chiếu với lựa chọn đầu bảng của engine để hiểu thêm các phương án chiến lược.');
  }else{
   addText(box,'p','', 'Theo Stockfish, nước đi này làm thay đổi đánh giá khoảng '+item.loss+' centipawn theo hướng bất lợi. Hãy xem nước đề xuất và biến thể bên dưới, rồi thử tìm xem quân nào đang bị đe dọa hoặc ô nào bị bỏ ngỏ.');
  }
  addText(box,'p','', 'Engine đề xuất: '+(item.bestSan||'chưa có nước đề xuất')+'.');
  if(item.pv)addText(box,'p','vqc-review-analysis-pv','Biến thể tham khảo: '+item.pv);
 }
 function applyMoveGrades(){
  if(!results||!game)return;
  const rows=$('vqcReviewMoves')?.querySelectorAll('.vqc-review-move-row');
  if(!rows)return;
  rows.forEach((row,rowIndex)=>{
   const white=row.querySelectorAll('.vqc-review-move')[0];
   const black=row.querySelectorAll('.vqc-review-move')[1];
   [[white,rowIndex*2],[black,rowIndex*2+1]].forEach(([button,index])=>{
    if(!button||!results.moves[index])return;
    const grade=results.moves[index].grade;
    button.dataset.analysisGrade=grade.key;
    button.title=(button.title?button.title+' · ':'')+grade.label+
      (results.moves[index].loss===null?'':' · mất '+results.moves[index].loss+' cp');
   });
  });
 }
 function renderReport(){
  const report=$('vqcReviewAnalysisReport');if(!report||!results)return;
  report.hidden=false;
  const metrics=$('vqcReviewAnalysisMetrics');metrics.replaceChildren();
  renderMetric(metrics,'Độ chính xác Trắng',results.whiteAccuracy+'%','Ước tính từ centipawn loss');
  renderMetric(metrics,'Độ chính xác Đen',results.blackAccuracy+'%','Ước tính từ centipawn loss');
  const sorted=[...results.moves].filter(x=>x.loss!==null).sort((a,b)=>b.loss-a.loss);
  const worst=sorted[0];
  renderMetric(metrics,'Sai lầm lớn nhất',worst?worst.loss+' cp':'—',worst?((worst.move.color==='w'?'Trắng':'Đen')+' · '+worst.move.san):'');
  $('vqcReviewAnalysisSummary').textContent='Đã phân tích '+results.evaluations.length+' vị trí ở depth '+results.depth+'. Điểm chính xác là chỉ số ước tính riêng của Đảo Kỳ Thủ, không phải thang điểm chính thức của Chess.com hoặc Chessigma.';
  renderGraph();
  const moments=$('vqcReviewAnalysisMoments');moments.replaceChildren();
  if(!sorted.length)addText(moments,'p','', 'Chưa tìm thấy thời điểm đáng chú ý.');
  sorted.slice(0,5).forEach(item=>{
   const button=document.createElement('button');button.type='button';button.className='vqc-review-analysis-moment';
   const label=(item.move.color==='w'?'Trắng':'Đen')+' · '+(Math.floor(item.index/2)+1)+'. '+item.move.san;
   addText(button,'strong','',label);
   addText(button,'span','',item.grade.label+' · mất '+item.loss+' cp · tốt hơn: '+(item.bestSan||'—'));
   button.addEventListener('click',()=>window.vqcGameReviewGo?.(item.index+1));
   moments.appendChild(button);
  });
  renderCoach();applyMoveGrades();
 }
 function updateCurrent(){
  if(!results)return;
  renderGraph();renderCoach();applyMoveGrades();
  const item=currentIndex>0?results.moves[currentIndex-1]:null;
  const current=$('vqcReviewAnalysisCurrent');
  if(!current)return;
  current.replaceChildren();
  if(!item){addText(current,'strong','', 'Vị trí ban đầu');addText(current,'p','', 'Chưa có nước đi nào được thực hiện ở vị trí này.');return;}
  addText(current,'strong','', (item.move.color==='w'?'Trắng':'Đen')+' vừa đi '+item.move.san+' · '+item.grade.label);
  addText(current,'p','', 'Nước tốt nhất theo engine: '+(item.bestSan||'—')+(item.loss===null?'':' · centipawn loss: '+item.loss));
  if(item.pv)addText(current,'p','vqc-review-analysis-pv','Biến thể: '+item.pv);
 }
 async function startAnalysis(){
  if(!game||!game.moves.length||!isTeacher())return;
  const token=++runId;
  const depth=Number($('vqcReviewAnalysisDepth')?.value||10);
  results=null;
  $('vqcReviewAnalysisReport').hidden=true;
  $('vqcReviewAnalysisGraphWrap')?.querySelector('.vqc-review-analysis-axis-label')?.remove();
  setProgress(0,game.positions.length);
  toggleButtons(true);
  setStatus('Đang khởi động Stockfish '+ENGINE_VERSION+'…','loading');
  try{
   await ensureEngine();
   if(token!==runId)return;
   setStatus('Đang phân tích trong trình duyệt. Bạn có thể tiếp tục xem biên bản sau khi hoàn tất.','loading');
   const raw=[];
   for(let i=0;i<game.positions.length;i++){
    if(token!==runId)break;
    const result=await evaluatePosition(game.positions[i],depth,token);
    if(result.cancelled||token!==runId)break;
    raw.push(result);
    setProgress(i+1,game.positions.length);
    if(result.info?.depth)setStatus('Đang phân tích vị trí '+(i+1)+'/'+game.positions.length+' · depth '+result.info.depth,'loading');
   }
   if(token!==runId)return;
   if(raw.length!==game.positions.length)throw Error('Phân tích chưa hoàn tất. Hãy chạy lại.');
   results=buildResults(game,raw,depth);
   renderReport();updateCurrent();
   setStatus('Hoàn tất phân tích ván đấu.','success');
   dispatch('vqc:game-review-analysis-ready',{results});
  }catch(error){
   if(token===runId)setStatus('Không thể phân tích: '+(error.message||String(error)),'error');
  }finally{
   if(token===runId)toggleButtons(false);
  }
 }
 function cancelAnalysis(){
  if(!analysisRunning)return;
  runId++;
  cleanupWorker();
  setStatus('Đã dừng phân tích. Nhấn Phân tích để chạy lại.','info');
  toggleButtons(false);
 }
 function onGameLoaded(event){
  const data=event.detail||{};
  if(analysisRunning)cleanupWorker();
  if(!Array.isArray(data.positions)||!Array.isArray(data.moves))return;
  runId++;
  game={positions:data.positions.slice(),moves:data.moves.map(x=>({...x}))};
  results=null;currentIndex=0;
  toggleButtons(false);
  $('vqcReviewAnalysisReport').hidden=true;
  setProgress(0,game.positions.length);
  if($('vqcReviewAnalyzeStart'))$('vqcReviewAnalyzeStart').disabled=!game.moves.length||!isTeacher();
  setStatus(game.moves.length?'Ván đấu đã sẵn sàng. Chọn mức phân tích rồi nhấn “Phân tích bằng Stockfish”.':'Chưa có ván đấu để phân tích.','info');
 }
 function onPosition(event){
  const index=Number(event.detail?.index);
  if(Number.isFinite(index))currentIndex=clamp(index,0,game?.moves.length||0);
  if(results)updateCurrent();
 }
 function initialize(){
  $('vqcReviewAnalyzeStart')?.addEventListener('click',startAnalysis);
  $('vqcReviewAnalyzeStop')?.addEventListener('click',cancelAnalysis);
  $('vqcReviewAnalysisDepth')?.addEventListener('change',()=>{
   const note=$('vqcReviewAnalysisDepthNote');
   if(note)note.textContent='Mức sâu cao hơn thường chậm hơn trên máy cấu hình thấp.';
  });
  window.addEventListener('vqc:game-review-loaded',onGameLoaded);
  window.addEventListener('vqc:game-review-position',onPosition);
  if($('vqcReviewAnalyzeStart'))$('vqcReviewAnalyzeStart').disabled=true;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
 else initialize();
 window.vqcGameReviewAnalysisCancel=cancelAnalysis;
 window.addEventListener('pagehide',()=>{runId++;cleanupWorker();},{once:true});
})();