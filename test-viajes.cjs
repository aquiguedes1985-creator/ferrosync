const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createServer}=require('./server.cjs');
let browser,server;
(async()=>{
  let baseURL=process.env.BASE_URL;
  if(!baseURL){server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));baseURL=`http://127.0.0.1:${server.address().port}/`;}
  const artifacts=path.resolve(process.env.ARTIFACT_DIR||'artifacts/viajes');fs.mkdirSync(artifacts,{recursive:true});
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(baseURL);await page.waitForFunction(()=>window.ferroReady);
  await page.evaluate(async()=>{
    currentCompany='RAS';
    const key=await generarClave('Prueba2026!');
    usuariosBD=['Conductor','Ayudante','Oficina'].map(name=>({name,...key,role:name==='Oficina'?'Logística':'Maquinista',empresa:'RAS'}));
    locomotoras=[{id:'RAS-TEST',modelo:'Prueba',estado:'Operativa',empresa:'RAS',km:0,max:50000}];
    trenesActivos=[{nroPlan:'OBS-001',empresa:'RAS',descripcion:'Carga de madera',ton:450,locoId:'RAS-TEST',conductor:'Conductor',ayudante:'Ayudante',piloto:'Ninguno',estado:'Programado',tramoActualIdx:0,salida:new Date().toISOString(),llegada:new Date(Date.now()+3600000).toISOString(),tramos:[{id:1,oName:'Origen',dName:'Destino',dist:50,estado:'Pendiente',reglamento:'Prueba'}]}];
    await guardarEstado();document.getElementById('company-screen').style.display='none';document.getElementById('auth-screen').style.display='flex';
  });
  async function login(name){await page.locator('#login-name').fill(name);await page.locator('#login-pass').fill('Prueba2026!');await page.getByRole('button',{name:'Ingresar al Sistema',exact:true}).click();await page.locator('#main-app').waitFor({state:'visible'});}
  async function logout(){await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();}
  await login('Ayudante');await page.locator('#maq-novedad').fill('Dos vagones fuera de formación <script>');await page.getByRole('button',{name:'Registrar observación',exact:true}).click();
  await page.waitForFunction(()=>miTren.observaciones?.length===1);assert.equal(await page.locator('#maq-tramo-inicio').isVisible(),false);
  await logout();await login('Conductor');await page.locator('#maq-obs-inicio').fill('Se inicia con formación revisada');await page.locator('#maq-comb-inicio').fill('200');await page.getByRole('button',{name:'Iniciar Tramo y Activar GPS'}).click();await page.locator('#maq-tramo-fin').waitFor({state:'visible'});
  await logout();await login('Ayudante');await page.locator('#maq-novedad').fill('Demora durante el recorrido');await page.getByRole('button',{name:'Registrar observación',exact:true}).click();await page.waitForFunction(()=>miTren.observaciones?.length===3);assert.equal(await page.evaluate(()=>miTren.estado),'En Tránsito');
  await page.reload();await login('Ayudante');assert.match(await page.locator('#maq-novedades').textContent(),/Demora durante/);
  await logout();await login('Oficina');assert.equal(await page.locator('#kpi-obs').textContent(),'1');assert.equal(await page.locator('#kpi-activos').textContent(),'1');
  await page.getByRole('button',{name:'Ver observados',exact:true}).click();assert.match(await page.locator('#detalle-contenido').textContent(),/Dos vagones/);await page.locator('#detalle-contenido [data-detalle]').click();
  await page.locator('#detalle-observacion').fill('Logística informada');await page.locator('#detalle-contenido').getByRole('button',{name:'Registrar observación',exact:true}).click();await page.waitForFunction(()=>trenesActivos[0].observaciones.length===4);
  assert.equal(await page.locator('#detalle-contenido script').count(),0);
  await page.screenshot({path:path.join(artifacts,'observados-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{window.print=()=>{window.impresionSolicitada=true;};});
  await page.getByRole('button',{name:'Exportar a PDF',exact:true}).click();assert.equal(await page.evaluate(()=>window.impresionSolicitada),true);
  await page.locator('#detalle-viaje > button').click();await page.emulateMedia({media:'print'});
  assert.match(await page.locator('#informe-impresion').textContent(),/450 t/);await page.pdf({path:path.join(artifacts,'viaje-OBS-001.pdf'),preferCSSPageSize:true});await page.screenshot({path:path.join(artifacts,'informe-pdf.png'),fullPage:true});await page.emulateMedia({media:'screen'});
  await logout();await login('Conductor');await page.locator('#maq-obs').fill('Servicio finalizado con demora');await page.locator('#maq-comb-fin').fill('100');await page.getByRole('button',{name:'Cerrar Tramo',exact:true}).click();await page.waitForFunction(()=>trenesActivos.length===0);
  await logout();await login('Oficina');await page.getByRole('button',{name:'Ver observados',exact:true}).click();assert.match(await page.locator('#detalle-contenido').textContent(),/Servicio finalizado/);await page.locator('#detalle-contenido [data-detalle]').click();assert.equal(await page.locator('#detalle-observacion').count(),0);assert.match(await page.locator('#detalle-contenido').textContent(),/Finalizado/);
  assert.equal(await page.evaluate(()=>obtenerViaje('inexistente')),null);
  await page.evaluate(()=>{currentCompany='AFE';});assert.equal(await page.evaluate(()=>obtenerViaje('OBS-001')),null);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({at:new Date().toISOString(),baseURL,errors,passed:true},null,2));
  console.log('OK: ayudante antes/durante, inicio/fin, estado independiente, persistencia, Logística, historial, PDF, móvil y aislamiento de empresa.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
