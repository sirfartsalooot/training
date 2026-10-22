async function stats(env,url){
 const sid=url.searchParams.get('sessionId'),slide=url.searchParams.get('slideId');
 if(sid!==env.PUBLIC_SESSION_ID)throw bad('Unknown session',404);
 if(!ALLOWED[slide])throw bad('Unknown slide');
 const entries=(await env.DB.prepare('SELECT participant_key,unit_id,answer_json,correct_count,total_count,outcome FROM responses WHERE session_id=? AND slide_id=?').bind(sid,slide).all()).results;
 const units={};const get=u=>units[u]??=({participants:0,passed:0,partial:0,failed:0,correctSum:0,totalSum:0,options:{}});
 const required={s29:['crm','draft','rcpt'],s38:['data_disclosure','status_change','resource_exhaustion']}[slide];
 const perPerson=new Map();
 for(const e of entries){
  const u=get(e.unit_id),a=JSON.parse(e.answer_json);
  u.participants++;u.passed+=Number(e.outcome==='Passed');u.partial+=Number(e.outcome==='Partial');u.failed+=Number(e.outcome==='Failed');u.correctSum+=e.correct_count||0;u.totalSum+=e.total_count||0;
  const count=k=>u.options[k]=(u.options[k]||0)+1;
  if(slide==='s06'){for(const x of a.placed)count('shield:'+x);count('attack:'+((a.stoppedAt||'none')));}
  if(slide==='s11')for(const [v,ans] of Object.entries(a.answers))for(const [k,x] of Object.entries(ans))count(v+'.'+k+':'+x);
  if(slide==='s29'&&e.unit_id!=='back')for(const x of a.selectedIndexes)count('selected:'+x);
  if(slide==='s29'&&e.unit_id==='back')count('now:'+a.now);
  if(slide==='s38'){count('control:'+a.firstControlIndex);count('test:'+a.firstTestIndex);}
  if(required&&required.includes(e.unit_id)){
   if(!perPerson.has(e.participant_key))perPerson.set(e.participant_key,new Map());
   const person=perPerson.get(e.participant_key);
   if(!person.has(e.unit_id))person.set(e.unit_id,e.outcome);
  }
 }
 let audience=null;
 if(required){
  let allCompleted=0,allPassed=0;
  for(const person of perPerson.values()){
   if(required.every(x=>person.has(x)))allCompleted++;
   if(required.every(x=>person.get(x)==='Passed'))allPassed++;
  }
  audience={uniqueParticipants:perPerson.size,allCompleted,allPassed};
 }
 return {sessionId:sid,slideId:slide,totalResponses:entries.length,units,audience,updatedAt:new Date().toISOString()};
}
