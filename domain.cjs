// Reglas compartidas por el servidor y las pruebas. Pesos en toneladas.
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual: same } = require('node:util');
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function requireThat(condition, message, status) { if (!condition) fail(message, status); }
const round = n => Math.round(n * 1000) / 1000;
const assigned = (t, u) => [t.conductor, t.ayudante, t.piloto].includes(u.name);
const logistics = u => ['Logística', 'Administrador'].includes(u.role);
function note(t, u, input) {
  const texto = String(input.texto || '').trim();
  requireThat(texto.length > 0 && texto.length <= 2000, 'Ingresá una descripción de hasta 2000 caracteres.');
  const categoria = input.categoria || 'Informativa';
  requireThat(['Informativa', 'Mecánica', 'Vía', 'Carga', 'Seguridad', 'Operación'].includes(categoria), 'Categoría inválida.');
  const gravedad = input.gravedad || 'Baja';
  requireThat(['Baja', 'Media', 'Alta', 'Crítica'].includes(gravedad), 'Gravedad inválida.');
  const now = new Date().toISOString();
  const o = { id: randomUUID(), texto, categoria, gravedad, responsable: String(input.responsable || '').slice(0,80), estado: categoria === 'Informativa' ? 'Informativa' : 'Pendiente', autor: u.name, fase: input.fase || 'Durante la operación', tramo: t.tramos[t.tramoActualIdx]?.id, fecha: now, cambios: [] };
  (t.observaciones ||= []).push(o); return o;
}
function wagonTotals(t) {
  if (!t.vagones) return;
  for (let i=0; i<t.tramos.length; i++) {
    const active=t.vagones.filter(v=>v.alta<=i && (v.baja===null || v.baja>i));
    t.tramos[i].ton=round(active.reduce((sum,v)=>sum+v.bruto,0));
    t.tramos[i].neto=round(active.reduce((sum,v)=>sum+v.neto,0));
  }
  t.ton=t.tramos[Math.min(t.tramoActualIdx,t.tramos.length-1)]?.ton || 0;
}
function operate(state, u, body) {
  const archived=state.history.filter(h=>h.nroPlan===body.plan).at(-1)?.viaje;
  const t=state.trains.find(t=>t.nroPlan===body.plan)||(['incident'].includes(body.action)?archived:null);
  requireThat(t && (logistics(u)||assigned(t,u)), 'No tenés acceso a este viaje.',403);
  const s=t.tramos[t.tramoActualIdx];
  if(body.action==='note') note(t,u,body);
  else if(body.action==='incident') {
    const o=t.observaciones?.find(o=>o.id===body.id);
    requireThat(o && o.categoria!=='Informativa','Imprevisto inexistente.');
    requireThat(['Pendiente','En atención','Resuelto'].includes(body.estado),'Estado inválido.');
    (o.cambios ||= []).push({fecha:new Date().toISOString(),autor:u.name,anterior:o.estado,estado:body.estado,responsable:String(body.responsable||'').slice(0,80)});
    o.estado=body.estado;o.responsable=String(body.responsable||'').slice(0,80);
    for(const h of state.history.filter(h=>h.nroPlan===t.nroPlan))if(h.viaje)h.viaje.observaciones=structuredClone(t.observaciones);
  } else if(body.action==='wagon-add'||body.action==='wagon-remove') {
    const tramo=Number(body.tramo);
    requireThat(Number.isInteger(tramo)&&tramo>=t.tramoActualIdx&&tramo<t.tramos.length,'No se puede modificar un tramo cerrado.');
    requireThat(t.tramos[tramo].estado==='Pendiente','La formación se modifica antes de iniciar el tramo.');
    if(body.action==='wagon-add') {
      const matricula=String(body.matricula||'').trim().toUpperCase(),tara=Number(body.tara),neto=Number(body.neto);
      requireThat(matricula && matricula.length<=40 && Number.isFinite(tara)&&tara>0&&Number.isFinite(neto)&&neto>=0,'Matrícula y pesos inválidos.');
      requireThat(!(t.vagones||[]).some(v=>v.matricula===matricula&&(v.baja===null||v.baja>tramo)),'El vagón ya está en la formación.');
      (t.vagones ||= []).push({id:randomUUID(),matricula,carga:String(body.carga||'').slice(0,300),tara,neto,bruto:round(tara+neto),alta:tramo,baja:null});
      note(t,u,{texto:`Alta del vagón ${matricula} desde el tramo ${tramo+1}.`,fase:'Formación'});
    } else {
      const v=t.vagones?.find(v=>v.id===body.id);
      requireThat(v&&v.alta<=tramo&&(v.baja===null||v.baja>tramo),'Vagón no activo en ese tramo.');
      v.baja=tramo;note(t,u,{texto:`Baja del vagón ${v.matricula} desde el tramo ${tramo+1}. ${String(body.motivo||'').slice(0,500)}`,fase:'Formación'});
    }
    wagonTotals(t);
    const loco=state.locomotives.find(l=>l.id===t.locoId);
    requireThat(loco&&t.tramos.every(s=>s.ton<=loco.maxArrastre),'La formación supera el arrastre permitido.');
  } else if(body.action==='start'||body.action==='finish') {
    requireThat(u.name===t.conductor,'Solo el conductor asignado registra los tramos.',403);
    const fuel=Number(body.fuel),now=new Date().toISOString();
    requireThat(body.fuel!==''&&Number.isFinite(fuel),'Ingresá el combustible.');
    if(body.action==='start') {
      requireThat(s?.estado==='Pendiente'&&fuel>0,'El tramo no está pendiente o el combustible es inválido.');
      const loco=state.locomotives.find(l=>l.id===t.locoId);
      requireThat(loco?.estado==='Operativa','La locomotora no está operativa.');
      requireThat(!state.trains.some(x=>x!==t&&x.estado==='En Tránsito'&&(x.locoId===t.locoId||[x.conductor,x.ayudante,x.piloto].some(n=>n&&n!=='Ninguno'&&[t.conductor,t.ayudante,t.piloto].includes(n)))),'Los recursos están en otro viaje en curso.');
      if(body.texto?.trim())note(t,u,{texto:body.texto,fase:'Inicio de tramo'});
      wagonTotals(t);s.ton=t.ton;s.combInicio=fuel;s.estado='En Curso';s.startTime=now;t.estado='En Tránsito';
    } else {
      requireThat(s?.estado==='En Curso'&&fuel>=0&&fuel<=s.combInicio,'Combustible final inválido.');
      if(body.texto?.trim())note(t,u,{texto:body.texto,fase:'Fin de tramo'});
      s.combFin=fuel;s.estado='Finalizado';s.endTime=now;
      s.obs=(t.observaciones||[]).filter(o=>o.tramo===s.id).map(o=>`${o.autor}: ${o.texto}`).join('\n');
      const consumo=s.combInicio-fuel,completed=t.tramoActualIdx===t.tramos.length-1;
      state.history.push({empresa:u.empresa,nroPlan:t.nroPlan,fecha:new Date().toLocaleDateString('es-UY'),descTramo:`${s.oName} — ${s.dName}`,reglamento:s.reglamento,ton:s.ton??t.ton,cIni:s.combInicio,cFin:fuel,ltsKm:(consumo/s.dist).toFixed(3),consumo,conductor:t.conductor,locoId:t.locoId,tiempo:String(Math.floor((Date.now()-Date.parse(s.startTime))/60000))+' min',dist:s.dist,obs:s.obs,viajeCompletado:completed,startTime:s.startTime,endTime:now,viaje:structuredClone(t)});
      const loco=state.locomotives.find(l=>l.id===t.locoId);loco.km+=s.dist;
      t.tramoActualIdx++;t.coordsActuales=null;
      if(completed)state.trains=state.trains.filter(x=>x!==t);else {t.estado='Programado';wagonTotals(t);}
    }
  } else if(body.action==='gps') {
    requireThat(u.name===t.conductor&&s?.estado==='En Curso','GPS no habilitado.',403);
    const {lat,lng,accuracy}=body;
    requireThat(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180&&Number.isFinite(accuracy)&&accuracy>=0,'Coordenadas inválidas.');
    t.coordsActuales={lat,lng,accuracy,at:new Date().toISOString()};
  } else fail('Operación desconocida.');
}
function validateState(s, company) {
  requireThat(s&&['trains','history','locomotives','crew'].every(k=>Array.isArray(s[k])&&s[k].length<=20000),'Respaldo o estado inválido.');
  for(const k of ['trains','history','locomotives','crew']) for(const r of s[k]) requireThat(r&&r.empresa===company,'El archivo contiene datos de otra empresa.');
  for(const key of ['trains','locomotives']) requireThat(new Set(s[key].map(r=>r[key==='trains'?'nroPlan':'id'])).size===s[key].length,'Identificadores duplicados.');
  for(const l of s.locomotives)requireThat(typeof l.id==='string'&&l.id.length>0&&Number.isFinite(l.maxArrastre)&&l.maxArrastre>0&&Number.isFinite(l.km)&&l.km>=0&&['Operativa','Taller'].includes(l.estado),'Locomotora inválida.');
  for(const t of s.trains) {
    requireThat(typeof t.nroPlan==='string'&&t.nroPlan.length>0&&Array.isArray(t.tramos)&&t.tramos.length>0,'Viaje inválido.');
    requireThat(Number.isInteger(t.tramoActualIdx)&&t.tramoActualIdx>=0&&t.tramoActualIdx<t.tramos.length,'Tramo actual inválido.');
    requireThat(Number.isFinite(t.ton)&&t.ton>=0&&t.tramos.every(x=>Number.isFinite(x.dist)&&x.dist>0),'Pesos o distancias inválidos.');
    requireThat(['Programado','En Tránsito'].includes(t.estado)&&t.tramos.every(x=>['Pendiente','En Curso','Finalizado'].includes(x.estado)),'Estado del viaje inválido.');
    for(let i=1;i<t.tramos.length;i++)requireThat(t.tramos[i-1].dName===t.tramos[i].oName,'Los tramos deben ser consecutivos.');
    if(t.vagones){requireThat(Array.isArray(t.vagones),'Formación inválida.');for(const v of t.vagones)requireThat(typeof v.matricula==='string'&&Number.isFinite(v.tara)&&v.tara>0&&Number.isFinite(v.neto)&&v.neto>=0&&v.bruto===round(v.tara+v.neto)&&Number.isInteger(v.alta)&&v.alta>=0&&v.alta<t.tramos.length&&(v.baja===null||Number.isInteger(v.baja)&&v.baja>=v.alta&&v.baja<t.tramos.length),'Vagón inválido.');const copy=structuredClone(t);wagonTotals(copy);requireThat(copy.ton===t.ton&&copy.tramos.every((s,i)=>s.ton===t.tramos[i].ton),'El tonelaje no coincide con la formación.');}
  }
  return s;
}
function validatePlanning(next,previous,users,company){
 requireThat(same(next.crew,previous.crew),'El personal se administra desde las cuentas autorizadas.');
 requireThat(same(next.history,previous.history),'El historial es inmutable.');
 for(const old of previous.trains){const n=next.trains.find(t=>t.nroPlan===old.nroPlan);if(old.estado!=='Programado'||old.tramoActualIdx>0)requireThat(same(n,old),'No se puede editar un viaje iniciado.');if(n){for(const k of ['observaciones','vagones','tramoActualIdx','estado','coordsActuales'])requireThat(same(n[k],old[k]),'Usá los controles operativos del viaje.');}}
 for(const t of next.trains){
  const old=previous.trains.find(x=>x.nroPlan===t.nroPlan);if(old&&same(old,t))continue;
  requireThat(t.estado==='Programado'&&t.tramoActualIdx===0&&t.tramos.every(s=>s.estado==='Pendiente'&&!s.startTime&&!s.endTime),'La planificación debe estar pendiente.');
  if(!old)requireThat(!t.vagones&&!(t.observaciones||[]).length&&!previous.history.some(h=>h.nroPlan===t.nroPlan),'Número de viaje usado o datos operativos no permitidos.');
  const crew=[t.conductor,t.ayudante,t.piloto].filter(x=>x&&x!=='Ninguno');requireThat(crew.length&&new Set(crew).size===crew.length,'Tripulación duplicada.');
  for(const name of crew)requireThat(users.some(x=>x.enabled&&x.empresa===company&&x.name===name&&x.role==='Maquinista'),'Tripulante no autorizado.');
  const start=Date.parse(t.salida),end=Date.parse(t.llegada);requireThat(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&start>=Date.now()-60000,'Horario inválido.');
  const loco=next.locomotives.find(l=>l.id===t.locoId);requireThat(loco?.estado==='Operativa'&&t.ton<=loco.maxArrastre,'Locomotora o tonelaje inválido.');
  for(const other of next.trains.filter(x=>x!==t)){const overlap=other.estado==='En Tránsito'||start<Date.parse(other.llegada)&&end>Date.parse(other.salida);requireThat(!overlap||!(other.locoId===t.locoId||crew.some(n=>[other.conductor,other.ayudante,other.piloto].includes(n))),'Superposición de locomotora o tripulación.');}
 }
 for(const old of previous.locomotives){const l=next.locomotives.find(x=>x.id===old.id);requireThat(l&&l.km===old.km,'El kilometraje solo cambia al cerrar un tramo.');if(next.trains.some(t=>t.locoId===old.id))requireThat(l.estado==='Operativa','La locomotora tiene viajes asignados.');}
}
module.exports={fail,requireThat,logistics,assigned,note,wagonTotals,operate,validateState,validatePlanning};
