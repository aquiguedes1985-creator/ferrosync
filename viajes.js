function normalizarObservados() {
  for (const t of trenesActivos) {
    if (t.estado !== 'Observado') continue;
    t.observaciones ||= [];
    t.observaciones.push({id:crypto.randomUUID(),texto:'Viaje marcado como observado en la versión anterior; sin detalle registrado.',autor:'Registro anterior',fase:'Importación',tramo:t.tramos[t.tramoActualIdx]?.id,fecha:null});
    t.estado=t.tramos[t.tramoActualIdx]?.estado==='En Curso'?'En Tránsito':'Programado';
  }
}
function puedeAnotar(t) {
  return t?.empresa===currentCompany && (rolActual==='Logística'||rolActual==='Maquinista'&&[t.conductor,t.ayudante,t.piloto].includes(valorUsuario()));
}
function agregarNovedad(t,texto,fase) {
  texto=texto.trim();
  if (!texto) return;
  if (texto.length>2000) throw new Error('La observación admite hasta 2000 caracteres.');
  if (!puedeAnotar(t)) throw new Error('No tenés acceso a este viaje.');
  (t.observaciones ||= []).push({id:crypto.randomUUID(),texto,autor:valorUsuario(),fase,tramo:t.tramos[t.tramoActualIdx]?.id,fecha:new Date().toISOString()});
}
function listaNovedades(t) {
  return (t.observaciones||[]).map(o=>`<li><strong>${esc(o.fase)} · Tramo ${esc(o.tramo)} · ${esc(o.autor)}</strong><br>${o.fecha?esc(new Date(o.fecha).toLocaleString('es-UY')):'Fecha no disponible'}<p class="texto-observacion">${esc(o.texto)}</p></li>`).join('')||'<li>Sin observaciones registradas.</li>';
}
function renderNovedadesOperacion() {
  document.getElementById('maq-novedades').innerHTML=`<h3>${esc(miTren.estado)}${miTren.observaciones?.length?' · Observado':''}</h3><ul>${listaNovedades(miTren)}</ul>`;
}
let guardandoNovedad=false;
async function guardarNovedad(id,inputId) {
  if (guardandoNovedad) return false;
  const t=trenesActivos.find(t=>t.empresa===currentCompany&&t.nroPlan===id);
  if (!puedeAnotar(t)) return false;
  const input=document.getElementById(inputId);
  if (!input.value.trim()) {alert('Ingresá una observación.');return false;}
  guardandoNovedad=true;
  try {
    agregarNovedad(t,input.value,t.tramos[t.tramoActualIdx]?.estado==='En Curso'?'Durante el tramo':'Antes del tramo');
    await guardarEstado();input.value='';refrescarUI();return true;
  } finally {guardandoNovedad=false;}
}
async function guardarNovedadOperacion() {
  if (miTren) await guardarNovedad(miTren.nroPlan,'maq-novedad');
}
function obtenerViaje(id) {
  const active=trenesActivos.find(t=>t.empresa===currentCompany&&t.nroPlan===id);
  const rows=historial.filter(h=>h.empresa===currentCompany&&h.nroPlan===id);
  const last=rows.at(-1);
  const t=active||last?.viaje||(last&&{...last,descripcion:'Detalle de carga no registrado en este historial',tramos:rows.map(h=>({oName:h.descTramo,dName:'',dist:h.dist,estado:'Finalizado',ton:h.ton})),observaciones:rows.filter(h=>h.obs).map(h=>({texto:h.obs,autor:h.conductor,fase:'Fin de tramo',fecha:h.endTime}))});
  if (!t || !puedeAnotar(t)) return null;
  return {...t,estado:active?t.estado:last?.viajeCompletado?'Finalizado':'Historial parcial',cerrado:!active};
}
function informeViaje(t) {
  return `<h2>FerroSync · Viaje ${esc(t.nroPlan)}</h2><p>Operadora: ${esc(COMPANY_PROFILES[currentCompany].name)} · Estado: ${esc(t.estado)}${t.observaciones?.length?' · Observado':''}</p><h3>Carga del viaje</h3><p class="texto-observacion">${esc(t.descripcion)}</p><p><strong>Carga remolcada registrada: ${esc(t.ton)} t</strong></p><p>Locomotora: ${esc(t.locoId)}<br>Conductor: ${esc(t.conductor)}<br>Ayudante: ${esc(t.ayudante||'No registrado')}<br>Piloto: ${esc(t.piloto||'No registrado')}</p><p>Salida prevista: ${t.salida?esc(new Date(t.salida).toLocaleString('es-UY')):'No registrada'}<br>Llegada prevista: ${t.llegada?esc(new Date(t.llegada).toLocaleString('es-UY')):'No registrada'}</p><table class="data-table"><thead><tr><th>Tramo</th><th>Recorrido</th><th>Km</th><th>Toneladas</th><th>Estado</th></tr></thead><tbody>${t.tramos.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.oName)}${s.dName?' → '+esc(s.dName):''}</td><td>${esc(s.dist)}</td><td>${esc(s.ton??t.ton)}</td><td>${esc(s.estado)}</td></tr>`).join('')}</tbody></table><p>Las toneladas corresponden a la carga remolcada declarada. No se suman entre tramos del mismo viaje. No hay desglose de peso por vagón registrado.</p><h3>Observaciones</h3><ul>${listaNovedades(t)}</ul>`;
}
let detalleActual=null;
function abrirDetalle(id) {
  const t=obtenerViaje(id);if (!t) return;
  detalleActual=id;
  document.getElementById('detalle-contenido').innerHTML=`<button class="btn btn-outline" onclick="imprimirViaje()"><i class="ti ti-file-type-pdf"></i> Exportar a PDF</button>${informeViaje(t)}${t.cerrado?'':'<div class="input-group"><label for="detalle-observacion">Nueva observación</label><textarea id="detalle-observacion" maxlength="2000"></textarea></div><button class="btn btn-outline" onclick="guardarNovedadDetalle()">Registrar observación</button>'}`;
  const pdfButton=document.querySelector('#detalle-contenido > button');
  pdfButton.setAttribute('aria-label','Exportar a PDF');
  const dialog=document.getElementById('detalle-viaje');if(!dialog.open)dialog.showModal();
}
async function guardarNovedadDetalle() {
  const id=detalleActual;
  if (await guardarNovedad(id,'detalle-observacion')) abrirDetalle(id);
}
function abrirObservados() {
  if(rolActual!=='Logística')return;
  const ids=new Set([...trenesActivos,...historial].filter(t=>t.empresa===currentCompany).map(t=>t.nroPlan));
  const viajes=[...ids].map(obtenerViaje).filter(t=>t?.observaciones?.length);
  document.getElementById('detalle-contenido').innerHTML='<h2>Viajes observados</h2>'+ (viajes.map(t=>`<section><h3>${esc(t.nroPlan)} · ${esc(t.estado)}</h3><ul>${listaNovedades(t)}</ul><button class="btn btn-outline" data-detalle="${esc(t.nroPlan)}">Detalle / PDF</button></section>`).join('')||'<p>Sin viajes observados.</p>');
  document.getElementById('detalle-viaje').showModal();
}
function imprimirViaje() {
  const t=obtenerViaje(detalleActual);if(!t)return;
  document.getElementById('informe-impresion').innerHTML=informeViaje(t);
  const dialog=document.getElementById('detalle-viaje');dialog.close();
  const title=document.title;document.title=`FerroSync - ${t.nroPlan}`;
  try {window.print();} finally {document.title=title;dialog.showModal();}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-detalle]');if(button)abrirDetalle(button.dataset.detalle);
});
