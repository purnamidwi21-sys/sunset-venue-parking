(() => {
const URL='https://dsvdtqypumwjevgtoghr.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzdmR0cXlwdW13amV2Z3RvZ2hyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzczNDUsImV4cCI6MjEwOTQ1MzM0NX0.VoCbLhxttbPPKtNqKaQPC-XQaHg9q48V5vyL0eDpZko';
const db=window.supabase.createClient(URL,KEY), STAFF=['Pak Gangga','Pak Manik','Pak Bayu','Pak Dek Putra','Pak Riki'];
let user=null,profile=null,staffRows=[],records=[],report=[];
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
 const [s,d,j]=await Promise.all([db.from('staff').select('id,full_name').eq('active',true),db.from('daily_records').select('*').order('record_date'),db.from('staff_duty').select('*')]);
 for(const x of [s,d,j])if(x.error)throw x.error;
 staffRows=s.data||[];const names=Object.fromEntries(staffRows.map(x=>[x.id,x.full_name])),duty={};
 (j.data||[]).forEach(x=>{(duty[x.daily_record_id]??=[]).push(names[x.staff_id])});
 records=(d.data||[]).map(x=>({id:x.id,date:x.record_date,revenue:Number(x.total_revenue),expenses:Number(x.total_expenses),note:x.note||'',staff:(duty[x.id]||[]).filter(Boolean),source:x.source}));
 $('staffChecks').innerHTML=STAFF.map((x,i)=>'<label class="stafftag"><input type="checkbox" id="st'+i+'">'+x+'</label>').join('');
}
const chosen=()=>STAFF.filter((x,i)=>$('st'+i)?.checked);
async function saveRecord(r){
 const {data,error}=await db.from('daily_records').upsert({record_date:r.date,total_revenue:r.revenue,total_expenses:r.expenses,note:r.note||'',source:r.source||'manual',created_by:user.id,updated_at:new Date().toISOString()},{onConflict:'record_date'}).select('id').single();
 if(error)throw error;
 const id=data.id,{error:de}=await db.from('staff_duty').delete().eq('daily_record_id',id);if(de)throw de;
 const ids=(r.staff||[]).map(n=>staffRows.find(x=>x.full_name===n)?.id).filter(Boolean);
 if(ids.length){const {error:ie}=await db.from('staff_duty').insert(ids.map(staff_id=>({daily_record_id:id,staff_id})));if(ie)throw ie}
 await loadData();
}
function total(a){return a.reduce((t,r)=>{let c=calc(r);t.rev+=r.revenue;t.exp+=r.expenses;t.net+=c.net;t.sun+=c.sunset;t.adat+=c.adat;t.pool+=c.pool;return t},{rev:0,exp:0,net:0,sun:0,adat:0,pool:0})}
function drawDash(){
 let p=$('dashPeriod').value,dt=today(),a=records.filter(r=>p==='all'||(p==='today'?r.date===dt:r.date.slice(0,7)===dt.slice(0,7))),t=total(a);
 $('dRevenue').textContent=money(t.rev);$('dExpenses').textContent=money(t.exp);$('dNet').textContent=money(t.net);$('dDays').textContent=a.length;
 $('dSunset').textContent=money(t.sun);$('dAdat').textContent=money(t.adat);$('dStaff').textContent=money(t.pool);
 $('recent').innerHTML=a.length?[...a].sort((x,y)=>y.date.localeCompare(x.date)).slice(0,5).map(r=>'<div class="share"><span>'+esc(r.date)+'<small class="muted" style="display:block">'+esc(r.staff.join(', '))+'</small></span><b>'+money(calc(r).net)+'</b></div>').join(''):'<div class="empty">Belum ada data.</div>';
}
function drawHistory(){
 $('historyRows').innerHTML=records.length?[...records].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+money(r.revenue)+'</td><td>'+money(r.expenses)+'</td><td>'+money(calc(r).net)+'</td><td>'+esc(r.staff.join(', '))+'</td><td>'+esc(r.note)+'</td><td>'+(admin()?'<button class="danger" onclick="window.delParkingRecord(\''+r.id+'\')">Hapus</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="7" class="empty">Belum ada data.</td></tr>';
}
function drawReport(){
 let from=$('fromDate').value,to=$('toDate').value;report=records.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>a.date.localeCompare(b.date));let t=total(report);
 $('reportSummary').innerHTML=[['Revenue',t.rev],['Pengeluaran',t.exp],['Net Revenue',t.net],['Bagian Petugas',t.pool]].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="value">'+money(x[1])+'</div></div>').join('');
 $('reportRows').innerHTML=report.length?report.map(r=>{let c=calc(r);return'<tr><td>'+r.date+'</td><td>'+money(r.revenue)+'</td><td>'+money(r.expenses)+'</td><td>'+money(c.net)+'</td><td>'+money(c.sunset)+'</td><td>'+money(c.adat)+'</td><td>'+money(c.pool)+'</td><td>'+esc(r.staff.join(', '))+'</td></tr>'}).join(''):'<tr><td colspan="8" class="empty">Tidak ada data pada periode ini.</td></tr>';
}
function draw(){drawDash();drawHistory();if($('reports').classList.contains('active'))drawReport()}
function page(p){document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===p));document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('pageTitle').textContent=({dashboard:'Dashboard',entry:'Input Harian',reports:'Laporan',history:'Data Historis'})[p];if(p==='reports')drawReport()}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));
function preview(){let rev=+$('revenue').value||0,exp=+$('expenses').value||0,st=chosen(),net=rev-exp,pool=net*.5;$('preview').innerHTML='Net: <b>'+money(net)+'</b> · Sunset 25%: <b>'+money(net*.25)+'</b> · Adat 25%: <b>'+money(net*.25)+'</b> · Petugas 50%: <b>'+money(pool)+'</b> ('+st.length+' orang'+(st.length?' · '+money(pool/st.length)+' per orang':' · pilih petugas')+')'}
$('dailyForm').addEventListener('input',preview);$('dailyForm').addEventListener('change',preview);
$('dailyForm').onsubmit=async e=>{e.preventDefault();let r={date:$('date').value,revenue:+$('revenue').value,expenses:+$('expenses').value,staff:chosen(),note:$('note').value.trim(),source:'manual'};if(!r.staff.length){alert('Pilih minimal satu petugas.');return}if(!r.date||r.revenue<0||r.expenses<0){alert('Periksa tanggal dan nominal.');return}if(records.some(x=>x.date===r.date)&&!confirm('Data tanggal ini sudah ada. Timpa?'))return;try{await saveRecord(r);alert('Data tersimpan ke database online.');$('dailyForm').reset();$('date').value=today();$('expenses').value=0;preview();page('dashboard');draw()}catch(x){alert('Gagal menyimpan: '+x.message)}};
$('resetForm').onclick=()=>{$('dailyForm').reset();$('date').value=today();$('expenses').value=0;preview()};
window.delParkingRecord=async id=>{if(!admin()||!confirm('Hapus data ini?'))return;let {error}=await db.from('daily_records').delete().eq('id',id);if(error){alert(error.message);return}await loadData();draw()};
function pdf(){
 if(!report.length){alert('Tidak ada data laporan.');return null}
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape'}),t=total(report);
 doc.setFontSize(17);doc.text('SUNSET VENUE PARKING',14,16);doc.setFontSize(10);doc.text('Laporan '+report[0].date+' s/d '+report[report.length-1].date,14,23);
 doc.text('Revenue '+money(t.rev)+' | Pengeluaran '+money(t.exp)+' | Net '+money(t.net),14,31);
 doc.text('Sunset 25% '+money(t.sun)+' | Adat 25% '+money(t.adat)+' | Petugas 50% '+money(t.pool),14,37);
 doc.autoTable({startY:44,head:[['Tanggal','Revenue','Pengeluaran','Net','Sunset 25%','Adat 25%','Petugas 50%','Petugas']],body:report.map(r=>{let c=calc(r);return[r.date,money(r.revenue),money(r.expenses),money(c.net),money(c.sunset),money(c.adat),money(c.pool),r.staff.join(', ')]}),styles:{fontSize:8}});
 let duties=[];report.forEach(r=>{let c=calc(r);r.staff.forEach(n=>duties.push([r.date,n,money(c.each)]))});
 if(duties.length){doc.addPage();doc.text('Rincian bagian petugas',14,16);doc.autoTable({startY:23,head:[['Tanggal','Petugas','Bagian per orang']],body:duties})}
 return doc;
}
$('runReport').onclick=drawReport;$('pdfReport').onclick=()=>{let d=pdf();if(d)d.save('Sunset-Parking-Report.pdf')};
$('waReport').onclick=async()=>{let d=pdf();if(!d)return;let file=new File([d.output('blob')],'Sunset-Parking-Report.pdf',{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Laporan Sunset Venue Parking'});return}catch(e){if(e.name==='AbortError')return}}d.save('Sunset-Parking-Report.pdf');window.open('https://wa.me/?text='+encodeURIComponent('Laporan Sunset Venue Parking. PDF sudah diunduh, silakan lampirkan file PDF di WhatsApp.'),'_blank')};
function dateParse(v){if(v instanceof Date)return [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-');if(typeof v==='number'){let d=XLSX.SSF.parse_date_code(v);if(d)return[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-')}let s=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;let p=s.split(/[\/.-]/);if(p.length===3)return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');return''}
$('importExcel').onclick=async()=>{
 if(!admin()){alert('Khusus Admin.');return}let f=$('excelFile').files[0];if(!f){alert('Pilih file Excel/CSV.');return}
 try{let wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}),added=0,updated=0,skipped=0;
 for(let row of rows){let o={};Object.keys(row).forEach(k=>o[k.toLowerCase().replace(/[^a-z]/g,'')]=row[k]);let date=dateParse(o.tanggal??o.date??o.tgl),rev=Number(String(o.revenue??o.totalrevenue??o.pendapatan??'').replace(/[^0-9.-]/g,'')),exp=Number(String(o.pengeluaran??o.expenses??o.totalpengeluaran??0).replace(/[^0-9.-]/g,''));if(!date||!Number.isFinite(rev)||!Number.isFinite(exp)||rev<0||exp<0){skipped++;continue}let names=String(o.petugas??o.staff??'').split(/[,;|]/).map(x=>x.trim()).filter(x=>STAFF.includes(x));let exists=records.some(x=>x.date===date);try{await saveRecord({date,revenue:rev,expenses:exp,staff:names,note:String(o.catatan??o.note??''),source:'excel_import'});if(exists)updated++;else added++}catch(e){skipped++}}
 await db.from('import_history').insert({file_name:f.name,rows_read:rows.length,rows_added:added,rows_updated:updated,rows_skipped:skipped,imported_by:user.id});
 $('importMessage').textContent='Import selesai: '+added+' baru, '+updated+' diperbarui, '+skipped+' dilewati.';draw();
 }catch(e){$('importMessage').textContent='Import gagal: '+e.message}
};
$('exportExcel').onclick=()=>{let rows=records.map(r=>({Tanggal:r.date,Revenue:r.revenue,Pengeluaran:r.expenses,Petugas:r.staff.join(', '),Catatan:r.note}));let w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(rows),'Parking Records');XLSX.writeFile(w,'Sunset-Parking-Backup.xlsx')};
$('dashPeriod').onchange=drawDash;$('refreshDash').onclick=async()=>{try{await loadData();draw()}catch(e){alert(e.message)}};
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='Sedang login...';let {error}=await db.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginButton').disabled=false;if(error){$('loginMessage').textContent='Login gagal: '+error.message;return}try{await sessionStart()}catch(x){showLogin('Login berhasil tetapi database belum siap: '+x.message)}};
$('logoutButton').onclick=async()=>{await db.auth.signOut();user=null;profile=null;showLogin('Kamu sudah logout.')};
$('date').value=today();$('fromDate').value=today().slice(0,7)+'-01';$('toDate').value=today();preview();
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});
sessionStart().catch(e=>showLogin('Koneksi/database belum siap. Jalankan schema.sql di Supabase dahulu. Detail: '+e.message));
})();