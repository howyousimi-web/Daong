/* Dispatcher calendar with illustrative relief trips, displayed in Manila time. */
(() => {
  const $=id=>document.getElementById(id);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=t=>parts.find(p=>p.type===t).value;
  const today=`${part('year')}-${part('month')}-${part('day')}`;
  let year=Number(part('year')),month=Number(part('month'))-1,selected=today;
  const trips=[
    {date:'2026-10-05',time:'08:00',title:'Pampanga Flood Relief',destination:'San Fernando, Pampanga',driver:'M. Santos',vehicle:'DAONG-01',plate:'CHU-6767',status:'completed'},
    {date:'2026-10-06',time:'09:30',title:'Central Luzon Food Drive',destination:'San Fernando Evacuation Center',driver:'J. Reyes',vehicle:'DAONG-02',plate:'DAN-1254',status:'completed'},
    {date:'2026-10-07',time:'07:30',title:'Bulacan Emergency Supplies',destination:'Malolos, Bulacan',driver:'A. Cruz',vehicle:'DAONG-03',plate:'NCR-4088',status:'active'},
    {date:'2026-10-07',time:'13:00',title:'Marikina Hygiene Kit Drive',destination:'Marikina City',driver:'L. Garcia',vehicle:'DAONG-04',plate:'SEF-123',status:'scheduled'},
    {date:'2026-10-09',time:'08:30',title:'Pampanga Relief Follow-up',destination:'San Fernando, Pampanga',driver:'M. Santos',vehicle:'DAONG-01',plate:'CHU-6767',status:'scheduled'},
    {date:'2026-10-12',time:'06:00',title:'Bulacan Food Distribution',destination:'Malolos, Bulacan',driver:'J. Reyes',vehicle:'DAONG-02',plate:'DAN-1254',status:'scheduled'},
    {date:'2026-11-02',time:'08:00',title:'Community Supply Run',destination:'Marikina City',driver:'L. Garcia',vehicle:'DAONG-04',plate:'SEF-123',status:'scheduled'},
    {date:'2026-09-28',time:'09:00',title:'Relief Supply Transfer',destination:'DAONG Logistics Hub',driver:'A. Cruz',vehicle:'DAONG-03',plate:'NCR-4088',status:'completed'}
  ];
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=s=>({completed:'Completed',active:'In progress',scheduled:'Scheduled'})[s];
  const iso=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dayLabel=date=>new Date(date+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const visible=()=>{const q=$('trip-search').value.trim().toLowerCase(),status=$('trip-status').value;return trips.filter(t=>(status==='all'||t.status===status)&&`${t.title} ${t.driver} ${t.vehicle} ${t.plate} ${t.destination}`.toLowerCase().includes(q));};
  function route(){const calendar=location.hash==='#calendar';$('dispatcher-panel').hidden=calendar;$('dispatcher-calendar').hidden=!calendar;document.querySelectorAll('[data-dispatcher-view]').forEach(a=>{if(a.dataset.dispatcherView===(calendar?'calendar':'panel'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  function render(){
    const rows=visible(),first=new Date(Date.UTC(year,month,1)),days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    $('calendar-month').textContent=first.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'});
    let cells=Array(first.getUTCDay()).fill('<div class="calendar-blank" aria-hidden="true"></div>');
    for(let day=1;day<=days;day++){const date=iso(year,month,day),daily=rows.filter(t=>t.date===date).sort((a,b)=>a.time.localeCompare(b.time));cells.push(`<button class="calendar-day" type="button" data-date="${date}" aria-pressed="${date===selected}" ${date===today?'aria-current="date"':''} aria-label="${safe(dayLabel(date))}, ${daily.length} trip(s)"><strong>${day}</strong>${daily.slice(0,2).map(t=>`<span class="calendar-event ${t.status}">${safe(t.time+' '+t.title)}</span>`).join('')}${daily.length>2?`<span class="calendar-event">+${daily.length-2} more</span>`:''}</button>`);}
    while(cells.length%7)cells.push('<div class="calendar-blank" aria-hidden="true"></div>');$('calendar-days').innerHTML=cells.join('');
    const prefix=iso(year,month,1).slice(0,7),count=rows.filter(t=>t.date.startsWith(prefix)).length;$('calendar-count').textContent=`${count} trip(s) match the filters in ${$('calendar-month').textContent}. Demo schedule · Times and statuses are illustrative.`;agenda(rows);
  }
  function agenda(rows){$('agenda-heading').textContent=dayLabel(selected);const daily=rows.filter(t=>t.date===selected).sort((a,b)=>a.time.localeCompare(b.time));$('trip-agenda').innerHTML=daily.length?daily.map(t=>`<article class="agenda-trip"><span class="agenda-time">${safe(t.time)} · Manila</span><h4>${safe(t.title)}</h4><p>${safe(t.destination)}</p><p>${safe(t.vehicle)} · ${safe(t.plate)}</p><p>Driver: ${safe(t.driver)}</p><span class="agenda-status ${t.status}">${label(t.status)}</span></article>`).join(''):'<p class="agenda-empty">No trips scheduled for this day with the current filters.</p>';}
  function move(offset){const d=new Date(Date.UTC(year,month+offset,1));year=d.getUTCFullYear();month=d.getUTCMonth();selected=iso(year,month,1);render();}
  $('calendar-prev').addEventListener('click',()=>move(-1));$('calendar-next').addEventListener('click',()=>move(1));$('calendar-today').addEventListener('click',()=>{year=Number(part('year'));month=Number(part('month'))-1;selected=today;render();});
  $('calendar-days').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(!b)return;selected=b.dataset.date;render();$('calendar-days').querySelector(`[data-date="${selected}"]`)?.focus();});
  $('trip-search').addEventListener('input',render);$('trip-status').addEventListener('change',render);window.addEventListener('hashchange',route);route();render();
})();
