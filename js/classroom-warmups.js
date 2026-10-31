/* 5 phút khởi động trí tuệ — hoạt động ngắn đồng bộ trong lớp Đảo Kỳ Thủ. */
(function(){
  'use strict';
  const CLIENT='warmup-'+Math.random().toString(36).slice(2)+'-'+Date.now();
  const MEMORY=[
    {items:['🍎','🚗','⭐','🐱','⚽'],missing:'🐱',options:['🐱','🍎','🚗']},
    {items:['🦋','🍌','🚀','🌻','🐟'],missing:'🚀',options:['🌻','🚀','🐟']},
    {items:['🐸','🎈','🍓','🌙','🚲','🐼'],missing:'🍓',options:['🐼','🍓','🌙']}
  ];
  const PATTERNS=[
    {items:['🔴','🔵','🔴','🔵','🔴','?'],options:['🔴','🔵','🟢'],answer:'🔵',why:'Hai hình đỏ và xanh luân phiên nhau.'},
    {items:['⭐','⭐','🌙','⭐','⭐','?'],options:['⭐','🌙','☀️'],answer:'🌙',why:'Quy luật là hai ngôi sao rồi một mặt trăng.'},
    {items:['🔺','🔵','🔵','🔺','🔵','🔵','?'],options:['🔺','🔵','🟩'],answer:'🔺',why:'Một tam giác rồi hai hình tròn được lặp lại.'}
  ];

  const ODD=[
    {items:['🍎','🍐','🍌','🚗'],answer:'🚗',why:'Ba hình đầu là trái cây, còn ô tô là phương tiện.'},
    {items:['🔺','🔵','🟩','🐱'],answer:'🐱',why:'Ba hình đầu là hình khối, còn mèo là con vật.'},
    {items:['🐶','🐱','🐰','🌻'],answer:'🌻',why:'Ba hình đầu là con vật, còn hoa hướng dương là thực vật.'}
  ];
  const ARROWS=[
    {start:[2,2],moves:['⬆️','➡️','⬇️'],options:['(2, 3)','(3, 3)','(2, 1)'],answer:'(2, 3)',why:'Từ giữa đi lên, sang phải rồi xuống một ô.'},
    {start:[1,1],moves:['➡️','➡️','⬆️'],options:['(1, 3)','(0, 3)','(2, 3)'],answer:'(0, 3)',why:'Đi sang phải hai ô rồi đi lên một ô.'},
    {start:[3,2],moves:['⬅️','⬆️','⬆️','➡️'],options:['(1, 2)','(2, 3)','(1, 3)'],answer:'(1, 3)',why:'Đi trái một ô, lên hai ô rồi sang phải một ô.'}
  ];
  const PICTURES=[
    {picture:'🐼',options:['🐼','🐻','🐱'],answer:'🐼',hint:'Con vật này có hai mảng màu đen quanh mắt.'},
    {picture:'🚀',options:['✈️','🚀','🚂'],answer:'🚀',hint:'Đây là phương tiện có thể bay vào không gian.'},
    {picture:'🍉',options:['🍉','🍓','🍍'],answer:'🍉',hint:'Loại quả này thường có vỏ xanh và ruột đỏ.'}
  ];
  const MAZE_PATH=[[0,0],[0,1],[1,1],[2,1],[2,2],[2,3],[1,3],[1,4],[2,4],[3,4],[4,4]];
  let state=null, unsubscribe=null, lastReceived='', overlay=null;
  const $=id=>document.getElementById(id);
  const isTeacher=()=>typeof role!=='undefined'&&role==='teacher';
  const getRoom=()=>typeof roomRef!=='undefined'?roomRef:null;
  function ensureUI(){
    if(overlay)return;
    overlay=document.createElement('div');
    overlay.id='vqcWarmupOverlay';overlay.className='vqc-warmup-overlay';overlay.hidden=true;
    overlay.innerHTML='<section class="vqc-warmup-dialog" role="dialog" aria-modal="true" aria-labelledby="vqcWarmupTitle">'+
      '<header class="vqc-warmup-head"><div><span class="vqc-warmup-kicker">ĐẢO KỲ THỦ · KHỞI ĐỘNG</span><h2 id="vqcWarmupTitle">🧠 5 phút khởi động trí tuệ</h2><p id="vqcWarmupSub">Cùng quan sát, suy nghĩ và khám phá!</p></div><button type="button" class="vqc-warmup-x" id="vqcWarmupClose" aria-label="Đóng">×</button></header>'+
      '<div id="vqcWarmupBody" class="vqc-warmup-body"></div>'+
      '<footer class="vqc-warmup-foot"><span id="vqcWarmupSync">● Chờ kết nối lớp</span><button type="button" id="vqcWarmupEnd" class="vqc-warmup-end" hidden>Kết thúc khởi động</button></footer>'+
      '</section>';
    document.body.appendChild(overlay);
    $('vqcWarmupClose').addEventListener('click',()=>{overlay.hidden=true;});
    $('vqcWarmupEnd').addEventListener('click',()=>{
      if(!isTeacher())return;
      if(!state)return;
      state={...state,active:false,phase:'finished',clientId:CLIENT,nonce:Date.now()};
      publish();
      render();
    });
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.hidden=true;});
  }
  function baseState(game){
    return {active:true,game,round:0,score:0,phase:game==='memory'?'memorize':game==='picture'?'reveal':game==='maze'?'playing':'question',
      answer:null,correct:null,mazeIndex:0,revealed:[],,clientId:CLIENT,nonce:Date.now()};
  }
  function open(){
    ensureUI();
    const r=getRoom();
    if(!r){notify('Hãy tạo phòng hoặc vào lớp trước khi mở trò chơi.');return;}
    if(isTeacher()){
      if(state&&state.active){overlay.hidden=false;render();return;}
      overlay.hidden=false;renderPicker();
    }else if(state&&state.active){overlay.hidden=false;render();}
    else notify('Em chờ giáo viên bắt đầu trò chơi khởi động nhé!');
  }
  function notify(message){
    if(typeof window.vqcNotify==='function')window.vqcNotify(message,'warning');
    else alert(message);
  }
  function publish(){
    const r=getRoom();if(!r||!state)return;
    const payload={...state,clientId:CLIENT,nonce:Date.now()};
    state=payload;
    r.update({warmupGame:payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
      .catch(e=>{console.warn('Warm-up sync failed:',e);notify('Chưa đồng bộ được trò chơi. Hãy kiểm tra kết nối phòng học.');});
  }
  function start(game){
    if(!isTeacher())return;
    state=baseState(game);
    overlay.hidden=false;
    publish();render();
  }
  function renderPicker(){
    ensureUI();
    $('vqcWarmupSub').textContent='Giáo viên chọn một thử thách để cả lớp cùng chơi.';
    $('vqcWarmupEnd').hidden=true;
    $('vqcWarmupBody').innerHTML='<div class="vqc-warmup-intro"><strong>Chọn thử thách hôm nay</strong><p>Mỗi trò chơi chỉ mất khoảng 1–2 phút. Học sinh và giáo viên sẽ nhìn thấy cùng một nội dung trên hai máy.</p></div>'+
      '<div class="vqc-warmup-cards">'+
      '<button class="vqc-warmup-card" data-game="memory"><span>🧠</span><strong>Thử thách trí nhớ</strong><small>Quan sát nhanh – tìm hình biến mất</small></button>'+
      '<button class="vqc-warmup-card" data-game="pattern"><span>🔍</span><strong>Giải mã quy luật</strong><small>Tìm hình tiếp theo trong dãy</small></button>'+
      '<button class="vqc-warmup-card" data-game="maze"><span>🧭</span><strong>Nhà thám hiểm tìm đường</strong><small>Lập kế hoạch – tìm lối ra mê cung</small></button>'+
      '<button class="vqc-warmup-card" data-game="odd"><span>🧩</span><strong>Ai khác biệt?</strong><small>Tìm hình không cùng nhóm</small></button>'+
      '<button class="vqc-warmup-card" data-game="arrows"><span>➡️</span><strong>Mũi tên thần kỳ</strong><small>Dự đoán vị trí sau các bước đi</small></button>'+
      '<button class="vqc-warmup-card" data-game="picture"><span>🖼️</span><strong>Bức tranh bí ẩn</strong><small>Mở ô – quan sát – đoán hình</small></button>'+
      '</div>';
    $('vqcWarmupBody').querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>start(b.dataset.game)));
    $('vqcWarmupSync').textContent='● Đang kết nối lớp';
  }
  function controls(extra){
    return '<div class="vqc-warmup-controls">'+extra+'</div>';
  }
  function teacherButton(label,action){
    return isTeacher()?'<button class="vqc-warmup-primary" data-action="'+action+'">'+label+'</button>':'';
  }
  function bindAction(action,fn){
    const b=$('vqcWarmupBody').querySelector('[data-action="'+action+'"]');
    if(b)b.addEventListener('click',fn);
  }
  function render(){
    ensureUI();
    if(!state||!state.active){overlay.hidden=true;return;}
    overlay.hidden=false;
    $('vqcWarmupEnd').hidden=!isTeacher();
    $('vqcWarmupSync').textContent='● Đã kết nối đồng bộ';
    const gameNames={memory:'🧠 Thử thách trí nhớ',pattern:'🔍 Giải mã quy luật',maze:'🧭 Nhà thám hiểm tìm đường',odd:'🧩 Ai khác biệt?',arrows:'➡️ Mũi tên thần kỳ',picture:'🖼️ Bức tranh bí ẩn'};
    $('vqcWarmupSub').textContent=gameNames[state.game]+' · Giáo viên và học sinh đang cùng tham gia';
    if(state.game==='memory')renderMemory();
    else if(state.game==='pattern')renderPattern();
    else if(state.game==='odd')renderOdd();
    else if(state.game==='arrows')renderArrows();
    else if(state.game==='picture')renderPicture();
    else renderMaze();
  }
  function renderMemory(){
    const q=MEMORY[Math.min(state.round,2)];
    const top='<div class="vqc-warmup-progress">Lượt '+(state.round+1)+'/3 <span>⭐ '+state.score+'/3</span></div>';
    let content='';
    if(state.phase==='memorize'){
      content='<p class="vqc-warmup-instruction">Hãy quan sát và ghi nhớ tất cả hình ảnh nhé!</p><div class="vqc-warmup-objects">'+q.items.map(x=>'<span>'+x+'</span>').join('')+'</div>'+
        '<p class="vqc-warmup-hint">Em hãy nhìn thật kỹ trước khi chuyển sang câu hỏi.</p>'+controls(teacherButton('Em đã ghi nhớ! →','question'));
    }else if(state.phase==='question'){
      const visible=q.items.filter((_,i)=>q.items[i]!==q.missing);
      content='<p class="vqc-warmup-instruction">Hình ảnh nào đã biến mất?</p><div class="vqc-warmup-objects">'+visible.map(x=>'<span>'+x+'</span>').join('')+'<span class="vqc-warmup-missing">?</span></div>'+
        '<div class="vqc-warmup-options">'+q.options.map(x=>'<button data-answer="'+x+'">'+x+'</button>').join('')+'</div><p class="vqc-warmup-hint">Chọn một đáp án. Hai máy sẽ cùng nhận kết quả.</p>';
      bindAnswers();
    }else{
      content='<div class="vqc-warmup-result">'+(state.correct?'🎉 Chính xác!':'🌱 Cùng thử lại ở lượt tiếp theo nhé!')+'</div><p class="vqc-warmup-instruction">Hình đã biến mất là <strong>'+q.missing+'</strong>.</p>'+
        controls(teacherButton(state.round===2?'Xem kết quả':'Lượt tiếp theo →','next'));
    }
    $('vqcWarmupBody').innerHTML=top+content;
    if(state.phase==='question')bindAnswers();
    if(state.phase==='result')bindAction('next',nextRound);
    if(state.phase==='memorize')bindAction('question',()=>{if(isTeacher()){state={...state,phase:'question',clientId:CLIENT};publish();render();}});
  }
  function bindAnswers(){
    $('vqcWarmupBody').querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>{
      if(state.phase!=='question')return;
      const q=MEMORY[Math.min(state.round,2)],ok=b.dataset.answer===q.missing;
      state={...state,phase:'result',answer:b.dataset.answer,correct:ok,score:state.score+(ok?1:0),clientId:CLIENT};
      publish();render();
    }));
  }
  function nextRound(){
    if(!isTeacher())return;
    if(state.round>=2){state={...state,active:false,phase:'finished',clientId:CLIENT};publish();render();return;}
    state={...state,round:state.round+1,phase:'memorize',answer:null,correct:null,clientId:CLIENT};
    publish();render();
  }
  function renderPattern(){
    const q=PATTERNS[Math.min(state.round,2)];
    const top='<div class="vqc-warmup-progress">Câu '+(state.round+1)+'/3 <span>⭐ '+state.score+'/3</span></div>';
    let content='<p class="vqc-warmup-instruction">Hãy tìm hình tiếp theo trong quy luật!</p><div class="vqc-warmup-pattern">'+q.items.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    if(state.phase==='question'){
      content+='<div class="vqc-warmup-options">'+q.options.map(x=>'<button data-pattern="'+x+'">'+x+'</button>').join('')+'</div>';
    }else{
      content+='<div class="vqc-warmup-result">'+(state.correct?'🌟 Tuyệt vời! Em đã tìm đúng quy luật.':'💡 Đáp án đúng là '+q.answer)+'</div><p class="vqc-warmup-hint">'+q.why+'</p>'+
        controls(teacherButton(state.round===2?'Hoàn thành':'Câu tiếp theo →','next-pattern'));
    }
    $('vqcWarmupBody').innerHTML=top+content;
    if(state.phase==='question')$('vqcWarmupBody').querySelectorAll('[data-pattern]').forEach(b=>b.addEventListener('click',()=>{
      if(state.phase!=='question')return;
      const ok=b.dataset.pattern===q.answer;
      state={...state,phase:'result',answer:b.dataset.pattern,correct:ok,score:state.score+(ok?1:0),clientId:CLIENT};
      publish();render();
    }));
    if(state.phase==='result')bindAction('next-pattern',()=>{
      if(!isTeacher())return;
      if(state.round>=2){state={...state,active:false,phase:'finished',clientId:CLIENT};publish();render();return;}
      state={...state,round:state.round+1,phase:'question',answer:null,correct:null,clientId:CLIENT};publish();render();
    });
  }

  function renderOdd(){
    const q=ODD[Math.min(state.round,2)];
    const top='<div class="vqc-warmup-progress">Câu '+(state.round+1)+'/3 <span>⭐ '+state.score+'/3</span></div>';
    let html=top+'<p class="vqc-warmup-instruction">Hình nào không cùng nhóm với các hình còn lại?</p><div class="vqc-odd-items">'+q.items.map(x=>'<span>'+x+'</span>').join('')+'</div>';
    if(state.phase==='question')html+='<div class="vqc-warmup-options">'+q.items.map(x=>'<button data-odd="'+x+'">'+x+'</button>').join('')+'</div>';
    else html+='<div class="vqc-warmup-result">'+(state.correct?'🎉 Em tìm đúng rồi!':'🌱 Đáp án là '+q.answer)+'</div><p class="vqc-warmup-hint">'+q.why+'</p>'+controls(teacherButton(state.round===2?'Hoàn thành':'Câu tiếp theo →','odd-next'));
    $('vqcWarmupBody').innerHTML=html;
    if(state.phase==='question')$('vqcWarmupBody').querySelectorAll('[data-odd]').forEach(b=>b.addEventListener('click',()=>{
      if(state.phase!=='question')return;const ok=b.dataset.odd===q.answer;
      state={...state,phase:'result',answer:b.dataset.odd,correct:ok,score:state.score+(ok?1:0),clientId:CLIENT};publish();render();
    }));
    if(state.phase==='result')bindAction('odd-next',()=>advanceQuestion('odd'));
  }
  function renderArrows(){
    const q=ARROWS[Math.min(state.round,2)];
    const moves=q.moves.map((x,i)=>'<span class="vqc-arrow-step"><small>Bước '+(i+1)+'</small>'+x+'</span>').join('');
    let html='<div class="vqc-warmup-progress">Câu '+(state.round+1)+'/3 <span>⭐ '+state.score+'/3</span></div>'+
      '<p class="vqc-warmup-instruction">Bạn nhỏ bắt đầu ở ô <strong>'+q.start.join(', ')+'</strong>. Sau các mũi tên, bạn ấy sẽ ở vị trí nào?</p>'+
      '<div class="vqc-arrow-sequence"><span class="vqc-arrow-start">🚩<small>Bắt đầu</small></span>'+moves+'</div>';
    if(state.phase==='question')html+='<div class="vqc-warmup-options">'+q.options.map(x=>'<button data-arrow="'+x+'">'+x+'</button>').join('')+'</div>';
    else html+='<div class="vqc-warmup-result">'+(state.correct?'🌟 Chính xác!':'💡 Vị trí đúng: '+q.answer)+'</div><p class="vqc-warmup-hint">'+q.why+'</p>'+controls(teacherButton(state.round===2?'Hoàn thành':'Câu tiếp theo →','arrow-next'));
    $('vqcWarmupBody').innerHTML=html;
    if(state.phase==='question')$('vqcWarmupBody').querySelectorAll('[data-arrow]').forEach(b=>b.addEventListener('click',()=>{
      if(state.phase!=='question')return;const ok=b.dataset.arrow===q.answer;
      state={...state,phase:'result',answer:b.dataset.arrow,correct:ok,score:state.score+(ok?1:0),clientId:CLIENT};publish();render();
    }));
    if(state.phase==='result')bindAction('arrow-next',()=>advanceQuestion('arrows'));
  }
  function renderPicture(){
    const q=PICTURES[Math.min(state.round,2)],revealed=state.revealed||[];
    const tiles=Array.from({length:9},(_,i)=>'<button class="vqc-picture-tile '+(revealed.includes(i)?'revealed':'')+'" data-tile="'+i+'">'+(revealed.includes(i)?q.picture:'?')+'</button>').join('');
    let html='<div class="vqc-warmup-progress">Bức tranh '+(state.round+1)+'/3 <span>🪟 '+revealed.length+'/9 ô</span></div>'+
      '<p class="vqc-warmup-instruction">Bức tranh đang được che lại. Em hãy mở từng ô và đoán xem đó là gì!</p>'+
      '<div class="vqc-picture-grid">'+tiles+'</div>';
    if(state.phase==='reveal'&&revealed.length>=2)html+='<p class="vqc-warmup-hint">Em đã có manh mối. Hãy thử đoán bức tranh!</p><div class="vqc-warmup-options">'+q.options.map(x=>'<button data-picture="'+x+'">'+x+'</button>').join('')+'</div>';
    if(state.phase==='reveal'&&revealed.length<2)html+='<p class="vqc-warmup-hint">Mở ít nhất 2 ô để nhận các lựa chọn nhé.</p>';
    if(state.phase==='result')html+='<div class="vqc-warmup-result">'+(state.correct?'🎉 Đoán đúng bức tranh!':'💡 Bức tranh là '+q.answer)+'</div><p class="vqc-warmup-hint">'+q.hint+'</p>'+controls(teacherButton(state.round===2?'Hoàn thành':'Bức tranh tiếp theo →','picture-next'));
    $('vqcWarmupBody').innerHTML=html;
    if(state.phase==='reveal')$('vqcWarmupBody').querySelectorAll('[data-tile]').forEach(b=>b.addEventListener('click',()=>{
      const n=Number(b.dataset.tile);if((state.revealed||[]).includes(n))return;
      state={...state,revealed:[...(state.revealed||[]),n],clientId:CLIENT};publish();render();
    }));
    if(state.phase==='reveal'&&revealed.length>=2)$('vqcWarmupBody').querySelectorAll('[data-picture]').forEach(b=>b.addEventListener('click',()=>{
      if(state.phase!=='reveal')return;const ok=b.dataset.picture===q.answer;
      state={...state,phase:'result',answer:b.dataset.picture,correct:ok,score:state.score+(ok?1:0),clientId:CLIENT};publish();render();
    }));
    if(state.phase==='result')bindAction('picture-next',()=>advanceQuestion('picture'));
  }
  function advanceQuestion(game){
    if(!isTeacher())return;
    if(state.round>=2){state={...state,active:false,phase:'finished',clientId:CLIENT};publish();render();return;}
    state={...state,round:state.round+1,phase:game==='picture'?'reveal':'question',answer:null,correct:null,revealed:[],clientId:CLIENT};
    publish();render();
  }
  function renderMaze(){
    const idx=state.mazeIndex||0,cur=MAZE_PATH[idx],done=idx===MAZE_PATH.length-1;
    const cells=[];
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){
      const pi=MAZE_PATH.findIndex(p=>p[0]===r&&p[1]===c);
      let cls=pi<0?'wall':pi<idx?'visited':pi===idx?'current':'path';
      let symbol=pi===0?'🚩':pi===MAZE_PATH.length-1?'🏁':pi===idx?'🧒':pi<idx?'·':'';
      cells.push('<span class="vqc-maze-cell '+cls+'">'+symbol+'</span>');
    }
    const buttons=done?'':[['up','⬆️'],['left','⬅️'],['down','⬇️'],['right','➡️']].map(([d,t])=>'<button data-dir="'+d+'">'+t+'</button>').join('');
    $('vqcWarmupBody').innerHTML='<div class="vqc-warmup-progress">Hành trình tìm đường <span>🧭 '+idx+'/'+(MAZE_PATH.length-1)+' bước</span></div>'+
      '<p class="vqc-warmup-instruction">'+(done?'🎉 Em đã tìm được đường đến đích!':'Hãy chọn hướng đi tiếp theo để đưa nhà thám hiểm đến lá cờ. Mỗi bước đi đều được đồng bộ.')+'</p>'+
      '<div class="vqc-maze-grid">'+cells.join('')+'</div>'+
      (done?'<div class="vqc-warmup-result">🏆 Hoàn thành mê cung!</div>': '<div class="vqc-maze-controls">'+buttons+'</div>')+
      (done?controls(teacherButton('Chơi lại mê cung ↻','maze-reset')):'')+
      '<p class="vqc-warmup-hint">Gợi ý: hãy suy nghĩ trước khi chọn hướng đi. Có thể quay lại ô vừa đi.</p>';
    $('vqcWarmupBody').querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('click',()=>moveMaze(b.dataset.dir)));
    bindAction('maze-reset',()=>{if(!isTeacher())return;state={...state,mazeIndex:0,clientId:CLIENT};publish();render();});
  }
  function moveMaze(dir){
    if(!state||state.game!=='maze'||state.mazeIndex>=MAZE_PATH.length-1)return;
    const [r,c]=MAZE_PATH[state.mazeIndex],delta={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]}[dir];
    const next=MAZE_PATH[state.mazeIndex+1],prev=MAZE_PATH[state.mazeIndex-1];
    let target=-1;
    if(next&&next[0]===r+delta[0]&&next[1]===c+delta[1])target=state.mazeIndex+1;
    else if(prev&&prev[0]===r+delta[0]&&prev[1]===c+delta[1])target=state.mazeIndex-1;
    if(target<0){notify('Đường này chưa thông. Hãy thử hướng khác nhé!');return;}
    state={...state,mazeIndex:target,score:target===MAZE_PATH.length-1?1:0,clientId:CLIENT};
    publish();render();
  }
  function receive(data){
    if(!data||data.clientId===CLIENT)return;
    const key=JSON.stringify(data);if(key===lastReceived)return;lastReceived=key;
    state=data;
    if(data.active)render();else if(overlay){overlay.hidden=true;}
  }
  function startListener(){
    const r=getRoom();if(!r||typeof r.onSnapshot!=='function')return;
    if(unsubscribe)unsubscribe();
    lastReceived='';state=null;if(overlay)overlay.hidden=true;
    unsubscribe=r.onSnapshot(snap=>{
      if(!snap.exists)return;
      const data=snap.data()||{};
      if(data.warmupGame)receive(data.warmupGame);
    },e=>console.warn('Warm-up listener:',e));
  }
  function stopListener(){if(unsubscribe){unsubscribe();unsubscribe=null;}state=null;lastReceived='';if(overlay)overlay.hidden=true;}
  const baseListen=window.listenToRoom;
  if(typeof baseListen==='function'){
    window.listenToRoom=function(){const out=baseListen.apply(this,arguments);startListener();return out;};
  }
  const baseStop=window.stopRoomListener;
  if(typeof baseStop==='function'){
    window.stopRoomListener=function(){stopListener();return baseStop.apply(this,arguments);};
  }
  window.vqcWarmupOpen=open;
  window.vqcWarmupClose=()=>{if(overlay)overlay.hidden=true;};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay&&!overlay.hidden)overlay.hidden=true;});
})();
