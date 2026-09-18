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
  function actualizarDropdowns() {
    const populate = (id, entries, optional=false) => {
      const el=document.getElementById(id), prev=el.value;
      el.replaceChildren(new Option(optional?'Ninguno':'Seleccioná…',optional?'Ninguno':''),...entries.map(([value,label])=>new Option(label,value)));
      if ([...el.options].some(o=>o.value===prev)) el.value=prev;
    };
    populate('d-locomotora',locomotoras.filter(l=>l.empresa===currentCompany&&l.estado==='Operativa').map(l=>[l.id,`${l.id} — ${l.modelo}`]));
    const crew=usuariosBD.filter(u=>u.empresa===currentCompany&&u.role==='Maquinista').map(u=>[u.name,u.name]);
    populate('d-conductor',crew); populate('d-ayudante',crew,true); populate('d-piloto',crew,true);
    calcularDistanciaTotal();
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
      if (overlaps&&(t.locoId===loco.id||crew.some(n=>[t.conductor,t.ayudante,t.piloto].includes(n)))) return fail(`Hay una superposición de locomotora o tripulación con el viaje ${t.nroPlan}.`);
    }
    const tramos=leerTramos();
    if (!tramos.length) return fail('Añadí al menos un tramo.');
    for (let i=0;i<tramos.length;i++) {
      if (!tramos[i]||tramos[i].dist<=0) return fail('Cada tramo debe tener origen y destino diferentes en una línea habilitada.');
      if (i&&tramos[i-1].dName!==tramos[i].oName) return fail('El origen de cada tramo debe coincidir con el destino del anterior.');
    }
    err.style.display='none'; return true;
  }
  async function registrarDespacho() {
    if (!validarFormularioDespacho()) return;
    const {salida,llegada}=fechasPlan();
    const train={nroPlan:valor('d-id').trim(),descripcion:valor('d-desc').trim().slice(0,300)||'Carga general',locoId:valor('d-locomotora'),conductor:valor('d-conductor'),ayudante:valor('d-ayudante'),piloto:valor('d-piloto'),ton:Number(valor('d-tonelaje')),tramos:leerTramos(),tramoActualIdx:0,estado:'Programado',empresa:currentCompany,coordsActuales:null,salida:new Date(salida).toISOString(),llegada:new Date(llegada).toISOString()};
    trenesActivos=trenesActivos.filter(t=>!(t.empresa===currentCompany&&t.nroPlan===trenEditando));
    trenesActivos.push(train); await guardarEstado(); limpiarPlanificacion();
    nav('dashboard',document.querySelector('#nav-logistica .nav-item'));
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
  async function registrarLocomotora() {
    if (rolActual!=='Logística') return;
    const id=valor('m-id').trim(),modelo=valor('m-modelo').trim();
    const [peso,maxArrastre,long]=['m-peso','m-max-arrastre','m-long'].map(x=>Number(valor(x)));
    if (!id||!modelo||[peso,maxArrastre,long].some(x=>!Number.isFinite(x)||x<=0)) return alert('Completá la matrícula, modelo y medidas positivas.');
    if (locomotoras.some(l=>l.id===id&&l.empresa===currentCompany)) return alert('La matrícula ya existe.');
    locomotoras.push({id,modelo,peso,maxArrastre,long,km:0,max:50000,estado:'Operativa',empresa:currentCompany});
    await guardarEstado(); refrescarUI();
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
  function exportarHistorial() {
    if (rolActual!=='Logística') return;
    const headers=['Fecha','Planificación','Tramo','Reglamento','Toneladas','Combustible inicial','Combustible final','L/km','Consumo','Conductor','Máquina','Duración','Km','Observaciones'];
    const keys=['fecha','nroPlan','descTramo','reglamento','ton','cIni','cFin','ltsKm','consumo','conductor','locoId','tiempo','dist','obs'];
    const cell=value=>'"'+String(/^[\s]*[=+@-]/.test(String(value))?"'"+value:value??'').replaceAll('"','""')+'"';
    const csv=[headers,...historial.filter(h=>h.empresa===currentCompany).map(h=>keys.map(k=>h[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`FerroSync_${currentCompany}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
