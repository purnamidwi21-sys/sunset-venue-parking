(() => {
const URL='https://dsvdtqypumwjevgtoghr.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmR0cXlwdW13amV2Z3RvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzczNDUsImV4cCI6MjEwOTQ1MzM0NX0.VoCbLhxttbPPKtNqKaQPC-XQaHg9q48V5vyL0eDpZko';
const db=window.supabase.createClient(URL,KEY), STAFF=['Pak Manik','Pak Bayu','Pak Gangga','Pak Riki','Pak Dek Putra'];
let user=null,profile=null,staffRows=[],records=[],report=[],dashRows=[],payouts=[],paymentBusy=false,realtimeChannel=null,refreshTimer=null,staffChecksSig='';
// Nama petugas dicocokkan tanpa membedakan huruf besar-kecil, sapaan "Pak", dan ejaan Riki/Riky.
const NAME_ALIASES={riky:'riki'};
const nameKey=s=>{let k=String(s??'').toLowerCase().replace(/\s+/g,' ').trim().replace(/^(pak|bapak|bpk)\.?\s+/,'');return NAME_ALIASES[k]||k};
const staffIndex=name=>STAFF.findIndex(x=>nameKey(x)===nameKey(name));
const staffCompare=(a,b)=>{const ai=staffIndex(a),bi=staffIndex(b);if(ai>=0&&bi>=0)return ai-bi;if(ai>=0)return -1;if(bi>=0)return 1;return a.localeCompare(b,'id')};
const findStaffRow=name=>staffRows.find(x=>nameKey(x.full_name)===nameKey(name));
const splitNames=v=>String(v??'').split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
// Label checkbox memakai nama persis seperti di database bila ada.
const staffLabels=()=>STAFF.map(n=>findStaffRow(n)?.full_name||n);
const $=id=>document.getElementById(id), setText=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??'')}, money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const parseAmount=value=>{
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 let s=String(value??'').trim();
 if(!s)return 0;
 s=s.replace(/\s|Rp/gi,'').replace(/[^0-9,.-]/g,'');
 const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
 if(comma>=0&&dot>=0){
  if(comma>dot)s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(/,/g,'');
 }else if(comma>=0){
  const parts=s.split(',');
  s=parts.length>2?parts.join(''):parts[0]+'.'+parts.slice(1).join('');
 }else if(dot>=0){
  const parts=s.split('.');
  if(parts.length>2||parts.slice(1).every(p=>p.length===3))s=parts.join('');
 }
 const n=Number(s);
 return Number.isFinite(n)?n:0;
};
const today=()=>{let d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const admin=()=>profile?.role==='admin', esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calc=r=>{let n=Number(r.revenue)-Number(r.expenses),p=n*.5;return{net:n,sunset:n*.25,adat:n*.25,pool:p,each:r.staff.length?p/r.staff.length:0}};
function showLogin(s=''){$('loginScreen').style.display='grid';$('app').classList.add('hidden');setText('loginMessage',s)}
async function sessionStart(){
 const {data:{session},error}=await db.auth.getSession();if(error)throw error;
 if(!session){showLogin();return}
 user=session.user;
 const {data:p,error:pe}=await db.from('user_profiles').select('display_name,role').eq('id',user.id).single();
 if(pe)throw pe;profile=p;
 $('loginScreen').style.display='none';$('app').classList.remove('hidden');
 setText('userBadge',(p.display_name||user.email)+' · '+p.role.toUpperCase());
 $('importExcel').disabled=!admin();$('importExcel').title=admin()?'':'Khusus Admin';
 await loadData();draw();setupRealtime();
}
async function loadData(){
 const [s,d,j,e,p]=await Promise.all([
  db.from('staff').select('id,full_name,active'),
  db.from('daily_records').select('*').order('record_date'),
  db.from('staff_duty').select('*'),
  db.from('expense_items').select('*').order('created_at'),
  db.from('payout_payments').select('*').order('paid_at')
 ]);
 for(const x of [s,d,j,e,p])if(x.error)throw x.error;
 payouts=p.data||[];
 staffRows=s.data||[];
 const names=Object.fromEntries(staffRows.map(x=>[x.id,x.full_name])),duty={},costs={};
 (j.data||[]).forEach(x=>{(duty[x.daily_record_id]??=[]).push(names[x.staff_id])});
 (e.data||[]).forEach(x=>{(costs[x.daily_record_id]??=[]).push({id:x.id,category:x.category,amount:Number(x.amount),description:x.description||''})});
 records=(d.data||[]).map(x=>{
  let items=costs[x.id]||[],legacy=Number(x.total_expenses)||0;
  if(!items.length&&legacy>0)items=[{category:'Biaya lama (belum dirinci)',amount:legacy,description:'Total biaya dari data lama'}];
  const sum=items.reduce((s,z)=>s+z.amount,0);
  return{id:x.id,date:x.record_date,revenue:Number(x.total_revenue),expenses:items.length?sum:legacy,expenseItems:items,note:x.note||'',staff:(duty[x.id]||[]).filter(Boolean),source:x.source};
 });
 renderStaffChecks();
}
// Dibuat ulang hanya bila daftar nama berubah, dan centang yang sudah dipilih tetap dipertahankan
// (sebelumnya centang hilang setiap auto-refresh 30 detik).
function renderStaffChecks(){
 const labels=staffLabels(),sig=labels.join('|');
 if(sig===staffChecksSig&&$('st0'))return;
 const keep=new Set(chosen().map(nameKey));
 staffChecksSig=sig;
 $('staffChecks').innerHTML=labels.map((x,i)=>'<label class="stafftag"><input type="checkbox" id="st'+i+'">'+esc(x)+'</label>').join('')+'<label class="stafftag staff-all"><input type="checkbox" id="stAll">Semua Bertugas</label>';
 const all=$('stAll');
 labels.forEach((x,i)=>{const el=$('st'+i);if(el)el.checked=keep.has(nameKey(x))});
 if(all){all.checked=labels.every((n,k)=>$('st'+k)?.checked);all.onchange=()=>{labels.forEach((x,i)=>{const el=$('st'+i);if(el)el.checked=all.checked});preview()}}
 labels.forEach((x,i)=>{const el=$('st'+i);if(el)el.onchange=()=>{if(all)all.checked=labels.every((n,k)=>$('st'+k)?.checked);preview()}});
 if(keep.size)preview();
}
function chosen(){return staffLabels().filter((x,i)=>$('st'+i)?.checked)}
async function saveRecord(r,{reload=true}={}){
 const unknown=(r.staff||[]).filter(n=>!findStaffRow(n));
 if(unknown.length)throw new Error('Nama petugas tidak ada di database: '+unknown.join(', ')+'. Data tanggal '+r.date+' tidak disimpan.');
 const items=(r.expenseItems||[]).filter(x=>Number(x.amount)>0);
 const expenseTotal=items.reduce((s,x)=>s+Number(x.amount),0);
 const {data,error}=await db.from('daily_records').upsert({record_date:r.date,total_revenue:r.revenue,total_expenses:expenseTotal,note:r.note||'',source:r.source||'manual',created_by:user.id,updated_at:new Date().toISOString()},{onConflict:'record_date'}).select('id').single();
 if(error)throw error;
 const id=data.id;
 const {error:ce}=await db.from('expense_items').delete().eq('daily_record_id',id);if(ce)throw ce;
 if(items.length){const {error:ei}=await db.from('expense_items').insert(items.map(x=>({daily_record_id:id,category:x.category,amount:Number(x.amount),description:x.description||''})));if(ei)throw ei}
 const {error:de}=await db.from('staff_duty').delete().eq('daily_record_id',id);if(de)throw de;
 const ids=[...new Set((r.staff||[]).map(n=>findStaffRow(n)?.id).filter(Boolean))];
 if(ids.length){const {error:ie}=await db.from('staff_duty').insert(ids.map(staff_id=>({daily_record_id:id,staff_id})));if(ie)throw ie}
 if(reload)await loadData();
}
function total(a){return a.reduce((t,r)=>{let c=calc(r);t.rev+=r.revenue;t.exp+=r.expenses;t.net+=c.net;t.sun+=c.sunset;t.adat+=c.adat;t.pool+=c.pool;return t},{rev:0,exp:0,net:0,sun:0,adat:0,pool:0})}
function expenseCategoryTotals(rows){
 const totals={};
 rows.forEach(r=>(r.expenseItems||[]).forEach(x=>{totals[x.category]=(totals[x.category]||0)+Number(x.amount||0)}));
 const order=['Jajan','Kopi','Sewa DW'];
 return Object.entries(totals).map(([category,amount])=>({category,amount})).sort((a,b)=>{
  const ai=order.indexOf(a.category),bi=order.indexOf(b.category);
  if(ai!==-1||bi!==-1)return (ai<0?99:ai)-(bi<0?99:bi);
  return a.category.localeCompare(b.category,'id');
 });
}
function expenseItemsText(r){return (r.expenseItems||[]).map(x=>x.category+': '+money(x.amount)).join(', ')||'—'}
function settlementLines(rows){
 const lines=[];
 rows.forEach(r=>{
  const c=calc(r);
  const entitlements=[
   {type:'sunset',name:'Sunset Venue',amount:c.sunset},
   {type:'adat',name:'Banjar Adat',amount:c.adat},
   ...(r.staff||[]).map(name=>({type:'staff',name,amount:c.each}))
  ];
  entitlements.forEach(e=>{
   if(e.amount<=0)return;
   const paid=payouts.filter(p=>p.daily_record_id===r.id&&p.recipient_type===e.type&&p.recipient_name===e.name).reduce((s,p)=>s+Number(p.amount||0),0);
   lines.push({recordId:r.id,date:r.date,type:e.type,name:e.name,due:e.amount,paid,balance:e.amount-paid});
  });
 });
 return lines;
}
function settlementRows(rows){
 const map={};
 settlementLines(rows).forEach(line=>{
  const key=line.type+'|'+line.name;
  if(!map[key])map[key]={type:line.type,name:line.name,due:0,paid:0,balance:0,items:[]};
  map[key].due+=line.due;map[key].paid+=line.paid;map[key].balance+=line.balance;
  if(line.balance>0.009)map[key].items.push(line);
 });
 const order={'sunset':0,'adat':1,'staff':2};
 return Object.values(map).sort((a,b)=>(order[a.type]-order[b.type])||staffCompare(a.name,b.name));
}
function totalBalance(rows){return settlementLines(rows).reduce((s,x)=>s+Math.max(0,x.balance),0)}
async function payRecipient(type,name){
 if(!admin()){alert('Hanya Admin yang dapat mencatat pembayaran.');return}
 if(paymentBusy)return;
 const pending=settlementLines(dashRows).filter(x=>x.type===type&&x.name===name&&x.balance>0.009);
 if(!pending.length){alert('Tidak ada saldo yang perlu dibayarkan untuk penerima ini.');return}
 const amount=pending.reduce((s,x)=>s+x.balance,0),method='Tunai';
 if(!confirm('Konfirmasi pembayaran '+name+' sebesar '+money(amount)+' untuk periode dashboard yang dipilih? Catat hanya setelah uang benar-benar dibayarkan.'))return;
 paymentBusy=true;
 try{
  const rowsToInsert=pending.map(x=>({daily_record_id:x.recordId,recipient_type:x.type,recipient_name:x.name,amount:Number(x.balance.toFixed(2)),payment_method:method,paid_by:user.id}));
  const {error}=await db.from('payout_payments').insert(rowsToInsert);
  if(error)throw error;
  await loadData();draw();
 }catch(e){alert('Pembayaran gagal dicatat: '+e.message)}
 finally{paymentBusy=false}
}
async function payAllBalances(){
 if(!admin()){alert('Hanya Admin yang dapat mencatat pembayaran.');return}
 if(paymentBusy)return;
 const pending=settlementLines(dashRows).filter(x=>x.balance>0.009);
 if(!pending.length){alert('Semua saldo pada periode ini sudah lunas.');return}
 const amount=pending.reduce((s,x)=>s+x.balance,0),method='Tunai';
 if(!confirm('Catat pembayaran SELURUH sisa saldo untuk '+pending.length+' bagian penerima, total '+money(amount)+'? Pastikan seluruh uang sudah benar-benar dibayarkan.'))return;
 paymentBusy=true;
 try{
  const rowsToInsert=pending.map(x=>({daily_record_id:x.recordId,recipient_type:x.type,recipient_name:x.name,amount:Number(x.balance.toFixed(2)),payment_method:method,paid_by:user.id}));
  const {error}=await db.from('payout_payments').insert(rowsToInsert);
  if(error)throw error;
  await loadData();draw();
 }catch(e){alert('Pembayaran gagal dicatat: '+e.message)}
 finally{paymentBusy=false}
}
function staffEarnings(rows){
 const out={};
 rows.forEach(r=>{
  const c=calc(r);
  (r.staff||[]).forEach(name=>{
   const k=nameKey(name);
   if(!out[k])out[k]={name:name,days:0,amount:0};
   out[k].days++;
   out[k].amount+=c.each;
  });
 });
 return Object.values(out).sort((a,b)=>staffCompare(a.name,b.name));
}
function dashDateRange(){const p=$('dashPreset').value,dt=today();if(p==='all')return{from:'',to:''};if(p==='month'){const m=$('dashMonth').value||dt.slice(0,7),last=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate();return{from:m+'-01',to:m+'-'+String(last).padStart(2,'0')}}if(p==='year'){const y=$('dashYear').value||dt.slice(0,4);return{from:y+'-01-01',to:y+'-12-31'}}return{from:$('dashStart').value,to:$('dashEnd').value}}
function syncDashFilters(){const p=$('dashPreset').value;const custom=p==='custom';document.querySelectorAll('.dash-custom').forEach(x=>{x.classList.toggle('hidden',p==='all');const input=x.querySelector('input');if(input)input.disabled=!custom});$('dashMonth').parentElement.classList.toggle('hidden',p!=='month');$('dashYear').parentElement.classList.toggle('hidden',p!=='year');if(p==='month'||p==='year'){const r=dashDateRange();$('dashStart').value=r.from;$('dashEnd').value=r.to}}
function reportDateRange(){const p=$('reportPreset').value,dt=today();if(p==='all')return{from:'',to:''};if(p==='month'){const m=$('reportMonth').value||dt.slice(0,7),last=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate();return{from:m+'-01',to:m+'-'+String(last).padStart(2,'0')}}if(p==='year'){const y=$('reportYear').value||dt.slice(0,4);return{from:y+'-01-01',to:y+'-12-31'}}return{from:$('fromDate').value,to:$('toDate').value}}
function syncReportFilters(){const p=$('reportPreset').value;document.querySelectorAll('.report-custom').forEach(x=>{x.classList.toggle('hidden',p==='all');const input=x.querySelector('input');if(input)input.disabled=false});$('reportMonth').parentElement.classList.toggle('hidden',p!=='month');$('reportYear').parentElement.classList.toggle('hidden',p!=='year');if(p==='month'||p==='year'){const r=reportDateRange();$('fromDate').value=r.from;$('toDate').value=r.to}}
function setupRealtime(){if(realtimeChannel)db.removeChannel(realtimeChannel);realtimeChannel=db.channel('parking-data-live').on('postgres_changes',{event:'*',schema:'public',table:'daily_records'},async()=>{await loadData();draw()}).on('postgres_changes',{event:'*',schema:'public',table:'staff_duty'},async()=>{await loadData();draw()}).on('postgres_changes',{event:'*',schema:'public',table:'expense_items'},async()=>{await loadData();draw()}).on('postgres_changes',{event:'*',schema:'public',table:'payout_payments'},async()=>{await loadData();draw()}).subscribe();if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(async()=>{if(!user)return;try{await loadData();draw()}catch(e){console.warn('Auto refresh:',e.message)}},30000)}
function draw(){drawDash();drawHistory();if($('reports').classList.contains('active'))drawReport()}
function page(p){document.querySelectorAll('.section').forEach(x=>{const active=x.id===p;x.classList.toggle('active',active);x.style.display=active?'block':'none'});document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));const info=PAGE_INFO[p]||PAGE_INFO.dashboard;setText('pageTitle',info[0]);setText('pageSub',info[1]);window.scrollTo?.(0,0);if(p==='dashboard')drawDash();if(p==='reports')drawReport()}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));
window.payParkingRecipient=payRecipient;
function addExpenseRow(category='',amount='',description=''){
 const row=document.createElement('div');row.className='expense-row';
 row.innerHTML='<div><label>Item pengeluaran</label><input class="expense-kind" type="text" placeholder="Contoh: Jajan, Kopi, BBM"></div><div><label>Nominal (Rp)</label><input class="expense-value" type="number" min="0" step="1" placeholder="0"></div><div><label>Keterangan (opsional)</label><input class="expense-note" type="text" placeholder="Catatan"></div><button type="button" class="secondary remove-expense">Hapus</button>';
 $('expenseRows').appendChild(row);
 row.querySelector('.expense-kind').value=category||'';row.querySelector('.expense-value').value=amount;row.querySelector('.expense-note').value=description;preview();
}
function collectExpenseItems(){
 const items=[];
 for(const row of $('expenseRows').querySelectorAll('.expense-row')){
  const category=row.querySelector('.expense-kind').value.trim(),amount=Number(row.querySelector('.expense-value').value)||0;
  if(amount<=0)continue;
  if(!category)throw new Error('Isi nama item pengeluaran.');
  items.push({category,amount,description:row.querySelector('.expense-note').value.trim()});
 }
 return items;
}
function collectExpenseItemsSafe(){try{return collectExpenseItems()}catch(e){return []}}
// Enter sebagai pintasan utama di seluruh aplikasi
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing||e.shiftKey)return;
 const el=e.target;
 if(!el||el.tagName==='TEXTAREA'||el.tagName==='BUTTON'||el.tagName==='SELECT'||el.type==='file'||el.type==='checkbox'||el.type==='radio')return;
 if(el.closest('#loginForm')){e.preventDefault();$('loginForm').requestSubmit();return}
 if(el.closest('#dailyForm')){e.preventDefault();$('dailyForm').requestSubmit();return}
 if(el.closest('#reports')){e.preventDefault();drawReport()}
});
$('dailyForm').addEventListener('input',preview);
$('dailyForm').addEventListener('change',preview);
$('expenseRows').addEventListener('click',e=>{if(e.target.classList.contains('remove-expense')){e.target.closest('.expense-row').remove();preview()}});
$('addExpense').onclick=()=>addExpenseRow();
$('dailyForm').onsubmit=async e=>{
 e.preventDefault();let expenseItems;try{expenseItems=collectExpenseItems()}catch(err){alert(err.message);return}
 let r={date:$('date').value,revenue:Number($('revenue').value),expenses:expenseItems.reduce((s,x)=>s+x.amount,0),expenseItems,staff:chosen(),note:'',source:'manual'};
 if(!r.staff.length){alert('Pilih minimal satu petugas.');return}
 if(!r.date||r.revenue<0){alert('Periksa tanggal dan pendapatan.');return}
 if(records.some(x=>x.date===r.date)&&!confirm('Data tanggal ini sudah ada. Timpa seluruh data tanggal tersebut?'))return;
 try{await saveRecord(r);alert('Data harian berhasil disimpan.');$('dailyForm').reset();$('expenseRows').innerHTML='';addExpenseRow();$('date').value=today();preview();page('dashboard');draw()}catch(x){alert('Gagal menyimpan: '+x.message)}
};
$('resetForm').onclick=()=>{$('dailyForm').reset();$('expenseRows').innerHTML='';addExpenseRow();$('date').value=today();preview()};
window.delParkingRecord=async id=>{if(!admin()||!confirm('Hapus data ini?'))return;let {error}=await db.from('daily_records').delete().eq('id',id);if(error){alert(error.message);return}await loadData();draw()};
// ===== Laporan: satu sumber data untuk tampilan layar dan PDF =====
const num=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.round(Number(n)||0));
const rp=n=>(Number(n)<0?'-Rp':'Rp')+num(Math.abs(Number(n)||0));
const pct=n=>(Number.isFinite(n)?(n*100).toLocaleString('id-ID',{maximumFractionDigits:1}):'0')+'%';
const ymd=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d)};
const fmtDate=s=>s?new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(ymd(s)):'—';
const fmtDay=s=>new Intl.DateTimeFormat('id-ID',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(ymd(s));
const titleCase=s=>s.toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
function expenseCategorySummary(rows){
 const map={};
 rows.forEach(r=>(r.expenseItems||[]).forEach(x=>{
  const raw=String(x.category||'Lainnya').trim().replace(/\s+/g,' '),k=raw.toLowerCase();
  const g=map[k]??={variants:{},count:0,amount:0};
  g.variants[raw]=(g.variants[raw]||0)+1;g.count++;g.amount+=Number(x.amount||0);
 }));
 const total=Object.values(map).reduce((s,g)=>s+g.amount,0);
 return Object.values(map).map(g=>{
  const v=Object.entries(g.variants).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const name=v.find(x=>x!==x.toUpperCase())||titleCase(v[0]);
  return{name,count:g.count,amount:g.amount,share:total?g.amount/total:0};
 }).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'id'));
}
function periodKpis(rows,t){
 const days=rows.length;
 return[
  {label:'Total Pendapatan',value:rp(t.rev),note:days?'Rata-rata '+rp(t.rev/days)+' per hari':'Belum ada data'},
  {label:'Total Pengeluaran',value:rp(t.exp),note:pct(t.rev?t.exp/t.rev:0)+' dari pendapatan'},
  {label:'Pendapatan Bersih',value:rp(t.net),note:'Margin '+pct(t.rev?t.net/t.rev:0)},
  {label:'Hari Tercatat',value:days+' hari',note:days?fmtDate(rows[0].date)+' – '+fmtDate(rows[days-1].date):'—'}
 ];
}
function reportData(){
 const range=reportDateRange();
 const rows=records.filter(r=>(!range.from||r.date>=range.from)&&(!range.to||r.date<=range.to)).sort((a,b)=>a.date.localeCompare(b.date));
 const t=total(rows),days=rows.length;
 const from=range.from||rows[0]?.date||'',to=range.to||rows[days-1]?.date||'';
 return{
  rows,t,days,from,to,
  period:from||to?fmtDate(from)+' – '+fmtDate(to):'Semua data',
  kpis:periodKpis(rows,t),
  shares:[['Sunset Venue','25%',t.sun],['Banjar Adat','25%',t.adat],['Petugas Parkir','50%',t.pool]],
  staff:staffEarnings(rows).map(x=>({...x,avg:x.days?x.amount/x.days:0})),
  categories:expenseCategorySummary(rows),
  daily:rows.map(r=>{const c=calc(r);return{date:r.date,rev:r.revenue,exp:r.expenses,net:c.net,sunset:c.sunset,adat:c.adat,pool:c.pool,n:r.staff.length,each:c.each}})
 };
}
// Kolom tabel dipakai sama persis di layar dan di PDF.
const RPT_COLS={
 shares:{head:['Penerima','Porsi','Jumlah'],num:[1,2]},
 staff:{head:['Nama Petugas','Hari','Rata-rata/Hari','Total'],num:[1,2,3]},
 categories:{head:['Kategori','Transaksi','Jumlah','Porsi'],num:[1,2,3]},
 daily:{head:['Tanggal','Pendapatan','Pengeluaran','Bersih','Sunset 25%','Adat 25%','Petugas 50%','Petugas','Per Orang'],num:[1,2,3,4,5,6,7,8]}
};
function reportTables(R){
 const st=R.staff.reduce((s,x)=>({days:s.days+x.days,amount:s.amount+x.amount}),{days:0,amount:0});
 return{
  shares:{body:R.shares.map(x=>[x[0],x[1],num(x[2])]),foot:['Total (Pendapatan Bersih)','100%',num(R.t.net)]},
  staff:{body:R.staff.map(x=>[x.name,String(x.days),num(x.avg),num(x.amount)]),foot:['Total','',' ',num(st.amount)]},
  categories:{body:R.categories.map(x=>[x.name,String(x.count),num(x.amount),pct(x.share)]),foot:['Total',String(R.categories.reduce((s,x)=>s+x.count,0)),num(R.t.exp),R.categories.length?'100%':'0%']},
  daily:{body:R.daily.map(x=>[fmtDay(x.date),num(x.rev),num(x.exp),num(x.net),num(x.sunset),num(x.adat),num(x.pool),String(x.n),x.n?num(x.each):'—']),foot:['Total',num(R.t.rev),num(R.t.exp),num(R.t.net),num(R.t.sun),num(R.t.adat),num(R.t.pool),'','']}
 };
}
function htmlTable(key,data,empty){
 const c=RPT_COLS[key],cls=i=>c.num.includes(i)?' class="num"':'';
 const head='<thead><tr>'+c.head.map((h,i)=>'<th'+cls(i)+'>'+esc(h)+'</th>').join('')+'</tr></thead>';
 const body='<tbody>'+(data.body.length?data.body.map(r=>'<tr>'+r.map((v,i)=>'<td'+cls(i)+'>'+esc(v)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+c.head.length+'" class="empty">'+esc(empty)+'</td></tr>')+'</tbody>';
 const foot=data.body.length?'<tfoot><tr>'+data.foot.map((v,i)=>'<td'+cls(i)+'>'+esc(v)+'</td>').join('')+'</tr></tfoot>':'';
 return'<table class="data-table t-'+key+'">'+head+body+foot+'</table>';
}
function drawReport(){
 const R=reportData(),T=reportTables(R);
 report=R.rows;
 setText('reportPeriodLabel','Periode: '+R.period);
 setText('reportRecordCount',R.days+' hari tercatat');
 $('rptKpis').innerHTML=kpiHtml(R.kpis);
 $('rptShares').innerHTML=htmlTable('shares',T.shares,'Tidak ada data.');
 $('rptStaff').innerHTML=htmlTable('staff',T.staff,'Tidak ada petugas tercatat.');
 $('rptCategories').innerHTML=htmlTable('categories',T.categories,'Tidak ada pengeluaran.');
 $('rptDaily').innerHTML=htmlTable('daily',T.daily,'Tidak ada data pada periode ini.');
}
function pdf(){
 const R=reportData(),T=reportTables(R);
 if(!R.rows.length){alert('Tidak ada data laporan pada periode ini.');return null}
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
 const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=14,CW=W-2*M;
 const NAVY=[23,43,69],MUTED=[100,116,139],ORANGE=[214,120,38],LINE=[220,227,236],SOFT=[247,249,252],FOOT=[236,241,247];
 const printed=new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date());
 const title=(text,x,y)=>{doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(...NAVY);doc.text(text,x,y)};
 const table=(key,data,opt)=>{const c=RPT_COLS[key];doc.autoTable(Object.assign({
  head:[c.head],body:data.body,foot:data.body.length?[data.foot]:undefined,showFoot:'lastPage',theme:'grid',
  styles:{fontSize:8,cellPadding:{top:1.8,bottom:1.8,left:2.2,right:2.2},lineColor:LINE,lineWidth:{bottom:.15},textColor:[41,56,78],overflow:'linebreak'},
  headStyles:{fillColor:NAVY,textColor:255,fontStyle:'bold'},footStyles:{fillColor:FOOT,textColor:NAVY,fontStyle:'bold'},
  alternateRowStyles:{fillColor:SOFT},margin:{left:M,right:M,top:16,bottom:16},
  didParseCell:d=>{if(c.num.includes(d.column.index))d.cell.styles.halign='right'}
 },opt));return doc.lastAutoTable.finalY};
 // Kepala laporan
 doc.setFillColor(...ORANGE);doc.rect(M,10,CW,1,'F');
 doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(...ORANGE);doc.text('SUNSET VENUE PARKING',M,18);
 doc.setFontSize(19);doc.setTextColor(...NAVY);doc.text('Laporan Keuangan',M,26.5);
 doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(...MUTED);
 doc.text('Periode: '+R.period,M,32.5);doc.text(R.days+' hari tercatat  |  Nilai dalam Rupiah',W-M,32.5,{align:'right'});
 doc.setDrawColor(...LINE);doc.setLineWidth(.3);doc.line(M,36,W-M,36);
 // 1. Ringkasan
 let y=44;title('1. Ringkasan',M,y);
 const gap=4,bw=(CW-gap*3)/4,bh=21;y+=3;
 R.kpis.forEach((k,i)=>{const x=M+i*(bw+gap);
  doc.setFillColor(...(i===2?[255,244,232]:SOFT));doc.setDrawColor(...(i===2?[240,200,160]:LINE));doc.roundedRect(x,y,bw,bh,2,2,'FD');
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...MUTED);doc.text(k.label.toUpperCase(),x+3.5,y+6);
  doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...NAVY);doc.text(k.value,x+3.5,y+12.8);
  doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.setTextColor(...MUTED);doc.text(doc.splitTextToSize(k.note,bw-7)[0],x+3.5,y+17.8)});
 y+=bh+11;
 // 2 & 3 berdampingan
 const half=(CW-6)/2;
 title('2. Pembagian Hasil',M,y);title('3. Pendapatan Petugas',M+half+6,y);
 const y1=table('shares',T.shares,{startY:y+3,tableWidth:half,margin:{left:M,right:M,top:16,bottom:16}});
 const y2=table('staff',T.staff,{startY:y+3,tableWidth:half,margin:{left:M+half+6,right:M,top:16,bottom:16}});
 y=Math.max(y1,y2)+11;
 // 4. Pengeluaran per kategori
 if(y>H-45){doc.addPage();y=22}
 title('4. Pengeluaran per Kategori',M,y);y=table('categories',T.categories,{startY:y+3})+11;
 // 5. Rincian harian
 if(y>H-45){doc.addPage();y=22}
 title('5. Rincian Harian',M,y);table('daily',T.daily,{startY:y+3,styles:{fontSize:7.5,cellPadding:{top:1.6,bottom:1.6,left:1.8,right:1.8},lineColor:LINE,lineWidth:{bottom:.15},textColor:[41,56,78]},columnStyles:{0:{cellWidth:27}}});
 // Kaki halaman
 const pages=doc.getNumberOfPages();
 for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.setLineWidth(.2);doc.line(M,H-11,W-M,H-11);
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...MUTED);
  doc.text('Sunset Venue Parking  |  Laporan Keuangan '+R.period+'  |  Dicetak '+printed,M,H-6.5);doc.text('Halaman '+i+' dari '+pages,W-M,H-6.5,{align:'right'})}
 return doc;
}
function pdfName(){const R=reportData();return'Laporan-Parkir-Sunset-Venue'+(R.from?'_'+R.from+'_sd_'+R.to:'')+'.pdf'}
// ===== Dashboard =====
const SHARE_COLORS=['#172b45','#4f7fb3','#d67826'];
function kpiHtml(kpis){return kpis.map((k,i)=>'<div class="kpi'+(i===2?' is-net':'')+'"><span>'+esc(k.label)+'</span><strong>'+esc(k.value)+'</strong><small>'+esc(k.note)+'</small></div>').join('')}
function drawDash(){
 const range=dashDateRange();
 const a=records.filter(r=>(!range.from||r.date>=range.from)&&(!range.to||r.date<=range.to)).sort((x,y)=>x.date.localeCompare(y.date)),t=total(a);
 dashRows=a;
 $('dKpis').innerHTML=kpiHtml(periodKpis(a,t));
 // Pembagian hasil
 const shares=[['Sunset Venue',.25,t.sun],['Banjar Adat',.25,t.adat],['Petugas Parkir',.5,t.pool]];
 $('dShares').innerHTML=a.length?'<div class="split-bar">'+shares.map((s,i)=>'<i style="width:'+(s[1]*100)+'%;background:'+SHARE_COLORS[i]+'"></i>').join('')+'</div><div class="legend-list">'+shares.map((s,i)=>'<div class="legend-row"><span class="dot" style="background:'+SHARE_COLORS[i]+'"></span><span>'+s[0]+'<em>'+(s[1]*100)+'%</em></span><b>'+rp(s[2])+'</b></div>').join('')+'</div><div class="legend-total"><span>Pendapatan bersih</span><span>'+rp(t.net)+'</span></div>':'<div class="empty">Belum ada data pada periode ini.</div>';
 // Petugas
 const st=staffEarnings(a);
 $('dashStaffEarnings').innerHTML=st.length?'<div class="tablewrap"><table class="data-table"><thead><tr><th>Nama Petugas</th><th class="num">Hari</th><th class="num">Total</th></tr></thead><tbody>'+st.map(x=>'<tr><td>'+esc(x.name)+'</td><td class="num">'+x.days+'</td><td class="num">'+rp(x.amount)+'</td></tr>').join('')+'</tbody><tfoot><tr><td>Total</td><td></td><td class="num">'+rp(st.reduce((s,x)=>s+x.amount,0))+'</td></tr></tfoot></table></div>':'<div class="empty">Belum ada petugas tercatat pada periode ini.</div>';
 // Biaya per kategori (6 terbesar + lainnya)
 const cats=expenseCategorySummary(a),top=cats.slice(0,6),rest=cats.slice(6);
 if(rest.length)top.push({name:'Lainnya ('+rest.length+' kategori)',amount:rest.reduce((s,x)=>s+x.amount,0),share:rest.reduce((s,x)=>s+x.share,0)});
 const max=Math.max(1,...top.map(x=>x.amount));
 setText('dCatHint',cats.length?'Total '+rp(t.exp)+' · '+cats.length+' kategori':'Pengeluaran terbesar periode ini');
 $('dashExpenseCategories').innerHTML=top.length?'<div class="bar-list">'+top.map(x=>'<div class="bar-item"><div class="bar-top"><span>'+esc(x.name)+'</span><b>'+rp(x.amount)+'<em>'+pct(x.share)+'</em></b></div><div class="bar-track"><i style="width:'+Math.max(2,x.amount/max*100)+'%"></i></div></div>').join('')+'</div>':'<div class="empty">Belum ada biaya pada periode ini.</div>';
 // Aktivitas terbaru
 const last=[...a].reverse().slice(0,5);
 const days=a.length,staffDays=a.reduce((x,r)=>x+r.staff.length,0);
 $('dMini').innerHTML=days?'<div><span>Bersih rata-rata / hari</span><b>'+rp(t.net/days)+'</b></div><div><span>Petugas rata-rata / hari</span><b>'+(staffDays/days).toLocaleString('id-ID',{maximumFractionDigits:1})+' orang</b></div>':'';
 $('recent').innerHTML=last.length?'<div class="tablewrap"><table class="data-table"><thead><tr><th>Tanggal</th><th class="num">Pendapatan</th><th class="num">Bersih</th><th class="num">Petugas</th></tr></thead><tbody>'+last.map(r=>'<tr><td>'+esc(fmtDay(r.date))+'</td><td class="num">'+rp(r.revenue)+'</td><td class="num">'+rp(calc(r).net)+'</td><td class="num">'+r.staff.length+' orang</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Belum ada data.</div>';
}
// ===== Data Historis =====
let histLimit=30;
function drawHistory(){
 const sel=$('histMonth'),months={};records.forEach(r=>{const k=r.date.slice(0,7);months[k]=(months[k]||0)+1});
 const keys=Object.keys(months).sort().reverse(),cur=sel.value,fmtMonth=k=>new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(ymd(k+'-01'));
 const opts='<option value="">Semua bulan</option>'+keys.map(k=>'<option value="'+k+'">'+fmtMonth(k)+' ('+months[k]+' hari)</option>').join('');
 if(sel.dataset.sig!==opts){sel.innerHTML=opts;sel.dataset.sig=opts;sel.value=keys.includes(cur)?cur:''}
 const m=sel.value,q=$('histSearch').value.trim().toLowerCase();
 const all=[...records].sort((a,b)=>b.date.localeCompare(a.date));
 const rows=all.filter(r=>(!m||r.date.startsWith(m))&&(!q||[r.staff.join(' '),expenseItemsText(r),r.note,r.date,fmtDay(r.date)].join(' ').toLowerCase().includes(q)));
 const shown=rows.slice(0,histLimit);
 setText('histCount',(m||q?rows.length+' dari '+all.length:all.length)+' hari tercatat'+(rows.length>shown.length?' · menampilkan '+shown.length:''));
 const head='<thead><tr><th>Tanggal</th><th class="num">Pendapatan</th><th class="num">Biaya</th><th class="num">Bersih</th><th>Petugas</th><th>Rincian Biaya</th><th>Catatan</th>'+(admin()?'<th></th>':'')+'</tr></thead>';
 const body=shown.length?shown.map(r=>'<tr><td>'+esc(fmtDay(r.date))+(r.source==='excel_import'?'<span class="sub">dari Excel</span>':'')+'</td><td class="num" data-label="Pendapatan">'+rp(r.revenue)+'</td><td class="num" data-label="Biaya">'+rp(r.expenses)+'</td><td class="num" data-label="Bersih"><b>'+rp(calc(r).net)+'</b></td><td class="wrap" data-label="Petugas ('+r.staff.length+' orang)"><span class="sub">'+esc(r.staff.join(', ')||'—')+'</span></td><td class="wrap" data-label="Rincian biaya"><span class="sub">'+esc((r.expenseItems||[]).map(x=>titleCase(String(x.category))+' '+rp(x.amount)).join(' · ')||'—')+'</span></td><td class="note'+(r.note?'':' none')+'" data-label="Catatan"><span class="sub">'+esc(r.note||'—')+'</span></td>'+(admin()?'<td class="act"><button class="danger" onclick="window.delParkingRecord(\''+r.id+'\')">Hapus</button></td>':'')+'</tr>').join(''):'<tr><td colspan="8" class="empty">'+(all.length?'Tidak ada data yang cocok.':'Belum ada data.')+'</td></tr>';
 $('historyTable').innerHTML='<table class="data-table t-history">'+head+'<tbody>'+body+'</tbody></table>';
 $('histMore').classList.toggle('hidden',rows.length<=shown.length);
 const first=all[all.length-1],lastR=all[0],t=total(records),excel=records.filter(r=>r.source==='excel_import').length;
 $('histStats').innerHTML=[
  ['Hari tercatat',records.length+' hari'],
  ['Rentang data',records.length?fmtDate(first.date)+' – '+fmtDate(lastR.date):'—'],
  ['Total pendapatan',rp(t.rev)],
  ['Total pendapatan bersih',rp(t.net)],
  ['Sumber data',excel+' dari Excel · '+(records.length-excel)+' input manual']
 ].map(x=>'<div><dt>'+x[0]+'</dt><dd>'+esc(x[1])+'</dd></div>').join('');
}
$('histMonth').onchange=()=>{histLimit=30;drawHistory()};
$('histSearch').oninput=()=>{histLimit=30;drawHistory()};
$('histMore').onclick=()=>{histLimit+=30;drawHistory()};
// ===== Simulasi Input Harian =====
function preview(){
 const rev=Number($('revenue').value)||0,items=collectExpenseItemsSafe(),exp=items.reduce((s,x)=>s+x.amount,0),st=chosen(),net=rev-exp,pool=net*.5,d=$('date').value;
 setText('expenseTotal',rp(exp));
 const row=(l,v,cls='')=>'<div class="sum-row'+cls+'"><span>'+l+'</span><b>'+v+'</b></div>';
 let notes='';
 if(d&&records.some(x=>x.date===d))notes+='<div class="sum-note warn">Tanggal ini sudah punya data. Menyimpan akan menimpa data lama.</div>';
 if(!st.length)notes+='<div class="sum-note info">Centang petugas yang bertugas untuk menghitung bagian per orang.</div>';
 if(net<0)notes+='<div class="sum-note warn">Biaya lebih besar dari pendapatan, hasil bagi menjadi minus.</div>';
 $('preview').innerHTML='<p class="summary-date">'+(d?esc(fmtDay(d)):'Pilih tanggal')+'</p>'+
  '<div class="sum-table">'+row('Pendapatan',rp(rev))+row('Total biaya',rp(exp))+row('Pendapatan bersih',rp(net),' total')+'</div>'+
  '<div class="sum-group">'+row('Sunset Venue 25%',rp(net*.25))+row('Banjar Adat 25%',rp(net*.25))+row('Petugas Parkir 50%',rp(pool))+row(st.length?st.length+' petugas · per orang':'Per petugas',st.length?rp(pool/st.length):'—')+'</div>'+notes;
}
const PAGE_INFO={dashboard:['Dashboard','Ringkasan pendapatan, biaya, dan pembagian hasil parkir'],entry:['Input Harian','Catat pendapatan, biaya, dan petugas yang bertugas'],reports:['Laporan','Laporan keuangan per periode, siap diunduh sebagai PDF'],history:['Data Historis','Semua data harian, import Excel, dan backup']};
function reportDateEdited(){$('reportPreset').value='custom';syncReportFilters();drawReport()}$('fromDate').onchange=reportDateEdited;$('toDate').onchange=reportDateEdited;$('reportPreset').onchange=()=>{syncReportFilters();drawReport()};$('reportMonth').onchange=()=>{syncReportFilters();drawReport()};$('reportYear').onchange=()=>{syncReportFilters();drawReport()};$('pdfReport').onclick=()=>{let d=pdf();if(d)d.save(pdfName())};
$('waReport').onclick=async()=>{let d=pdf();if(!d)return;const name=pdfName();let file=new File([d.output('blob')],name,{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Laporan Sunset Venue Parking'});return}catch(e){if(e.name==='AbortError')return}}d.save(name);window.open('https://wa.me/?text='+encodeURIComponent('Laporan Sunset Venue Parking. PDF sudah diunduh, silakan lampirkan file PDF di WhatsApp.'),'_blank')};
function dateParse(v){if(v instanceof Date)return [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-');if(typeof v==='number'){let d=XLSX.SSF.parse_date_code(v);if(d)return[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-')}let s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;let p=s.split(/[\/.-]/);if(p.length===3)return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');return''}
$('importExcel').onclick=async()=>{
 if(!admin()){alert('Khusus Admin.');return}
 let f=$('excelFile').files[0];
 if(!f){alert('Pilih file Excel/CSV.');return}
 try{
  let wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
  let rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
  let added=0,updated=0,skipped=0;const unknownStaff=new Set(),failed=[];
  const grouped=new Map();
  for(const row of rows){
   let o={};
   Object.keys(row).forEach(k=>o[k.toLowerCase().replace(/[^a-z0-9]/g,'')]=row[k]);
   const date=dateParse(o.tanggal??o.date??o.tgl);
   if(!date){skipped++;continue}
   if(Object.prototype.hasOwnProperty.call(o,'kategori')){
    const category=String(o.kategori??'').trim().toLowerCase().replace(/\s+/g,' ');
    const description=String(o.keterangan??'').trim();
    const incoming=parseAmount(o.pemasukan);
    const outgoing=parseAmount(o.pengeluaran);
    if(!['biaya','pendapatan','petugas parkir','setoran'].includes(category)){skipped++;continue}
    let rec=grouped.get(date);
    if(!rec){rec={date,revenue:0,expenses:0,expenseItems:[],staff:[],note:'',source:'excel_import'};grouped.set(date,rec)}
    if(category==='pendapatan'){
     rec.revenue+=incoming;
    }else if(category==='biaya'){
     const amount=outgoing>0?outgoing:incoming;
     if(amount>0)rec.expenseItems.push({category:description||'Biaya',amount,description:''});
     else if(description)rec.note=[rec.note,'Biaya tanpa nominal: '+description].filter(Boolean).join(' | ');
    }else if(category==='petugas parkir'){
     const names=splitNames(description);
     names.filter(x=>!findStaffRow(x)).forEach(x=>unknownStaff.add(x));
     const merged=[...rec.staff];names.forEach(x=>{if(!merged.some(y=>nameKey(y)===nameKey(x)))merged.push(x)});
     rec.staff=merged;
    }else if(category==='setoran'){
     if(incoming>0)rec.note=[rec.note,'Setoran masuk '+(description?description+' ':'')+money(incoming)].filter(Boolean).join(' | ');
     if(outgoing>0)rec.note=[rec.note,'Setoran keluar '+(description?description+' ':'')+money(outgoing)].filter(Boolean).join(' | ');
     if(incoming===0&&outgoing===0&&description)rec.note=[rec.note,'Setoran: '+description].filter(Boolean).join(' | ');
    }
    continue;
   }
   const revenueCell=o.revenue??o.totalrevenue??o.pendapatan??'';
   const revenueText=String(revenueCell??'').trim();
   const rev=revenueText===''?0:parseAmount(revenueCell);
   const legacyCell=o.pengeluaran??o.expenses??o.totalpengeluaran??0;
   const legacyExp=parseAmount(legacyCell);
   if(!date||!Number.isFinite(rev)||!Number.isFinite(legacyExp)||rev<0||legacyExp<0){skipped++;continue}
   const names=splitNames(o.petugas??o.staff);
   names.filter(x=>!findStaffRow(x)).forEach(x=>unknownStaff.add(x));
   const note=String(o.catatan??o.note??'').trim();
   const isLongExpenseFormat=Object.prototype.hasOwnProperty.call(o,'itempengeluaran')||
    Object.prototype.hasOwnProperty.call(o,'itembiaya')||
    (Object.prototype.hasOwnProperty.call(o,'item')&&Object.prototype.hasOwnProperty.call(o,'nominal'));
   if(isLongExpenseFormat){
    let rec=grouped.get(date);
    if(!rec){rec={date,revenue:rev,expenses:0,expenseItems:[],staff:names,note,source:'excel_import'};grouped.set(date,rec)}
    else{
     if(revenueText!=='')rec.revenue=rev;
     if(names.length)rec.staff=names;
     if(note)rec.note=note;
    }
    const category=String(o.itempengeluaran??o.itembiaya??o.item??'').trim();
    const amountCell=o.nominal??o.nominalpengeluaran??o.nominalbiaya??'';
    const amount=parseAmount(amountCell);
    const description=String(o.keterangan??o.description??'').trim();
    if(category&&amount>0)rec.expenseItems.push({category,amount,description});
    else if(!category&&amount>0)skipped++;
    continue;
   }
   let expenseItems=[];
   const knownExpenseKeys={jajan:'Jajan',kopi:'Kopi',sewadw:'Sewa DW'};
   const manualSlots={},manualSlotKeys=new Set();
   Object.keys(o).forEach(key=>{
    let m=key.match(/^(itempengeluaran|itembiaya)(\d+)$/);
    if(m){const n=Number(m[2]);manualSlots[n]=manualSlots[n]||{};manualSlots[n].category=String(o[key]??'').trim();manualSlotKeys.add(key);return}
    m=key.match(/^(nominalpengeluaran|nominalbiaya)(\d+)$/);
    if(m){const n=Number(m[2]);manualSlots[n]=manualSlots[n]||{};manualSlots[n].amount=parseAmount(o[key]);manualSlotKeys.add(key);return}
    m=key.match(/^(keteranganpengeluaran|keteranganbiaya)(\d+)$/);
    if(m){const n=Number(m[2]);manualSlots[n]=manualSlots[n]||{};manualSlots[n].description=String(o[key]??'').trim();manualSlotKeys.add(key)}
   });
   Object.keys(manualSlots).map(Number).sort((a,b)=>a-b).forEach(n=>{
    const item=manualSlots[n];
    if(item.category&&item.amount>0)expenseItems.push({category:item.category,amount:item.amount,description:item.description||''});
   });
   const ignoredKeys=new Set(['tanggal','date','tgl','revenue','totalrevenue','pendapatan','pengeluaran','expenses','totalpengeluaran','petugas','staff','catatan','note']);
   Object.keys(o).forEach(key=>{
    if(ignoredKeys.has(key)||manualSlotKeys.has(key)||/^(itempengeluaran|itembiaya|nominalpengeluaran|nominalbiaya|keteranganpengeluaran|keteranganbiaya)\d+$/.test(key))return;
    const amount=parseAmount(o[key]);
    if(!Number.isFinite(amount)||amount<=0)return;
    const category=knownExpenseKeys[key]||key;
    expenseItems.push({category,amount,description:'Diimpor dari kolom '+category});
   });
   if(!expenseItems.length&&legacyExp>0)expenseItems=[{category:'Biaya lama (belum dirinci)',amount:legacyExp,description:'Diimpor dari kolom pengeluaran total'}];
   grouped.set(date,{date,revenue:rev,expenses:expenseItems.reduce((sum,x)=>sum+x.amount,0),expenseItems,staff:names,note,source:'excel_import'});
  }
  // Jangan simpan apa pun bila ada nama petugas yang tidak dikenal: pembagian 50% akan salah.
  if(unknownStaff.size){setText('importMessage','Import dibatalkan, tidak ada data yang diubah. Nama petugas tidak ditemukan di database: '+[...unknownStaff].join(', ')+'. Perbaiki ejaan di Excel atau tambahkan nama tersebut ke tabel staff, lalu import ulang.');return}
  if(!grouped.size){setText('importMessage','Tidak ada baris bertanggal yang bisa diimpor.');return}
  let done=0;
  for(const rec of grouped.values()){
   rec.expenses=(rec.expenseItems||[]).reduce((sum,x)=>sum+Number(x.amount||0),0);
   const exists=records.some(x=>x.date===rec.date);
   try{await saveRecord(rec,{reload:false});if(exists)updated++;else added++}
   catch(e){failed.push(rec.date+' ('+e.message+')')}
   done++;if(done%10===0)setText('importMessage','Mengimpor... '+done+' dari '+grouped.size+' tanggal');
  }
  await loadData();
  await db.from('import_history').insert({file_name:f.name,rows_read:rows.length,rows_added:added,rows_updated:updated,rows_skipped:skipped+failed.length,imported_by:user.id});
  setText('importMessage','Import selesai: '+added+' tanggal baru, '+updated+' diperbarui, '+skipped+' baris dilewati.'+(failed.length?' GAGAL disimpan '+failed.length+' tanggal: '+failed.join('; '):''));draw();
 }catch(e){setText('importMessage','Import gagal: '+e.message)}
};
$('exportExcel').onclick=()=>{
 let w=XLSX.utils.book_new();
 let summary=records.map(r=>({Tanggal:r.date,Pendapatan:r.revenue,Total_Biaya:r.expenses,Net_Revenue:calc(r).net,Sunset_25:calc(r).sunset,Desa_Adat_25:calc(r).adat,Petugas_50:calc(r).pool,Petugas_Bertugas:r.staff.join(', '),Catatan:r.note}));
 let details=[];records.forEach(r=>(r.expenseItems||[]).forEach(x=>details.push({Tanggal:r.date,Kategori:x.category,Nominal:x.amount,Keterangan:x.description})));
 XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(summary),'Ringkasan Harian');
 XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(details),'Rincian Biaya');
 const paymentDetails=payouts.map(p=>({Tanggal:records.find(r=>r.id===p.daily_record_id)?.date||'',Penerima:p.recipient_name,Jenis:p.recipient_type,Nominal:p.amount,Metode:p.payment_method,Tanggal_Bayar:p.paid_at}));
 XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(paymentDetails),'Riwayat Pembayaran');
 XLSX.writeFile(w,'Sunset-Parking-Backup.xlsx')
};
$('dashEnter').addEventListener('click',()=>{syncDashFilters();drawDash()});$('reportEnter').addEventListener('click',drawReport);$('dashPreset').onchange=()=>{syncDashFilters();drawDash()};
 $('dashStart').onchange=()=>{$('dashPreset').value='custom';syncDashFilters();drawDash()};
 $('dashEnd').onchange=()=>{$('dashPreset').value='custom';syncDashFilters();drawDash()};
 $('dashMonth').onchange=()=>{if($('dashMonth').value)$('dashPreset').value='month';syncDashFilters();drawDash()};
 $('dashYear').onchange=()=>{if($('dashYear').value)$('dashPreset').value='year';syncDashFilters();drawDash()};
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginButton').disabled=true;setText('loginMessage','Sedang login...');const loginName=$('loginEmail').value.trim();const loginKey=loginName.toLowerCase();const loginEmail=loginKey==='petugas'?'petugas@sunsetvenue.local':loginKey==='belong76'?'wikansutama19@gmail.com':loginName;let {error}=await db.auth.signInWithPassword({email:loginEmail,password:$('loginPassword').value});$('loginButton').disabled=false;if(error){setText('loginMessage','Login gagal: periksa username dan password.');return}try{await sessionStart()}catch(x){showLogin('Login berhasil, tetapi aplikasi belum selesai dimuat: '+x.message)}};
$('logoutButton').onclick=async()=>{await db.auth.signOut();user=null;profile=null;showLogin('Kamu sudah logout.')};
$('date').value=today();$('fromDate').value=today().slice(0,7)+'-01';$('toDate').value=today();$('reportMonth').value=today().slice(0,7);$('reportYear').value=today().slice(0,4);$('reportPreset').value='all';syncReportFilters();$('dashStart').value=today().slice(0,7)+'-01';$('dashEnd').value=today();$('dashMonth').value=today().slice(0,7);$('dashYear').value=today().slice(0,4);$('dashPreset').value='all';syncDashFilters();addExpenseRow();preview();
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});
sessionStart().catch(e=>showLogin('Aplikasi belum berhasil dimuat. Periksa koneksi dan setup database. Detail: '+e.message));
})();
