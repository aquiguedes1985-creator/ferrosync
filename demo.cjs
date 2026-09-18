const {chromium}=require('playwright');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const context=await chromium.launchPersistentContext(path.join(__dirname,'perfil-demo'),{headless:true,channel:'msedge',viewport:{width:1440,height:1000},timezoneId:'America/Montevideo'});
 const page=context.pages()[0]||await context.newPage();page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:8765');
 await page.waitForFunction(()=>window.ferroReady);
 if(await page.locator('#company-screen').isVisible()){await page.locator('[onclick="selectCompany(\'RAS\', this)"]').click();await page.getByRole('button',{name:'Continuar',exact:true}).click();}
 const names=['Demo Maquinista Uno','Demo Maquinista Dos','Demo Logística'];
 for(let i=0;i<names.length;i++){
  if(await page.evaluate(name=>usuariosBD.some(u=>u.empresa==='RAS'&&u.name===name),names[i]))continue;
  await page.locator('#form-login .auth-switch').first().click();await page.locator(`#form-register [onclick="selectRegRole('${i<2?'Maquinista':'Logística'}', this)"]`).click();await page.locator('#reg-name').fill(names[i]);await page.locator('#reg-pass').fill('FerroDemo2026!');await page.getByRole('button',{name:'Registrarse',exact:true}).click();await page.locator('#form-login').waitFor({state:'visible'});
 }
 async function login(name){await page.locator('#login-name').fill(name);await page.locator('#login-pass').fill('FerroDemo2026!');await page.getByRole('button',{name:'Ingresar al Sistema',exact:true}).click();await page.locator('#main-app').waitFor({state:'visible'});}
 await login(names[2]);
 const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'America/Montevideo'});
 const plans=[{id:'RAS-DEMO-001',loco:'RAS-01',driver:names[0],from:'0',to:'6',start:'09:00',end:'12:00',description:'Prueba: Puerto — Florida',ton:'400'},{id:'RAS-DEMO-002',loco:'RAS-02',driver:names[1],from:'6',to:'7',start:'13:00',end:'16:00',description:'Prueba: Florida — Durazno',ton:'500'}];
 for(const p of plans){
  if(await page.evaluate(id=>trenesActivos.some(t=>t.empresa==='RAS'&&t.nroPlan===id),p.id))continue;
  await page.locator('#nav-logistica .nav-item').nth(1).click();await page.getByRole('button',{name:'Nueva planificación / cancelar edición'}).click();
  for(const [id,value] of Object.entries({'d-id':p.id,'d-desc':p.description,'d-f-ini':tomorrow,'d-h-ini':p.start,'d-f-fin':tomorrow,'d-h-fin':p.end,'d-tonelaje':p.ton}))await page.locator('#'+id).fill(value);
  await page.locator('#d-locomotora').selectOption(p.loco);await page.locator('#d-conductor').selectOption(p.driver);await page.locator('[id^="tl-ori-"]').selectOption(p.from);await page.locator('[id^="tl-dst-"]').selectOption(p.to);await page.getByRole('button',{name:'Guardar Planificación'}).click();await page.locator('#panel-dashboard.active').waitFor();
 }
 await page.reload();await login(names[2]);assert.equal(await page.locator('#kpi-prog').textContent(),'2');
 await page.screenshot({path:'viajes-programados.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'viajes-celular.png',fullPage:true,animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:1000});
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await login(names[i]);assert.match(await page.locator('#maq-tren-id').textContent(),new RegExp(plans[i].id));}
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await login(names[2]);
 const snapshot=await page.evaluate(()=>({usuarios:usuariosBD.map(({name,role,empresa})=>({name,role,empresa})),viajes:trenesActivos}));
 fs.writeFileSync('viajes-creados.json',JSON.stringify(snapshot,null,2));
 console.log(JSON.stringify(snapshot,null,2));await context.close();
})().catch(e=>{console.error(e);process.exit(1);});
