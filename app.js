(() => {
const URL='https://dsvdtqypumwjevgtoghr.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmR0cXlwdW13amV2Z3RvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzczNDUsImV4cCI6MjEwOTQ1MzM0NX0.VoCbLhxttbPPKtNqKaQPC-XQaHg9q48V5vyL0eDpZko';
const db=window.supabase.createClient(URL,KEY), STAFF=['Pak Gangga','Pak Manik','Pak Bayu','Pak Dek Putra','Pak Riki'];
let user=null,profile=null,staffRows=[],records=[],report=[],payouts=[];
const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const today=()=>{let d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const admin=()=>profile?.role==='admin', esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calc=r=>{let n=Number(r.revenue)-Number(r.expenses),p=n*.5;return{net:n,sunset:n*.25,adat:n*.25,pool:p,each:r.staff.length?p/r.staff.length:0}};
function notice(s){$('appNotice').textContent=s}
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
 await loadData();draw();
}
async function loadData(){
 const [s,d,j,e]=await Promise.all([
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
 $('staffChecks').innerHTML=STAFF.map((x,i)=>'<label class="stafftag"><input type="checkbox" id="st'+i+'">'+x+'</label>').join('');
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
 const pending=settlementLines(report).filter(x=>x.type===type&&x.name===name&&x.balance>0.009);
 if(!pending.length){alert('Tidak ada saldo yang perlu dibayarkan untuk penerima ini.');return}
 const amount=pending.reduce((s,x)=>s+x.balance,0),method=$('paymentMethod').value;
 if(!confirm('Konfirmasi pembayaran '+name+' sebesar '+money(amount)+' untuk periode laporan ini? Catat hanya setelah uang benar-benar dibayarkan.'))return;
 const rowsToInsert=pending.map(x=>({daily_record_id:x.recordId,recipient_type:x.type,recipient_name:x.name,amount:Number(x.balance.toFixed(2)),payment_method:method,paid_by:user.id}));
 const {error}=await db.from('payout_payments').insert(rowsToInsert);
 if(error){alert('Pembayaran gagal dicatat: '+error.message);return}
 await loadData();draw();
}
async function payAllBalances(){
 if(!admin()){alert('Hanya Admin yang dapat mencatat pembayaran.');return}
 const pending=settlementLines(report).filter(x=>x.balance>0.009);
 if(!pending.length){alert('Semua saldo pada periode ini sudah lunas.');return}
 const amount=pending.reduce((s,x)=>s+x.balance,0),method=$('paymentMethod').value;
 if(!confirm('Catat pembayaran SELURUH sisa saldo untuk '+pending.length+' bagian penerima, total '+money(amount)+'? Pastikan seluruh uang sudah benar-benar dibayarkan.'))return;
 const rowsToInsert=pending.map(x=>({daily_record_id:x.recordId,recipient_type:x.type,recipient_name:x.name,amount:Number(x.balance.toFixed(2)),payment_method:method,paid_by:user.id}));
 const {error}=await db.from('payout_payments').insert(rowsToInsert);
 if(error){alert('Pembayaran gagal dicatat: '+error.message);return}
 await loadData();draw();
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
function drawDash(){
 let p=$('dashPeriod').value,dt=today(),a=records.filter(r=>p==='all'||(p==='today'?r.date===dt:r.date.slice(0,7)===dt.slice(0,7))),t=total(a);
 $('dRevenue').textContent=money(t.rev);$('dExpenses').textContent=money(t.exp);$('dNet').textContent=money(t.net);$('dDays').textContent=a.length;
 $('dSunset').textContent=money(t.sun);$('dAdat').textContent=money(t.adat);$('dStaff').textContent=money(t.pool);
 const lines=settlementLines(a),paid=lines.reduce((s,x)=>s+x.paid,0),outstanding=totalBalance(a);
 $('dPaid').textContent=money(paid);$('dOutstanding').textContent=money(outstanding);
 const categoryTotals=expenseCategoryTotals(a);
 $('dashExpenseCategories').innerHTML=categoryTotals.length?categoryTotals.map(x=>'<div class="share"><span>'+esc(x.category)+'</span><b>'+money(x.amount)+'</b></div>').join(''):'<div class="empty">Belum ada biaya pada periode ini.</div>';
 const perStaff=staffEarnings(a);
 $('dashStaffEarnings').innerHTML=perStaff.length?perStaff.map(x=>'<div class="share"><span>'+esc(x.name)+'<small class="muted" style="display:block">'+x.days+' hari bertugas</small></span><b>'+money(x.amount)+'</b></div>').join(''):'<div class="empty">Belum ada petugas tercatat pada periode ini.</div>';
 $('recent').innerHTML=a.length?[...a].sort((x,y)=>y.date.localeCompare(x.date)).slice(0,5).map(r=>'<div class="share"><span>'+esc(r.date)+'<small class="muted" style="display:block">'+esc(r.staff.join(', '))+'</small></span><b>'+money(calc(r).net)+'</b></div>').join(''):'<div class="empty">Belum ada data.</div>';
}
function drawHistory(){
 $('historyRows').innerHTML=records.length?[...records].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+money(r.revenue)+'</td><td>'+money(r.expenses)+'</td><td>'+esc(expenseItemsText(r))+'</td><td>'+money(calc(r).net)+'</td><td>'+esc(r.staff.join(', '))+'</td><td>'+esc(r.note)+'</td><td>'+(admin()?'<button class="danger" onclick="window.delParkingRecord(\''+r.id+'\')">Hapus</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="8" class="empty">Belum ada data.</td></tr>';
}
function drawReport(){
 let from=$('fromDate').value,to=$('toDate').value;report=records.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>a.date.localeCompare(b.date));let t=total(report);
 $('reportSummary').innerHTML=[['Pendapatan',t.rev],['Total Biaya',t.exp],['Net Revenue',t.net],['Sunset Venue 25%',t.sun],['Desa Adat 25%',t.adat],['Petugas 50%',t.pool]].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="value">'+money(x[1])+'</div></div>').join('');
 $('reportRows').innerHTML=report.length?report.map(r=>{let c=calc(r);return'<tr><td>'+r.date+'</td><td>'+money(r.revenue)+'</td><td>'+money(r.expenses)+'</td><td>'+money(c.net)+'</td><td>'+money(c.sunset)+'</td><td>'+money(c.adat)+'</td><td>'+money(c.pool)+'</td><td>'+esc(r.staff.join(', '))+'</td></tr>'}).join(''):'<tr><td colspan="8" class="empty">Tidak ada data pada periode ini.</td></tr>';
 let perCategory=expenseCategoryTotals(report);
 $('reportExpenseRows').innerHTML=perCategory.length?perCategory.map(x=>'<tr><td>'+esc(x.category)+'</td><td>'+money(x.amount)+'</td></tr>').join(''):'<tr><td colspan="2" class="empty">Tidak ada pengeluaran pada periode ini.</td></tr>';
 let perStaff=staffEarnings(report);
 $('reportStaffRows').innerHTML=perStaff.length?perStaff.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.days+'</td><td>'+money(x.amount)+'</td></tr>').join(''):'<tr><td colspan="3" class="empty">Belum ada pembagian petugas pada periode ini.</td></tr>';
 const settlements=settlementRows(report);
 const totalDue=settlements.reduce((s,x)=>s+x.due,0),totalPaid=settlements.reduce((s,x)=>s+x.paid,0),balance=totalBalance(report);
 $('reportSettlementRows').innerHTML=settlements.length?settlements.map(x=>{
  const status=x.balance<=0.009?'Lunas':(x.paid>0?'Belum lunas':'Belum dibayar');
  const action=admin()&&x.balance>0.009?'<button class="secondary payout-one" onclick="window.payParkingRecipient(\''+x.type+'\',\''+esc(x.name)+'\')">Bayar saldo</button>':'—';
  return '<tr><td>'+esc(x.name)+'</td><td>'+money(x.due)+'</td><td>'+money(x.paid)+'</td><td>'+money(Math.max(0,x.balance))+'</td><td>'+status+'</td><td>'+action+'</td></tr>';
 }).join(''):'<tr><td colspan="6" class="empty">Belum ada pembagian pada periode ini.</td></tr>';
 $('settlementSummary').innerHTML=[['Total hak bagi hasil',totalDue],['Sudah dibayar',totalPaid],['Saldo tersisa',balance]].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="value">'+money(x[1])+'</div></div>').join('');
 $('payAllBtn').disabled=balance<=0.009;
 $('payAllBtn').textContent=balance<=0.009?'Semua saldo sudah lunas':'Catat pembayaran semua saldo';
 $('payAllBtn').classList.toggle('hidden',!admin());
 $('paymentMethod').disabled=!admin();
 const reportIds=new Set(report.map(r=>r.id)),recordDates=Object.fromEntries(report.map(r=>[r.id,r.date]));
 const periodPayments=payouts.filter(p=>reportIds.has(p.daily_record_id)).sort((a,b)=>String(b.paid_at).localeCompare(String(a.paid_at)));
 $('reportPaymentRows').innerHTML=periodPayments.length?periodPayments.map(p=>'<tr><td>'+esc(recordDates[p.daily_record_id]||'')+'</td><td>'+esc(p.recipient_name)+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_method||'')+'</td><td>'+new Date(p.paid_at).toLocaleString('id-ID')+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">Belum ada pembayaran tercatat.</td></tr>';
}
function draw(){drawDash();drawHistory();if($('reports').classList.contains('active'))drawReport()}
function page(p){document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===p));document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('pageTitle').textContent=({dashboard:'Dashboard',entry:'Input Harian',reports:'Laporan',history:'Data Historis'})[p];if(p==='reports')drawReport()}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));
window.payParkingRecipient=payRecipient;
$('payAllBtn').onclick=payAllBalances;
function addExpenseRow(category='Jajan',amount='',description='',custom=''){
 const row=document.createElement('div');row.className='expense-row';
 row.innerHTML='<div><label>Kategori</label><select class="expense-kind"><option>Jajan</option><option>Kopi</option><option>Sewa DW</option><option value="__custom">Lainnya</option></select></div><div class="expense-custom hidden"><label>Nama kategori</label><input class="expense-custom-name" type="text" placeholder="Contoh: BBM"></div><div><label>Nominal (Rp)</label><input class="expense-value" type="number" min="0" step="1" placeholder="0"></div><div><label>Keterangan (opsional)</label><input class="expense-note" type="text" placeholder="Catatan"></div><button type="button" class="secondary remove-expense">Hapus</button>';
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
 $('preview').innerHTML='Total biaya: <b>'+money(exp)+'</b> · Net revenue: <b>'+money(net)+'</b><br>Sunset Venue 25%: <b>'+money(net*.25)+'</b> · Desa Adat 25%: <b>'+money(net*.25)+'</b> · Petugas 50%: <b>'+money(pool)+'</b> ('+st.length+' orang'+(st.length?' · '+money(pool/st.length)+' per orang':' · pilih petugas')+')';
}
$('dailyForm').addEventListener('input',preview);
$('dailyForm').addEventListener('change',e=>{if(e.target.classList.contains('expense-kind'))e.target.closest('.expense-row').querySelector('.expense-custom').classList.toggle('hidden',e.target.value!=='__custom');preview()});
$('expenseRows').addEventListener('click',e=>{if(e.target.classList.contains('remove-expense')){e.target.closest('.expense-row').remove();preview()}});
$('addExpense').onclick=()=>addExpenseRow();
$('dailyForm').onsubmit=async e=>{
 e.preventDefault();let expenseItems;try{expenseItems=collectExpenseItems()}catch(err){alert(err.message);return}
 let r={date:$('date').value,revenue:Number($('revenue').value),expenses:expenseItems.reduce((s,x)=>s+x.amount,0),expenseItems,staff:chosen(),note:$('note').value.trim(),source:'manual'};
 if(!r.staff.length){alert('Pilih minimal satu petugas.');return}
 if(!r.date||r.revenue<0){alert('Periksa tanggal dan pendapatan.');return}
 if(records.some(x=>x.date===r.date)&&!confirm('Data tanggal ini sudah ada. Timpa seluruh data tanggal tersebut?'))return;
 try{await saveRecord(r);alert('Data tersimpan ke database online.');$('dailyForm').reset();$('expenseRows').innerHTML='';addExpenseRow();$('date').value=today();preview();page('dashboard');draw()}catch(x){alert('Gagal menyimpan: '+x.message)}
};
$('resetForm').onclick=()=>{$('dailyForm').reset();$('expenseRows').innerHTML='';addExpenseRow();$('date').value=today();preview()};
window.delParkingRecord=async id=>{if(!admin()||!confirm('Hapus data ini?'))return;let {error}=await db.from('daily_records').delete().eq('id',id);if(error){alert(error.message);return}await loadData();draw()};
function pdf(){
 if(!report.length){alert('Tidak ada data laporan.');return null}
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape'}),t=total(report);
 doc.setFontSize(17);doc.text('SUNSET VENUE PARKING',14,16);doc.setFontSize(10);doc.text('Laporan '+report[0].date+' s/d '+report[report.length-1].date,14,23);
 doc.text('Revenue '+money(t.rev)+' | Pengeluaran '+money(t.exp)+' | Net '+money(t.net),14,31);
 doc.text('Sunset 25% '+money(t.sun)+' | Adat 25% '+money(t.adat)+' | Petugas 50% '+money(t.pool),14,37);
 doc.autoTable({startY:44,head:[['Tanggal','Pendapatan','Total biaya','Net','Sunset 25%','Desa Adat 25%','Petugas 50%','Petugas']],body:report.map(r=>{let c=calc(r);return[r.date,money(r.revenue),money(r.expenses),money(c.net),money(c.sunset),money(c.adat),money(c.pool),r.staff.join(', ')]}),styles:{fontSize:8}});
 let costDetails=[];report.forEach(r=>(r.expenseItems||[]).forEach(x=>costDetails.push([r.date,x.category,money(x.amount),x.description||''])));
 if(costDetails.length){doc.addPage();doc.text('Rincian biaya per tanggal',14,16);doc.autoTable({startY:23,head:[['Tanggal','Kategori','Nominal','Keterangan']],body:costDetails,styles:{fontSize:8}});}
 const settlements=settlementRows(report);
 if(settlements.length){
  doc.addPage();doc.text('Status pembayaran bagi hasil',14,16);
  doc.autoTable({startY:23,head:[['Penerima','Hak bagi hasil','Sudah dibayar','Saldo tersisa','Status']],body:settlements.map(x=>[x.name,money(x.due),money(x.paid),money(Math.max(0,x.balance)),x.balance<=0.009?'Lunas':(x.paid>0?'Belum lunas':'Belum dibayar')]),styles:{fontSize:8}});
 }
 const staffTotals=staffEarnings(report);
 if(staffTotals.length){
  doc.addPage();
  doc.text('Rekap pendapatan per petugas',14,16);
  doc.autoTable({startY:23,head:[['Petugas','Hari bertugas','Total pendapatan']],body:staffTotals.map(x=>[x.name,String(x.days),money(x.amount)])});
 }
 const categoryTotals=expenseCategoryTotals(report);
 if(categoryTotals.length){doc.addPage();doc.text('Rekap biaya per kategori',14,16);doc.autoTable({startY:23,head:[['Kategori biaya','Total periode']],body:categoryTotals.map(x=>[x.category,money(x.amount)])});}
 let duties=[];report.forEach(r=>{let c=calc(r);r.staff.forEach(n=>duties.push([r.date,n,money(c.each)]))});
 if(duties.length){doc.addPage();doc.text('Rincian bagian petugas per tanggal',14,16);doc.autoTable({startY:23,head:[['Tanggal','Petugas','Bagian per orang']],body:duties})}
 return doc;
}
$('runReport').onclick=drawReport;$('pdfReport').onclick=()=>{let d=pdf();if(d)d.save('Sunset-Parking-Report.pdf')};
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
$('dashPeriod').onchange=drawDash;$('refreshDash').onclick=async()=>{try{await loadData();draw()}catch(e){alert(e.message)}};
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='Sedang login...';let {error}=await db.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginButton').disabled=false;if(error){$('loginMessage').textContent='Login gagal: '+error.message;return}try{await sessionStart()}catch(x){showLogin('Login berhasil tetapi database belum siap: '+x.message)}};
$('logoutButton').onclick=async()=>{await db.auth.signOut();user=null;profile=null;showLogin('Kamu sudah logout.')};
$('date').value=today();$('fromDate').value=today().slice(0,7)+'-01';$('toDate').value=today();addExpenseRow();preview();
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});
sessionStart().catch(e=>showLogin('Koneksi/database belum siap. Jalankan schema.sql di Supabase dahulu. Detail: '+e.message));
})();