/* DAONG Live Tracking — Google Maps demo GPS feed, ready for later ESP32/API replacement. */
(() => {
  const trackers = [
    { id:'ESP-001', vehicle:'DAONG-01', plate:'CHU-6767', drive:'Pampanga Flood Relief', status:'in_transit', online:true, lat:15.1392, lng:120.5856, speed:42.3, updated:'10 sec ago', destination:'San Fernando, Pampanga', donations:24 },
    { id:'ESP-002', vehicle:'DAONG-02', plate:'DAN-1254', drive:'Central Luzon Food Drive', status:'at_site', online:true, lat:15.0346, lng:120.6840, speed:0, updated:'18 sec ago', destination:'San Fernando Evacuation Center', donations:31 },
    { id:'ESP-003', vehicle:'DAONG-03', plate:'NCR-4088', drive:'Bulacan Emergency Supplies', status:'returning', online:true, lat:14.9530, lng:120.9000, speed:36.8, updated:'27 sec ago', destination:'DAONG Logistics Hub', donations:17 },
    { id:'ESP-004', vehicle:'DAONG-04', plate:'SEF-123', drive:'Marikina Hygiene Kit Drive', status:'offline', online:false, lat:14.6507, lng:121.1029, speed:0, updated:'1 hr 12 min ago', destination:'Marikina City', donations:12 }
  ];

  let map, routeLine, selectedId = null;
  const markers = new Map();
  const label = s => ({in_transit:'In Transit',at_site:'At Site',returning:'Returning',offline:'Offline'})[s] || s;
  const safe = s => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function markerColor(t){
    if(!t.online || t.status==='offline') return '#7c8495';
    if(t.status==='at_site') return '#3B8FA6';
    if(t.status==='returning') return '#2F9E5B';
    return '#D9A441';
  }

  function makeMarkerIcon(t){
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: markerColor(t), fillOpacity: 1,
      strokeColor: '#ffffff', strokeWeight: 3,
      scale: 9
    };
  }

  window.initDaongGoogleMap = function(){
    const mapEl = document.getElementById('tracking-map');
    if(!mapEl || !window.google?.maps) return;
    document.getElementById('map-key-notice')?.remove();

    map = new google.maps.Map(mapEl, {
      center:{lat:14.98,lng:120.72}, zoom:9,
      mapTypeControl:false, streetViewControl:false, fullscreenControl:true,
      clickableIcons:false, gestureHandling:'greedy'
    });

    trackers.forEach(t => {
      const info = new google.maps.InfoWindow({content:`<div class="gm-daong-popup"><strong>${safe(t.vehicle)} · ${safe(t.plate)}</strong><br>${safe(t.drive)}<br><small>${label(t.status)} · ${t.speed.toFixed(1)} km/h</small></div>`});
      const marker = new google.maps.Marker({position:{lat:t.lat,lng:t.lng},map,title:`${t.vehicle} · ${t.plate}`,icon:makeMarkerIcon(t)});
      marker.addListener('click',()=>{ selectTracker(t.id,false); info.open({anchor:marker,map}); });
      markers.set(t.id,{marker,info});
    });

    routeLine = new google.maps.Polyline({
      path:[{lat:15.1392,lng:120.5856},{lat:15.1054,lng:120.6198},{lat:15.0695,lng:120.6550},{lat:15.0346,lng:120.6840}],
      geodesic:true, strokeColor:'#D9A441', strokeOpacity:.78, strokeWeight:4, map
    });
    fitAll();
  };

  function renderList(){
    const list=document.getElementById('tracker-list'), search=document.getElementById('tracker-search');
    const statusFilter=document.getElementById('status-filter'), signalFilter=document.getElementById('signal-filter');
    if(!list) return;
    const q=search.value.trim().toLowerCase(), sf=statusFilter.value, sig=signalFilter.value;
    const visible=trackers.filter(t=>{
      const hay=`${t.id} ${t.vehicle} ${t.plate} ${t.drive}`.toLowerCase();
      return (!q||hay.includes(q)) && (sf==='all'||t.status===sf) && (sig==='all'||(sig==='online'?t.online:!t.online));
    });
    list.innerHTML=visible.length?visible.map(t=>`
      <article class="tracker-card ${selectedId===t.id?'active':''}" data-tracker="${t.id}" tabindex="0">
        <div class="tracker-card-head"><div class="tracker-id"><i class="signal-dot ${t.online?'':'offline'}"></i><h3>${safe(t.plate)}</h3></div><span class="status-badge ${t.status}">${label(t.status)}</span></div>
        <div class="tracker-meta">${safe(t.id)} · ${safe(t.vehicle)}</div>
        <div class="tracker-drive">${safe(t.drive)}</div>
        <div class="tracker-stats"><div><span>Speed</span><strong>${t.speed.toFixed(1)} km/h</strong></div><div><span>Last update</span><strong>${safe(t.updated)}</strong></div><div><span>Coordinates</span><strong>${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}</strong></div><div><span>Linked IDs</span><strong>${t.donations} donations</strong></div></div>
      </article>`).join(''):'<div class="empty-trackers">No trackers match these filters.</div>';
    list.querySelectorAll('.tracker-card').forEach(card=>{
      card.addEventListener('click',()=>selectTracker(card.dataset.tracker,true));
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectTracker(card.dataset.tracker,true);}});
    });
  }

  function selectTracker(id,focusMap=true){
    const t=trackers.find(x=>x.id===id); if(!t) return;
    selectedId=id;
    const selected=document.getElementById('selected-operation');
    selected.hidden=false;
    selected.innerHTML=`<span class="so-label">Selected Relief Operation</span><strong>${safe(t.drive)}</strong><p>${safe(t.vehicle)} · ${safe(t.plate)} → ${safe(t.destination)} · ${t.donations} linked Donation IDs</p>`;
    renderList();
    if(map && focusMap){map.panTo({lat:t.lat,lng:t.lng});map.setZoom(13);}
    if(map && markers.has(id)){const {marker,info}=markers.get(id);info.open({anchor:marker,map});}
  }

  function fitAll(){
    if(!map || !markers.size) return;
    const bounds=new google.maps.LatLngBounds();
    markers.forEach(({marker})=>bounds.extend(marker.getPosition()));
    map.fitBounds(bounds,70);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const search=document.getElementById('tracker-search'), statusFilter=document.getElementById('status-filter'), signalFilter=document.getElementById('signal-filter');
    document.getElementById('fit-all')?.addEventListener('click',fitAll);
    [search,statusFilter,signalFilter].forEach(el=>el?.addEventListener(el===search?'input':'change',renderList));
    document.getElementById('online-count').textContent=`${trackers.filter(t=>t.online).length} of ${trackers.length}`;
    renderList();

    // Load Google Maps using the key configured in google-maps-config.js.
    const key=window.DAONG_GOOGLE_MAPS_API_KEY;
    if(!key || key==='PASTE_YOUR_GOOGLE_MAPS_API_KEY_HERE'){
      document.getElementById('tracking-map').insertAdjacentHTML('beforeend','<div id="map-key-notice" class="map-key-notice"><strong>Google Maps API key needed</strong><span>Open <code>js/google-maps-config.js</code> and paste your Maps JavaScript API key.</span></div>');
      return;
    }
    const script=document.createElement('script');
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initDaongGoogleMap&v=weekly`;
    script.async=true; script.defer=true; document.head.appendChild(script);

    setInterval(()=>{
      const t=trackers[0]; if(!t.online) return;
      t.lat+=0.00025;t.lng+=0.00018;t.updated='just now';
      if(markers.has(t.id)) markers.get(t.id).marker.setPosition({lat:t.lat,lng:t.lng});
      if(selectedId===t.id) selectTracker(t.id,false); else renderList();
    },5000);
  });
})();
