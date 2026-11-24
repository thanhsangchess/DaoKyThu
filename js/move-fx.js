(function(){
 'use strict';
 if(window.vqcFx)return;
 const VERSION='20261124-fx-v2';
 let soundOn=true;
 function reduced(){try{return !!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){return false;}}

 let ctx=null,master=null,unlocked=false;
 function unlock(){
  if(unlocked)return;
  unlocked=true;
  try{
   const C=window.AudioContext||window.webkitAudioContext;
   if(C){ctx=new C();master=ctx.createGain();master.gain.value=0.55;master.connect(ctx.destination);}
  }catch(e){ctx=null;}
  decodeSamples();
 }
 const SAMPLE_OF={move:'move',capture:'move',castle:'move',promote:'move',check:'check'};
 const buffers={};let decoded=false;
 function samples(){return window.vqcSoundData||{};}
 function dataToBuffer(uri){
  const raw=atob(String(uri).slice(String(uri).indexOf(',')+1)),u=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);
  return u.buffer;
 }
 function decodeSamples(){
  if(decoded||!ctx)return;
  decoded=true;
  const sd=samples();
  Object.keys(sd).forEach(function(k){
   try{
    const p=ctx.decodeAudioData(dataToBuffer(sd[k]),function(b){buffers[k]=b;},function(){});
    if(p&&typeof p.then==='function')p.then(function(b){if(b)buffers[k]=b;},function(){});
   }catch(e){}
  });
 }
 function playSample(key){
  const sd=samples();
  if(!sd[key])return false;
  try{
   if(ctx&&buffers[key]){
    const src=ctx.createBufferSource(),g=ctx.createGain();
    src.buffer=buffers[key];g.gain.value=1;src.connect(g);g.connect(ctx.destination);src.start(0);
    return true;
   }
   const a=new Audio(sd[key]);a.volume=1;
   const pr=a.play();if(pr&&typeof pr.catch==='function')pr.catch(function(){});
   return true;
  }catch(e){return false;}
 }
 ['pointerdown','keydown','touchstart'].forEach(function(n){window.addEventListener(n,unlock,{capture:true,passive:true});});
 function ready(){
  if(!soundOn||!ctx)return false;
  if(ctx.state==='suspended'){try{ctx.resume();}catch(e){}}
  return ctx.state!=='closed';
 }
 function tone(freq,at,dur,o){
  o=o||{};
  const osc=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+at;
  osc.type=o.type||'sine';
  osc.frequency.setValueAtTime(freq,t);
  if(o.to)osc.frequency.exponentialRampToValueAtTime(o.to,t+dur);
  const peak=o.gain==null?0.3:o.gain;
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  osc.connect(g);g.connect(master);
  osc.start(t);osc.stop(t+dur+0.03);
 }
 let noiseBuf=null;
 function click(at,dur,o){
  o=o||{};
  if(!noiseBuf){
   noiseBuf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.2),ctx.sampleRate);
   const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  }
  const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),t=ctx.currentTime+at;
  src.buffer=noiseBuf;f.type='lowpass';f.frequency.value=o.lp||1700;
  g.gain.setValueAtTime(o.gain==null?0.5:o.gain,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(f);f.connect(g);g.connect(master);
  src.start(t);src.stop(t+dur+0.02);
 }
 const SOUNDS={
  move:function(){click(0,0.05,{gain:0.55,lp:1500});tone(210,0,0.09,{to:140,gain:0.28});},
  capture:function(){click(0,0.08,{gain:0.85,lp:2400});tone(150,0,0.13,{to:80,gain:0.4});click(0.055,0.05,{gain:0.4,lp:1200});},
  castle:function(){SOUNDS.move();setTimeout(function(){if(ready())SOUNDS.move();},120);},
  promote:function(){[523,659,784].forEach(function(f,i){tone(f,i*0.07,0.14,{type:'triangle',gain:0.25});});},
  check:function(){tone(880,0,0.09,{type:'square',gain:0.1});tone(880,0.13,0.12,{type:'square',gain:0.1});},
  ok:function(){[523,659,784,1047].forEach(function(f,i){tone(f,i*0.085,0.2,{type:'triangle',gain:0.26});});},
  err:function(){tone(190,0,0.22,{type:'sawtooth',to:120,gain:0.11});},
  click:function(){click(0,0.025,{gain:0.3,lp:3000});}
 };
 function play(name){
  if(!ready())return false;
  const key=SAMPLE_OF[name];
  if(key&&playSample(key))return true;
  const f=SOUNDS[name];if(!f)return false;
  try{f();return true;}catch(e){return false;}
 }
 let pend=null;
 window.addEventListener('vqc:board-move',function(e){
  const d=e.detail||{};
  const name=d.castle?'castle':(d.promotion?'promote':(d.capture?'capture':'move'));
  if(pend)clearTimeout(pend.t);
  pend={name:name,t:setTimeout(function(){const p=pend;pend=null;if(p)play(p.name);},40)};
 });
 window.addEventListener('vqc:board-check',function(){
  if(pend){clearTimeout(pend.t);pend=null;}
  play('check');
 });

 function setSound(on){soundOn=!!on;if(soundOn)unlock();}
 function mountStyles(){
  const old=document.getElementById('vqcSoundToggle');
  if(old){try{old.remove();}catch(e){}}
  if(document.getElementById('vqcFxCss')||!document.head)return;
  const st=document.createElement('style');st.id='vqcFxCss';
  st.textContent='@keyframes vqcHintPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,184,28,.0)}50%{box-shadow:0 0 0 7px rgba(255,184,28,.55)}}'+
   '.vqc-hint-pulse{animation:vqcHintPulse 1s ease-in-out 6;outline:3px solid #ffb81c;outline-offset:2px}'+
   '@media(prefers-reduced-motion:reduce){.vqc-hint-pulse{animation:none}}';
  document.head.appendChild(st);
 }

 const FEED_SEL='[id$="Feedback"],[id$="Message"],[class*="-feedback"],.mate-msg';
 const OK_TXT=/^(🏆|🎉|✅|⭐|🌟|👏)|Chính xác|Giỏi lắm|Tuyệt vời|Đúng rồi|Hoàn thành/;
 const ERR_TXT=/^(❌|😅|🙈)|Chưa đúng|Sai rồi|Chưa phải/;
 const watched=new WeakMap();
 function visible(el){
  if(el.hidden)return false;
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0;
 }
 function judge(el){
  if(!visible(el))return null;
  const t=(el.textContent||'').trim();
  if(!t)return null;
  const c=String(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className||'');
  if(/(^|[\s-])(good|success|correct)($|[\s-])/.test(c))return 'ok';
  if(/(^|[\s-])(bad|wrong|error|incorrect)($|[\s-])/.test(c))return 'err';
  if(el.id==='captureFeedback')return 'err';
  if(OK_TXT.test(t))return 'ok';
  if(ERR_TXT.test(t))return 'err';
  return null;
 }
 function boardNear(el){
  const root=el.closest('[class*="overlay"],[class*="dialog"],main,body')||document.body;
  const cands=root.querySelectorAll('[class*="board"],[id$="Board"]');
  for(const c of cands){if(c.children.length>=64){const r=c.getBoundingClientRect();if(r.width>0)return c;}}
  return null;
 }
 function burst(origin){
  if(reduced())return;
  const r=origin?origin.getBoundingClientRect():{left:innerWidth/2-1,top:innerHeight/2-1,width:2,height:2};
  const cx=r.left+r.width/2,cy=r.top+r.height/2;
  const box=document.createElement('div');
  box.setAttribute('aria-hidden','true');
  box.style.cssText='position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000';
  const COL=['#ffcf33','#ff7a59','#4cc9a4','#4ea1ff','#c77dff','#ff5d8f'];
  const n=30;
  for(let i=0;i<n;i++){
   const p=document.createElement('span');
   const star=i%3===0;
   p.textContent=star?(i%2?'⭐':'✨'):'';
   p.style.cssText='position:absolute;left:'+cx+'px;top:'+cy+'px;'+(star?'font-size:'+(16+(i%4)*4)+'px;line-height:1;':'width:'+(6+i%4*2)+'px;height:'+(9+i%3*3)+'px;border-radius:2px;background:'+COL[i%COL.length]+';');
   box.appendChild(p);
   const ang=(Math.PI*2*i/n)+Math.random()*0.4,spd=90+Math.random()*(r.width>10?Math.min(220,r.width/2.2):150);
   const dx=Math.cos(ang)*spd,dy=Math.sin(ang)*spd-40,fall=110+Math.random()*90,rot=(Math.random()*720-360);
   try{
    p.animate([
     {transform:'translate(0,0) rotate(0deg) scale(.4)',opacity:1},
     {transform:'translate('+dx*0.7+'px,'+dy+'px) rotate('+rot*0.6+'deg) scale(1)',opacity:1,offset:.45},
     {transform:'translate('+dx+'px,'+(dy+fall)+'px) rotate('+rot+'deg) scale(.9)',opacity:0}
    ],{duration:950+Math.random()*350,easing:'cubic-bezier(.2,.6,.3,1)',fill:'forwards'});
   }catch(e){}
  }
  document.body.appendChild(box);
  setTimeout(function(){try{box.remove();}catch(e){}},1500);
 }
 function shake(board){
  if(!board||reduced()||typeof board.animate!=='function')return;
  try{
   board.animate([{transform:'translateX(0)'},{transform:'translateX(-7px)'},{transform:'translateX(6px)'},{transform:'translateX(-4px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:380,easing:'ease-out'});
   board.animate([{boxShadow:'inset 0 0 0 0 rgba(255,120,90,0)'},{boxShadow:'inset 0 0 0 6px rgba(255,120,90,.45)',offset:.3},{boxShadow:'inset 0 0 0 0 rgba(255,120,90,0)'}],{duration:520});
  }catch(e){}
 }
 const errStreak=new Map();
 let lastHintAt=0;
 function nudgeHint(el){
  const root=el.closest('[class*="overlay"],[class*="dialog"]')||document;
  let btn=null;
  root.querySelectorAll('button').forEach(function(b){
   if(btn||b.disabled)return;
   const r=b.getBoundingClientRect();
   if(r.width>0&&/gợi ý|💡/i.test(b.textContent||''))btn=b;
  });
  const now=Date.now();
  if(btn){
   btn.classList.add('vqc-hint-pulse');
   setTimeout(function(){btn.classList.remove('vqc-hint-pulse');},7000);
  }
  if(now-lastHintAt>60000){
   lastHintAt=now;
   try{if(typeof vqcNotify==='function')vqcNotify(btn?'Chưa sao đâu! Nhìn kỹ lại, hoặc bấm nút Gợi ý đang nhấp nháy nhé.':'Chưa sao đâu! Nhìn kỹ lại rồi thử nước khác nhé.','info');}catch(e){}
  }
 }
 const lastFire=new Map();
 function fire(el,kind){
  const id=el.id||el.className||'fb';
  const sig=kind+'|'+(el.textContent||'').trim().slice(0,60);
  const prev=lastFire.get(id);
  const t=Date.now();
  if(prev&&prev.sig===sig&&t-prev.t<1500)return;
  lastFire.set(id,{sig:sig,t:t});
  const board=boardNear(el);
  if(kind==='ok'){errStreak.delete(id);play('ok');burst(board||el);}
  else{
   play('err');shake(board);
   const n=(errStreak.get(id)||0)+1;errStreak.set(id,n);
   if(n>=2){nudgeHint(el);errStreak.set(id,0);}
  }
  try{window.dispatchEvent(new CustomEvent('vqc:result',{detail:{kind:kind,el:el,id:id}}));}catch(e){}
 }
 function attachFeed(el){
  if(watched.has(el))return;
  const st={last:judge(el)};
  st.text=(el.textContent||'').trim();
  watched.set(el,st);
  const mo=new MutationObserver(function(){
   const k=judge(el),txt=(el.textContent||'').trim();
   const changed=k!==st.last||txt!==st.text;
   st.last=k;st.text=txt;
   if(k&&changed)fire(el,k);
  });
  mo.observe(el,{attributes:true,attributeFilter:['class','hidden','style'],childList:true,characterData:true,subtree:true});
 }
 function scan(){
  mountStyles();
  document.querySelectorAll(FEED_SEL).forEach(attachFeed);
 }
 setInterval(scan,1500);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
 window.addEventListener('load',scan);

 window.vqcFx={
  version:VERSION,
  sound:{play:play,isOn:function(){return soundOn;},set:setSound,names:Object.keys(SOUNDS),samples:function(){return Object.keys(samples()).filter(function(k){return !!buffers[k];});}},
  burst:burst,shake:shake,scan:scan,
  _unlock:unlock
 };
})();
