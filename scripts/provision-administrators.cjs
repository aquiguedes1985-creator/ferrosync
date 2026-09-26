const crypto=require('node:crypto');
const {migrateAdministrators}=require('../backend/api.cjs');
async function provisionAdministrators(store,accounts){
 if(!Array.isArray(accounts)||accounts.length!==4||new Set(accounts.map(a=>a.empresa)).size!==4||!accounts.every(a=>['RAS','SELF','AFE','DBCC'].includes(a.empresa)&&a.name==='admin.'+a.empresa.toLowerCase()&&/^[a-f0-9]{32}$/.test(a.salt)&&/^[a-f0-9]{128}$/.test(a.hash)))throw Error('Configuración de administradores inválida.');
 return store.transaction(db=>{
  migrateAdministrators(db);
  if(!db.users.some(u=>u.role==='Administrador'&&u.adminScope==='general'&&u.enabled))throw Error('Se requiere una administración general activa.');
  for(const account of accounts){
   const existing=db.users.find(u=>u.empresa===account.empresa&&u.name.toLowerCase()===account.name);
   if(existing){if(existing.role!=='Administrador'||existing.adminScope==='general'||existing.hash!==account.hash||existing.salt!==account.salt||!existing.enabled)throw Error('La cuenta '+account.name+' ya existe con otra configuración. No se reemplazó.');continue;}
   if(db.users.some(u=>u.empresa===account.empresa&&u.role==='Administrador'&&u.adminScope!=='general'))throw Error('Ya existe administración en '+account.empresa+'. No se reemplazó.');
   const company=db.companies[account.empresa]||={revision:0,enabled:true,state:{trains:[],history:[],locomotives:[],crew:[]},audit:[]};
   if(!company.enabled)throw Error('La operadora '+account.empresa+' está deshabilitada.');
   db.users.push({id:crypto.randomUUID(),...account,role:'Administrador',adminScope:'company',enabled:true});
   company.revision++;company.audit.push({at:new Date().toISOString(),actor:'trusted-provision',action:'admin',operation:'create-operator-admin',name:account.name});
  }
  return accounts.map(a=>({name:a.name,empresa:a.empresa}));
 });
}
if(require.main===module&&process.env.FERRO_OPERATOR_ADMINS){
 (async()=>{if(!process.env.DATABASE_URL)throw Error('La provisión requiere DATABASE_URL.');const {postgresStore}=require('../backend/store.cjs');const store=postgresStore(process.env.DATABASE_URL);try{const result=await provisionAdministrators(store,JSON.parse(process.env.FERRO_OPERATOR_ADMINS));console.log('Administradores de operadora habilitados: '+result.map(a=>a.name).join(', '));}finally{await store.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={provisionAdministrators};
