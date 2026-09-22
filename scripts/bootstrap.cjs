const {bootstrap}=require('../backend/api.cjs');
const {postgresStore,fileStore}=require('../backend/store.cjs');
(async()=>{
 if(!process.env.ADMIN_NAME||!process.env.ADMIN_PASSWORD)throw Error('Configurá ADMIN_NAME y ADMIN_PASSWORD en el entorno.');
 const store=process.env.DATABASE_URL?postgresStore(process.env.DATABASE_URL):await fileStore(process.env.FERRO_DATA_FILE||'private-data/state.json');
 try{await bootstrap(store,{name:process.env.ADMIN_NAME,pass:process.env.ADMIN_PASSWORD,empresa:process.env.ADMIN_COMPANY||'RAS'});console.log('Administrador inicial creado.');}finally{await store.close?.();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
