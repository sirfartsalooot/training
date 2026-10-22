/* API connection for four training slides. Set the WORKER_URL below once. */
(function(){
'use strict';
const WORKER_URL='https://training-votes-api.skovaleva.workers.dev';
const SESSION_ID='training-001';
const STORE='training.api.v1.';
const configured=!WORKER_URL.includes('REPLACE-WITH');
const json=(k)=>{try{return JSON.parse(localStorage.getItem(STORE+k));}catch{return null;}};
const persist=(k,v)=>{try{localStorage.setItem(STORE+k,JSON.stringify(v));return true;}catch{return false;}};
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'p'+Date.now().toString(36)+Math.random().toString(36).slice(2);
let participant=json('participant');if(!participant){participant=uid();persist('participant',participant);}
const slides=['s06','s11','s29','s38'];
const badge=document.createElement('div');badge.id='training-api-status';badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');
badge.style.cssText='position:fixed;bottom:12px;left:12px;z-index:99999;max-width:290px;padding:7px 11px;background:rgba(22,24,29,.88);color:white;border-radius:8px;font:12px/1.35 Arial,sans-serif;pointer-events:none;box-shadow:0 2px 10px #0002';
function report(msg,kind){badge.textContent=msg;badge.style.background=kind==='bad'?'rgba(170,45,31,.92)':kind==='ok'?'rgba(20,113,69,.88)':'rgba(22,24,29,.88)';}
function mount(){if(!badge.isConnected)document.body.appendChild(badge);if(!configured)report('⚠ Укажите адрес Worker в training-api.js','bad');else report('Статистика: подключение готово');}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
let working=false;
async function flush(){
 if(working||!configured||!navigator.onLine)return;
 working=true;
 try{
  for(let i=0;i<80;i++){
   const queue=json('queue')||[];if(!queue.length)break;
   const payload=queue[0];
   try{
    const res=await fetch(WORKER_URL.replace(/\/$/,'')+'/api/answers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),mode:'cors'});
    let data;try{data=await res.json();}catch{throw Error('Неверный ответ API');}
    if(!res.ok||!data.accepted){
     // Do not discard the first answer in an error: it remains available for retry.
     report('⚠ Ответ ожидает отправки ('+(data.error||res.status)+')','bad');break;
    }
    persist('queue',(json('queue')||[]).filter(x=>x.submissionId!==payload.submissionId));
    report(data.duplicate?'Ответ уже учтён':'✓ Первый ответ сохранён','ok');
   }catch(e){report('⚠ Нет связи, ответ сохранён на устройстве','bad');break;}
  }
 }finally{working=false;}
}
function submit(slideId,unitId,answer){
 if(!slides.includes(slideId)||typeof unitId!=='string'||!answer)return false;
 const key=SESSION_ID+':'+slideId+':'+unitId;
 if(json('first.'+key))return false;
 const payload={sessionId:SESSION_ID,participantId:participant,slideId,unitId,submissionId:uid().replaceAll('-',''),answer};
 // Save the first attempt synchronously, *before* any network activity.
 if(!persist('first.'+key,payload)){
  report('⚠ Не удалось сохранить первый ответ на устройстве','bad');return false;
 }
 const q=json('queue')||[];q.push(payload);persist('queue',q);
 report('Отправляем первый ответ…');void flush();return true;
}
window.TrainingAPI={submit,flush,first:(slide,unit)=>json('first.'+SESSION_ID+':'+slide+':'+unit),get participantId(){return participant;}};
window.addEventListener('online',flush);
window.addEventListener('pageshow',flush);
setTimeout(flush,100);
})();
