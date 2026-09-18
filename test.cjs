const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('./server.cjs');
let browser,server;
(async()=>{
 let baseURL=process.env.BASE_URL;
 if(!baseURL){server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseURL=`http://127.0.0.1:${server.address().port}/`;}
 const artifacts=path.resolve(process.env.ARTIFACT_DIR||'artifacts/local');fs.mkdirSync(artifacts,{recursive:true});
 browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
 const context=await browser.newContext({viewport:{width:1365,height:900},timezoneId:'America/Montevideo'});
 const page=await context.newPage();const errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const check=(name)=>{results.push(name);console.log('OK: '+name);};
 await page.goto(baseURL);await page.waitForFunction(()=>window.ferroReady);
 await page.locator('[onclick="selectCompany(\'RAS\', this)"]').click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
 async function register(name,role){await page.locator('#form-login .auth-switch').first().click();await page.locator(`#form-register [onclick="selectRegRole('${role}', this)"]`).click();await page.locator('#reg-name').fill(name);await page.locator('#reg-pass').fill('PruebaRAS2026!');await page.getByRole('button',{name:'Registrarse',exact:true}).click();await page.locator('#form-login').waitFor({state:'visible'});}
 async function login(name){await page.locator('#login-name').fill(name);await page.locator('#login-pass').fill('PruebaRAS2026!');await page.getByRole('button',{name:'Ingresar al Sistema',exact:true}).click();await page.locator('#main-app').waitFor({state:'visible'});}
 async function logout(){await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();}
 await register('Prueba Maquinista Uno','Maquinista');await register('Prueba Maquinista Dos','Maquinista');await register('Prueba Logística','Logística');await login('Prueba Logística');
 assert.equal(await page.evaluate(()=>usuariosBD.filter(u=>u.hash&&!u.pass).length),3);check('Tres cuentas creadas por interfaz, contraseñas derivadas con sal');
 const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'America/Montevideo'});
 async function fillPlan(id,driver,loco,start,end,ori='0',dst='6'){
  await page.locator('#nav-logistica .nav-item').nth(1).click();
  await page.getByRole('button',{name:'Nueva planificación / cancelar edición'}).click();
  for(const [sel,v] of Object.entries({'d-id':id,'d-desc':'Viaje de prueba','d-f-ini':tomorrow,'d-h-ini':start,'d-f-fin':tomorrow,'d-h-fin':end,'d-tonelaje':'400'}))await page.locator('#'+sel).fill(v);
  await page.locator('#d-locomotora').selectOption(loco);await page.locator('#d-conductor').selectOption(driver);await page.locator('[id^="tl-ori-"]').selectOption(ori);await page.locator('[id^="tl-dst-"]').selectOption(dst);
 }
 const save=()=>page.getByRole('button',{name:'Guardar Planificación'}).click();
 await fillPlan('QA-001','Prueba Maquinista Uno','RAS-01','09:00','12:00');
 await page.locator('#d-h-fin').fill('08:00');await save();assert.match(await page.locator('#error-despacho').textContent(),/posterior/);await page.locator('#d-h-fin').fill('12:00');
 await page.locator('#d-tonelaje').fill('9999');await save();assert.match(await page.locator('#error-despacho').textContent(),/1200/);await page.locator('#d-tonelaje').fill('400');
 await page.locator('#d-ayudante').selectOption('Prueba Maquinista Uno');await save();assert.match(await page.locator('#error-despacho').textContent(),/dos roles/);await page.locator('#d-ayudante').selectOption('Ninguno');
 await page.locator('[id^="tl-dst-"]').selectOption('0');await save();assert.match(await page.locator('#error-despacho').textContent(),/diferentes/);await page.locator('[id^="tl-dst-"]').selectOption('6');
 await save();await page.locator('#panel-dashboard.active').waitFor();check('Rechazo de horarios invertidos, sobrecarga, doble rol y recorrido nulo');
 await fillPlan('QA-002','Prueba Maquinista Uno','RAS-02','10:00','13:00');await save();assert.match(await page.locator('#error-despacho').textContent(),/superposición/);
 await page.locator('#d-conductor').selectOption('Prueba Maquinista Dos');await page.locator('#d-locomotora').selectOption('RAS-01');await save();assert.match(await page.locator('#error-despacho').textContent(),/superposición/);
 await page.locator('#d-locomotora').selectOption('RAS-02');await save();await page.locator('#panel-dashboard.active').waitFor();check('Superposición de tripulación y locomotora bloqueada');
 await fillPlan('QA-MULTI','Prueba Maquinista Uno','RAS-01','14:00','20:00');await page.getByRole('button',{name:'Añadir Tramo'}).click();await page.locator('[id^="tl-dst-"]').nth(1).selectOption('8');await save();assert.match(await page.locator('#error-despacho').textContent(),/coincidir/);await page.locator('[id^="tl-ori-"]').nth(1).selectOption('6');await save();await page.locator('#panel-dashboard.active').waitFor();await page.locator('[data-cancel="QA-MULTI"]').click();await page.waitForFunction(()=>trenesActivos.length===2);check('Continuidad entre tramos, reutilización de recursos en otro horario y cancelación');
 await page.locator('[data-edit="QA-001"]').click();assert.equal(await page.locator('#d-conductor').inputValue(),'Prueba Maquinista Uno');assert.equal(await page.locator('#d-h-ini').inputValue(),'09:00');await page.locator('#d-desc').fill('<img src=x onerror=alert(1)>');await save();await page.locator('#panel-dashboard.active').waitFor();assert.equal(await page.locator('#dash-tabla img').count(),0);check('Edición conserva asignación y horario; texto HTML no se ejecuta');
 await page.reload();await login('Prueba Logística');assert.equal(await page.locator('#kpi-prog').textContent(),'2');check('Dos viajes y usuarios persisten tras recarga');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'qa-mobile.png'),fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check('Vista móvil de 390 px sin desborde de página');await page.setViewportSize({width:1365,height:900});
 await page.evaluate(async()=>{const other=structuredClone(trenesActivos.find(t=>t.nroPlan==='QA-001'));other.empresa='AFE';trenesActivos.push(other);await guardarEstado();});
 await logout();await login('Prueba Maquinista Uno');assert.match(await page.locator('#maq-tren-id').textContent(),/QA-001/);
 await page.locator('#maq-comb-inicio').fill('100');await page.getByRole('button',{name:'Iniciar Tramo y Activar GPS'}).click();await page.locator('#maq-tramo-fin').waitFor({state:'visible'});await page.reload();await login('Prueba Maquinista Uno');await page.locator('#maq-tramo-fin').waitFor({state:'visible'});assert.notEqual(await page.locator('#maq-timer').textContent(),'');
 await page.locator('#maq-comb-fin').fill('0');await page.getByRole('button',{name:'Cerrar Tramo',exact:true}).click();await page.waitForFunction(()=>historial.length===1&&trenesActivos.filter(t=>t.empresa==='RAS').length===1);check('Inicio, recuperación al recargar, cierre con combustible cero e historial');assert.equal(await page.evaluate(()=>trenesActivos.some(t=>t.empresa==='AFE'&&t.nroPlan==='QA-001')),true);check('Cerrar un viaje conserva el mismo número en otra operadora');
 await logout();await login('Prueba Logística');assert.equal(await page.locator('#kpi-completados').textContent(),'1');assert.equal(await page.evaluate(()=>locomotoras.find(l=>l.id==='RAS-01').km),97);check('Completados cuenta viajes y kilometraje aumenta por distancia');
 await page.locator('#nav-logistica .nav-item').last().click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'EXCEL / CSV'}).click();const download=await downloadPromise;await download.saveAs(path.join(artifacts,'qa-export.csv'));assert.match(fs.readFileSync(path.join(artifacts,'qa-export.csv'),'utf8'),/QA-001/);check('Exportación CSV descargada y verificada');
 const second=await context.newPage();second.on('dialog',d=>d.accept());await second.goto(baseURL);await second.waitForFunction(()=>window.ferroReady);await second.locator('#login-name').fill('Prueba Logística');await second.locator('#login-pass').fill('PruebaRAS2026!');await second.getByRole('button',{name:'Ingresar al Sistema',exact:true}).click();await second.locator('#main-app').waitFor({state:'visible'});
 await page.locator('#nav-logistica .nav-item').first().click();await page.locator('[data-edit="QA-002"]').click();await page.locator('#d-desc').fill('Actualizado entre pestañas');await save();await second.waitForFunction(()=>trenesActivos.find(t=>t.nroPlan==='QA-002').descripcion==='Actualizado entre pestañas');assert.match(await second.locator('#dash-tabla').textContent(),/Actualizado entre pestañas/);await second.close();check('Sincronización del cambio entre dos pestañas');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await context.setOffline(true);await page.reload();await login('Prueba Logística');assert.equal(await page.locator('#kpi-prog').textContent(),'1');check('Aplicación y datos utilizables sin conexión después de la primera carga');await context.setOffline(false);
 const conflict=await page.evaluate(async()=>{revision--;try{await guardarEstado();return false;}catch(error){return error.message.includes('otra pestaña')&&trenesActivos.filter(t=>t.empresa==='RAS').length===1;}});assert.equal(conflict,true);check('Guardado obsoleto rechazado sin pérdida de viajes');
 assert.deepEqual(errors,[]);check('Sin excepciones JavaScript durante el flujo');
 if(server){assert.equal((await fetch(new URL('perfil-demo/Local State',baseURL))).status,404);assert.equal((await fetch(new URL('original.html',baseURL))).status,404);check('Servidor local no expone perfiles ni archivos internos');}
 fs.writeFileSync(path.join(artifacts,'qa-results.json'),JSON.stringify({at:new Date().toISOString(),baseURL,results,errors},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
