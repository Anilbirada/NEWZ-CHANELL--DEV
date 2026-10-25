import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { initDatabase, pool, query } from './db.js';
import { ensureStorage } from './services/storage.js';
import { initializeImageQueue, closeImageQueue } from './services/imageQueue.js';
import { authRouter } from './routes/auth.routes.js';
import { articleRouter, publicArticleRouter } from './routes/articles.routes.js';
import { mediaRouter, publicMediaRouter } from './routes/media.routes.js';
import { editionRouter, publicEditionRouter } from './routes/editions.routes.js';
import { adsRouter, publicAdsRouter } from './routes/ads.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';

const app=express();
app.disable('x-powered-by');
app.set('trust proxy',process.env.TRUST_PROXY==='false'?false:1);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'},contentSecurityPolicy:process.env.NODE_ENV==='production'?undefined:false}));
const origins=(process.env.WEB_ORIGIN||'http://localhost:5173').split(',').map(v=>v.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>{if(!origin||origins.includes('*')||origins.includes(origin)){cb(null,true);return;}cb(new Error('Origin is not allowed by CORS.'));},credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS']}));
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:false,limit:'128kb'}));
app.use(rateLimit({windowMs:15*60*1000,limit:Number(process.env.API_RATE_LIMIT||600),standardHeaders:'draft-7',legacyHeaders:false}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false}));
app.get('/api/health',async(_req,res)=>{try{await query('SELECT 1');res.json({status:'ok',service:'vachana-kranti-api',database:'connected',time:new Date().toISOString()});}catch{res.status(503).json({status:'degraded',service:'vachana-kranti-api',database:'unavailable'});}});
app.use('/api/auth',authRouter);
app.use('/api/dashboard',dashboardRouter);
app.use('/api/articles',articleRouter);
app.use('/api/public/articles',publicArticleRouter);
app.use('/api/media',publicMediaRouter);
app.use('/api/editorial/media',mediaRouter);
app.use('/api/editions',editionRouter);
app.use('/api/public/editions',publicEditionRouter);
app.use('/api/advertisements',adsRouter);
app.use('/api/public/advertisements',publicAdsRouter);

app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));

const webDistCandidates = [
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/web/dist'),
];
const webDistPath = webDistCandidates.find(p => fs.existsSync(p));
if (webDistPath) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  const error=err instanceof Error?err:new Error('Unexpected server error');
  console.error('[api-error]',error.message);
  if(error.message.includes('file too large')){res.status(413).json({error:'Upload exceeds the configured size limit.'});return;}
  if(error.message.includes('Origin is not allowed')){res.status(403).json({error:'Request origin is not allowed.'});return;}
  const status=(err as {status?:number;statusCode?:number})?.statusCode||(err as {status?:number})?.status;
  res.status(typeof status==='number'&&status>=400&&status<500?status:500).json({error:typeof status==='number'&&status<500?error.message:'The server could not complete the request. Check the server logs and try again.'});
});

async function seedUser(email:string|undefined,password:string|undefined,displayName:string,role:'admin'|'editor'){
  if(!email||!password)return;
  if(password.length<12)throw new Error(`Seed password for ${role} must contain at least 12 characters.`);
  const normalized=email.trim().toLowerCase();
  const exists=await query('SELECT id FROM users WHERE lower(email)=$1',[normalized]);
  if(exists.rows.length)return;
  const hash=await bcrypt.hash(password,12);
  await query('INSERT INTO users(email,password_hash,display_name,role) VALUES($1,$2,$3,$4)',[normalized,hash,displayName,role]);
  console.info(`Seeded ${role} account: ${normalized}`);
}

async function start(){
  const port=Number(process.env.PORT||4000);
  if(process.env.NODE_ENV==='production'&&(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32))throw new Error('Configure a strong JWT_SECRET before production startup.');
  await ensureStorage();
  await initDatabase();
  await seedUser(process.env.SEED_ADMIN_EMAIL,process.env.SEED_ADMIN_PASSWORD,'Vachana Kranti Admin','admin');
  await seedUser(process.env.SEED_EDITOR_EMAIL,process.env.SEED_EDITOR_PASSWORD,'Editorial Team','editor');
  await initializeImageQueue().catch((e)=>{if(process.env.NODE_ENV==='production')throw e;console.warn('Image queue initialization fallback:',e instanceof Error?e.message:e);});
  const server=app.listen(port,()=>console.info(`Vachana Kranti API listening at http://localhost:${port}`));
  const shutdown=async()=>{console.info('Shutting down Vachana Kranti API...');server.close(()=>undefined);await closeImageQueue();await pool.end();process.exit(0);};
  process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
}
start().catch((error)=>{console.error('API startup failed:',error);process.exit(1);});
