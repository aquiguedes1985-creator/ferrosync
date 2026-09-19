// Extensión de colaboración. El servidor nunca utiliza el rol declarado por el navegador.
let serverMode=false,serverUser=null,serverRevision=0,syncBusy=false,syncTimer;
const localSave=guardarEstado,localLoad=cargarEstado,localInit=iniciarApp,localLogin=iniciarSesion,localLogout=cerrarSesion,localRegister=registrarUsuario;
function syncStatus(text){document.querySelector('.local-notice').textContent=text;}
async function api(action,body){
  const response=await fetch('./api/sync?action='+action,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Error del servidor.'),{status:response.status});return data;
}
function useSnapshot(data){
  serverRevision=data.revision;usuariosBD=data.users;trenesActivos=data.state.trains;historial=data.state.history;locomotoras=data.state.locomotives;personal=data.state.crew;
  syncStatus('Sincronizado con el servidor · '+new Date().toLocaleTimeString('es-UY'));
}
function stateSnapshot(){return structuredClone({trains:trenesActivos.filter(t=>t.empresa===currentCompany),history:historial.filter(t=>t.empresa===currentCompany),locomotives:locomotoras.filter(t=>t.empresa===currentCompany),crew:personal.filter(t=>t.empresa===currentCompany)});}
cargarEstado=async function(){if(!serverMode)return localLoad();if(serverUser)useSnapshot(await api('state'));};
guardarEstado=async function(broadcast=true){
  if(!serverMode)return localSave(broadcast);
  if(!serverUser)return;
  if(syncBusy)throw Error('Esperá a que termine la sincronización.');
  syncBusy=true;
  try{useSnapshot(await api('state',{revision:serverRevision,state:stateSnapshot()}));}
  catch(e){try{useSnapshot(await api('state'));refrescarUI();}catch{}syncStatus('No se guardó el cambio: '+e.message);throw e;}finally{syncBusy=false;}
};
iniciarApp=async function(){
  await localInit();
  try{const status=await api('status');serverMode=status.mode==='server';}
  catch(e){if(location.hostname!=='localhost'&&location.hostname!=='127.0.0.1'&&!location.hostname.endsWith('github.io')){serverMode=true;syncStatus('Servidor no disponible. No se puede iniciar sesión.');}}
  if(serverMode){syncStatus('Servidor compartido · Ingresá con una cuenta autorizada');document.querySelector('#form-login .auth-switch').textContent='Las cuentas las habilita Administración';}
  installOperationsUI();
};
registrarUsuario=async function(){if(serverMode)return alert('Solicitá una cuenta a Administración.');return localRegister();};
iniciarSesion=async function(){
  if(!serverMode){await localLogin();renderTools();return;}
  try{
    const data=await api('login',{name:valor('login-name'),pass:valor('login-pass'),empresa:currentCompany});serverUser=data.user;useSnapshot(data);
    rolActual=serverUser.role==='Administrador'?'Logística':serverUser.role;
    for(const [id,text]of Object.entries({'user-name':serverUser.name,'user-role':serverUser.role,'user-initial':serverUser.name[0],'sidebar-company-name':COMPANY_PROFILES[currentCompany].name}))document.getElementById(id).textContent=text;
    document.getElementById('company-screen').style.display='none';document.getElementById('auth-screen').style.display='none';document.getElementById('main-app').style.display='grid';document.getElementById('login-pass').value='';
    const section=rolActual==='Logística'?'logistica':'maquinista';document.getElementById('nav-'+section).style.display='block';nav(rolActual==='Logística'?'dashboard':'operacion',document.querySelector('#nav-'+section+' .nav-item'));if(rolActual==='Logística'&&!tramoCount)addTramo();refrescarUI();renderTools();
    clearInterval(syncTimer);syncTimer=setInterval(syncNow,5000);
  }catch(e){const el=document.getElementById('login-error');el.textContent=e.message;el.style.display='block';}
};
async function syncNow(){if(!serverMode||!serverUser||syncBusy)return;syncBusy=true;try{const data=await api('state');if(data.revision!==serverRevision){useSnapshot(data);refrescarUI();}else syncStatus('Sincronizado con el servidor · '+new Date().toLocaleTimeString('es-UY'));}catch(e){syncStatus('Sin conexión: los cambios requieren confirmación del servidor.');if(e.status===401){serverUser=null;clearInterval(syncTimer);localLogout();renderTools();}}finally{syncBusy=false;}}
cerrarSesion=async function(){if(serverMode&&serverUser){await api('logout',{});serverUser=null;clearInterval(syncTimer);trenesActivos=[];historial=[];usuariosBD=[];locomotoras=[];personal=[];}localLogout();renderTools();};
async function command(body){
  if(syncBusy)throw Error('Esperá a que termine la sincronización.');syncBusy=true;
  try{useSnapshot(await api('operate',{...body,revision:serverRevision}));refrescarUI();}
  catch(e){try{useSnapshot(await api('state'));refrescarUI();}catch{}throw e;}finally{syncBusy=false;}
}
const localStart=iniciarTramo,localFinish=finalizarTramo;
iniciarTramo=async function(){if(!serverMode)return localStart();if(miTren)await command({action:'start',plan:miTren.nroPlan,fuel:valor('maq-comb-inicio'),texto:valor('maq-obs-inicio')});};
finalizarTramo=async function(){if(!serverMode)return localFinish();if(miTren)await command({action:'finish',plan:miTren.nroPlan,fuel:valor('maq-comb-fin'),texto:valor('maq-obs')});};
const localGPS=activarGPS;
activarGPS=function(){if(!serverMode)return localGPS();if(gpsWatchId!==null||!esConductor())return;gpsWatchId=navigator.geolocation.watchPosition(async p=>{if(syncBusy||!esConductor())return;try{await command({action:'gps',plan:miTren.nroPlan,lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy});document.getElementById('gps-status').textContent='Ubicación compartida con Logística';}catch(e){document.getElementById('gps-status').textContent=e.message;}},()=>{document.getElementById('gps-status').textContent='GPS no disponible; registro manual habilitado';},{enableHighAccuracy:true,maximumAge:30000,timeout:10000});};
function pending(t){return (t.observaciones||[]).some(o=>o.categoria&&o.categoria!=='Informativa'&&o.estado!=='Resuelto');}
function incidentFields(prefix){return `<div class="collab-grid"><label>Categoría<select id="${prefix}-categoria">${['Informativa','Mecánica','Vía','Carga','Seguridad','Operación'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Gravedad<select id="${prefix}-gravedad"><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></label><label>Responsable<input id="${prefix}-responsable" maxlength="80"></label></div>`;}
function incidentInput(prefix){return {categoria:valor(prefix+'-categoria'),gravedad:valor(prefix+'-gravedad'),responsable:valor(prefix+'-responsable')};}
const oldAddNote=agregarNovedad;
agregarNovedad=function(t,texto,fase){oldAddNote(t,texto,fase);if(texto.trim())Object.assign(t.observaciones.at(-1),{categoria:'Informativa',gravedad:'Baja',responsable:'',estado:'Informativa',cambios:[]});};
guardarNovedad=async function(id,inputId){
  if(guardandoNovedad)return false;const t=trenesActivos.find(t=>t.nroPlan===id&&t.empresa===currentCompany);if(!puedeAnotar(t))return false;
  const texto=valor(inputId).trim();if(!texto)return alert('Ingresá una observación.');guardandoNovedad=true;
  try{const input=incidentInput(inputId);if(serverMode)await command({action:'note',plan:id,texto,...input});else {agregarNovedad(t,texto,'Durante la operación');Object.assign(t.observaciones.at(-1),input,{estado:input.categoria==='Informativa'?'Informativa':'Pendiente'});await guardarEstado();refrescarUI();}document.getElementById(inputId).value='';return true;}finally{guardandoNovedad=false;}
};
listaNovedades=function(t){return (t.observaciones||[]).map(o=>`<li><strong>${esc(o.categoria||'Informativa')} · ${esc(o.estado||'Informativa')} · ${esc(o.autor)}</strong><br>${o.fecha?esc(new Date(o.fecha).toLocaleString('es-UY')):'Fecha no registrada'} · Tramo ${esc(o.tramo)} · ${esc(o.gravedad||'Baja')} · Responsable: ${esc(o.responsable||'Sin asignar')}<p class="texto-observacion">${esc(o.texto)}</p>${o.categoria&&o.categoria!=='Informativa'?`<button class="btn btn-outline" data-incident="${esc(o.id)}" data-plan="${esc(t.nroPlan)}">Actualizar seguimiento</button>`:''}${(o.cambios||[]).map(c=>`<small>${esc(c.fecha)} · ${esc(c.autor)} · ${esc(c.estado)} · ${esc(c.responsable)}</small>`).join('<br>')}</li>`).join('')||'<li>Sin observaciones registradas.</li>';};
renderNovedadesOperacion=function(){document.getElementById('maq-novedades').innerHTML=`<h3>${esc(miTren.estado)}${pending(miTren)?' · Imprevistos pendientes':''}</h3><ul>${listaNovedades(miTren)}</ul>`;};
const oldDash=renderDash;
renderDash=function(){oldDash();document.getElementById('kpi-obs').textContent=trenesActivos.filter(t=>t.empresa===currentCompany&&pending(t)).length;};
abrirObservados=function(){const ids=new Set([...trenesActivos,...historial].filter(t=>t.empresa===currentCompany).map(t=>t.nroPlan));const trips=[...ids].map(obtenerViaje).filter(t=>t&&pending(t));document.getElementById('detalle-contenido').innerHTML='<h2>Imprevistos pendientes</h2>'+ (trips.map(t=>`<h3>${esc(t.nroPlan)}</h3><ul>${listaNovedades(t)}</ul><button class="btn btn-outline" data-detalle="${esc(t.nroPlan)}">Detalle / PDF</button>`).join('')||'<p>Sin imprevistos pendientes.</p>');document.getElementById('detalle-viaje').showModal();};
const baseReport=informeViaje;
function formationReport(t){return `<h3>Formación por vagón</h3>${t.vagones?`<div class="table-responsive"><table class="data-table"><thead><tr><th>Matrícula / carga</th><th>Tara (t)</th><th>Neto (t)</th><th>Bruto (t)</th><th>Alta / baja desde tramo</th></tr></thead><tbody>${t.vagones.map(v=>`<tr><td>${esc(v.matricula)}<br>${esc(v.carga)}</td><td>${esc(v.tara)}</td><td>${esc(v.neto)}</td><td>${esc(v.bruto)}</td><td>${Number(v.alta)+1} / ${v.baja===null?'—':Number(v.baja)+1}</td></tr>`).join('')}</tbody></table></div>`:'<p>Sin desglose. El tonelaje es el total declarado.</p>'}`;}
informeViaje=function(t){return baseReport(t).replace('No hay desglose de peso por vagón registrado.','El peso bruto incluye tara y carga; el neto corresponde solo a la carga.')+formationReport(t);};
const baseDetail=abrirDetalle;
abrirDetalle=function(id){baseDetail(id);const t=obtenerViaje(id);if(!t||t.cerrado)return;document.getElementById('detalle-observacion').insertAdjacentHTML('afterend',incidentFields('detalle-observacion'));document.getElementById('detalle-contenido').insertAdjacentHTML('beforeend',`<h3>Actualizar formación</h3><p>El primer vagón sustituye el tonelaje total declarado por la suma de pesos brutos de la formación registrada.</p><div class="collab-grid"><label>Desde el tramo<select id="v-tramo">${t.tramos.map((s,i)=>s.estado==='Pendiente'?`<option value="${i}">${i+1}: ${esc(s.oName)} → ${esc(s.dName)}</option>`:'').join('')}</select></label><label>Matrícula<input id="v-matricula" maxlength="40"></label><label>Carga<input id="v-carga" maxlength="300"></label><label>Tara (t)<input id="v-tara" type="number" min="0.001" step="0.001"></label><label>Peso neto (t)<input id="v-neto" type="number" min="0" step="0.001"></label></div><button class="btn btn-outline" onclick="addWagon()">Dar de alta vagón</button><label>Vagón a retirar<select id="v-baja">${(t.vagones||[]).filter(v=>v.baja===null).map(v=>`<option value="${esc(v.id)}">${esc(v.matricula)}</option>`).join('')}</select></label><label>Motivo de baja<input id="v-motivo" maxlength="500"></label><button class="btn btn-outline" onclick="removeWagon()">Dar de baja vagón</button>`);};
function recalcWagons(t){for(let i=0;i<t.tramos.length;i++){const list=t.vagones.filter(v=>v.alta<=i&&(v.baja===null||v.baja>i));t.tramos[i].ton=Math.round(list.reduce((a,v)=>a+v.bruto,0)*1000)/1000;t.tramos[i].neto=Math.round(list.reduce((a,v)=>a+v.neto,0)*1000)/1000;}t.ton=t.tramos[t.tramoActualIdx]?.ton||0;}
async function wagonCommand(body){
  if(serverMode)await command({...body,plan:detalleActual});
  else {
    const t=trenesActivos.find(t=>t.nroPlan===detalleActual&&t.empresa===currentCompany);if(!puedeAnotar(t))throw Error('Sin permiso.');const before=structuredClone(t),i=Number(body.tramo);
    if(!Number.isInteger(i)||i<t.tramoActualIdx||t.tramos[i]?.estado!=='Pendiente')throw Error('Elegí un tramo pendiente.');
    try{if(body.action==='wagon-add'){const tara=Number(body.tara),neto=Number(body.neto),matricula=body.matricula.trim().toUpperCase();if(!matricula||body.tara===''||body.neto===''||!Number.isFinite(tara)||tara<=0||!Number.isFinite(neto)||neto<0)throw Error('Completá la matrícula y los pesos.');if((t.vagones||[]).some(v=>v.matricula===matricula&&(v.baja===null||v.baja>i)))throw Error('El vagón ya está en la formación.');(t.vagones ||= []).push({id:crypto.randomUUID(),matricula,carga:body.carga,tara,neto,bruto:Math.round((tara+neto)*1000)/1000,alta:i,baja:null});agregarNovedad(t,`Alta del vagón ${matricula} desde el tramo ${i+1}.`,'Formación');}
    else{const v=t.vagones?.find(v=>v.id===body.id);if(!v||v.alta>i||v.baja!==null)throw Error('Vagón no activo.');v.baja=i;agregarNovedad(t,`Baja del vagón ${v.matricula} desde el tramo ${i+1}. ${body.motivo}`,'Formación');}
    recalcWagons(t);const loco=locomotoras.find(l=>l.id===t.locoId&&l.empresa===currentCompany);if(t.tramos.some(s=>s.ton>loco.maxArrastre))throw Error('La formación supera el arrastre permitido.');await guardarEstado();}catch(e){Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,before);throw e;}
  }
  refrescarUI();abrirDetalle(detalleActual);
}
async function addWagon(){await wagonCommand({action:'wagon-add',tramo:Number(valor('v-tramo')),matricula:valor('v-matricula'),carga:valor('v-carga'),tara:valor('v-tara'),neto:valor('v-neto')});}
async function removeWagon(){await wagonCommand({action:'wagon-remove',tramo:Number(valor('v-tramo')),id:valor('v-baja'),motivo:valor('v-motivo')});}
async function updateIncident(plan,id){
  const t=trenesActivos.find(t=>t.nroPlan===plan&&t.empresa===currentCompany)||obtenerViaje(plan),o=t?.observaciones?.find(o=>o.id===id);if(!puedeAnotar(t)||!o)return;
  const estado=prompt('Estado: Pendiente, En atención o Resuelto',o.estado);if(estado===null)return;if(!['Pendiente','En atención','Resuelto'].includes(estado))throw Error('Estado inválido.');const responsable=prompt('Responsable',o.responsable||'');if(responsable===null)return;
  if(serverMode)await command({action:'incident',plan,id,estado,responsable});else{(o.cambios ||= []).push({autor:valorUsuario(),fecha:new Date().toISOString(),anterior:o.estado,estado,responsable});o.estado=estado;o.responsable=responsable;await guardarEstado();refrescarUI();}
  if(document.getElementById('detalle-viaje').open)abrirDetalle(plan);
}
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function serverBackups(){const list=await api('backups');document.getElementById('detalle-contenido').innerHTML='<h2>Copias del servidor</h2>'+list.map(b=>`<p>${esc(new Date(b.at).toLocaleString('es-UY'))} · ${esc(b.reason)} <button class="btn btn-outline" data-restore="${esc(b.id)}">Restaurar esta copia</button></p>`).join('');document.getElementById('detalle-viaje').showModal();}
async function exportBackup(){const data=serverMode?await api('backup'):{format:'ferrosync-local-backup',version:1,at:new Date().toISOString(),users:usuariosBD,locomotives:locomotoras,crew:personal,trains:trenesActivos,history:historial};downloadJSON(data,'FerroSync-respaldo-'+new Date().toISOString().slice(0,10)+'.json');}
async function importBackup(file){
 if(!file)return;if(file.size>2e6)throw Error('El respaldo supera 2 MB.');let data;try{data=JSON.parse(await file.text());}catch{throw Error('El archivo no es JSON válido.');}
 if(serverMode){if(data.format!=='ferrosync-backup'||data.version!==1||data.company!==currentCompany)throw Error('Respaldo incompatible o de otra empresa.');if(!confirm('Se reemplazarán los datos operativos de esta empresa. Se guardará una copia previa. ¿Continuar?'))return;useSnapshot(await api('restore',{revision:serverRevision,backup:data}));refrescarUI();return;}
 if(data.format!=='ferrosync-local-backup'||data.version!==1||!['users','locomotives','crew','trains','history'].every(k=>Array.isArray(data[k])))throw Error('Respaldo local incompatible.');
 for(const k of ['users','locomotives','crew','trains','history'])for(const row of data[k])if(!COMPANY_PROFILES[row.empresa])throw Error('Empresa inválida en el archivo.');
 if(!confirm('Se reemplazarán todos los datos locales. Primero se descargará un respaldo del estado actual. ¿Continuar?'))return;
 await exportBackup();usuariosBD=data.users;locomotoras=data.locomotives;personal=data.crew;trenesActivos=data.trains;historial=data.history;await guardarEstado();cerrarSesion();
}
function renderTools(){const el=document.getElementById('collab-tools');if(!el)return;const allowed=serverMode?serverUser?.role==='Administrador':rolActual==='Logística';el.hidden=!allowed;document.getElementById('admin-button').hidden=!serverMode||!allowed;document.getElementById('server-backups-button').hidden=!serverMode||!allowed;}
async function adminPanel(){const data=await api('admin');document.getElementById('detalle-contenido').innerHTML=`<h2>Administración</h2><h3>Empresas</h3>${data.companies.map(c=>`<p>${esc(c.id)}: ${c.enabled?'Habilitada':'Deshabilitada'}</p>`).join('')}<label>Empresa<select id="admin-company">${Object.keys(COMPANY_PROFILES).map(id=>`<option>${id}</option>`).join('')}</select></label><button class="btn btn-outline" onclick="adminCompany(true)">Habilitar empresa</button><button class="btn btn-outline" onclick="adminCompany(false)">Deshabilitar empresa</button><h3>Usuarios</h3>${data.users.map(u=>`<p>${esc(u.name)} · ${esc(u.empresa)} · ${esc(u.role)} · ${u.enabled?'Habilitado':'Deshabilitado'} <button class="btn btn-outline" data-account="${esc(u.id)}">Editar permisos</button></p>`).join('')}<input id="admin-id" type="hidden"><div class="collab-grid"><label>Nombre<input id="admin-name" maxlength="80"></label><label>Contraseña inicial o nueva<input id="admin-pass" type="password" autocomplete="new-password" minlength="12"></label><label>Rol<select id="admin-role"><option>Maquinista</option><option>Logística</option><option>Administrador</option></select></label><label>Habilitado<input id="admin-enabled" type="checkbox" checked></label></div><button class="btn btn-primary" onclick="adminSave()">Guardar cuenta</button><p>Las cuentas existentes conservan nombre y empresa. Una contraseña vacía conserva la actual.</p>`;window.adminAccounts=data.users;document.getElementById('detalle-viaje').showModal();}
async function adminCompany(enabled){await api('admin',{operation:'company',empresa:valor('admin-company'),enabled});await adminPanel();}
async function adminSave(){await api('admin',{operation:'user',id:valor('admin-id'),name:valor('admin-name'),pass:valor('admin-pass'),empresa:valor('admin-company'),role:valor('admin-role'),enabled:document.getElementById('admin-enabled').checked});await adminPanel();}
function installOperationsUI(){
 document.getElementById('maq-novedad').insertAdjacentHTML('afterend',incidentFields('maq-novedad'));
 document.getElementById('main-content').insertAdjacentHTML('afterbegin','<div id="collab-tools" hidden><button class="btn btn-outline" onclick="exportBackup()">Exportar respaldo completo</button><label class="btn btn-outline">Restaurar respaldo<input id="backup-file" type="file" accept=".json" hidden></label><button id="admin-button" class="btn btn-outline" onclick="adminPanel()">Administración</button></div>');
 document.getElementById('backup-file').addEventListener('change',async e=>{try{await importBackup(e.target.files[0]);}finally{e.target.value='';}});
 document.getElementById('admin-button').insertAdjacentHTML('afterend','<button id="server-backups-button" class="btn btn-outline" hidden onclick="serverBackups()">Copias automáticas</button>');
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-restore]');if(!b)return;if(!confirm('¿Restaurar esta copia? Se guardará una copia del estado actual y se revocarán las demás sesiones de esta empresa.'))return;useSnapshot(await api('restore',{revision:serverRevision,id:b.dataset.restore}));refrescarUI();document.getElementById('detalle-viaje').close();});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-incident],[data-account]');if(!b)return;if(b.dataset.incident)await updateIncident(b.dataset.plan,b.dataset.incident);else {const u=window.adminAccounts.find(u=>u.id===b.dataset.account);for(const [id,v]of Object.entries({'admin-id':u.id,'admin-name':u.name,'admin-company':u.empresa,'admin-role':u.role}))document.getElementById(id).value=v;document.getElementById('admin-enabled').checked=u.enabled;}});
}
