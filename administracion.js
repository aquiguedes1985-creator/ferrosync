// Administrative entry points share the authenticated server API.
let adminEntry=null;
const initWithAdministration=iniciarApp;
iniciarApp=async function(){
 await initWithAdministration();
 document.querySelector('#company-screen .auth-card').insertAdjacentHTML('beforeend','<button class="auth-switch admin-entry" id="administrator-entry" type="button" onclick="openAdministrators()">Administrador</button>');
 document.body.insertAdjacentHTML('beforeend',`<dialog id="administrator-access" aria-labelledby="administrator-title"><button class="btn btn-outline" onclick="document.getElementById('administrator-access').close()">Volver</button><h2 id="administrator-title">Administradores</h2><p>Seleccioná la administración a la que vas a ingresar.</p><div class="admin-access-grid">${Object.entries(COMPANY_PROFILES).map(([id,p])=>`<button class="btn btn-outline" data-admin-entry="${id}" onclick="chooseAdministrator('${id}')">Administrador ${esc(p.name)}</button>`).join('')}<button class="btn btn-primary" data-admin-entry="general" onclick="chooseAdministrator('general')">Administrador general</button></div><p id="administrator-info" role="status"></p></dialog>`);
};
function openAdministrators(){
 document.getElementById('administrator-info').textContent=serverMode?'Cada administrador de operadora puede generar usuarios únicamente de su empresa.':'La administración de cuentas requiere el servidor compartido. Ingresá desde la versión de Vercel.';
 document.querySelectorAll('[data-admin-entry]').forEach(b=>b.disabled=!serverMode);
 document.getElementById('administrator-access').showModal();
}
async function chooseAdministrator(id){
 if(!serverMode)return;
 adminEntry=id;
 currentCompany=id==='general'?'RAS':id;
 document.getElementById('administrator-access').close();
 document.getElementById('company-screen').style.display='none';
 document.getElementById('auth-screen').style.display='flex';
 toggleAuthMode('login');
 document.getElementById('login-company-label').textContent=id==='general'?'Administración general':'Administración · '+COMPANY_PROFILES[id].name;
 document.getElementById('login-name').value='';
 document.getElementById('login-pass').value='';
 document.getElementById('login-name').focus();
}
const previousCompanyReturn=volverAEmpresa;
volverAEmpresa=async function(){adminEntry=null;return previousCompanyReturn();};
const authenticatedLogin=iniciarSesion;
iniciarSesion=async function(){
 if(!adminEntry)return authenticatedLogin();
 try{
  const data=await api('login',{name:valor('login-name'),pass:valor('login-pass'),empresa:currentCompany,adminScope:adminEntry==='general'?'general':'company'});
  serverUser=data.user;currentCompany=serverUser.empresa;useSnapshot(data);rolActual='Logística';
  for(const [id,text]of Object.entries({'user-name':serverUser.name,'user-role':serverUser.adminScope==='general'?'Administrador general':'Administrador '+currentCompany,'user-initial':serverUser.name[0],'sidebar-company-name':COMPANY_PROFILES[currentCompany].name}))document.getElementById(id).textContent=text;
  document.getElementById('auth-screen').style.display='none';document.getElementById('main-app').style.display='grid';document.getElementById('login-pass').value='';
  document.getElementById('nav-logistica').style.display='block';nav('dashboard',document.querySelector('#nav-logistica .nav-item'));if(!tramoCount)addTramo();refrescarUI();renderTools();
  clearInterval(syncTimer);syncTimer=setInterval(syncNow,5000);
  await adminPanel();
 }catch(e){const el=document.getElementById('login-error');el.textContent=e.message;el.style.display='block';}
};
const logoutAdministration=cerrarSesion;
cerrarSesion=async function(){await logoutAdministration();adminEntry=null;document.getElementById('detalle-viaje').close();};
adminPanel=async function(){
 const data=await api('admin');
 document.getElementById('detalle-contenido').innerHTML=`<h2>${data.general?'Administración general':'Administración · '+esc(serverUser.empresa)}</h2><p>${data.general?'Gestioná los administradores y usuarios de las cuatro operadoras.':'Podés crear y gestionar usuarios únicamente de tu operadora.'}</p><label>Operadora<select id="admin-company" ${data.general?'':'disabled'}>${data.companies.map(c=>`<option value="${esc(c.id)}">${esc(c.id)}${c.enabled?'':' · Deshabilitada'}</option>`).join('')}</select></label>${data.general?'<button class="btn btn-outline" onclick="adminCompany(true)">Habilitar empresa</button><button class="btn btn-outline" onclick="adminCompany(false)">Deshabilitar empresa</button>':''}<h3>Usuarios</h3><div class="admin-accounts">${data.users.map(u=>`<p>${esc(u.name)} · ${esc(u.empresa)} · ${u.adminScope==='general'?'Administrador general':esc(u.role)} · ${u.enabled?'Habilitado':'Deshabilitado'} <button class="btn btn-outline" data-account="${esc(u.id)}">Editar permisos</button></p>`).join('')||'<p>No hay usuarios registrados.</p>'}</div><button class="btn btn-outline" onclick="adminPanel()">Nueva cuenta</button><input id="admin-id" type="hidden"><div class="collab-grid"><label>Nombre<input id="admin-name" maxlength="80" autocomplete="off"></label><label>Contraseña inicial o nueva<input id="admin-pass" type="password" autocomplete="new-password" minlength="12" maxlength="128"></label><label>Rol<select id="admin-role"><option>Maquinista</option><option>Logística</option><option ${data.general?'':'disabled'}>Administrador</option></select></label><label>Habilitado<input id="admin-enabled" type="checkbox" checked></label></div><button class="btn btn-primary" onclick="adminSave()">Guardar cuenta</button><p id="admin-feedback" role="status"></p><p>Contraseña: entre 12 y 128 caracteres. Al editar, dejala vacía para conservarla. Cada operadora admite una cuenta administradora, asignada por Administración general.</p>`;
 window.adminAccounts=data.users;
 document.getElementById('detalle-viaje').showModal();
};
adminSave=async function(){
 const feedback=document.getElementById('admin-feedback');
 try{await api('admin',{operation:'user',id:valor('admin-id'),name:valor('admin-name'),pass:valor('admin-pass'),empresa:valor('admin-company'),role:valor('admin-role'),enabled:document.getElementById('admin-enabled').checked});await adminPanel();document.getElementById('admin-feedback').textContent='Cuenta guardada correctamente.';}
 catch(e){feedback.textContent=e.message;}
};
adminCompany=async function(enabled){try{await api('admin',{operation:'company',empresa:valor('admin-company'),enabled});await adminPanel();}catch(e){document.getElementById('admin-feedback').textContent=e.message;}};
