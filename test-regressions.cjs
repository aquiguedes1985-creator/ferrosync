const test=require('node:test');
const assert=require('node:assert/strict');
const {operate,validatePlanning}=require('./domain.cjs');
const {memoryStore}=require('./backend/store.cjs');
const {bootstrap}=require('./backend/api.cjs');
const {createServer}=require('./server.cjs');
function fixture(){
 const user={name:'Conductor',empresa:'RAS',role:'Maquinista',enabled:true};
 const trip={nroPlan:'REG-01',empresa:'RAS',conductor:user.name,ayudante:'Ninguno',piloto:'Ninguno',locoId:'L1',ton:100,estado:'Programado',tramoActualIdx:0,salida:new Date(Date.now()+3600000).toISOString(),llegada:new Date(Date.now()+7200000).toISOString(),tramos:[{id:1,oName:'A',dName:'B',estado:'Pendiente',dist:10},{id:2,oName:'B',dName:'C',estado:'Pendiente',dist:20}]};
 return {user,trip,state:{trains:[trip],history:[],crew:[],locomotives:[{id:'L1',empresa:'RAS',estado:'Operativa',maxArrastre:150,km:0}]}};
}
test('Un vagón futuro conserva la carga del tramo en curso y del historial',()=>{
 const {user,trip,state}=fixture();
 operate(state,user,{action:'start',plan:trip.nroPlan,fuel:100});
 operate(state,user,{action:'wagon-add',plan:trip.nroPlan,tramo:1,matricula:'V1',tara:20,neto:30});
 assert.equal(trip.ton,100);assert.equal(trip.tramos[0].ton,100);assert.equal(trip.tramos[1].ton,50);
 operate(state,user,{action:'finish',plan:trip.nroPlan,fuel:50});
 assert.equal(state.history[0].ton,100);assert.equal(trip.ton,50);
 operate(state,user,{action:'wagon-add',plan:trip.nroPlan,tramo:1,matricula:'V2',tara:10,neto:10});
 assert.equal(trip.tramos[0].ton,100);assert.equal(state.history[0].viaje.tramos[0].ton,100);assert.equal(trip.ton,70);
});
test('La primera formación después del cierre conserva el tonelaje declarado anterior',()=>{
 const {user,trip,state}=fixture();
 operate(state,user,{action:'start',plan:trip.nroPlan,fuel:100});operate(state,user,{action:'finish',plan:trip.nroPlan,fuel:50});
 operate(state,user,{action:'wagon-add',plan:trip.nroPlan,tramo:1,matricula:'V1',tara:20,neto:30});
 assert.equal(trip.tramos[0].ton,100);assert.equal(trip.ton,50);assert.equal(state.history[0].ton,100);
});
test('Una edición de locomotora valida la carga asignada y la de tramos futuros',()=>{
 const {state}=fixture();const next=structuredClone(state);next.locomotives[0].maxArrastre=90;
 assert.throws(()=>validatePlanning(next,state,[],'RAS'),/tonelaje/);
 const future=structuredClone(state);future.trains[0].tramos[1].ton=140;
 const lower=structuredClone(future);lower.locomotives[0].maxArrastre=120;
 assert.throws(()=>validatePlanning(lower,future,[],'RAS'),/tonelaje/);
});
test('La planificación exige conductor aunque haya ayudante habilitado',()=>{
 const {state,user}=fixture();state.trains[0].conductor='Ninguno';state.trains[0].ayudante=user.name;
 assert.throws(()=>validatePlanning(state,{...state,trains:[]},[user],'RAS'),/conductor/);
});
test('El inicio rechaza cargas excesivas y el cierre no convierte valores vacíos en cero',()=>{
 const {state,user,trip}=fixture();state.locomotives[0].maxArrastre=90;
 assert.throws(()=>operate(state,user,{action:'start',plan:trip.nroPlan,fuel:100}),/arrastre/);
 state.locomotives[0].maxArrastre=150;operate(state,user,{action:'start',plan:trip.nroPlan,fuel:100});
 for(const fuel of [null,false,'','   '])assert.throws(()=>operate(state,user,{action:'finish',plan:trip.nroPlan,fuel}),/combustible/);
 operate(state,user,{action:'finish',plan:trip.nroPlan,fuel:0});assert.equal(state.history[0].cFin,0);
});
test('Cambiar la empresa no elude el bloqueo del administrador general',async()=>{
 const store=memoryStore();await bootstrap(store,{name:'General',pass:'PruebaAdmin2026!'});
 const server=createServer(__dirname,store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(let i=0;i<11;i++){
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/sync?action=login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'General',adminScope:'general',empresa:'Empresa-'+i,pass:'Incorrecta2026!'})});
  await response.json();assert.equal(response.status,i<10?401:429);
 }}finally{await new Promise(r=>server.close(r));}
});
