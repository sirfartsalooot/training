const ALLOWED = {s06:['main'],s11:['main'],s29:['crm','draft','rcpt','back'],s38:['data_disclosure','status_change','resource_exhaustion']};
const EXPECTED11=[
 {type:'1 вызов LLM',step:'Код',auth:'Инфраструктура'},
 {type:'Workflow',step:'Код',auth:'Инфраструктура'},
 {type:'Агент',step:'Модель',auth:'Инфраструктура'}
];
const EXPECTED29={crm:[false,true,true,true],draft:[false,true,true,true],rcpt:[false,true,true,false]};
const EXPECTED38={data_disclosure:{control:1,test:2},status_change:{control:3,test:0},resource_exhaustion:{control:1,test:3}};
const slots=['A','B','C','D','E','F','G'];
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const s=x=>typeof x==='string'&&x.length>0&&x.length<=160;
const validId=x=>s(x)&&/^[a-zA-Z0-9_-]{1,90}$/.test(x);
const unique=x=>new Set(x).size===x.length;
function validate(slide,unit,a){
 if(!isObj(a))throw bad('answer must be object');
 const items=[];let correct=null,total=null,outcome='Not Scored',mistakes=0;
 const add=(q,ans,expected,ok,type='Choice')=>items.push({question_id:q,answer:String(ans),correct_answer:expected===null?null:String(expected),is_correct:ok===null?null:Number(ok),option_counted:1,item_type:type});
 if(slide==='s06'){
  if(!Array.isArray(a.placed)||a.placed.length>3||!unique(a.placed)||!a.placed.every(x=>slots.includes(x)))throw bad('Invalid shield selection');
  const stops=a.placed.find(x=>['B','C','D'].includes(x))||null;
  // Stop position depends on topology and cannot be trusted from the browser; we persist a client-reported position separately.
  if(a.stoppedAt!==undefined&&a.stoppedAt!==null&&!slots.includes(a.stoppedAt))throw bad('Invalid stoppedAt');
  for(const k of slots)add('shield_'+k,a.placed.includes(k),null,null,'Boolean');
  outcome='Not Scored';
 }else if(slide==='s11'){
  if(!isObj(a.answers))throw bad('Missing answers');
  correct=0;total=9;
  for(let i=0;i<3;i++){
   const v=a.answers['v'+(i+1)];if(!isObj(v))throw bad('Missing system answers');
   for(const k of ['type','step','auth']){
    const allowed=k==='type'?['1 вызов LLM','Workflow','Агент']:k==='step'?['Код','Модель']:['Модель','Инфраструктура'];
    if(!allowed.includes(v[k]))throw bad('Invalid classification');
    const ok=v[k]===EXPECTED11[i][k];correct+=Number(ok);add('v'+(i+1)+'.'+k,v[k],EXPECTED11[i][k],ok);
   }
  }
  outcome=correct===9?'Passed':correct===0?'Failed':'Partial';mistakes=total-correct;
 }else if(slide==='s29'&&unit!=='back'){
  if(!Array.isArray(a.selectedIndexes)||!unique(a.selectedIndexes)||!a.selectedIndexes.every(x=>Number.isInteger(x)&&x>=0&&x<4))throw bad('Invalid selections');
  correct=0;total=4;const truth=EXPECTED29[unit];
  truth.forEach((x,i)=>{const answer=a.selectedIndexes.includes(i),ok=x===answer;correct+=Number(ok);add(unit+'.'+i,answer,x,ok,'Boolean');});
  mistakes=4-correct;outcome=correct===4?'Passed':correct===0?'Failed':'Partial';
 }else if(slide==='s29'&&unit==='back'){
  if(!['A','B','C','D','L'].includes(a.now))throw bad('Invalid new choice');
  if(a.beforeSingle!==undefined&&a.beforeSingle!==null&&!['A','B','C','D'].includes(a.beforeSingle))throw bad('Invalid previous choice');
  if(a.beforePlaced!==undefined&&a.beforePlaced!==null&&(!Array.isArray(a.beforePlaced)||!a.beforePlaced.every(x=>slots.includes(x))))throw bad('Invalid previous shields');
  add('before',a.beforeSingle||'from_slide06',null,null);add('now',a.now,null,null);
 }else if(slide==='s38'){
  const c=a.firstControlIndex,t=a.firstTestIndex;
  if(!Number.isInteger(c)||c<0||c>3||!Number.isInteger(t)||t<0||t>3)throw bad('Invalid indices');
  const expected=EXPECTED38[unit];correct=Number(c===expected.control)+Number(t===expected.test);total=2;mistakes=2-correct;
  add('control',c,expected.control,c===expected.control);add('test',t,expected.test,t===expected.test);
  outcome=correct===2?'Passed':correct===0?'Failed':'Partial';
 }
 return {items,correct,total,outcome,mistakes};
}
function cors(origin,env){const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim());return origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}:{};}
function reply(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});}
async function authParticipant(req,env,body){
 // Non-secret IDs identify browser installations; API does not claim identity verification.
 if(!validId(body.participantId))throw bad('Invalid participantId');
 if(body.sessionId!==env.PUBLIC_SESSION_ID)throw bad('Unknown sessionId',403);
 return body.sessionId+':'+body.participantId;
}
async function submit(request,env){
 if(Number(request.headers.get('content-length')||0)>12000)throw bad('Payload too large',413);
 let b;try{b=await request.json();}catch{throw bad('Invalid JSON');}
 if(!isObj(b)||!validId(b.slideId)||!validId(b.unitId)||!ALLOWED[b.slideId]?.includes(b.unitId)||!validId(b.submissionId))throw bad('Invalid submission metadata');
 const pk=await authParticipant(request,env,b),key=pk+':'+b.slideId+':'+b.unitId;
 const computed=validate(b.slideId,b.unitId,b.answer);
 const existing=await env.DB.prepare('SELECT response_key,submitted_at FROM responses WHERE response_key=?').bind(key).first();
 if(existing)return {accepted:true,duplicate:true,responseKey:key,submittedAt:existing.submitted_at};
 const now=new Date().toISOString();
 // D1 batch executes transactionally; a unique response_key makes races idempotent.
 try{
  const queries=[
   env.DB.prepare('INSERT OR IGNORE INTO sessions(session_id,name) VALUES(?,?)').bind(b.sessionId,b.sessionId),
   env.DB.prepare('INSERT OR IGNORE INTO participants(participant_key,participant_id,session_id,joined_at,last_activity_at) VALUES(?,?,?,?,?)').bind(pk,b.participantId,b.sessionId,now,now),
   env.DB.prepare('INSERT INTO responses(response_key,participant_key,session_id,slide_id,unit_id,answer_json,correct_count,total_count,outcome,mistakes,submission_id,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(key,pk,b.sessionId,b.slideId,b.unitId,JSON.stringify(b.answer),computed.correct,computed.total,computed.outcome,computed.mistakes,b.submissionId,now),
   ...computed.items.map((x,i)=>env.DB.prepare('INSERT INTO response_items(item_key,response_key,question_id,answer,correct_answer,is_correct,option_counted,item_type) VALUES(?,?,?,?,?,?,?,?)').bind(key+':'+i,key,x.question_id,x.answer,x.correct_answer,x.is_correct,x.option_counted,x.item_type))
  ];
  await env.DB.batch(queries);
 }catch(e){
  if(/UNIQUE constraint failed/i.test(String(e)))return {accepted:true,duplicate:true,responseKey:key};
  throw e;
 }
 return {accepted:true,duplicate:false,responseKey:key,submittedAt:now};
}
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
async function syncTable(env,table,rows,fieldMapper,keyField){
 const token=env.AIRTABLE_TOKEN,base=env.AIRTABLE_BASE_ID;if(!token||!base||!rows.length)return;
 // One batch per table per cron tick. Airtable allows up to ten records per create request.
 const data=rows.map(x=>({fields:fieldMapper(x)}));
 const resp=await fetch('https://api.airtable.com/v0/'+encodeURIComponent(base)+'/'+encodeURIComponent(table),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({records:data,typecast:false,performUpsert:{fieldsToMergeOn:[keyField]}})});
 if(!resp.ok)throw Error('Airtable '+table+' '+resp.status+' '+(await resp.text()).slice(0,200));
 const result=await resp.json();return result.records.map(x=>x.id);
}
async function synchronize(env){
 if(!env.AIRTABLE_TOKEN||!env.AIRTABLE_BASE_ID)return;
 // Keep a conservative 4 API requests / minute, ordered by parent foreign-key dependencies.
 const session=(await env.DB.prepare('SELECT * FROM sessions WHERE airtable_id IS NULL LIMIT 10').all()).results;
 if(session.length){const ids=await syncTable(env,'Sessions',session,x=>({'Session ID':x.session_id,'Session Name':x.name,'Started At':x.started_at,'Status':x.status}),'Session ID');await env.DB.batch(session.map((x,i)=>env.DB.prepare('UPDATE sessions SET airtable_id=? WHERE session_id=?').bind(ids[i],x.session_id)));}
 const people=(await env.DB.prepare('SELECT p.*,s.airtable_id AS session_airtable_id FROM participants p JOIN sessions s ON s.session_id=p.session_id WHERE p.airtable_id IS NULL AND s.airtable_id IS NOT NULL LIMIT 10').all()).results;
 if(people.length){const ids=await syncTable(env,'Participants',people,x=>({'Participant Key':x.participant_key,'Participant ID':x.participant_id,'Session':[x.session_airtable_id],'Joined At':x.joined_at,'Last Activity At':x.last_activity_at}),'Participant Key');await env.DB.batch(people.map((x,i)=>env.DB.prepare('UPDATE participants SET airtable_id=? WHERE participant_key=?').bind(ids[i],x.participant_key)));}
 const responses=(await env.DB.prepare('SELECT r.*,p.airtable_id AS participant_airtable_id,s.airtable_id AS session_airtable_id FROM responses r JOIN participants p ON p.participant_key=r.participant_key JOIN sessions s ON s.session_id=r.session_id WHERE r.airtable_id IS NULL AND p.airtable_id IS NOT NULL AND s.airtable_id IS NOT NULL LIMIT 10').all()).results;
 if(responses.length){const ids=await syncTable(env,'First Responses',responses,x=>({'Response Key':x.response_key,'Participant':[x.participant_airtable_id],'Session':[x.session_airtable_id],'Slide ID':x.slide_id,'Unit ID':x.unit_id,'Answer JSON':x.answer_json,'Correct Count':x.correct_count,'Total Count':x.total_count,'Outcome':x.outcome,'Mistakes':x.mistakes,'Submitted At':x.submitted_at,'Submission ID':x.submission_id,'Schema Version':x.schema_version}),'Response Key');await env.DB.batch(responses.map((x,i)=>env.DB.prepare('UPDATE responses SET airtable_id=? WHERE response_key=?').bind(ids[i],x.response_key)));}
 const items=(await env.DB.prepare('SELECT i.*,r.airtable_id AS response_airtable_id FROM response_items i JOIN responses r ON r.response_key=i.response_key WHERE i.airtable_id IS NULL AND r.airtable_id IS NOT NULL LIMIT 10').all()).results;
 if(items.length){const ids=await syncTable(env,'Response Items',items,x=>({'Item Key':x.item_key,'Response':[x.response_airtable_id],'Question ID':x.question_id,'Answer':x.answer,'Correct Answer':x.correct_answer||'','Is Correct':!!x.is_correct,'Option Counted':x.option_counted,'Item Type':x.item_type}),'Item Key');await env.DB.batch(items.map((x,i)=>env.DB.prepare('UPDATE response_items SET airtable_id=? WHERE item_key=?').bind(ids[i],x.item_key)));}
}
export default {
 async fetch(request,env){const origin=request.headers.get('Origin'),headers=cors(origin,env),url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
   if(url.pathname==='/api/health'&&request.method==='GET')return reply({ok:true,storage:'D1',sessionId:env.PUBLIC_SESSION_ID},200,headers);
   if(url.pathname==='/api/answers'&&request.method==='POST'){
    if(!origin||!headers['Access-Control-Allow-Origin'])throw bad('Origin not allowed',403);
    return reply(await submit(request,env),200,headers);
   }
   if(url.pathname==='/api/results'&&request.method==='GET')return reply(await stats(env,url),200,headers);
   return reply({error:'Not found'},404,headers);
  }catch(e){console.error(e);return reply({error:e.status?e.message:'Server error'},e.status||500,headers);}
 },
 async scheduled(_controller,env,ctx){ctx.waitUntil(synchronize(env).catch(e=>console.error('Airtable synchronization failed',e)));}
};
