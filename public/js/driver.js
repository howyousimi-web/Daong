/* Driver bookings and personal schedule demo, in Manila time. */
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
  const driver='M. Santos', storageKey='daong-driver-journeys-v1';
  let updates={};
  try { const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved==='object'&&!Array.isArray(saved))updates=saved; } catch (_) {}
  trips.push({date:'2026-10-07',time:'08:00',title:'Pampanga Evacuation Supplies',destination:'San Fernando Evacuation Center',driver,vehicle:'DAONG-01',plate:'CHU-6767',status:'scheduled'});
  const ownTrips=trips.filter(t=>t.driver===driver);
  ownTrips.forEach(t=>{t.id=t.date+'-'+t.time;t.bookingId='BKG-'+t.date.replaceAll('-','')+'-'+t.time.replace(':','');if(['scheduled','active','completed'].includes(updates[t.id]))t.status=updates[t.id];});
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=s=>({approval:'For Approval',completed:'Finished',active:'On-Going',scheduled:'Scheduled'})[s];
  const iso=(y,m,d)=>`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dayLabel=date=>new Date(date+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const visible=()=>{const q=$('trip-search').value.trim().toLowerCase(),status=$('trip-status').value;return ownTrips.filter(t=>(status==='all'||t.status===status)&&`${t.title} ${t.driver} ${t.vehicle} ${t.plate} ${t.destination}`.toLowerCase().includes(q));};
  function route(){const view=['bookings','schedule'].includes(location.hash.slice(1))?location.hash.slice(1):'panel';['panel','bookings','schedule'].forEach(id=>$('driver-'+id).hidden=id!==view);document.querySelectorAll('[data-driver-view]').forEach(a=>{if(a.dataset.driverView===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  function bookings(){const q=$('booking-search').value.trim().toLowerCase(),filter=$('booking-status').value;const rows=ownTrips.filter(t=>(filter==='all'||t.status===filter)&&`${t.bookingId} ${t.title} ${t.destination} ${t.plate}`.toLowerCase().includes(q)).sort((a,b)=>($('booking-sort').value==='latest'?-1:1)*(a.date+a.time).localeCompare(b.date+b.time));
    $('driver-booking-list').innerHTML=rows.length?rows.map(t=>`<article class="surface driver-booking"><div class="driver-booking-head"><div><span class="eyebrow">${safe(t.date)} · ${safe(t.time)} Manila</span><h3>${safe(t.title)}</h3><span class="driver-booking-id">${safe(t.bookingId)}</span></div><span class="agenda-status ${t.status}">${label(t.status)}</span></div><div class="driver-trip-details"><p><span>Itinerary</span>DAONG Logistics Hub → ${safe(t.destination)}</p><p><span>Assigned vehicle</span>${safe(t.vehicle)} · ${safe(t.plate)}</p></div>${t.status==='completed'?'<p class="subtle">Journey completed.</p>':`<button type="button" class="button primary" data-journey="${safe(t.id)}">${t.status==='scheduled'?'Start journey':'Complete journey'}</button>`}</article>`).join(''):'<div class="driver-empty">'+(ownTrips.length?'No assigned trips match your filters.':'You currently have no assigned trips.')+'</div>';
  }
  function render(){
    const rows=visible(),first=new Date(Date.UTC(year,month,1)),days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
    $('calendar-month').textContent=first.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'});
    let cells=Array(first.getUTCDay()).fill('<div class="calendar-blank" aria-hidden="true"></div>');
    for(let day=1;day<=days;day++){const date=iso(year,month,day),daily=rows.filter(t=>t.date===date).sort((a,b)=>a.time.localeCompare(b.time));cells.push(`<button class="calendar-day" type="button" data-date="${date}" aria-pressed="${date===selected}" ${date===today?'aria-current="date"':''} aria-label="${safe(dayLabel(date))}, ${daily.length} trip(s)"><strong>${day}</strong>${daily.slice(0,2).map(t=>`<span class="calendar-event ${t.status}">${safe(t.time+' '+t.title)}</span>`).join('')}${daily.length>2?`<span class="calendar-event">+${daily.length-2} more</span>`:''}</button>`);}
    while(cells.length%7)cells.push('<div class="calendar-blank" aria-hidden="true"></div>');$('calendar-days').innerHTML=cells.join('');
    const prefix=iso(year,month,1).slice(0,7),count=rows.filter(t=>t.date.startsWith(prefix)).length;$('calendar-count').textContent=count ? `${count} assigned trip(s) in ${$('calendar-month').textContent}. Select a day to view the itinerary.` : 'You have no trips scheduled this month with the current filters. Use Prev and Next to look at other months.';agenda(rows);
  }
  function agenda(rows){$('agenda-heading').textContent=dayLabel(selected);const daily=rows.filter(t=>t.date===selected).sort((a,b)=>a.time.localeCompare(b.time));$('trip-agenda').innerHTML=daily.length?daily.map(t=>`<article class="agenda-trip"><span class="agenda-time">${safe(t.time)} · Manila</span><h4>${safe(t.title)}</h4><p>${safe(t.destination)}</p><p>${safe(t.vehicle)} · ${safe(t.plate)}</p><p>Driver: ${safe(t.driver)}</p><span class="agenda-status ${t.status}">${label(t.status)}</span></article>`).join(''):'<p class="agenda-empty">No trips scheduled for this day with the current filters.</p>';}
  function move(offset){$('driver-day-details').hidden=true;const d=new Date(Date.UTC(year,month+offset,1));year=d.getUTCFullYear();month=d.getUTCMonth();selected=iso(year,month,1);render();}
  $('calendar-prev').addEventListener('click',()=>move(-1));$('calendar-next').addEventListener('click',()=>move(1));$('calendar-today').addEventListener('click',()=>{year=Number(part('year'));month=Number(part('month'))-1;selected=today;render();});
  $('calendar-days').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(!b)return;selected=b.dataset.date;$('driver-day-details').hidden=false;render();$('calendar-days').querySelector(`[data-date="${selected}"]`)?.focus();});
  $('trip-search').addEventListener('input',render);$('trip-status').addEventListener('change',render);$('booking-search').addEventListener('input',bookings);$('booking-status').addEventListener('change',bookings);$('booking-sort').addEventListener('change',bookings);
  $('driver-booking-list').addEventListener('click',e=>{const button=e.target.closest('[data-journey]');if(!button)return;const trip=ownTrips.find(t=>t.id===button.dataset.journey);if(!trip||trip.status==='completed')return;trip.status=trip.status==='scheduled'?'active':'completed';updates[trip.id]=trip.status;let message=trip.title+': '+label(trip.status)+'.';try{localStorage.setItem(storageKey,JSON.stringify(updates));}catch(_){message+=' Storage unavailable; this update lasts until reload.';}bookings();render();$('driver-message').textContent=message;});
  window.addEventListener('hashchange',route);route();render();bookings();
})();
