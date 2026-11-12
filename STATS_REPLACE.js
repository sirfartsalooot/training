/* Замена функции stats() в Worker (темы 1.1, 1.3, 1.8; часть 2 — темы 2.1, 2.4, 2.5).
   Совпадает с stats() в worker-complete-reference.js. Использует ALLOWED, GENERIC и SELFTEST_SESSION из того же файла,
   поэтому надёжнее заменять код Worker целиком файлом worker-complete-reference.js. */
async function stats(env,url){
 const sid=url.searchParams.get('sessionId'),slide=url.searchParams.get('slideId');
 if(sid!==env.PUBLIC_SESSION_ID&&sid!==SELFTEST_SESSION)throw bad('Unknown session',404);
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
  if(GENERIC[slide]){for(const [q,v] of Object.entries(a.answers||{}))count(q+':'+v);if(Array.isArray(a.order))a.order.forEach((x,i)=>count('order'+(i+1)+':'+x));}
  if(['s26','s42','s46','s47','s48'].includes(slide)){for(const [k,v] of Object.entries(a)){if(Array.isArray(v)){if(k==='answers')v.forEach((x,i)=>count('a'+i+':'+x));else v.forEach(x=>count(k+':'+x));}else count(k+':'+v);}}
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
 // Expose only group-level aggregates; no participant identities or raw answers.
 const sessionTotalRow=await env.DB.prepare('SELECT COUNT(DISTINCT participant_key) AS n FROM participants WHERE session_id=?').bind(sid).first();
 const sessionParticipants=Number(sessionTotalRow?.n||0);
 const questionRows=(await env.DB.prepare(`SELECT ri.question_id AS questionId, COUNT(*) AS attempts, SUM(CASE WHEN ri.is_correct=0 THEN 1 ELSE 0 END) AS mistakes, SUM(CASE WHEN ri.is_correct=1 THEN 1 ELSE 0 END) AS correct FROM response_items ri JOIN responses r ON r.response_key=ri.response_key WHERE r.session_id=? AND r.slide_id=? AND r.unit_id='main' GROUP BY ri.question_id`).bind(sid,slide).all()).results;
 const questions={};for(const row of questionRows){questions[row.questionId]={attempts:Number(row.attempts||0),mistakes:Number(row.mistakes||0),correct:Number(row.correct||0)};}
 return {sessionId:sid,slideId:slide,totalResponses:entries.length,units,audience,sessionParticipants,questions,updatedAt:new Date().toISOString()};
}
