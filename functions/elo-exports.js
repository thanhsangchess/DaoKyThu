'use strict';
const {makeApi}=require('./elo-api');

module.exports=function register(ctx){
 const functions=ctx.functions;
 const api=makeApi({db:ctx.db,HttpsError:functions.https.HttpsError});
 const wrap=handler=>ctx.region.runWith({memory:'256MB',timeoutSeconds:30}).https.onCall(async(data,context)=>{
  if(!context.auth)throw new functions.https.HttpsError('unauthenticated','Cần đăng nhập.');
  return handler(data,context.auth.uid);
 });
 return {
  eloPuzzleStart:wrap(api.start),
  eloPuzzleMove:wrap(api.move),
  eloPuzzleHint:wrap(api.hint),
  eloPuzzleGiveUp:wrap(api.giveUp),
  eloSessionBrowse:wrap(api.sessionBrowse),
  eloSessionCreate:wrap(api.sessionCreate),
  eloSessionGet:wrap(api.sessionGet),
  eloSessionEnd:wrap(api.sessionEnd)
 };
};
