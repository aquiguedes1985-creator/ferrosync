const assert=require('node:assert/strict');
const {memoryStore}=require('./backend/store.cjs');
const {bootstrap}=require('./backend/api.cjs');
const {createServer}=require('./server.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const store=memoryStore();await bootstrap(store,{name:'General',pass:'PruebaAdmin2026!'});
 const server=createServer(__dirname,store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(action,body,cookie){const r=await fetch(base+'/api/sync?action='+action,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 let browser;
 try{
  const general=await request('login',{name:'General',pass:'PruebaAdmin2026!',adminScope:'general'});assert.equal(general.status,200);
  const administrators={};
  for(const empresa of ['RAS','SELF','AFE','DBCC']){
   assert.equal((await request('admin',{operation:'user',empresa,name:'admin.'+empresa.toLowerCase(),role:'Administrador',pass:'PruebaAdmin2026!'},general.cookie)).status,200);
   const login=await request('login',{empresa,name:'admin.'+empresa.toLowerCase(),pass:'PruebaAdmin2026!',adminScope:'company'});assert.equal(login.status,200);administrators[empresa]=login;
   assert.equal((await request('admin',{operation:'user',empresa,name:'Usuario '+empresa,role:'Maquinista',pass:'PruebaAdmin2026!'},login.cookie)).status,200);
   const list=await request('admin',null,login.cookie);assert.deepEqual(list.data.companies.map(c=>c.id),[empresa]);assert.ok(list.data.users.every(u=>u.empresa===empresa&&u.adminScope!=='general'));
   for(const other of ['RAS','SELF','AFE','DBCC'].filter(x=>x!==empresa))assert.equal((await request('admin',{operation:'user',empresa:other,name:'Intruso',role:'Maquinista',pass:'PruebaAdmin2026!'},login.cookie)).status,403);
   assert.equal((await request('admin',{operation:'company',empresa,enabled:false},login.cookie)).status,403);
   assert.equal((await request('admin',{operation:'user',empresa,name:'Escalada',role:'Administrador',pass:'PruebaAdmin2026!'},login.cookie)).status,403);
   assert.equal((await request('admin',{operation:'user',empresa,name:'Escalada',role:'Maquinista',adminScope:'general',pass:'PruebaAdmin2026!'},login.cookie)).status,403);
   assert.equal((await request('login',{empresa,name:'admin.'+empresa.toLowerCase(),pass:'PruebaAdmin2026!',adminScope:'general'})).status,401);
   assert.equal((await request('admin',{operation:'user',empresa,name:'Otro admin',role:'Administrador',pass:'PruebaAdmin2026!'},general.cookie)).status,400);
  }
  const ras=administrators.RAS,afe=administrators.AFE;
  assert.equal((await request('admin',{operation:'user',id:afe.data.user.id,empresa:'RAS',name:afe.data.user.name,role:'Maquinista',pass:'PruebaAdmin2026!'},ras.cookie)).status,403);
  assert.equal((await request('restore',{revision:(await request('state',null,ras.cookie)).data.revision,backup:{}},ras.cookie)).status,403);
  const normal=await request('login',{empresa:'RAS',name:'Usuario RAS',pass:'PruebaAdmin2026!'});assert.equal((await request('admin',null,normal.cookie)).status,403);
  assert.equal((await request('login',{empresa:'RAS',name:'Usuario RAS',pass:'PruebaAdmin2026!',adminScope:'company'})).status,401);
  console.log('OK: cuatro operadoras, 12 cruces rechazados, ID ajeno, escalada de privilegios, duplicados, respaldos y usuario normal.');
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  fs.mkdirSync('artifacts/admin',{recursive:true});const errors=[];
  for(const entry of ['general','RAS','SELF','AFE','DBCC']){
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.waitForFunction(()=>window.ferroReady);
   await page.getByRole('button',{name:'Administrador',exact:true}).click();assert.equal(await page.locator('[data-admin-entry]').count(),5);
   if(entry==='general')await page.screenshot({path:'artifacts/admin/accesos-mobile.png',fullPage:true});
   await page.locator(`[data-admin-entry="${entry}"]`).click();await page.locator('#login-name').fill(entry==='general'?'General':'admin.'+entry.toLowerCase());await page.locator('#login-pass').fill('PruebaAdmin2026!');await page.getByRole('button',{name:'Ingresar al Sistema',exact:true}).click();await page.locator('#admin-name').waitFor({state:'visible'});
   assert.equal(await page.locator('#admin-company option').count(),entry==='general'?4:1);
   await page.locator('#admin-name').fill('Creado UI '+entry);await page.locator('#admin-pass').fill('PruebaAdmin2026!');await page.getByRole('button',{name:'Guardar cuenta',exact:true}).click();await page.getByText('Cuenta guardada correctamente.',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:'artifacts/admin/panel-'+entry+'.png',fullPage:true});
   if(entry!=='general')assert.equal((await request('login',{empresa:entry,name:'Creado UI '+entry,pass:'PruebaAdmin2026!'})).status,200);
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('OK: cinco accesos móviles, creación por interfaz, persistencia e ingreso del usuario creado; sin errores JavaScript.');
  const {provisionAdministrators}=require('./scripts/provision-administrators.cjs');const {credentials}=require('./backend/api.cjs');const provisionStore=memoryStore();await bootstrap(provisionStore,{name:'General',pass:'PruebaAdmin2026!'});
  const accounts=await Promise.all(['RAS','SELF','AFE','DBCC'].map(async empresa=>({empresa,name:'admin.'+empresa.toLowerCase(),...await credentials('PruebaAdmin2026!')})));
  await provisionAdministrators(provisionStore,accounts);await provisionAdministrators(provisionStore,accounts);
  assert.equal(await provisionStore.transaction(db=>db.users.length),5);
  await assert.rejects(()=>provisionAdministrators(provisionStore,accounts.map(a=>({...a,hash:'0'.repeat(128)}))));
  assert.equal(await provisionStore.transaction(db=>db.users.length),5);console.log('OK: provisión de cuatro cuentas, repetición idempotente y rechazo de reemplazo de credenciales.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
