/* Illustrative financial records; all money is stored in centavos. */
(() => {
  const $ = id => document.getElementById(id);
  const bookings = [
    {date:'2026-10-05',id:'BKG-2026-001',client:'Alice Vii',company:'',vehicle:'Van',plate:'CHU-6767',billed:800612,collected:500000,fuel:148072,driver:240000,allowance:272028,status:'Finished'},
    {date:'2026-10-06',id:'BKG-2026-002',client:'Alice Vii',company:'',vehicle:'SUV',plate:'DAN-1254',billed:610161,collected:349194,fuel:74372,driver:240000,allowance:201273,status:'On route'},
    {date:'2026-09-18',id:'BKG-2026-003',client:'Maria Santos',company:'Department of Education',vehicle:'Van',plate:'NCR-4088',billed:450000,collected:450000,fuel:60000,driver:180000,allowance:120000,status:'Finished'},
    {date:'2026-08-12',id:'BKG-2026-004',client:'DepEd',company:'DepEd Pampanga',vehicle:'Sedan',plate:'SEF-123',billed:320000,collected:220000,fuel:40000,driver:140000,allowance:90000,status:'Finished'},
    {date:'2026-10-04',id:'BKG-2026-005',client:'Cancelled demo',company:'',vehicle:'Van',plate:'CHU-6767',billed:150000,collected:0,fuel:0,driver:0,allowance:0,status:'Cancelled'}
  ];
  const ledger=[{date:'2026-10-05',type:'income',category:'Other income',amount:500000},{date:'2026-10-06',type:'expense',category:'Fuel',amount:50000},{date:'2026-09-18',type:'expense',category:'Supplies',amount:25000}];
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateParts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part=t=>dateParts.find(p=>p.type===t).value;
  const isoToday=`${part('year')}-${part('month')}-${part('day')}`;
  let terms=[], applied={from:`${part('year')}-01-01`,to:isoToday,terms:[]}, chart='income', showPlates=false;
  const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sum=(rows,field)=>rows.reduce((n,r)=>n+r[field],0);
  const cost=r=>r.fuel+r.driver+r.allowance;
  const visible=()=>bookings.filter(r=>r.status!=='Cancelled'&&r.date>=applied.from&&r.date<=applied.to&&(!applied.terms.length||applied.terms.some(t=>`${r.client} ${r.company}`.toLowerCase().includes(t.toLowerCase()))));
  const dateLabel=d=>new Date(d+'T00:00:00+08:00').toLocaleDateString('en-US',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'});
  function chips(){ $('financial-client-chips').innerHTML=terms.length?terms.map((t,i)=>`<button type="button" class="client-chip" data-term="${i}" aria-label="Remove ${safe(t)}">${safe(t)} ×</button>`).join(''):'<span class="subtle">No client filter · All clients</span>'; }
  function apply(){if(!$('financial-filter-form').reportValidity())return;if($('financial-from').value>$('financial-to').value){$('report-notice').textContent='From date must be on or before the to date.';return;}applied={from:$('financial-from').value,to:$('financial-to').value,terms:[...terms]};render();$('report-notice').textContent=`Report loaded · ${visible().length} booking(s).`;}
  function render(){
    const rows=visible(), collected=sum(rows,'collected'),billed=sum(rows,'billed');
    $('report-collected').textContent=money(collected);$('report-billed').textContent=`${money(billed)} billed · ${money(billed-collected)} outstanding`;
    $('report-client-label').textContent=applied.terms.join(', ')||'All clients';$('report-finished').textContent=rows.filter(r=>r.status==='Finished').length;$('report-bookings').textContent=`${rows.length} booking(s) in range`;
    document.querySelectorAll('.report-range').forEach(el=>el.textContent=`${dateLabel(applied.from)} → ${dateLabel(applied.to)} · ${applied.terms.join(', ')||'All clients'}`);
    const entries=ledger.filter(r=>r.date>=applied.from&&r.date<=applied.to),income=entries.filter(r=>r.type==='income'),expenses=entries.filter(r=>r.type==='expense');
    $('report-other').textContent=money(sum(income,'amount'));$('report-expenses').textContent=money(sum(expenses,'amount'));$('report-net').textContent=money(collected+sum(income,'amount')-sum(expenses,'amount'));
    $('report-other-count').textContent=`${income.length} entry/entries`;$('report-expense-count').textContent=`${expenses.length} entry/entries`;
    const cats={};expenses.forEach(r=>cats[r.category]=(cats[r.category]||0)+r.amount);const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];$('report-top-category').textContent=top?top[0]:'—';$('report-top-amount').textContent=top?`${money(top[1])} · ${(top[1]/sum(expenses,'amount')*100).toFixed(0)}% of expenses`:'No expenses in range';
    table(rows);draw(rows);
  }
  function table(rows){
    const headers=['Date','Booking ID','Vehicle',...(showPlates?['Plate']:[]),'Client','Company','Status','Profit','Fuel','Driver & vehicle','Allowance','Billed','Collected','Outstanding'];
    const t=$('financial-table');t.querySelector('thead').innerHTML='<tr>'+headers.map(h=>`<th scope="col">${h}</th>`).join('')+'</tr>';
    t.querySelector('tbody').innerHTML=rows.length?rows.map(r=>`<tr>${[r.date,r.id,r.vehicle,...(showPlates?[r.plate]:[]),r.client,r.company||'—',r.status].map(v=>`<td>${safe(v)}</td>`).join('')}<td class="money-positive">${money(r.billed-cost(r))}</td>${[r.fuel,r.driver,r.allowance].map(v=>`<td class="money-negative">−${money(v)}</td>`).join('')}<td>${money(r.billed)}</td><td class="money-positive">${money(r.collected)}</td><td>${money(r.billed-r.collected)}</td></tr>`).join(''):`<tr><td colspan="${headers.length}" class="financial-empty">No bookings match the applied filters.</td></tr>`;
    t.querySelector('tfoot').innerHTML=`<tr><th scope="row" colspan="${showPlates?8:7}">TOTALS · ${rows.length} booking(s)</th><td class="money-positive">${money(rows.reduce((n,r)=>n+r.billed-cost(r),0))}</td>${['fuel','driver','allowance'].map(f=>`<td class="money-negative">−${money(sum(rows,f))}</td>`).join('')}<td>${money(sum(rows,'billed'))}</td><td class="money-positive">${money(sum(rows,'collected'))}</td><td>${money(sum(rows,'billed')-sum(rows,'collected'))}</td></tr>`;
  }
  function draw(rows){
    const series=chart==='income'?[['Total billed','billed','var(--teal)']]:chart==='collected'?[['Collected','collected','var(--green)'],['Outstanding','outstanding','var(--gold)']]:[['Cost','cost','var(--red)'],['Profit','profit','var(--green)']];
    $('chart-title').textContent={income:'Income',collected:'Collected vs Outstanding',profit:'Cost vs Profit'}[chart];
    const days=[...new Set(rows.map(r=>r.date))].sort(),value=(day,key)=>rows.filter(r=>r.date===day).reduce((n,r)=>n+(key==='outstanding'?r.billed-r.collected:key==='cost'?cost(r):key==='profit'?r.billed-cost(r):r[key]),0);
    const peak=Math.max(100,...days.flatMap(day=>series.map(([,key])=>value(day,key))));const max=Math.ceil(peak/100000)*100000;
    let svg='<svg viewBox="0 0 800 300" aria-hidden="true">';
    for(let i=0;i<=4;i++){const y=240-i*50;svg+=`<line x1="85" y1="${y}" x2="780" y2="${y}" stroke="var(--line-strong)" stroke-dasharray="4 5"/><text x="75" y="${y+4}" text-anchor="end" fill="var(--ink-soft)" font-size="11">${safe(money(max*i/4))}</text>`;}
    const group=690/Math.max(days.length,1),bar=Math.min(48,group/(series.length+2));
    days.forEach((day,i)=>{series.forEach(([label,key,color],j)=>{const v=value(day,key),h=v/max*200,x=85+group*(i+.5)+(j-series.length/2)*bar;svg+=`<rect x="${x}" y="${240-h}" width="${bar-4}" height="${h}" rx="3" fill="${color}"><title>${safe(day+' · '+label+' '+money(v))}</title></rect>`;});svg+=`<text x="${85+group*(i+.5)}" y="265" text-anchor="middle" fill="var(--ink-soft)" font-size="11">${safe(day.slice(5))}</text>`;});svg+='</svg>';
    $('financial-chart').innerHTML=rows.length?svg:'<p class="financial-empty">No data for this date range and client filter.</p>';
    $('financial-chart').setAttribute('aria-label',`${$('chart-title').textContent}. ${days.map(day=>day+': '+series.map(([label,key])=>label+' '+money(value(day,key))).join(', ')).join('; ')||'No data.'}`);
    $('chart-legend').innerHTML=series.map(([label,,color])=>`<span><i style="background:${color}"></i>${label}</span>`).join('')+'<span>Grouped by day</span>';
  }
  $('financial-from').value=applied.from;$('financial-to').value=applied.to;
  $('financial-filter-form').addEventListener('submit',e=>{e.preventDefault();apply();});
  const addTerm=()=>{const input=$('financial-client'),term=input.value.trim();if(term&&!terms.some(t=>t.toLowerCase()===term.toLowerCase()))terms.push(term);input.value='';chips();};
  $('financial-add-client').addEventListener('click',addTerm);$('financial-client').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTerm();}});
  $('financial-clear-clients').addEventListener('click',()=>{terms=[];chips();});$('financial-client-chips').addEventListener('click',e=>{const b=e.target.closest('[data-term]');if(b){terms.splice(Number(b.dataset.term),1);chips();}});
  document.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{const year=Number(part('year')),month=Number(part('month'));let from,to=isoToday;if(b.dataset.range==='year')from=`${year}-01-01`;else if(b.dataset.range==='month')from=`${year}-${part('month')}-01`;else{const d=new Date(Date.UTC(year,month-2,1)),end=new Date(Date.UTC(year,month-1,0));from=d.toISOString().slice(0,10);to=end.toISOString().slice(0,10);}$('financial-from').value=from;$('financial-to').value=to;apply();}));
  document.querySelectorAll('[data-chart]').forEach(b=>b.addEventListener('click',()=>{chart=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));draw(visible());}));
  $('financial-plates').addEventListener('click',()=>{showPlates=!showPlates;$('financial-plates').setAttribute('aria-pressed',String(showPlates));$('financial-plates').textContent=showPlates?'Hide plate numbers':'Show plate numbers';table(visible());});
  $('financial-export').addEventListener('click',()=>{
    const cell=v=>'"'+String(v).replace(/^[=+@\-\t\r\n]/,"'$&").replaceAll('"','""')+'"';
    const rows=[['DAONG Financial Report (Demo)'],['From',applied.from,'To',applied.to],['Clients',applied.terms.join(' / ')||'All clients'],[],['Date','Booking ID','Vehicle',...(showPlates?['Plate']:[]),'Client','Company','Status','Profit PHP','Fuel PHP','Driver PHP','Allowance PHP','Billed PHP','Collected PHP','Outstanding PHP'],...visible().map(r=>[r.date,r.id,r.vehicle,...(showPlates?[r.plate]:[]),r.client,r.company,r.status,...[r.billed-cost(r),r.fuel,r.driver,r.allowance,r.billed,r.collected,r.billed-r.collected].map(n=>(n/100).toFixed(2))])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`daong-financial-${applied.from}-to-${applied.to}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('report-notice').textContent='Filtered financial records exported as Excel-compatible CSV.';
  });
  $('financial-print').addEventListener('click',()=>window.print());chips();render();
})();
