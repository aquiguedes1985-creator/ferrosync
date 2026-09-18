
  function toggleSidebar() { const sidebar = document.getElementById('sidebar'); const overlay = document.getElementById('sidebar-overlay'); if(sidebar && overlay) { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); } }

  // ==========================================
  // DATOS ESTÁTICOS Y REGLAMENTOS
  // ==========================================
  const COMPANY_PROFILES = {
    'DBCC': { name: 'DBCC Transport', loads: ['Celulosa', 'Insumos Químicos'], lines: ['FFCC'] },
    'RAS':  { name: 'Grupo RAS', loads: ['Carga General', 'Madera', 'Contenedores'], lines: ['FFCC', 'RGO'] },
    'SELF': { name: 'Servicios Log. Ferroviarios', loads: ['Carga General', 'Mantenimiento'], lines: ['FFCC', 'RGO'] },
    'AFE':  { name: 'AFE', loads: ['Pasajeros'], lines: ['FFCC', 'RGO'] }
  };

  const LINES = {
    FFCC: { id: 'FFCC', name: 'Ferrocarril Central', reglamento: 'MOF', estaciones: [
      { n: 'Puerto', km: 0, lat: -34.901, lng: -56.195 }, { n: 'Carnelli', km: 3, lat: -34.872, lng: -56.202 },
      { n: 'Nueva Terminal', km: 5, lat: -34.851, lng: -56.208 }, { n: 'Sayago', km: 8, lat: -34.821, lng: -56.215 },
      { n: 'Peñarol', km: 10, lat: -34.802, lng: -56.198 }, { n: 'Manga', km: 15, lat: -34.792, lng: -56.136 },
      { n: 'Florida', km: 97, lat: -34.095, lng: -56.214 }, { n: 'Durazno', km: 189, lat: -33.382, lng: -56.525 },
      { n: 'Paso de los Toros', km: 273.418, lat: -32.812, lng: -56.516 }
    ]},
    RGO: { id: 'RGO', name: 'Línea Rivera', reglamento: 'RGO', estaciones: [
      { n: 'Paso de los Toros', km: 273.418, lat: -32.812, lng: -56.516 }, { n: 'Chamberlain', km: 280, lat: -32.748, lng: -56.551 },
      { n: 'Achar', km: 315, lat: -32.404, lng: -56.166 }, { n: 'Tacuarembó', km: 440, lat: -31.716, lng: -55.981 },
      { n: 'Rivera', km: 560, lat: -30.902, lng: -55.534 }
    ]}
  };

  // ==========================================
  // ESTADO EN MEMORIA
  // ==========================================
  let usuariosBD    = [];
  let trenesActivos = [];
  let historial     = [];
  let personal      = [];
  let locomotoras   = [];

  let currentCompany = '';
  let rolActual      = '';
  let tramoCount     = 0;
  let trenEditando   = null;

  const syncChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ferrosync_channel') : { postMessage() {} };

  // ==========================================
  // CAPA DE PERSISTENCIA — IndexedDB
  // ==========================================
  const DB_NAME    = 'ferrosync_db';
  const DB_VERSION = 1;
  let revision = 0;
  let   _db        = null;

  function abrirDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('users')) { const s = db.createObjectStore('users', { keyPath: ['name', 'empresa'] }); s.createIndex('by_empresa', 'empresa', { unique: false }); }
        if (!db.objectStoreNames.contains('trains')) { const s = db.createObjectStore('trains', { keyPath: ['nroPlan', 'empresa'] }); s.createIndex('by_empresa', 'empresa', { unique: false }); }
        if (!db.objectStoreNames.contains('history')) { const s = db.createObjectStore('history', { autoIncrement: true }); s.createIndex('by_empresa', 'empresa', { unique: false }); }
        if (!db.objectStoreNames.contains('locomotives')) { const s = db.createObjectStore('locomotives', { keyPath: ['id', 'empresa'] }); s.createIndex('by_empresa', 'empresa', { unique: false }); }
        if (!db.objectStoreNames.contains('crew')) { const s = db.createObjectStore('crew', { keyPath: ['nombre', 'empresa'] }); s.createIndex('by_empresa', 'empresa', { unique: false }); }
        if (!db.objectStoreNames.contains('config')) { db.createObjectStore('config', { keyPath: 'key' }); }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  async function dbPut(storeName, records) {
    const db    = await abrirDB();
    const items = Array.isArray(records) ? records : [records];
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function dbGetAll(storeName) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbGetConfig(key) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('config', 'readonly');
      const req = tx.objectStore('config').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbSetConfig(key, value) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('config', 'readwrite');
      const store = tx.objectStore('config');
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function dbClear(storeName) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function cargarEstado() {
    try {
      await abrirDB();
      revision = await dbGetConfig('revision') || 0;
      const [company, users, trains, hist, locos, crew] = await Promise.all([
        dbGetConfig('currentCompany'), dbGetAll('users'), dbGetAll('trains'), dbGetAll('history'), dbGetAll('locomotives'), dbGetAll('crew'),
      ]);
      if (!currentCompany && COMPANY_PROFILES[company]) currentCompany = company;
      usuariosBD = users;
      trenesActivos = trains;
      historial = hist;
      personal = crew;
      locomotoras = locos;
    } catch (err) { throw new Error('No se pudieron cargar los datos: ' + err.message); }
  }

  async function guardarEstado(broadcast = true) {
    const db = await abrirDB();
    const snapshot = structuredClone({ users: usuariosBD, locomotives: locomotoras, crew: personal, trains: trenesActivos, history: historial });
    await new Promise((resolve, reject) => {
      const tx = db.transaction([...Object.keys(snapshot), 'config'], 'readwrite');
      const config = tx.objectStore('config');
      let conflict = false;
      const req = config.get('revision');
      req.onsuccess = () => {
        if ((req.result?.value || 0) !== revision) { conflict = true; tx.abort(); return; }
        for (const [name, records] of Object.entries(snapshot)) {
          const store = tx.objectStore(name); store.clear(); records.forEach(record => store.put(record));
        }
        config.put({key:'revision',value:revision+1});
        if (currentCompany) config.put({key:'currentCompany',value:currentCompany});
      };
      tx.oncomplete = () => { revision++; resolve(); };
      tx.onabort = () => reject(new Error(conflict ? 'Los datos cambiaron en otra pestaña. Se actualizaron; revisá y repetí la operación.' : 'No se guardaron los cambios.'));
      tx.onerror = () => {};
    }).catch(async error => { await cargarEstado(); refrescarUI(); throw error; });
    if (broadcast) syncChannel.postMessage({type:'UPDATE'});
  }

  syncChannel.onmessage = async (e) => {
    if (e.data.type === 'UPDATE') { await cargarEstado(); refrescarUI(); }
  };

  async function iniciarApp() {
    await cargarEstado();

    // AUTO-CURACIÓN: Inyectar locomotoras por defecto para todas las operadoras si faltan
    const defaultLocos = [
      { id: 'LGE2006', modelo: 'General Eléctrico', peso: 116, long: 16, maxArrastre: 1000, km: 0, max: 50000, estado: 'Operativa', empresa: 'SELF' },
      { id: 'LAL809',  modelo: 'Alstom',            peso: 56,  long: 14, maxArrastre: 500,  km: 0, max: 50000, estado: 'Operativa', empresa: 'SELF' },
      { id: 'GE-1500', modelo: 'General Eléctrico', peso: 110, long: 15, maxArrastre: 900,  km: 0, max: 50000, estado: 'Operativa', empresa: 'AFE' },
      { id: 'AL-810',  modelo: 'Alstom',            peso: 56,  long: 14, maxArrastre: 500,  km: 0, max: 50000, estado: 'Operativa', empresa: 'AFE' },
      { id: 'EURO-01', modelo: 'Stadler Euro4001',  peso: 120, long: 23, maxArrastre: 2500, km: 0, max: 50000, estado: 'Operativa', empresa: 'DBCC' },
      { id: 'EURO-02', modelo: 'Stadler Euro4001',  peso: 120, long: 23, maxArrastre: 2500, km: 0, max: 50000, estado: 'Operativa', empresa: 'DBCC' },
      { id: 'RAS-01',  modelo: 'General Motors',    peso: 115, long: 17, maxArrastre: 1200, km: 0, max: 50000, estado: 'Operativa', empresa: 'RAS' },
      { id: 'RAS-02',  modelo: 'General Motors',    peso: 115, long: 17, maxArrastre: 1200, km: 0, max: 50000, estado: 'Operativa', empresa: 'RAS' }
    ];

    let locosFaltantes = false;
    defaultLocos.forEach(dl => {
      if (!locomotoras.find(l => l.id === dl.id && l.empresa === dl.empresa)) {
        locomotoras.push(dl);
        locosFaltantes = true;
      }
    });

    if (locosFaltantes) await dbPut('locomotives', locomotoras);

    if (!currentCompany) document.getElementById('company-screen').style.display = 'flex';
    else {
      document.getElementById('company-screen').style.display = 'none';
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('form-login').style.display = 'block';
      document.getElementById('login-company-label').innerText = COMPANY_PROFILES[currentCompany].name;
    }
  }

  window.addEventListener('load', async () => { await iniciarApp(); window.ferroReady = true; });

  // ==========================================
  // SELECCIÓN DE EMPRESA Y AUTH
  // ==========================================
  let tempCompany = '';
  function selectCompany(id, el) { document.querySelectorAll('.company-grid .role-card').forEach(c => c.classList.remove('active')); el.classList.add('active'); tempCompany = id; }
  async function confirmCompany() {
    if (!tempCompany) return alert('Seleccioná una operadora.');
    currentCompany = tempCompany; await guardarEstado(false);
    document.getElementById('company-screen').style.display = 'none'; document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('form-login').style.display = 'block'; document.getElementById('login-company-label').innerText = COMPANY_PROFILES[currentCompany].name;
  }
  async function volverAEmpresa() {
    toggleAuthMode('login'); currentCompany = ''; await dbSetConfig('currentCompany', '');
    document.getElementById('auth-screen').style.display = 'none'; document.getElementById('company-screen').style.display = 'flex';
  }

  let regRole = '';
  function toggleAuthMode(mode) {
    document.getElementById('reg-error').style.display = 'none'; document.getElementById('login-error').style.display = 'none';
    if (mode === 'register') { document.getElementById('form-login').style.display = 'none'; document.getElementById('form-register').style.display = 'block'; }
    else { document.getElementById('form-register').style.display = 'none'; document.getElementById('form-login').style.display = 'block'; }
  }
  function selectRegRole(r, el) { document.querySelectorAll('#form-register .role-card').forEach(c => c.classList.remove('active')); el.classList.add('active'); regRole = r; }

  async function registrarUsuario() {
    const name = document.getElementById('reg-name').value.trim().normalize('NFC');
    const pass = document.getElementById('reg-pass').value;
    const err = document.getElementById('reg-error');
    const fail = message => { err.textContent = message; err.style.display='block'; };
    if (!COMPANY_PROFILES[currentCompany] || !['Maquinista','Logística'].includes(regRole) || name.length < 3 || name.length > 80 || pass.length < 8) return fail('Elegí un rol, un nombre de 3 a 80 caracteres y una contraseña de al menos 8 caracteres.');
    if (usuariosBD.some(u => u.empresa === currentCompany && u.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return fail('El usuario ya existe en esta operadora.');
    const credentials = await generarClave(pass);
    usuariosBD.push({name,...credentials,role:regRole,empresa:currentCompany});
    if (regRole === 'Maquinista') personal.push({nombre:name,empresa:currentCompany});
    await guardarEstado();
    document.getElementById('reg-pass').value='';
    alert('Cuenta creada en '+COMPANY_PROFILES[currentCompany].name+'.'); toggleAuthMode('login');
  }

  async function iniciarSesion() {
    const name = document.getElementById('login-name').value.trim(); const pass = document.getElementById('login-pass').value; const err = document.getElementById('login-error');
    if (!name || !pass) { err.innerText = 'Completá usuario y contraseña.'; err.style.display = 'block'; return; }
    const user = usuariosBD.find(u => u.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es') && u.empresa === currentCompany);
    if (!user || !(await verificarClave(user, pass))) { err.innerText = 'Credenciales incorrectas para esta operadora.'; err.style.display = 'block'; return; }

    document.getElementById('company-screen').style.display = 'none';
    rolActual = user.role; document.getElementById('user-name').innerText = user.name; document.getElementById('user-role').innerText = user.role; document.getElementById('user-initial').innerText = user.name.charAt(0).toUpperCase();
    document.getElementById('sidebar-company-name').innerText = COMPANY_PROFILES[currentCompany].name;
    document.getElementById('auth-screen').style.display = 'none'; document.getElementById('main-app').style.display = 'grid';

    if (rolActual === 'Logística') {
      document.getElementById('nav-logistica').style.display = 'block'; nav('dashboard', document.querySelector('#nav-logistica .nav-item'));
      if (tramoCount === 0) addTramo();
    } else {
      document.getElementById('nav-maquinista').style.display = 'block'; nav('operacion', document.querySelector('#nav-maquinista .nav-item'));
    }
    refrescarUI();
  }

  function cerrarSesion() {
    detenerSeguimiento(); miTren = null; currTramo = null; trenEditando = null;
    document.getElementById('tramos-lista').replaceChildren(); tramoCount = 0;
    rolActual = ''; document.getElementById('main-app').style.display = 'none'; document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('login-name').value = ''; document.getElementById('login-pass').value = '';
    document.getElementById('nav-logistica').style.display = 'none'; document.getElementById('nav-maquinista').style.display = 'none';
    toggleAuthMode('login');
    if (window.innerWidth <= 768 && document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
  }

  function nav(id, el) {
    if (!rolActual || (rolActual === 'Maquinista' && id !== 'operacion') || (rolActual === 'Logística' && id === 'operacion')) return;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); el.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active')); document.getElementById('panel-' + id).classList.add('active');
    const titulos = { dashboard: 'Panel General', despacho: 'Planificador de Viajes', operacion: 'Operación en Vía', mantenimiento: 'Flota', historial: 'Administrador de Viajes', tripulacion: 'Personal', mapa: 'Monitor GPS en Vía' };
    document.getElementById('page-title').innerText = titulos[id] || '';
    const content = document.getElementById('main-content'); content.classList.remove('fade-in'); void content.offsetWidth; content.classList.add('fade-in');
    if (window.innerWidth <= 768 && document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
    refrescarUI();

    if(id === "mapa") {
      // Retraso de 450ms para esperar que termine el fadeIn antes de recalcular el mapa
      setTimeout(() => {
        initMap();
        if(map) { map.invalidateSize(); renderMapData(); }
      }, 450);
    }
  }

  function refrescarUI() {
    if (rolActual === 'Logística') { renderDash(); renderMantenimiento(); renderHistorial(); actualizarDropdowns(); renderTripulacion(); if(document.getElementById('panel-mapa').classList.contains('active')) renderMapData(); }
    else if (rolActual === 'Maquinista') { cargarViajeMaquinista(); }
  }

  // ==========================================
  // FORMVALIDATOR
  // ==========================================
  function limpiarErroresCampo(containerSelector) {
    document.querySelectorAll(containerSelector + ' .input-group.field-error').forEach(g => {
      g.classList.remove('field-error');
      const msg = g.querySelector('.field-error-msg');
      if (msg) msg.textContent = '';
    });
  }

  function marcarError(grupoId, errorId, mensaje) {
    const grupo = document.getElementById(grupoId);
    let span  = document.getElementById(errorId);
    if (grupo) grupo.classList.add('field-error');
    if (!span && grupo) { span = document.createElement('div'); span.id = errorId; span.className = 'field-error-msg'; grupo.appendChild(span); }
    if (span) span.textContent = mensaje;
  }

  function validarFormularioDespacho() {
    const err=document.getElementById('error-despacho');
    const fail=message=>{err.textContent=message;err.style.display='block';return false;};
    if (rolActual!=='Logística') return fail('Solo Logística puede programar viajes.');
    const id=valor('d-id').trim();
    if (!id || id.length>60) return fail('Ingresá un número de planificación de hasta 60 caracteres.');
    if (trenesActivos.some(t=>t.empresa===currentCompany&&t.nroPlan===id&&t.nroPlan!==trenEditando) || historial.some(t=>t.empresa===currentCompany&&t.nroPlan===id)) return fail('El número de planificación ya existe.');
    const editing=trenesActivos.find(t=>t.empresa===currentCompany&&t.nroPlan===trenEditando);
    if (trenEditando && (!editing || editing.estado!=='Programado')) return fail('Este viaje ya no se puede editar.');
    const {salida,llegada}=fechasPlan();
    if (!Number.isFinite(salida)||!Number.isFinite(llegada)||llegada<=salida) return fail('Completá las fechas y horas; la llegada debe ser posterior a la salida.');
    if (salida<Date.now()-60000) return fail('La salida debe estar en el futuro.');
    const loco=locomotoras.find(l=>l.id===valor('d-locomotora')&&l.empresa===currentCompany&&l.estado==='Operativa');
    if (!loco) return fail('Seleccioná una locomotora operativa de esta empresa.');
    const ton=Number(valor('d-tonelaje'));
    if (!valor('d-tonelaje')||!Number.isFinite(ton)||ton<0||ton>loco.maxArrastre) return fail(`La carga remolcada debe estar entre 0 y ${loco.maxArrastre} t. Cero corresponde a máquina sola.`);
    const crew=['d-conductor','d-ayudante','d-piloto'].map(valor).filter(x=>x!=='Ninguno');
    if (crew.some(name=>!usuariosBD.some(u=>u.empresa===currentCompany&&u.role==='Maquinista'&&u.name===name))) return fail('Asigná tripulantes registrados como maquinistas.');
    if (new Set(crew).size!==crew.length) return fail('Una persona no puede ocupar dos roles en el mismo viaje.');
    for (const t of trenesActivos.filter(t=>t.empresa===currentCompany&&t.nroPlan!==trenEditando)) {
      const overlaps=!t.salida||!t.llegada||t.estado!=='Programado'||salida<Date.parse(t.llegada)&&llegada>Date.parse(t.salida);
      if (overlaps&&(t.locoId===loco.id||crew.some(n=>[t.conductor,t.ayudante,t.piloto].includes(n)))) return fail(`Hay una superposición de locomotora o tripulación con el viaje ${esc(t.nroPlan)}.`);
    }
    const tramos=leerTramos();
    if (!tramos.length) return fail('Añadí al menos un tramo.');
    for (let i=0;i<tramos.length;i++) {
      if (!tramos[i]||tramos[i].dist<=0) return fail('Cada tramo debe tener origen y destino diferentes en una línea habilitada.');
      if (i&&tramos[i-1].dName!==tramos[i].oName) return fail('El origen de cada tramo debe coincidir con el destino del anterior.');
    }
    err.style.display='none'; return true;
  }

  // ==========================================
  // LÓGICA LOGÍSTICA
  // ==========================================
  function actualizarDropdowns() {
    const populate = (id, entries, optional=false) => {
      const el=document.getElementById(id), prev=el.value;
      el.replaceChildren(new Option(optional?'Ninguno':'Seleccioná…',optional?'Ninguno':''),...entries.map(([value,label])=>new Option(label,value)));
      if ([...el.options].some(o=>o.value===prev)) el.value=prev;
    };
    populate('d-locomotora',locomotoras.filter(l=>l.empresa===currentCompany&&l.estado==='Operativa').map(l=>[l.id,`${esc(l.id)} — ${esc(l.modelo)}`]));
    const crew=usuariosBD.filter(u=>u.empresa===currentCompany&&u.role==='Maquinista').map(u=>[u.name,u.name]);
    populate('d-conductor',crew); populate('d-ayudante',crew,true); populate('d-piloto',crew,true);
    calcularDistanciaTotal();
  }

  function renderTripulacion() {
    const personalEmpresa = personal.filter(c => c.empresa === currentCompany);
    const ocupados = []; trenesActivos.filter(t => t.empresa === currentCompany && t.estado !== 'Completado').forEach(t => { if (t.conductor) ocupados.push(t.conductor); if (t.ayudante) ocupados.push(t.ayudante); if (t.piloto) ocupados.push(t.piloto); });
    document.getElementById('tripulacion-tabla').innerHTML = personalEmpresa.map(c => {
      const badge = ocupados.includes(c.nombre) ? '<span class="badge badge-warning">Asignado</span>' : '<span class="badge badge-success">Sin asignación</span>';
      return `<tr><td><b>${esc(c.nombre)}</b></td><td>${badge}</td></tr>`;
    }).join('') || `<tr><td colspan="2" style="text-align:center;">No hay personal registrado.</td></tr>`;
  }

  async function registrarLocomotora() {
    if (rolActual!=='Logística') return;
    const id=valor('m-id').trim(),modelo=valor('m-modelo').trim();
    const [peso,maxArrastre,long]=['m-peso','m-max-arrastre','m-long'].map(x=>Number(valor(x)));
    if (!id||!modelo||[peso,maxArrastre,long].some(x=>!Number.isFinite(x)||x<=0)) return alert('Completá la matrícula, modelo y medidas positivas.');
    if (locomotoras.some(l=>l.id===id&&l.empresa===currentCompany)) return alert('La matrícula ya existe.');
    locomotoras.push({id,modelo,peso,maxArrastre,long,km:0,max:50000,estado:'Operativa',empresa:currentCompany});
    await guardarEstado(); refrescarUI();
  }

  function renderMantenimiento() {
    document.getElementById('mant-tabla').innerHTML = locomotoras.filter(l => l.empresa === currentCompany).map(l => {
      const isOperativa = l.estado === 'Operativa';
      const badge = isOperativa ? '<span class="badge badge-success">Ok</span>' : '<span class="badge badge-danger">Taller</span>';

      const btnAction = `<button class="btn btn-outline btn-sm" style="padding: 4px 8px; font-size: 10px;" data-loco="${esc(l.id)}">
        <i class="ti ${isOperativa ? 'ti-tool' : 'ti-check'}"></i> ${isOperativa ? 'A Taller' : 'Alta Vía'}
      </button>`;

      return `<tr>
        <td><b>${esc(l.id)}</b><br><span style="font-size:10px;color:var(--text-muted)">${esc(l.modelo)}</span></td>
        <td>Peso: ${l.peso}t / Arr: ${l.maxArrastre}t</td>
        <td>${badge}</td>
        <td>${btnAction}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" style="text-align:center;">No hay locomotoras en la flota.</td></tr>`;
  }

  function addTramo() {
    tramoCount++; const n = tramoCount; const div = document.createElement('div'); div.className = 'tramo-block'; div.id = 'tramo-' + n;
    const allowedLines = COMPANY_PROFILES[currentCompany].lines;
    const lOpts = Object.keys(LINES).filter(k => allowedLines.includes(k)).map(k => `<option value="${k}">${LINES[k].name}</option>`).join('');
    const firstLine = LINES[allowedLines[0]];
    const eOpts = firstLine.estaciones.map((e, i) => `<option value="${i}">${e.n} (PK ${e.km})</option>`).join('');

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-weight:700;color:var(--text-muted);font-size:11px;">Tramo ${n}</span>
          <span id="reg-badge-${n}" class="badge badge-primary" style="font-size:9px;">Reglamento: ${firstLine.reglamento}</span>
        </div>
        <i class="ti ti-trash" style="cursor:pointer;color:var(--danger)" onclick="document.getElementById('tramo-${n}').remove();calcularDistanciaTotal();"></i>
      </div>
      <div class="grid-3">
        <div class="input-group" style="margin:0"><label>Línea</label><select id="tl-linea-${n}" onchange="updateTramo(${n})">${lOpts}</select></div>
        <div class="input-group" style="margin:0"><label>Origen</label><select id="tl-ori-${n}" onchange="calcularDistanciaTotal()">${eOpts}</select></div>
        <div class="input-group" style="margin:0"><label>Destino</label><select id="tl-dst-${n}" onchange="calcularDistanciaTotal()">${eOpts}</select></div>
      </div>`;
    document.getElementById('tramos-lista').appendChild(div);
  }

  function updateTramo(n) {
    const lk = document.getElementById('tl-linea-' + n).value;
    const opts = LINES[lk].estaciones.map((e, i) => `<option value="${i}">${e.n} (PK ${e.km})</option>`).join('');
    document.getElementById('tl-ori-' + n).innerHTML = opts;
    document.getElementById('tl-dst-' + n).innerHTML = opts;

    const badge = document.getElementById('reg-badge-' + n);
    if (badge) badge.innerText = 'Reglamento: ' + LINES[lk].reglamento;

    calcularDistanciaTotal();
  }

  function calcularDistanciaTotal() {
    let d = 0;
    document.querySelectorAll("[id^='tramo-']").forEach(b => {
      const n = b.id.replace('tramo-', ''); const lk = document.getElementById(`tl-linea-${n}`)?.value; const oi = parseInt(document.getElementById(`tl-ori-${n}`)?.value); const di = parseInt(document.getElementById(`tl-dst-${n}`)?.value);
      if (lk && !isNaN(oi) && !isNaN(di)) d += Math.abs(LINES[lk].estaciones[di].km - LINES[lk].estaciones[oi].km);
    });
    document.getElementById('calc-dist').innerText = d.toFixed(1) + ' km'; return d;
  }

  async function registrarDespacho() {
    if (!validarFormularioDespacho()) return;
    const {salida,llegada}=fechasPlan();
    const train={nroPlan:valor('d-id').trim(),descripcion:valor('d-desc').trim().slice(0,300)||'Carga general',locoId:valor('d-locomotora'),conductor:valor('d-conductor'),ayudante:valor('d-ayudante'),piloto:valor('d-piloto'),ton:Number(valor('d-tonelaje')),tramos:leerTramos(),tramoActualIdx:0,estado:'Programado',empresa:currentCompany,coordsActuales:null,salida:new Date(salida).toISOString(),llegada:new Date(llegada).toISOString()};
    trenesActivos=trenesActivos.filter(t=>!(t.empresa===currentCompany&&t.nroPlan===trenEditando));
    trenesActivos.push(train); await guardarEstado(); limpiarPlanificacion();
    nav('dashboard',document.querySelector('#nav-logistica .nav-item'));
  }

  function renderDash() {
    const misTrenes = trenesActivos.filter(t => t.empresa === currentCompany);
    document.getElementById('kpi-prog').innerText = misTrenes.filter(t => t.estado === 'Programado').length;
    document.getElementById('kpi-activos').innerText = misTrenes.filter(t => t.estado === 'En Tránsito').length;
    document.getElementById('kpi-completados').innerText = new Set(historial.filter(t => t.empresa === currentCompany && t.viajeCompletado).map(t => t.nroPlan)).size;
    document.getElementById('kpi-obs').innerText = misTrenes.filter(t => t.estado === 'Observado').length;

    document.getElementById('dash-tabla').innerHTML = misTrenes.map(t => {
      let badge = '';
      if (t.estado === 'Programado') badge = '<span class="badge badge-warning">Programado</span>';
      if (t.estado === 'En Tránsito') badge = '<span class="badge badge-primary">En Tránsito</span>';
      if (t.estado === 'Observado') badge = '<span class="badge badge-danger">Observado</span>';
      const currTramo = t.tramos[t.tramoActualIdx];
      const tramoText = currTramo ? `Tramo ${currTramo.id}: ${currTramo.oName} — ${currTramo.dName} <span style="color:var(--primary); font-weight:bold;">(${currTramo.reglamento || ''})</span>` : 'Finalizado';

      let btnAcciones = '';
      if (t.estado === 'Programado') {
        btnAcciones = `<div style="display:flex;gap:4px;">
          <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:11px;" data-edit="${esc(t.nroPlan)}"><i class="ti ti-edit"></i> Editar</button>
          <button class="btn btn-sm" style="padding:4px 8px; font-size:11px; background:var(--danger); color:#fff; border:none;" data-cancel="${esc(t.nroPlan)}"><i class="ti ti-trash"></i></button>
        </div>`;
      }

      return `<tr>
        <td><b>${esc(t.nroPlan)}</b><br><span style="font-size:10px">${esc(t.descripcion)}</span><br><span style="font-size:11px">${t.salida ? new Date(t.salida).toLocaleString("es-UY") : "Sin horario registrado"}<br>Hasta: ${t.llegada ? new Date(t.llegada).toLocaleString("es-UY") : "—"}</span></td>
        <td><div style="font-size:11px;margin-bottom:4px;color:var(--text-muted)">${tramoText}</div></td>
        <td><span style="font-size:11px">C: ${esc(t.conductor)}<br>A: ${esc(t.ayudante !== 'Ninguno' ? t.ayudante : '—')}<br>P: ${esc(t.piloto !== 'Ninguno' ? t.piloto : '—')}</span></td>
        <td>${badge}</td>
        <td>${btnAcciones}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Sin operaciones en curso.</td></tr>`;
  }

  function renderHistorial() {
    document.getElementById('historial-tabla').innerHTML = historial.filter(h => h.empresa === currentCompany).map(h => `<tr><td>${esc(h.fecha)}</td><td>${esc(h.nroPlan)}</td><td>${esc(h.descTramo)}</td><td>${h.reglamento || '-'}</td><td>${esc(h.ton)}</td><td>${esc(h.cIni)}</td><td>${esc(h.cFin)}</td><td>${esc(h.ltsKm)}</td><td>${esc(h.consumo)}</td><td>${esc(h.conductor)}</td><td>${esc(h.locoId)}</td><td>${esc(h.tiempo)}</td><td>${esc(h.dist)}</td></tr>`).join('') || `<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text-muted)">Sin historial.</td></tr>`;
  }

  function exportarHistorial() {
    if (rolActual!=='Logística') return;
    const headers=['Fecha','Planificación','Tramo','Reglamento','Toneladas','Combustible inicial','Combustible final','L/km','Consumo','Conductor','Máquina','Duración','Km','Observaciones'];
    const keys=['fecha','nroPlan','descTramo','reglamento','ton','cIni','cFin','ltsKm','consumo','conductor','locoId','tiempo','dist','obs'];
    const cell=value=>'"'+String(/^[\s]*[=+@-]/.test(String(value))?"'"+value:value??'').replaceAll('"','""')+'"';
    const csv=[headers,...historial.filter(h=>h.empresa===currentCompany).map(h=>keys.map(k=>h[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`FerroSync_${currentCompany}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  // ==========================================
  // MAPA GPS (Logística)
  // ==========================================
  let map, mapLines = [];
  function initMap() {
    if (!window.L) { document.getElementById('map-container').textContent = 'Mapa no disponible sin conexión. Los viajes siguen disponibles.'; return; }
    if(!map) {
      map = L.map('map-container').setView([-33.5, -56.0], 7);
      // PROVEEDOR: Esri Dark Gray
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        maxZoom: 16
      }).addTo(map);
    }
  }

  function renderMapData() {
    if(!map) return;
    mapLines.forEach(l => map.removeLayer(l)); mapLines = [];

    const allowedLines = COMPANY_PROFILES[currentCompany].lines;

    // Auto-centrado del mapa según las líneas de la operadora seleccionada
    let lineasLatlngs = [];
    Object.keys(LINES).filter(k => allowedLines.includes(k)).forEach(k => {
      const latlngs = LINES[k].estaciones.map(e => [e.lat, e.lng]);
      lineasLatlngs = lineasLatlngs.concat(latlngs);

      // Dibujar la línea de la vía
      mapLines.push(L.polyline(latlngs, {color: '#0ea5e9', weight: 3, opacity: 0.8, dashArray:'6, 6'}).addTo(map));

      // NUEVO: Dibujar los puntos de las estaciones con Tooltip
      LINES[k].estaciones.forEach(st => {
        const stationMarker = L.circleMarker([st.lat, st.lng], {
          radius: 4,
          fillColor: '#0f172a',
          color: '#0ea5e9',
          weight: 2,
          fillOpacity: 1
        }).addTo(map);

        // Agregamos el cartel flotante (Tooltip)
        stationMarker.bindTooltip(`<b>${st.n}</b><br>PK ${st.km}`, {
          direction: 'top',
          opacity: 0.95
        });

        mapLines.push(stationMarker);
      });
    });

    if (lineasLatlngs.length > 0) {
       map.fitBounds(L.latLngBounds(lineasLatlngs), {padding: [20, 20]});
    }

    // Dibujar los trenes activos encima de las estaciones
    trenesActivos.filter(t => t.empresa === currentCompany).forEach(t => {
      let color = t.estado === 'EMERGENCIA' ? '#ef4444' : '#10b981';
      let currentLat = -33.5, currentLng = -56.0;

      if (t.coordsActuales && t.coordsActuales.lat) {
        currentLat = t.coordsActuales.lat;
        currentLng = t.coordsActuales.lng;
      } else {
        const tramoObj = t.tramos[t.tramoActualIdx];
        if (tramoObj) {
          let found = false;
          for (const lineKey of allowedLines) {
            const st = LINES[lineKey].estaciones.find(e => e.n === tramoObj.oName);
            if(st) { currentLat = st.lat; currentLng = st.lng; found = true; break; }
          }
        }
      }

      // El tren tiene un radio mayor (8) para que destaque sobre la estación (radio 4)
      const marker = L.circleMarker([currentLat, currentLng], {
        radius: 8, fillColor: color, color: "#fff", weight: 2, fillOpacity: 1
      }).addTo(map);

      marker.bindPopup(`<b>Tren ${esc(t.nroPlan)}</b><br>Tripulación: ${esc(t.conductor)}<br>${t.coordsActuales ? 'Última posición GPS: ' + new Date(t.coordsActuales.at).toLocaleString('es-UY') : 'Origen planificado; sin posición GPS'}`);
      mapLines.push(marker);
    });
  }

  // ==========================================
  // MAQUINISTA UI Y GPS TRACKING
  // ==========================================
  let miTren = null; let currTramo = null; let timerInt = null; let segs = 0;
  let gpsWatchId = null;

  function cargarViajeMaquinista() {
    const name=valorUsuario(); const previous=miTren?.nroPlan; const oldState=currTramo?.estado;
    miTren=trenesActivos.filter(t=>t.empresa===currentCompany&&[t.conductor,t.ayudante,t.piloto].includes(name)).sort((a,b)=>(a.estado==='En Tránsito'?-1:1)-(b.estado==='En Tránsito'?-1:1)||Date.parse(a.salida)-Date.parse(b.salida))[0]||null;
    const container=document.getElementById('maq-tramo-container');
    if (!miTren) { detenerSeguimiento(); currTramo=null; document.getElementById('maq-tren-id').textContent='SISTEMA EN ESPERA'; document.getElementById('maq-ruta-info').textContent='Sin viajes programados.'; container.style.display='none'; return; }
    currTramo=miTren.tramos[miTren.tramoActualIdx];
    document.getElementById('maq-tren-id').textContent='TREN '+miTren.nroPlan;
    document.getElementById('maq-ruta-info').textContent=`${miTren.descripcion} | ${miTren.locoId} | Salida: ${new Date(miTren.salida).toLocaleString('es-UY')}`;
    container.style.display=currTramo&&miTren.estado!=='Observado'?'block':'none';
    if (!currTramo||miTren.estado==='Observado') {detenerSeguimiento();return;}
    document.getElementById('maq-tramo-title').textContent=`Tramo ${currTramo.id}: ${currTramo.oName} → ${currTramo.dName} (${currTramo.dist} km)`;
    const running=currTramo.estado==='En Curso', driver=miTren.conductor===name;
    document.getElementById('maq-tramo-inicio').style.display=!running&&driver?'block':'none';
    document.getElementById('maq-tramo-fin').style.display=running&&driver?'block':'none';
    if (!driver) document.getElementById('maq-ruta-info').textContent+=' · Consulta: el conductor registra el tramo.';
    if (previous!==miTren.nroPlan||oldState!==currTramo.estado) for (const id of ['maq-comb-inicio','maq-comb-fin','maq-obs']) document.getElementById(id).value='';
    if (running&&driver) {startTimer(); activarGPS();} else detenerSeguimiento();
  }

  async function iniciarTramo() {
    if (!esConductor()||currTramo.estado!=='Pendiente') return;
    const cin=Number(valor('maq-comb-inicio'));
    if (!valor('maq-comb-inicio')||!Number.isFinite(cin)||cin<=0) return alert('Ingresá combustible inicial mayor que cero.');
    if (trenesActivos.some(t=>t!==miTren&&t.empresa===currentCompany&&t.estado==='En Tránsito'&&(t.locoId===miTren.locoId||[t.conductor,t.ayudante,t.piloto].some(n=>n!=='Ninguno'&&[miTren.conductor,miTren.ayudante,miTren.piloto].includes(n))))) return alert('Los recursos están en otro viaje en curso.');
    const loco=locomotoras.find(l=>l.empresa===currentCompany&&l.id===miTren.locoId);
    if (!loco||loco.estado!=='Operativa') return alert('La locomotora no está operativa.');
    currTramo.combInicio=cin; currTramo.estado='En Curso'; currTramo.startTime=new Date().toISOString(); miTren.estado='En Tránsito';
    await guardarEstado(); cargarViajeMaquinista();
  }

  function startTimer() {
    clearInterval(timerInt);
    const update=()=>{const total=Math.max(0,Math.floor((Date.now()-Date.parse(currTramo.startTime))/1000));document.getElementById('maq-timer').textContent=[Math.floor(total/3600),Math.floor(total/60)%60,total%60].map(x=>String(x).padStart(2,'0')).join(':');};
    update();timerInt=setInterval(update,1000);
  }

  async function finalizarTramo() {
    if (!esConductor()||currTramo.estado!=='En Curso') return;
    const cfin=Number(valor('maq-comb-fin'));
    if (!valor('maq-comb-fin')||!Number.isFinite(cfin)||cfin<0||cfin>currTramo.combInicio) return alert('El combustible final debe estar entre cero y el inicial.');
    detenerSeguimiento(); const fin=new Date().toISOString();
    currTramo.combFin=cfin;currTramo.obs=valor('maq-obs').trim().slice(0,500);currTramo.estado='Finalizado';currTramo.endTime=fin;
    const consumo=currTramo.combInicio-cfin,dist=Number(currTramo.dist),minutes=Math.floor((Date.parse(fin)-Date.parse(currTramo.startTime))/60000);
    const completed=miTren.tramoActualIdx===miTren.tramos.length-1;
    historial.push({fecha:new Date().toLocaleDateString('es-UY'),nroPlan:miTren.nroPlan,descTramo:`${currTramo.oName} — ${currTramo.dName}`,reglamento:currTramo.reglamento,ton:miTren.ton,cIni:currTramo.combInicio,cFin:cfin,ltsKm:(consumo/dist).toFixed(3),consumo,conductor:miTren.conductor,locoId:miTren.locoId,tiempo:`${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`,dist,empresa:currentCompany,obs:currTramo.obs,viajeCompletado:completed,startTime:currTramo.startTime,endTime:fin,salida:miTren.salida,llegada:miTren.llegada});
    const loco=locomotoras.find(l=>l.id===miTren.locoId&&l.empresa===currentCompany);if(loco)loco.km+=dist;
    miTren.tramoActualIdx++;miTren.coordsActuales=null;
    if (completed) trenesActivos=trenesActivos.filter(t=>t!==miTren); else miTren.estado='Programado';
    await guardarEstado();cargarViajeMaquinista();
  }

  async function toggleEstadoLocomotora(idLocomotora) {
    if (rolActual!=='Logística') return;
    const loco=locomotoras.find(l=>l.id===idLocomotora&&l.empresa===currentCompany);
    if (!loco) return;
    if (loco.estado==='Operativa'&&trenesActivos.some(t=>t.empresa===currentCompany&&t.locoId===loco.id)) return alert('La locomotora tiene viajes asignados. Cancelá o reasigná los viajes antes de enviarla a taller.');
    loco.estado=loco.estado==='Operativa'?'Taller':'Operativa'; await guardarEstado(); refrescarUI();
  }

  async function cancelarTren(idTren) {
    const tren=trenesActivos.find(t=>t.empresa===currentCompany&&t.nroPlan===idTren);
    if (rolActual!=='Logística'||!tren||tren.estado!=='Programado') return;
    if (!confirm(`¿Cancelar el viaje ${idTren}?`)) return;
    trenesActivos=trenesActivos.filter(t=>t!==tren); await guardarEstado(); if (trenEditando===idTren) limpiarPlanificacion(); refrescarUI();
  }

  function editarTren(idTren) {
    const tren=trenesActivos.find(t=>t.nroPlan===idTren&&t.empresa===currentCompany);
    if (rolActual!=='Logística'||!tren||tren.estado!=='Programado') return;
    trenEditando=idTren; nav('despacho',document.querySelectorAll('#nav-logistica .nav-item')[1]);
    for (const [id,key] of Object.entries({'d-id':'nroPlan','d-desc':'descripcion','d-locomotora':'locoId','d-tonelaje':'ton','d-conductor':'conductor','d-ayudante':'ayudante','d-piloto':'piloto'})) document.getElementById(id).value=tren[key];
    ponerFecha('ini',tren.salida); ponerFecha('fin',tren.llegada);
    document.getElementById('tramos-lista').replaceChildren(); tramoCount=0;
    tren.tramos.forEach(tramo=>{
      addTramo(); const n=tramoCount;
      const lk=tramo.lineaId||COMPANY_PROFILES[currentCompany].lines.find(k=>LINES[k].name===tramo.linea);
      document.getElementById(`tl-linea-${n}`).value=lk; updateTramo(n);
      document.getElementById(`tl-ori-${n}`).value=LINES[lk].estaciones.findIndex(e=>e.n===tramo.oName);
      document.getElementById(`tl-dst-${n}`).value=LINES[lk].estaciones.findIndex(e=>e.n===tramo.dName);
    }); calcularDistanciaTotal();
  }

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
