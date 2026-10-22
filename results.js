(()=>{'use strict';
const API='https://training-votes-api.skovaleva.workers.dev';
const SESSION='training-001';
const slide=document.body.dataset.slide;
const q=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const num=n=>Number(n||0).toLocaleString('ru-RU');
const pct=(a,b)=>b?Math.round(a/b*100):0;
const unit=(d,k)=>d.units?.[k]||{participants:0,passed:0,partial:0,failed:0,correctSum:0,totalSum:0,options:{}};
const get=(u,k)=>Number(u.options?.[k]||0);
const tile=(v,l)=>`<article class="tile"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></article>`;
const bar=(name,n,d,cls='')=>`<div class="barline"><div>${esc(name)}</div><div class="track"><div class="fill ${cls}" style="width:${pct(n,d)}%"></div></div><div class="amt">${num(n)} · ${pct(n,d)}%</div></div>`;
const panel=(title,desc,body)=>`<section class="panel"><h2>${esc(title)}</h2><p class="desc">${esc(desc)}</p>${body}</section>`;
function draw06(d){const u=unit(d,'main'),n=u.participants;const shields=['A','B','C','D','E','F','G'];const stop=['B','C','D'].reduce((s,k)=>s+get(u,'attack:'+k),0);
 q('metrics').innerHTML=tile(num(n),'Участников')+tile(`${pct(stop,n)}%`,'Остановили атаку')+tile(num(shields.reduce((s,k)=>s+get(u,'shield:'+k),0)),'Всего выбранных щитов');
 q('content').innerHTML=panel('Где поставили контроль','Можно выбрать до трёх точек: сумма процентов может быть больше 100%.',`<div class="bars">${shields.map(k=>bar('Точка '+k,get(u,'shield:'+k),n)).join('')}</div>`)+panel('Где остановилась атака','Распределение по первому запуску симуляции.',`<div class="bars">${['B','C','D','none'].map(k=>bar(k==='none'?'Не остановлена':'Точка '+k,get(u,'attack:'+k),n,k==='none'?'gray':'green')).join('')}</div>`);
}
const questions11=[['v1.type','Тип · Ответ по документу','1 вызов LLM'],['v1.step','Выбор шага · Ответ по документу','Код'],['v1.auth','Разрешение · Ответ по документу','Инфраструктура'],['v2.type','Тип · Workflow','Workflow'],['v2.step','Выбор шага · Workflow','Код'],['v2.auth','Разрешение · Workflow','Инфраструктура'],['v3.type','Тип · Агент','Агент'],['v3.step','Выбор шага · Агент','Модель'],['v3.auth','Разрешение · Агент','Инфраструктура']];
function draw11(d){const u=unit(d,'main'),n=u.participants;q('metrics').innerHTML=tile(num(n),'Участников')+tile(`${pct(u.correctSum,u.totalSum)}%`,'Правильных ответов')+tile(`${pct(u.passed,n)}%`,'Все 9 с первой попытки');
 q('content').innerHTML=panel('Правильность по девяти вопросам','Доля правильных первых ответов для каждого признака.',`<div class="bars">${questions11.map(([key,title,answer])=>bar(title,get(u,key+':'+answer),n)).join('')}</div>`)+panel('Результаты первой проверки','Распределение участников по общей оценке.',`<div class="bars">${bar('9 из 9',u.passed,n,'green')}${bar('Часть верно',u.partial,n)}${bar('0 из 9',u.failed,n,'gray')}</div>`);
}
const controls=[['crm','Ограничение CRM'],['draft','Режим черновика'],['rcpt','Проверка получателя']];
function draw29(d){const us=controls.map(([k])=>unit(d,k)),back=unit(d,'back');const all=us.reduce((n,u)=>n+u.participants,0), correct=us.reduce((n,u)=>n+u.correctSum,0),total=us.reduce((n,u)=>n+u.totalSum,0);
 q('metrics').innerHTML=tile(num(d.totalResponses),'Всего первых ответов по заданиям')+tile(`${pct(correct,total)}%`,'Правильных отметок риска')+tile(num(back.participants),'Ответов о новом выборе');
 q('content').innerHTML=`<div class="grid">${controls.map(([id,name],i)=>{const u=us[i],n=u.participants;return panel(name,`${num(n)} участников выполнили это задание · ${pct(u.correctSum,u.totalSum)}% правильных отметок`, `<div class="bars">${[0,1,2,3].map(j=>bar('Вариант '+(j+1),get(u,'selected:'+j),n)).join('')}</div><p class="note">Показана частота выбора каждого пункта, а не его правильность. Доля правильных отметок указана выше.</p>`) }).join('')}${panel('Пересмотр решения','Первый новый выбор после обсуждения рисков.',`<div class="bars">${['A','B','C','D','L'].map(x=>bar(x==='L'?'Несколько слоёв':'Вариант '+x,get(back,'now:'+x),back.participants)).join('')}</div>`)}</div><p class="note">Число первых ответов по заданиям не равно числу уникальных людей. API возвращает число участников отдельно для каждого задания; точное число уникальных участников всего слайда без дополнительного API-поля недоступно.</p>`;
}
const scenarios=[['data_disclosure','Раскрытие данных',1,2],['status_change','Изменение статуса',3,0],['resource_exhaustion','Расход ресурсов',1,3]];
function draw38(d){const us=scenarios.map(([id])=>unit(d,id)),total=us.reduce((s,u)=>s+u.totalSum,0),correct=us.reduce((s,u)=>s+u.correctSum,0),all=us.reduce((s,u)=>s+u.participants,0);
 q('metrics').innerHTML=tile(num(all),'Завершённых сценариев')+tile(`${pct(correct,total)}%`,'Верных первых выборов')+tile(num(us.reduce((s,u)=>s+u.passed,0)),'Сценариев без ошибок');
 q('content').innerHTML=`<div class="grid">${scenarios.map(([id,name,c,t],i)=>{const u=us[i],n=u.participants;return panel(name,`${num(n)} участников · ${pct(u.correctSum,u.totalSum)}% правильных первых выборов`,`<div class="bars">${bar('Контроль — верно',get(u,'control:'+c),n,'green')}${bar('Тест — верно',get(u,'test:'+t),n,'green')}${bar('Оба верны',u.passed,n,'green')}</div>`)}).join('')}</div><p class="note">Один участник может пройти несколько сценариев. Показано количество выполненных сценариев, не уникальных людей.</p>`;
}
const draw={s06:draw06,s11:draw11,s29:draw29,s38:draw38};
let lastGood=null;async function refresh(){const st=q('connection');try{const res=await fetch(`${API}/api/results?sessionId=${encodeURIComponent(SESSION)}&slideId=${encodeURIComponent(slide)}`,{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const d=await res.json();if(d.slideId!==slide||d.sessionId!==SESSION||typeof d.totalResponses!=='number')throw Error('Неверный формат API');lastGood=d;draw[slide](d);st.className='status ok';st.innerHTML='<span class="dot"></span>Данные актуальны';q('stamp').textContent='Последнее обновление: '+new Date().toLocaleTimeString('ru-RU');}catch(err){st.className='status bad';st.innerHTML='<span class="dot"></span>Нет связи с API';q('stamp').textContent='Ошибка получения данных: '+err.message+(lastGood?' · показаны последние доступные данные':'');if(!lastGood){q('metrics').innerHTML=tile('—','Нет данных')+tile('—','Ожидание подключения')+tile('—','');q('content').innerHTML='<div class="empty">Не удалось получить статистику. Проверьте подключение к интернету и доступность Worker.</div>';}}}
refresh();setInterval(()=>{if(!document.hidden)refresh()},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
