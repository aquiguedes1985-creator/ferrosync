const {postgresStore}=require('../backend/store.cjs');
const {createAPI}=require('../backend/api.cjs');
const store=process.env.DATABASE_URL?postgresStore(process.env.DATABASE_URL):null;
module.exports=createAPI(store,{secure:true});
