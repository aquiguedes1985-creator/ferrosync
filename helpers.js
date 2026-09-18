function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function valor(id) { return document.getElementById(id).value; }
function valorUsuario() { return document.getElementById('user-name').textContent; }
function fechasPlan() { return {salida:Date.parse(valor('d-f-ini')+'T'+valor('d-h-ini')),llegada:Date.parse(valor('d-f-fin')+'T'+valor('d-h-fin'))}; }
function ponerFecha(suffix,iso) { const d=iso?new Date(iso):null;const local=d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString():'';document.getElementById('d-f-'+suffix).value=local.slice(0,10);document.getElementById('d-h-'+suffix).value=local.slice(11,16); }
function leerTramos() {
  return [...document.querySelectorAll('#tramos-lista > div')].map((el,i)=>{
    const n=el.id.replace('tramo-',''),lk=valor('tl-linea-'+n);
    if(!COMPANY_PROFILES[currentCompany].lines.includes(lk)) return null;
    const o=LINES[lk].estaciones[Number(valor('tl-ori-'+n))],d=LINES[lk].estaciones[Number(valor('tl-dst-'+n))];
    if(!o||!d)return null;
    return {id:i+1,lineaId:lk,linea:LINES[lk].name,reglamento:LINES[lk].reglamento,oName:o.n,oKm:o.km,dName:d.n,dKm:d.km,dist:Number(Math.abs(d.km-o.km).toFixed(3)),combInicio:null,combFin:null,obs:'',estado:'Pendiente'};
  });
}
function limpiarPlanificacion() { trenEditando=null;for(const id of ['d-id','d-desc','d-f-ini','d-h-ini','d-f-fin','d-h-fin'])document.getElementById(id).value='';document.getElementById('tramos-lista').replaceChildren();tramoCount=0;addTramo();actualizarDropdowns();document.getElementById('error-despacho').style.display='none'; }
function esConductor() { return rolActual==='Maquinista'&&miTren&&currTramo&&miTren.empresa===currentCompany&&miTren.conductor===valorUsuario(); }
function detenerSeguimiento() { clearInterval(timerInt);timerInt=null;if(gpsWatchId!==null)navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null; }
function activarGPS() {
  if(gpsWatchId!==null)return;
  const label=document.getElementById('gps-status');
  if(!navigator.geolocation){label.textContent='GPS no disponible';return;}
  label.textContent='Esperando ubicación y permiso GPS';
  const company=currentCompany,plan=miTren.nroPlan;
  gpsWatchId=navigator.geolocation.watchPosition(async position=>{
    if(!esConductor()||miTren.nroPlan!==plan||currentCompany!==company||currTramo.estado!=='En Curso')return;
    label.textContent='Ubicación GPS recibida (almacenada en este navegador)';
    miTren.coordsActuales={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,at:new Date(position.timestamp).toISOString()};
    try { await guardarEstado(); } catch(error) { label.textContent=error.message; }
  },error=>{label.textContent=error.code===1?'Permiso GPS denegado; registro manual disponible':'Sin señal GPS; registro manual disponible';},{enableHighAccuracy:true,timeout:10000,maximumAge:10000});
}
async function generarClave(pass,salt) {
  const bytes=salt?Uint8Array.from(atob(salt),c=>c.charCodeAt(0)):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);
  const hash=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations:210000},key,256);
  return {salt:btoa(String.fromCharCode(...bytes)),hash:btoa(String.fromCharCode(...new Uint8Array(hash)))};
}
async function verificarClave(user,pass) {
  if(user.hash) return (await generarClave(pass,user.salt)).hash===user.hash;
  if(user.pass!==pass)return false;
  Object.assign(user,await generarClave(pass));delete user.pass;await guardarEstado();return true;
}
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-edit],[data-cancel],[data-loco]');if(!el)return;
  if(el.dataset.edit)editarTren(el.dataset.edit);
  if(el.dataset.cancel)cancelarTren(el.dataset.cancel);
  if(el.dataset.loco)toggleEstadoLocomotora(el.dataset.loco);
});
window.addEventListener('unhandledrejection',event=>{event.preventDefault();alert(event.reason?.message||'No se pudo completar la operación.');});
window.addEventListener('pagehide',detenerSeguimiento);
window.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.input-group').forEach(group=>{const input=group.querySelector('input,select,textarea'),label=group.querySelector('label');if(input?.id&&label)label.htmlFor=input.id;});
  document.querySelectorAll('.role-card,.nav-item,.auth-switch').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});});
  for(const id of ['reg-error','login-error','error-despacho'])document.getElementById(id).setAttribute('role','alert');
  for(const id of ['login-name','login-pass'])document.getElementById(id).addEventListener('keydown',e=>{if(e.key==='Enter')iniciarSesion();});
  // Serialize state-changing UI operations so double clicks cannot duplicate transactions.
  for(const name of ['registrarUsuario','iniciarSesion','registrarDespacho','registrarLocomotora','toggleEstadoLocomotora','cancelarTren','iniciarTramo','finalizarTramo','confirmCompany']) {
    const original=window[name];let busy=false;
    window[name]=async(...args)=>{if(busy)return;busy=true;try{return await original(...args);}finally{busy=false;}};
  }
});
