/* Same-origin Worker bootstrap for Stockfish.js 19 lite single-threaded build. */
(function(){
 'use strict';
 const primary='https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/';
 const fallback='https://unpkg.com/stockfish@19.0.1/bin/';
 const engine='stockfish-19-lite-single.js';
 const wasm='stockfish-19-lite-single.wasm';
 function setBase(base){
  self.__vqcStockfishBase=base;
  self.Module=self.Module||{};
  self.Module.locateFile=function(path){
   if(path&&path.endsWith('.wasm'))return base+wasm;
   return base+path;
  };
 }
 self.addEventListener('error',function(event){
  try{self.postMessage('VQC_ENGINE_RUNTIME_ERROR '+String(event.message||'Engine worker error'));}catch(e){}
 });
 setBase(primary);
 try{
  importScripts(primary+engine);
 }catch(first){
  setBase(fallback);
  try{importScripts(fallback+engine);}
  catch(second){
   self.postMessage('VQC_ENGINE_LOAD_ERROR '+String(second&&second.message||second||first));
  }
 }
})();