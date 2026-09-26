const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const {requireThat,fail,logistics,assigned,operate,validateState,validatePlanning}=require('../domain.cjs');
const companies=['RAS','SELF','AFE','DBCC'];
const isGeneral=u=>u?.role==='Administrador'&&u.adminScope==='general';
const safeUser=u=>({id:u.id,name:u.name,empresa:u.empresa,role:u.role,enabled:u.enabled,adminScope:isGeneral(u)?'general':'company'});
function migrateAdministrators(db){
 if(db.adminVersion===1)return;
 const first=db.users.find(u=>u.role==='Administrador');
 for(const u of db.users)u.adminScope=u===first?'general':'company';
 db.adminVersion=1;
}
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
async function credentials(pass){requireThat(typeof pass==='string'&&pass.length>=12&&pass.length<=128,'La contraseña debe tener entre 12 y 128 caracteres.');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:(await scrypt(pass,salt,64)).toString('hex')};}
async function verify(u,pass){if(!u||typeof pass!=='string'||pass.length>128)return false;const key=await scrypt(pass,u.salt,64);return crypto.timingSafeEqual(key,Buffer.from(u.hash,'hex'));}
async function bootstrap(store,{name,pass,empresa='RAS'}){requireThat(companies.includes(empresa),'Empresa inválida.');const c=await credentials(pass);await store.transaction(db=>{requireThat(!db.users.length,'El administrador inicial ya existe.');for(const id of companies)db.companies[id]={revision:0,enabled:true,state:{trains:[],history:[],locomotives:[],crew:[]},audit:[]};db.users.push({id:crypto.randomUUID(),name,empresa,role:'Administrador',adminScope:'general',enabled:true,...c});db.adminVersion=1;});}
function snapshot(db,u){const c=db.companies[u.empresa];const state=structuredClone(c.state);if(!logistics(u)){state.trains=state.trains.filter(t=>assigned(t,u));state.history=state.history.filter(t=>t.viaje&&assigned(t.viaje,u));}return {revision:c.revision,state,users:db.users.filter(x=>x.empresa===u.empresa&&x.enabled).map(safeUser)};}
function backup(db,company,reason){const c=db.companies[company];const record={format:'ferrosync-backup',version:1,id:crypto.randomUUID(),at:new Date().toISOString(),company,reason,revision:c.revision,state:structuredClone(c.state),users:structuredClone(db.users.filter(u=>u.empresa===company)),audit:structuredClone(c.audit)};db.backups.push(record);const same=db.backups.filter(x=>x.company===company);if(same.length>30){const remove=new Set(same.slice(0,-30).map(x=>x.id));db.backups=db.backups.filter(x=>!remove.has(x.id));}return record;}
function createAPI(store,{secure=false,cronSecret=process.env.CRON_SECRET}={}){
 return async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  try{
   const url=new URL(req.url,'http://localhost'),action=url.searchParams.get('action')||'status';
   if(action==='status'){requireThat(req.method==='GET','Método no permitido.',405);return send(200,{mode:store||secure?'server':'local',configured:!!store});}
   requireThat(store,'El servidor no tiene base de datos configurada.',503);
   if(!['GET','POST'].includes(req.method))fail('Método no permitido.',405);
   if(req.method==='POST'){
    requireThat(req.headers['content-type']?.startsWith('application/json'),'Se requiere JSON.',415);
    if(req.headers.origin)requireThat(new URL(req.headers.origin).host===req.headers.host,'Origen no permitido.',403);
   }
   let body={};if(req.method==='POST'){if(req.body&&typeof req.body==='object')body=req.body;else {let raw='';for await(const chunk of req){raw+=chunk;requireThat(Buffer.byteLength(raw)<=2e6,'Solicitud demasiado grande.',413);}try{body=JSON.parse(raw);}catch{fail('JSON inválido.');}}}
   requireThat(Buffer.byteLength(JSON.stringify(body))<=2e6,'Solicitud demasiado grande.',413);
   if(action==='cron'){
    requireThat(req.method==='GET'&&cronSecret&&req.headers.authorization===`Bearer ${cronSecret}`,'No autorizado.',401);
    await store.transaction(db=>{for(const company of Object.keys(db.companies))backup(db,company,'Automática diaria');});return send(200,{ok:true});
   }
   if(action==='login'){
    requireThat(req.method==='POST','Método no permitido.',405);
    const name=String(body.name||'').trim().normalize('NFC'),empresa=body.empresa;
    const result=await store.transaction(async db=>{
     migrateAdministrators(db);
     const k=hashToken(empresa+':'+name.toLowerCase());const now=Date.now();
     for(const [key,a]of Object.entries(db.attempts))if(a.until<now)delete db.attempts[key];
     const attempt=db.attempts[k];if(attempt?.count>=10)return {error:'Demasiados intentos. Esperá 15 minutos.',status:429};
     const u=db.users.find(u=>(body.adminScope==='general'?isGeneral(u):u.empresa===empresa)&&u.name.toLowerCase()===name.toLowerCase());
     const wrongScope=body.adminScope&&(u?.role!=='Administrador'||(body.adminScope==='general'?!isGeneral(u):isGeneral(u)));
     if(!u?.enabled||!db.companies[u.empresa]?.enabled||wrongScope||!await verify(u,body.pass)){db.attempts[k]={count:(attempt?.count||0)+1,until:attempt?.until||now+900000};return {error:'Credenciales incorrectas o cuenta deshabilitada.',status:401};}
     delete db.attempts[k];db.sessions=db.sessions.filter(s=>s.expires>now);const token=crypto.randomBytes(32).toString('hex');db.sessions.push({hash:hashToken(token),userId:u.id,expires:now+8*3600000});return {token,user:safeUser(u),...snapshot(db,u)};
    });
    if(result.error)return send(result.status,{error:result.error});
    res.setHeader('Set-Cookie',`ferro_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);delete result.token;return send(200,result);
   }
   const token=/(?:^|;\s*)ferro_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
   const result=await store.transaction(async db=>{
    migrateAdministrators(db);
    const session=db.sessions.find(s=>s.hash===hashToken(token||'')&&s.expires>Date.now());const u=db.users.find(u=>u.id===session?.userId);
    requireThat(u?.enabled&&db.companies[u.empresa]?.enabled,'La sesión venció o fue revocada.',401);
    const c=db.companies[u.empresa];
    if(action==='state'&&req.method==='GET')return {user:safeUser(u),...snapshot(db,u)};
    if(action==='logout'&&req.method==='POST'){db.sessions=db.sessions.filter(s=>s!==session);return {ok:true};}
    if(action==='admin'&&req.method==='GET'){requireThat(u.role==='Administrador','Solo Administración.',403);return {general:isGeneral(u),users:db.users.filter(x=>isGeneral(u)||x.empresa===u.empresa&&!isGeneral(x)).map(safeUser),companies:companies.filter(id=>isGeneral(u)||id===u.empresa).map(id=>({id,enabled:!!db.companies[id]?.enabled}))};}
    if(action==='admin'&&req.method==='POST'){
     requireThat(u.role==='Administrador','Solo Administración.',403);
     requireThat(isGeneral(u)||body.empresa===u.empresa,'Solo podés administrar usuarios de tu operadora.',403);
     requireThat(body.operation!=='company'||isGeneral(u),'Solo Administración general puede habilitar operadoras.',403);
     if(body.operation==='company'){requireThat(companies.includes(body.empresa),'Empresa inválida.');const target=db.companies[body.empresa]||={revision:0,enabled:true,state:{trains:[],history:[],crew:[],locomotives:[]},audit:[]};requireThat(body.empresa!==u.empresa||body.enabled!==false,'No podés deshabilitar tu propia empresa.');target.enabled=body.enabled!==false;}
     else if(body.operation==='user'){
      requireThat(db.companies[body.empresa]?.enabled,'Habilitá primero la empresa.');
      requireThat(['Administrador','Logística','Maquinista'].includes(body.role),'Rol inválido.');
      const name=String(body.name||'').trim().normalize('NFC');requireThat(name.length>=3&&name.length<=80,'Nombre inválido.');
      let target=db.users.find(x=>x.id===body.id);
      requireThat(!body.id||target,'La cuenta no existe.',404);
      requireThat(!target||isGeneral(u)||target.empresa===u.empresa&&!isGeneral(target),'Cuenta fuera de tu administración.',403);
      requireThat(body.adminScope!=='general','No se puede crear ni asignar una administración general desde este formulario.',403);
      requireThat(isGeneral(u)||body.role!=='Administrador'||target?.id===u.id,'Solo Administración general puede asignar administradores.',403);
      requireThat(!isGeneral(target||{})||body.enabled!==false&&body.role==='Administrador','No podés revocar la administración general.');
      requireThat(body.role!=='Administrador'||isGeneral(target||{})||!db.users.some(x=>x!==target&&x.empresa===body.empresa&&x.role==='Administrador'&&!isGeneral(x)),'Ya existe un administrador de esta operadora. Editá esa cuenta.');
      requireThat(!db.users.some(x=>x!==target&&x.empresa===body.empresa&&x.name.toLowerCase()===name.toLowerCase()),'Usuario duplicado.');
      requireThat(!target||target.id!==u.id||body.enabled!==false&&body.role==='Administrador','No podés revocar tu propia administración.');
      if(target)requireThat(target.name===name&&target.empresa===body.empresa,'El nombre y la empresa de una cuenta existente no se cambian.');
      if(!target){target={id:crypto.randomUUID(),name,empresa:body.empresa,...await credentials(body.pass)};db.users.push(target);}else if(body.pass)Object.assign(target,await credentials(body.pass));
      target.adminScope=isGeneral(target)?'general':'company';target.role=body.role;target.enabled=body.enabled!==false;
      db.companies[target.empresa].state.crew=db.users.filter(x=>x.empresa===target.empresa&&x.enabled&&x.role==='Maquinista').map(x=>({nombre:x.name,empresa:x.empresa}));
      db.sessions=db.sessions.filter(s=>s.userId!==target.id||s===session);
      db.companies[target.empresa].revision++;
     }else fail('Operación administrativa inválida.');
     c.audit.push({at:new Date().toISOString(),actor:u.id,action:'admin',operation:body.operation});return {ok:true};
    }
    if(action==='backup'&&req.method==='GET'){requireThat(u.role==='Administrador','Solo Administración.',403);const exported=structuredClone(backup(db,u.empresa,'Exportación manual'));if(!isGeneral(u))exported.users=exported.users.filter(x=>!isGeneral(x));return {format:'ferrosync-backup',version:1,...exported};}
    if(action==='backups'&&req.method==='GET'){requireThat(u.role==='Administrador','Solo Administración.',403);return db.backups.filter(x=>x.company===u.empresa).map(({id,at,reason,revision})=>({id,at,reason,revision}));}
    requireThat(req.method==='POST','Método no permitido.',405);
    requireThat(body.revision===c.revision,'Los datos cambiaron en otro equipo. Actualizá y repetí la operación.',409);
    if(action==='restore'){
     requireThat(u.role==='Administrador','Solo Administración.',403);
     requireThat(isGeneral(u),'Solo Administración general puede restaurar cuentas desde respaldos.',403);
     const file=body.backup||db.backups.find(x=>x.id===body.id&&x.company===u.empresa);
     requireThat(file&&file.version===1&&file.format==='ferrosync-backup'&&file.company===u.empresa,'Respaldo incompatible o de otra empresa.');
     validateState(file.state,u.empresa);
     requireThat(Array.isArray(file.users)&&file.users.every(x=>x.empresa===u.empresa&&typeof x.id==='string'&&typeof x.name==='string'&&['Administrador','Logística','Maquinista'].includes(x.role)&&typeof x.enabled==='boolean'&&/^[a-f0-9]{32}$/.test(x.salt)&&/^[a-f0-9]{128}$/.test(x.hash)),'Cuentas inválidas en el respaldo.');
     requireThat(new Set(file.users.map(x=>x.id)).size===file.users.length&&new Set(file.users.map(x=>x.name.toLowerCase())).size===file.users.length,'Cuentas duplicadas en el respaldo.');
     requireThat(!file.users.some(x=>db.users.some(y=>y.empresa!==u.empresa&&y.id===x.id)),'Identidad de otra empresa.');
     backup(db,u.empresa,'Antes de restaurar');c.state=structuredClone(file.state);
     const restored=file.users.filter(x=>x.id!==u.id&&x.name.toLowerCase()!==u.name.toLowerCase()).map(x=>({...x,adminScope:'company'}));
     requireThat(restored.filter(x=>x.role==='Administrador').length<=1,'El respaldo contiene más de un administrador de operadora.');
     db.users=db.users.filter(x=>x.empresa!==u.empresa).concat(structuredClone(restored),u);
     db.sessions=db.sessions.filter(s=>s===session||db.users.some(x=>x.id===s.userId&&x.empresa!==u.empresa));
     c.audit=Array.isArray(file.audit)?structuredClone(file.audit):[];
    }else if(action==='state'){
     requireThat(logistics(u),'Solo Logística puede modificar la planificación.',403);
     const next=validateState(body.state,u.empresa);
     validatePlanning(next,c.state,db.users,u.empresa);
     c.state=structuredClone(next);
    }else if(action==='operate')operate(c.state,u,body);
    else fail('Ruta no encontrada.',404);
    c.revision++;c.audit.push({at:new Date().toISOString(),actor:u.id,action,operation:body.action,revision:c.revision});c.audit=c.audit.slice(-10000);
    if(!db.backups.some(b=>b.company===u.empresa&&Date.parse(b.at)>Date.now()-86400000))backup(db,u.empresa,'Automática por actividad');
    return snapshot(db,u);
   });
   if(action==='logout')res.setHeader('Set-Cookie',`ferro_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);
   send(200,result);
  }catch(e){send(e.status||500,{error:e.status?e.message:'No se pudo completar la operación del servidor.'});if(!e.status)console.error('FerroSync API:',e.message);}
 };
}
module.exports={createAPI,bootstrap,credentials,migrateAdministrators};
