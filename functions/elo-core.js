'use strict';
const fs=require('fs');
const path=require('path');
const {Chess}=require('chess.js');

const START_ELO=600;
const MIN_ELO=200;
const MAX_ELO=2200;
const SQ=/^[a-h][1-8]$/;

let cache=null;

function loadBank(dir){
 const base=dir||path.join(__dirname,'puzzle-bank');
 if(cache&&cache.dir===base)return cache;
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 const list=[];
 const byId=new Map();
 const themes=new Set();
 for(const band of manifest.bands){
  const j=JSON.parse(fs.readFileSync(path.join(base,band.file),'utf8'));
  for(const it of j.p){
   const p={id:String(it[0]),fen:String(it[1]),moves:String(it[2]).split(' '),rating:Number(it[3]),themes:String(it[4]||'').split(' ').filter(Boolean)};
   p.themes.forEach(t=>themes.add(t));
   list.push(p);
   byId.set(p.id,p);
  }
 }
 list.sort((a,b)=>a.rating-b.rating||(a.id<b.id?-1:1));
 cache={dir:base,list,byId,themes};
 return cache;
}

function clampElo(v){return Math.max(MIN_ELO,Math.min(MAX_ELO,Math.round(v)));}

function calcDelta(elo,games,puzzleRating,score,clean){
 const expected=1/(1+Math.pow(10,(puzzleRating-elo)/400));
 const k=games<10?48:32;
 let d=Math.round(k*(score-expected));
 if(clean&&d<1)d=1;
 return clampElo(elo+d)-elo;
}

function applyUci(game,uci){
 if(typeof uci!=='string'||uci.length<4)return null;
 try{return game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci.length>4?uci[4]:undefined});}
 catch(e){return null;}
}

function replay(puzzle,idx){
 const g=new Chess();
 if(!g.load(puzzle.fen))return null;
 for(let i=0;i<idx;i++){if(!applyUci(g,puzzle.moves[i]))return null;}
 return g;
}

function playerColor(puzzle){
 const g=new Chess();
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
 let pool=list.filter(p=>!seenSet.has(p.id));
 if(pool.length<15)pool=list.slice();
 pool.sort((a,b)=>Math.abs(a.rating-elo)-Math.abs(b.rating-elo)||(a.id<b.id?-1:1));
 const top=pool.slice(0,15);
 return top[Math.floor((rng||Math.random)()*top.length)];
}

function filterBank(list,minElo,maxElo,themes){
 return list.filter(p=>{
  if(p.rating<minElo||p.rating>maxElo)return false;
  if(themes&&themes.length&&!themes.some(t=>p.themes.includes(t)))return false;
  return true;
 });
}

module.exports={START_ELO,MIN_ELO,MAX_ELO,loadBank,clampElo,calcDelta,applyUci,replay,playerColor,judge,pickNear,filterBank};
