const assert=require('node:assert/strict');
const {memoryStore,postgresStore}=require('./backend/store.cjs');
const {bootstrap}=require('./backend/api.cjs');
const {createServer}=require('./server.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 process.env.CRON_SECRET='FerroSync-test-cron-only';
 const testDatabase=process.env.TEST_DATABASE_URL;
 if(testDatabase){const parsed=new URL(testDatabase);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.pathname,'/ferrosync_test');}
 const store=testDatabase?postgresStore(testDatabase):memoryStore();await bootstrap(store,{name:'Administracion',pass:'PruebaSegura2026!'});
 const server=createServer(__dirname,store);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 const request=async(action,body,cookie)=>{const response=await fetch(`${base}/api/sync?action=${action}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
 const admin=await request('login',{name:'Administracion',pass:'PruebaSegura2026!',empresa:'RAS'});assert.equal(admin.status,200);
 for(const [name,role]of [['Conductor','Maquinista'],['Ayudante','Maquinista'],['Oficina','Logística']])assert.equal((await request('admin',{operation:'user',name,role,pass:'PruebaSegura2026!',empresa:'RAS'},admin.cookie)).status,200);
 let snapshot=(await request('state',null,admin.cookie)).data;
 const trip={nroPlan:'SYNC-01',empresa:'RAS',descripcion:'Madera',ton:100,locoId:'L1',conductor:'Conductor',ayudante:'Ayudante',piloto:'Ninguno',estado:'Programado',tramoActualIdx:0,salida:new Date(Date.now()+3600000).toISOString(),llegada:new Date(Date.now()+7200000).toISOString(),tramos:[{id:1,oName:'Puerto',dName:'Florida',dist:97,estado:'Pendiente'},{id:2,oName:'Florida',dName:'Durazno',dist:92,estado:'Pendiente'}]};
 snapshot.state.trains=[trip];snapshot.state.locomotives=[{id:'L1',modelo:'Prueba',estado:'Operativa',empresa:'RAS',maxArrastre:1200,km:0,max:50000}];
 assert.equal((await request('state',{revision:snapshot.revision,state:snapshot.state},admin.cookie)).status,200);
 const helper=await request('login',{name:'Ayudante',pass:'PruebaSegura2026!',empresa:'RAS'});
 assert.equal((await request('admin',{operation:'company',empresa:'AFE'},helper.cookie)).status,403);
 assert.equal((await request('state',{revision:helper.data.revision,state:helper.data.state},helper.cookie)).status,403);
 assert.equal((await request('operate',{revision:helper.data.revision,action:'start',plan:'SYNC-01',fuel:100},helper.cookie)).status,403);
 assert.equal((await request('state')).status,401);
 assert.equal((await request('state',{revision:0,state:snapshot.state},admin.cookie)).status,409);
 console.log('OK: autorización del servidor, sesión obligatoria y rechazo de conflictos.');
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const officeContext=await browser.newContext(),helperContext=await browser.newContext({viewport:{width:390,height:844}});const office=await officeContext.newPage(),phone=await helperContext.newPage();const errors=[];
 async function login(page,name){page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(base);await page.waitForFunction(()=>window.ferroReady);await page.locator('[onclick="selectCompany(\'RAS\', this)"]').click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.locator('#login-name').fill(name);await page.locator('#login-pass').fill('PruebaSegura2026!');await page.getByRole('button',{name:'Ingresar al Sistema',exact:true}).click();await page.locator('#main-app').waitFor({state:'visible'});}
 await login(office,'Oficina');await login(phone,'Ayudante');
 await phone.locator('#maq-novedad').fill('Nota desde el celular');await phone.getByRole('button',{name:'Registrar observación',exact:true}).click();await office.waitForFunction(()=>trenesActivos[0].observaciones?.length===1);assert.equal(await office.locator('#kpi-obs').textContent(),'0');
 await phone.locator('#maq-novedad').fill('Falla de freno');await phone.locator('#maq-novedad-categoria').selectOption('Mecánica');await phone.locator('#maq-novedad-gravedad').selectOption('Alta');await phone.getByRole('button',{name:'Registrar observación',exact:true}).click();await office.waitForFunction(()=>trenesActivos[0].observaciones?.length===2);assert.equal(await office.locator('#kpi-obs').textContent(),'1');
 await office.locator('[data-detalle="SYNC-01"]').first().click();await office.locator('#v-matricula').fill('V001');await office.locator('#v-carga').fill('Madera');await office.locator('#v-tara').fill('20');await office.locator('#v-neto').fill('50');await office.getByRole('button',{name:'Dar de alta vagón'}).click();await office.waitForFunction(()=>trenesActivos[0].ton===70);
 await office.locator('#v-tramo').selectOption('1');await office.locator('#v-motivo').fill('Descarga parcial');await office.getByRole('button',{name:'Dar de baja vagón'}).click();await office.waitForFunction(()=>trenesActivos[0].vagones[0].baja===1);assert.deepEqual(await office.evaluate(()=>trenesActivos[0].tramos.map(t=>t.ton)),[70,0]);assert.match(await office.locator('#detalle-contenido').textContent(),/V001/);
 fs.mkdirSync('artifacts/servidor',{recursive:true});await phone.screenshot({path:'artifacts/servidor/celular.png',fullPage:true});await office.screenshot({path:'artifacts/servidor/logistica.png',fullPage:true});
 await office.evaluate(()=>{document.getElementById('informe-impresion').innerHTML=informeViaje(obtenerViaje('SYNC-01'));document.getElementById('detalle-viaje').close();});await office.emulateMedia({media:'print'});await office.pdf({path:'artifacts/servidor/informe.pdf'});
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('OK: dos navegadores independientes, nota informativa, imprevisto, alta/baja por tramo, tonelaje, PDF y móvil.');
 const driver=await request('login',{name:'Conductor',pass:'PruebaSegura2026!',empresa:'RAS'});
 async function operation(action,extra={},cookie=driver.cookie){const latest=(await request('state',null,cookie)).data;return request('operate',{revision:latest.revision,action,plan:'SYNC-01',...extra},cookie);}
 assert.equal((await operation('start',{fuel:200})).status,200);
 assert.equal((await operation('wagon-add',{tramo:0,matricula:'RECHAZADO',tara:20,neto:10})).status,400);
 assert.equal((await operation('finish',{fuel:250})).status,400);
 assert.equal((await operation('finish',{fuel:100})).status,200);
 assert.equal((await operation('start',{fuel:100})).status,200);
 assert.equal((await operation('finish',{fuel:0})).status,200);
 const completed=(await request('state',null,admin.cookie)).data;
 assert.equal(completed.state.trains.length,0);assert.deepEqual(completed.state.history.map(h=>h.ton),[70,0]);assert.equal(completed.state.locomotives[0].km,189);
 const incident=completed.state.history.at(-1).viaje.observaciones.find(o=>o.categoria==='Mecánica');
 assert.equal((await operation('incident',{id:incident.id,estado:'En atención',responsable:'Taller'},admin.cookie)).status,200);
 assert.equal((await operation('incident',{id:incident.id,estado:'Resuelto',responsable:'Taller'},admin.cookie)).status,200);
 assert.equal((await request('cron')).status,401);
 assert.equal((await request('state',null,helper.cookie)).data.users.some(u=>u.hash),false);
 console.log('OK: inicio/cierre de dos tramos, combustible cero, pesos históricos, kilometraje y resolución posterior al viaje.');
 const saved=(await request('backup',null,admin.cookie)).data;assert.equal(saved.format,'ferrosync-backup');const revision=(await request('state',null,admin.cookie)).data.revision;
 const invalid=structuredClone(saved);invalid.company='AFE';assert.equal((await request('restore',{revision,backup:invalid},admin.cookie)).status,400);
 assert.equal((await request('restore',{revision,backup:saved},admin.cookie)).status,200);
 assert.equal((await request('state',null,helper.cookie)).status,401);
 const restored=(await request('state',null,admin.cookie)).data;assert.deepEqual(restored.state,saved.state);
 const copies=(await request('backups',null,admin.cookie)).data;assert.ok(copies.some(b=>b.reason==='Antes de restaurar'));
 const scheduled=await fetch(`${base}/api/sync?action=cron`,{headers:{Authorization:'Bearer FerroSync-test-cron-only'}});assert.equal(scheduled.status,200);
 const scheduledCopies=(await request('backups',null,admin.cookie)).data;assert.ok(scheduledCopies.some(b=>b.reason==='Automática diaria'));
 assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/servidor/results.json',JSON.stringify({passed:true,errors,checks:['permissions','conflict','two-context-sync','incidents','wagons','PDF','restore']},null,2));console.log('OK: respaldo, restauración y aislamiento por empresa.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));await store.close?.();}
})().catch(e=>{console.error(e);process.exitCode=1;});
