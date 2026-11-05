(() => {
const URL='https://dsvdtqypumwjevgtoghr.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmR0cXlwdW13amV2Z3RvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzczNDUsImV4cCI6MjEwOTQ1MzM0NX0.VoCbLhxttbPPKtNqKaQPC-XQaHg9q48V5vyL0eDpZko';
const db=window.supabase.createClient(URL,KEY), STAFF=['Pak Gangga','Pak Manik','Pak Bayu','Pak Dek Putra','Pak Riki'];
let user=null,profile=null,staffRows=[],records=[],report=[],dashRows=[],payouts=[],paymentBusy=false,realtimeChannel=null,refreshTimer=null;
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const today=()=>{let d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const admin=()=>profile?.role==='admin', esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calc=r=>{let n=Number(r.revenue)-Number(r.expenses),p=n*.5;return{net:n,sunset:n*.25,adat:n*.25,pool:p,each:r.staff.length?p/r.staff.length:0}};
function showLogin(s=''){$('loginScreen').style.display='grid';$('app').classList.add('hidden');$('loginMessage').textContent=s}
async function sessionStart(){
 const {data:{session},error}=await db.auth.getSession();if(error)throw error;
 if(!session){showLogin();return}
 user=session.user;
 const {data:p,error:pe}=await db.from('user_profiles').select('display_name,role').eq('id',user.id).single();
 if(pe)throw pe;profile=p;
 $('loginScreen').style.display='none';$('app').classList.remove('hidden');
 $('userBadge').textContent=(p.display_name||user.email)+' · '+p.role.toUpperCase();
 $('importExcel').disabled=!admin();$('importExcel').title=admin()?'':'Khusus Admin';
 await loadData();draw();setupRealtime();
}
async function loadData(){
 const [s,d,j,e,p]=await Promise.all([
  db.from('staff').select('id,full_name').eq('active',true),
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
 $('staffChecks').innerHTML='<label class="stafftag staff-all"><input type="checkbox" id="stAll">Semua Bertugas</label>'+STAFF.map((x,i)=>'<label class="stafftag"><input type="checkbox" id="st'+i+'">'+x+'</label>').join('');
 const all=$('stAll');
 if(all)all.onchange=()=>{STAFF.forEach((x,i)=>{const el=$('st'+i);if(el)el.checked=all.checked});preview()};
 STAFF.forEach((x,i)=>{const el=$('st'+i);if(el)el.onchange=()=>{if(all)all.checked=STAFF.every((n,k)=>$('st'+k)?.checked);preview()}});
}
const chosen=()=>STAFF.filter((x,i)=>$('st'+i)?.checked);
async function saveRecord(r){
 const items=(r.expenseItems||[]).filter(x=>Number(x.amount)>0);
 const expenseTotal=items.reduce((s,x)=>s+Number(x.amount),0);
 const {data,error}=await db.from('daily_records').upsert({record_date:r.date,total_revenue:r.revenue,total_expenses:expenseTotal,note:r.note||'',source:r.source||'manual',created_by:user.id,updated_at:new Date().toISOString()},{onConflict:'record_date'}).select('id').single();
 if(error)throw error;
 const id=data.id;
 const {error:ce}=await db.from('expense_items').delete().eq('daily_record_id',id);if(ce)throw ce;
 if(items.length){const {error:ei}=await db.from('expense_items').insert(items.map(x=>({daily_record_id:id,category:x.category,amount:Number(x.amount),description:x.description||''})));if(ei)throw ei}
 const {error:de}=await db.from('staff_duty').delete().eq('daily_record_id',id);if(de)throw de;
 const ids=(r.staff||[]).map(n=>staffRows.find(x=>x.full_name===n)?.id).filter(Boolean);
 if(ids.length){const {error:ie}=await db.from('staff_duty').insert(ids.map(staff_id=>({daily_record_id:id,staff_id})));if(ie)throw ie}
 await loadData();
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
   {type:'adat',name:'Desa Adat',amount:c.adat},
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
 return Object.values(map).sort((a,b)=>(order[a.type]-order[b.type])||(STAFF.indexOf(a.name)-STAFF.indexOf(b.name)));
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
   if(!out[name])out[name]={name:name,days:0,amount:0};
   out[name].days++;
   out[name].amount+=c.each;
  });
 });
 return STAFF.filter(name=>out[name]).map(name=>out[name]);
}
function dashDateRange(){const p=$('dashPreset').value,dt=today();if(p==='all')return{from:'',to:''};if(p==='thisMonth'){const m=dt.slice(0,7),last=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate();return{from:m+'-01',to:m+'-'+String(last).padStart(2,'0')}}if(p==='month'){const m=$('dashMonth').value||dt.slice(0,7),last=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate();return{from:m+'-01',to:m+'-'+String(last).padStart(2,'0')}}if(p==='year'){const y=$('dashYear').value||dt.slice(0,4);return{from:y+'-01-01',to:y+'-12-31'}}return{from:$('dashStart').value,to:$('dashEnd').value}}
function syncDashFilters(){const p=$('dashPreset').value;document.querySelectorAll('.dash-custom').forEach(x=>x.classList.toggle('hidden',p!=='custom'));$('dashMonth').parentElement.classList.toggle('hidden',p!=='month');$('dashYear').parentElement.classList.toggle('hidden',p!=='year')}
function drawDash(){const range=dashDateRange();let a=records.filter(r=>(!range.from||r.date>=range.from)&&(!range.to||r.date<=range.to)),t=total(a);dashRows=a;
 $('dRevenue').textContent=money(t.rev);$('dExpenses').textContent=money(t.exp);$('dNet').textContent=money(t.net);$('dDays').textContent=a.length;
 $('dSunset').textContent=money(t.sun);$('dAdat').textContent=money(t.adat);$('dStaff').textContent=money(t.pool);
 const settlements=settlementRows(a);
 $('dashSettlementRows').innerHTML=settlements.length?settlements.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+money(x.due)+'</td><td>'+money(x.paid)+'</td><td>'+money(Math.max(0,x.balance))+'</td><td>'+(admin()&&x.balance>0.009?'<button class="secondary" onclick="window.payParkingRecipient(\''+x.type+'\',\''+esc(x.name)+'\')">Bayar</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">Belum ada pembagian pada periode ini.</td></tr>';
 $('dashPayAllBtn').classList.toggle('hidden',!admin());$('dashPayAllBtn').disabled=outstanding<=0.009;
 const categoryTotals=expenseCategoryTotals(a);
 $('dashExpenseCategories').innerHTML=categoryTotals.length?categoryTotals.map(x=>'<div class="share"><span>'+esc(x.category)+'</span><b>'+money(x.amount)+'</b></div>').join(''):'<div class="empty">Belum ada biaya pada periode ini.</div>';
 const perStaff=staffEarnings(a);
 $('dashStaffEarnings').innerHTML=perStaff.length?perStaff.map(x=>'<div class="share"><span>'+esc(x.name)+'<small class="muted" style="display:block">'+x.days+' hari bertugas</small></span><b>'+money(x.amount)+'</b></div>').join(''):'<div class="empty">Belum ada petugas tercatat pada periode ini.</div>';
 $('recent').innerHTML=a.length?[...a].sort((x,y)=>y.date.localeCompare(x.date)).slice(0,5).map(r=>'<div class="share"><span>'+esc(r.date)+'<small class="muted" style="display:block">'+esc(r.staff.join(', '))+'</small></span><b>'+money(calc(r).net)+'</b></div>').join(''):'<div class="empty">Belum ada data.</div>';
}
function drawHistory(){
 $('historyRows').innerHTML=records.length?[...records].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+money(r.revenue)+'</td><td>'+money(r.expenses)+'</td><td>'+esc(expenseItemsText(r))+'</td><td>'+money(calc(r).net)+'</td><td>'+esc(r.staff.join(', '))+'</td><td>'+esc(r.note)+'</td><td>'+(admin()?'<button class="danger" onclick="window.delParkingRecord(\''+r.id+'\')">Hapus</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="8" class="empty">Belum ada data.</td></tr>';
}
function drawReport(){let from=$('fromDate').value,to=$('toDate').value;report=records.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>a.date.localeCompare(b.date));
 $('reportRows').innerHTML=report.length?report.map(r=>{let c=calc(r);return'<tr><td>'+r.date+'</td><td>'+money(r.revenue)+'</td><td>'+money(r.expenses)+'</td><td>'+money(c.net)+'</td><td>'+money(c.sunset)+'</td><td>'+money(c.adat)+'</td><td>'+money(c.pool)+'</td><td>'+esc(r.staff.join(', '))+'</td></tr>'}).join(''):'<tr><td colspan="8" class="empty">Tidak ada data pada periode ini.</td></tr>';
 const selectedStaff=$('reportStaffFilter').value;
 const dailyStaffLines=report.flatMap(r=>{const c=calc(r);return(r.staff||[]).filter(n=>!selectedStaff||n===selectedStaff).map(name=>({date:r.date,name,amount:c.each}))}).sort((a,b)=>a.date.localeCompare(b.date)||STAFF.indexOf(a.name)-STAFF.indexOf(b.name));
 $('reportDailyStaffRows').innerHTML=dailyStaffLines.length?dailyStaffLines.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.name)+'</td><td>'+money(x.amount)+'</td></tr>').join(''):'<tr><td colspan="3" class="empty">Tidak ada data petugas pada periode ini.</td></tr>';
 const settlements=settlementRows(report);
 const totalDue=settlements.reduce((s,x)=>s+x.due,0),totalPaid=settlements.reduce((s,x)=>s+x.paid,0),balance=totalBalance(report);
}
function setupRealtime(){if(realtimeChannel)db.removeChannel(realtimeChannel);realtimeChannel=db.channel('parking-data-live').on('postgres_changes',{event:'*',schema:'public',table:'daily_records'},async()=>{await loadData();draw()}).on('postgres_changes',{event:'*',schema:'public',table:'staff_duty'},async()=>{await loadData();draw()}).on('postgres_changes',{event:'*',schema:'public',table:'expense_items'},async()=>{await loadData();draw()}).on('postgres_changes',{event:'*',schema:'public',table:'payout_payments'},async()=>{await loadData();draw()}).subscribe();if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(async()=>{if(!user)return;try{await loadData();draw()}catch(e){console.warn('Auto refresh:',e.message)}},30000)}
function draw(){drawDash();drawHistory();if($('reports').classList.contains('active'))drawReport()}
function page(p){document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===p));document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('pageTitle').textContent=({dashboard:'Dashboard',entry:'Input Harian',reports:'Laporan',history:'Data Historis'})[p];if(p==='reports')drawReport()}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));
window.payParkingRecipient=payRecipient;
$('dashPayAllBtn').onclick=payAllBalances;
function addExpenseRow(category='Jajan',amount='',description='',custom=''){
 const row=document.createElement('div');row.className='expense-row';
 row.innerHTML='<div><label>Item</label><select class="expense-kind"><option>Jajan</option><option>Kopi</option><option>Sewa DW</option><option value="__custom">Lainnya</option></select></div><div class="expense-custom hidden"><label>Nama kategori</label><input class="expense-custom-name" type="text" placeholder="Contoh: BBM"></div><div><label>Nominal (Rp)</label><input class="expense-value" type="number" min="0" step="1" placeholder="0"></div><div><label>Keterangan (opsional)</label><input class="expense-note" type="text" placeholder="Catatan"></div><button type="button" class="secondary remove-expense">Hapus</button>';
 $('expenseRows').appendChild(row);
 row.querySelector('.expense-kind').value=['Jajan','Kopi','Sewa DW'].includes(category)?category:'__custom';
 row.querySelector('.expense-custom').classList.toggle('hidden',row.querySelector('.expense-kind').value!=='__custom');
 row.querySelector('.expense-custom-name').value=custom||(!['Jajan','Kopi','Sewa DW'].includes(category)?category:'');
 row.querySelector('.expense-value').value=amount;row.querySelector('.expense-note').value=description;preview();
}
function collectExpenseItems(){
 const items=[];
 for(const row of $('expenseRows').querySelectorAll('.expense-row')){
  const kind=row.querySelector('.expense-kind').value,amount=Number(row.querySelector('.expense-value').value)||0;
  if(amount<=0)continue;
  const category=kind==='__custom'?row.querySelector('.expense-custom-name').value.trim():kind;
  if(!category)throw new Error('Isi nama kategori untuk biaya Lainnya.');
  items.push({category,amount,description:row.querySelector('.expense-note').value.trim()});
 }
 return items;
}
function collectExpenseItemsSafe(){try{return collectExpenseItems()}catch(e){return []}}
function preview(){
 const rev=Number($('revenue').value)||0,items=collectExpenseItemsSafe(),exp=items.reduce((s,x)=>s+x.amount,0),st=chosen(),net=rev-exp,pool=net*.5;
 $('expenseTotal').textContent=money(exp);
 $('preview').innerHTML='<div class="preview-line"><span>Total biaya:</span> <b>'+money(exp)+'</b> <span class="preview-dot">·</span> <span>Net revenue:</span> <b>'+money(net)+'</b></div><div class="preview-line"><span>Sunset Venue 25%:</span> <b>'+money(net*.25)+'</b> <span class="preview-dot">·</span> <span>Desa Adat 25%:</span> <b>'+money(net*.25)+'</b> <span class="preview-dot">·</span> <span>Petugas 50%:</span> <b>'+money(pool)+'</b> <span class="preview-count">('+st.length+' orang'+(st.length?' · '+money(pool/st.length)+' per orang':' · pilih petugas')+')</span></div>';
}
$('dailyForm').addEventListener('input',preview);
$('dailyForm').addEventListener('change',e=>{if(e.target.classList.contains('expense-kind'))e.target.closest('.expense-row').querySelector('.expense-custom').classList.toggle('hidden',e.target.value!=='__custom');preview()});
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
function pdf(){if(!report.length){alert('Tidak ada data laporan.');return null}
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape'}),t=total(report);
 doc.setFontSize(17);doc.text('SUNSET VENUE PARKING',14,16);doc.setFontSize(10);doc.text('Laporan '+report[0].date+' s/d '+report[report.length-1].date,14,23);
 let y=31;doc.setFontSize(13);doc.text('1. Pendapatan',14,y);
 doc.autoTable({startY:y+4,head:[['Tanggal','Pendapatan']],body:report.map(r=>[r.date,money(r.revenue)]),foot:[['TOTAL',money(t.rev)]],styles:{fontSize:9},theme:'grid'});
 y=doc.lastAutoTable.finalY+12;doc.setFontSize(13);doc.text('2. Pengeluaran',14,y);
 const costDetails=[];report.forEach(r=>(r.expenseItems||[]).forEach(x=>costDetails.push([r.date,x.category,money(x.amount),x.description||''])));
 doc.autoTable({startY:y+4,head:[['Tanggal','Item pengeluaran','Nominal','Keterangan']],body:costDetails,foot:[['','','TOTAL',money(t.exp)]],styles:{fontSize:8},theme:'grid'});
 y=doc.lastAutoTable.finalY+12;doc.setFontSize(13);doc.text('3. Pembagian hasil',14,y);
 doc.autoTable({startY:y+4,head:[['Tanggal','Net Revenue','Sunset Venue 25%','Desa Adat 25%','Petugas 50%','Nama petugas']],body:report.map(r=>{const c=calc(r);return[r.date,money(c.net),money(c.sunset),money(c.adat),money(c.pool),r.staff.join(', ')]}),foot:[['TOTAL',money(t.net),money(t.sun),money(t.adat),money(t.pool),'']],styles:{fontSize:8},theme:'grid'});return doc}
$('fromDate').onchange=drawReport;$('toDate').onchange=drawReport;$('reportStaffFilter').onchange=drawReport;$('pdfReport').onclick=()=>{let d=pdf();if(d)d.save('Sunset-Parking-Report.pdf')};
$('waReport').onclick=async()=>{let d=pdf();if(!d)return;let file=new File([d.output('blob')],'Sunset-Parking-Report.pdf',{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Laporan Sunset Venue Parking'});return}catch(e){if(e.name==='AbortError')return}}d.save('Sunset-Parking-Report.pdf');window.open('https://wa.me/?text='+encodeURIComponent('Laporan Sunset Venue Parking. PDF sudah diunduh, silakan lampirkan file PDF di WhatsApp.'),'_blank')};
function dateParse(v){if(v instanceof Date)return [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-');if(typeof v==='number'){let d=XLSX.SSF.parse_date_code(v);if(d)return[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-')}let s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;let p=s.split(/[\/.-]/);if(p.length===3)return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');return''}
$('importExcel').onclick=async()=>{
 if(!admin()){alert('Khusus Admin.');return}let f=$('excelFile').files[0];if(!f){alert('Pilih file Excel/CSV.');return}
 try{let wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}),added=0,updated=0,skipped=0;
 for(let row of rows){let o={};Object.keys(row).forEach(k=>o[k.toLowerCase().replace(/[^a-z]/g,'')]=row[k]);let date=dateParse(o.tanggal??o.date??o.tgl),rev=Number(String(o.revenue??o.totalrevenue??o.pendapatan??'').replace(/[^0-9.-]/g,'')),legacyExp=Number(String(o.pengeluaran??o.expenses??o.totalpengeluaran??0).replace(/[^0-9.-]/g,''));if(!date||!Number.isFinite(rev)||!Number.isFinite(legacyExp)||rev<0||legacyExp<0){skipped++;continue}
 let expenseItems=[];const knownExpenseKeys={jajan:'Jajan',kopi:'Kopi',sewadw:'Sewa DW'};
 const ignoredKeys=new Set(['tanggal','date','tgl','revenue','totalrevenue','pendapatan','pengeluaran','expenses','totalpengeluaran','petugas','staff','catatan','note']);
 Object.keys(o).forEach(key=>{if(ignoredKeys.has(key))return;const amount=Number(String(o[key]??'').replace(/[^0-9.-]/g,''));if(!Number.isFinite(amount)||amount<=0)return;const category=knownExpenseKeys[key]||key;expenseItems.push({category,amount,description:'Diimpor dari kolom '+category})});
 if(!expenseItems.length&&legacyExp>0)expenseItems=[{category:'Biaya lama (belum dirinci)',amount:legacyExp,description:'Diimpor dari kolom pengeluaran total'}];
 let exp=expenseItems.reduce((s,x)=>s+x.amount,0);let names=String(o.petugas??o.staff??'').split(/[,;|]/).map(x=>x.trim()).filter(x=>STAFF.includes(x));let exists=records.some(x=>x.date===date);try{await saveRecord({date,revenue:rev,expenses:exp,expenseItems,staff:names,note:String(o.catatan??o.note??''),source:'excel_import'});if(exists)updated++;else added++}catch(e){skipped++}}
 await db.from('import_history').insert({file_name:f.name,rows_read:rows.length,rows_added:added,rows_updated:updated,rows_skipped:skipped,imported_by:user.id});
 $('importMessage').textContent='Import selesai: '+added+' baru, '+updated+' diperbarui, '+skipped+' dilewati.';draw();
 }catch(e){$('importMessage').textContent='Import gagal: '+e.message}
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
$('dashPreset').onchange=()=>{syncDashFilters();drawDash()};$('dashStart').onchange=drawDash;$('dashEnd').onchange=drawDash;$('dashMonth').onchange=drawDash;$('dashYear').onchange=drawDash;
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='Sedang login...';let {error}=await db.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginButton').disabled=false;if(error){$('loginMessage').textContent='Login gagal: '+error.message;return}try{await sessionStart()}catch(x){showLogin('Login berhasil tetapi database belum siap: '+x.message)}};
$('logoutButton').onclick=async()=>{await db.auth.signOut();user=null;profile=null;showLogin('Kamu sudah logout.')};
$('date').value=today();$('fromDate').value=today().slice(0,7)+'-01';$('toDate').value=today();$('dashStart').value=today().slice(0,7)+'-01';$('dashEnd').value=today();$('dashMonth').value=today().slice(0,7);$('dashYear').value=today().slice(0,4);syncDashFilters();addExpenseRow();preview();
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});
sessionStart().catch(e=>showLogin('Koneksi/database belum siap. Jalankan schema.sql di Supabase dahulu. Detail: '+e.message));
})();