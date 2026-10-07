/* Browser-local maintenance demo. */
(() => {
  const $ = id => document.getElementById(id), key = 'daong-maintenance-cleaned-v1';
  const fleet = [
    {id:'DAONG-01',plate:'CHU-6767',odometer:42380,oilAt:45000,cleaning:true,lastTrip:'Pampanga Flood Relief'},
    {id:'DAONG-02',plate:'DAN-1254',odometer:31840,oilAt:35000,cleaning:false,lastTrip:'Central Luzon Food Drive'},
    {id:'DAONG-03',plate:'NCR-4088',odometer:60120,oilAt:60000,cleaning:false,lastTrip:'Bulacan Emergency Supplies'},
    {id:'DAONG-04',plate:'SEF-123',odometer:18450,oilAt:20000,cleaning:true,lastTrip:'Marikina Hygiene Kit Drive'}
  ];
  let cleaned=[];
  try { const saved=JSON.parse(localStorage.getItem(key));if(Array.isArray(saved))cleaned=saved.filter(id=>fleet.some(v=>v.id===id)); } catch (_) {}
  const state=v=>v.odometer>=v.oilAt?'service':v.cleaning&&!cleaned.includes(v.id)?'cleaning':'ready';
  const label=s=>({ready:'Ready',cleaning:'Needs cleaning',service:'Service due'})[s];
  function route(){const vehicles=location.hash==='#vehicles';$('maintenance-panel').hidden=vehicles;$('maintenance-vehicles').hidden=!vehicles;document.querySelectorAll('[data-maintenance-view]').forEach(link=>{if(link.dataset.maintenanceView===(vehicles?'vehicles':'panel'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}
  function render(){
    $('maintenance-summary').innerHTML=['ready','cleaning','service'].map(s=>`<article><span>${label(s)}</span><strong>${fleet.filter(v=>state(v)===s).length}</strong></article>`).join('');
    const query=$('maintenance-search').value.trim().toLowerCase(),filter=$('maintenance-status').value;
    const rows=fleet.filter(v=>`${v.id} ${v.plate}`.toLowerCase().includes(query)&&(filter==='all'||state(v)===filter));
    $('maintenance-fleet').innerHTML=rows.length?rows.map(v=>`<article class="maintenance-vehicle"><div class="maintenance-vehicle-head"><h2>${v.id}<span>${v.plate}</span></h2><span class="readiness-badge ${state(v)}">${label(state(v))}</span></div><div class="maintenance-readings"><div><span>Latest odometer</span><strong>${v.odometer.toLocaleString()} km</strong></div><div><span>Oil change</span><strong>${v.odometer>=v.oilAt?'Overdue by '+(v.odometer-v.oilAt).toLocaleString():(v.oilAt-v.odometer).toLocaleString()+' km remaining'}${v.odometer>=v.oilAt?' km':''}</strong></div><div><span>Last relief operation</span><strong>${v.lastTrip}</strong></div></div>${v.cleaning&&!cleaned.includes(v.id)?`<button class="button primary" type="button" data-clean="${v.id}">Mark cleaning complete</button>`:'<span class="subtle">'+(state(v)==='service'?'Oil change required before returning to service.':'Cleaning complete · Ready for dispatch.')+'</span>'}</article>`).join(''):'<div class="surface maintenance-empty">No vehicles match these filters.</div>';
  }
  $('maintenance-search').addEventListener('input',render);$('maintenance-status').addEventListener('change',render);
  $('maintenance-fleet').addEventListener('click',e=>{const b=e.target.closest('[data-clean]');if(!b)return;const v=fleet.find(v=>v.id===b.dataset.clean);if(!v)return;if(!cleaned.includes(v.id))cleaned.push(v.id);let message=`${v.id}: cleaning marked complete.`;try{localStorage.setItem(key,JSON.stringify(cleaned));}catch(_){message+=' Browser storage is unavailable; this update lasts until reload.';}render();$('maintenance-message').textContent=message;$('maintenance-search').focus();});
  window.addEventListener('hashchange',route);route();render();
})();
