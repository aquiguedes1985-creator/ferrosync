const fs=require('node:fs/promises');
const path=require('node:path');
const empty=()=>({version:1,users:[],sessions:[],companies:{},backups:[],attempts:{}});
// All mutations share one transaction, including revision, audit and backup.
function memoryStore(initial=empty(),filename) {
  let state=initial,queue=Promise.resolve();
  return {transaction(fn){const task=queue.then(async()=>{const draft=structuredClone(state);const result=await fn(draft);if(filename){await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename+'.tmp',JSON.stringify(draft),{mode:0o600});await fs.rename(filename+'.tmp',filename);}state=draft;return result;});queue=task.catch(()=>{});return task;}};
}
async function fileStore(filename){let state;try{state=JSON.parse(await fs.readFile(filename,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}return memoryStore(state||empty(),filename);}
function postgresStore(url) {
  // Preserve certificate and hostname verification when pg changes SSL aliases.
  const connection=new URL(url);
  if(['prefer','require','verify-ca'].includes(connection.searchParams.get('sslmode')))connection.searchParams.set('sslmode','verify-full');
  const {Pool}=require('pg');const pool=new Pool({connectionString:connection.toString(),max:3});
  let init;
  return {async transaction(fn){
    init ||= pool.query('CREATE TABLE IF NOT EXISTS ferrosync_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL)').then(()=>pool.query('INSERT INTO ferrosync_state VALUES (1,$1) ON CONFLICT DO NOTHING',[JSON.stringify(empty())])).catch(e=>{init=null;throw e;});
    await init;const client=await pool.connect();
    try{await client.query('BEGIN');const {rows}=await client.query('SELECT data FROM ferrosync_state WHERE id=1 FOR UPDATE');const state=rows[0].data;const result=await fn(state);await client.query('UPDATE ferrosync_state SET data=$1 WHERE id=1',[JSON.stringify(state)]);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  },close:()=>pool.end()};
}
module.exports={empty,memoryStore,fileStore,postgresStore};
