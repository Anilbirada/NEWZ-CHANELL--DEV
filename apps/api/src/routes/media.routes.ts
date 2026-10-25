import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { authenticate, optionalAuthenticate, requireRole } from '../auth.js';
import { audit, query } from '../db.js';
import type { AuthedRequest } from '../types.js';
import { writeStorage, readStorage } from '../services/storage.js';
import { enqueueImageProcessing } from '../services/imageQueue.js';
import { createMediaPreviewToken, verifyMediaPreviewToken } from '../services/mediaTokens.js';

export const mediaRouter = Router();
const maxMb = Number(process.env.MAX_UPLOAD_MB || 25);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 12 } });
const accepted = new Set(['image/jpeg','image/png','image/webp','image/avif']);

mediaRouter.use(authenticate);
mediaRouter.get('/', async (req: AuthedRequest, res: Response, next: NextFunction)=>{
  try { const q=String(req.query.search||'').trim();const vals:unknown[]=[];let where='';if(q){vals.push(`%${q}%`);where='WHERE original_name ILIKE $1 OR alt_text ILIKE $1 OR caption ILIKE $1';}const r=await query(`SELECT id,original_name,detected_mime,original_width,original_height,original_size_bytes,status,alt_text,caption,photographer_credit,is_public,processing_error,focal_x,focal_y,crop_config,created_at FROM media_assets ${where} ORDER BY created_at DESC LIMIT 300`,vals);res.json({items:r.rows.map((item:any)=>({...item, preview_url:`/api/media/${item.id}/admin_thumbnail/webp?t=${createMediaPreviewToken(item.id,'admin_thumbnail','webp')}`}))}); } catch(e){next(e)}
});
mediaRouter.post('/upload', upload.single('file'), async (req: AuthedRequest, res: Response, next: NextFunction)=>{
  try {
    if(!req.file){res.status(400).json({error:'Select an image file to upload.'});return;}
    const actual=await fileTypeFromBuffer(req.file.buffer);
    if(!actual || !accepted.has(actual.mime)){res.status(415).json({error:'Unsupported image type. Upload a valid JPEG, PNG, WebP, or AVIF image.'});return;}
    if(req.file.mimetype && req.file.mimetype!=='application/octet-stream' && !accepted.has(req.file.mimetype)){res.status(415).json({error:'The declared file type is not allowed.'});return;}
    const maxPixels=Number(process.env.MAX_IMAGE_PIXELS||40_000_000);
    const metadata=await sharp(req.file.buffer,{limitInputPixels:maxPixels,failOn:'error'}).metadata();
    if(!metadata.width||!metadata.height){res.status(422).json({error:'Image dimensions could not be read.'});return;}
    if(metadata.width*metadata.height>maxPixels){res.status(413).json({error:`Image exceeds the configured ${maxPixels.toLocaleString()}-pixel limit.`});return;}
    const id=crypto.randomUUID();const originalKey=`originals/${id}/source.${actual.ext}`;
    await writeStorage(originalKey,req.file.buffer);
    try{
      await query(`INSERT INTO media_assets (id,uploaded_by,original_key,original_name,detected_mime,original_format,original_width,original_height,original_size_bytes,status,is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',FALSE)`,[id,req.user!.id,originalKey,req.file.originalname.slice(0,255),actual.mime,actual.ext,metadata.width,metadata.height,req.file.size]);
    }catch(e){const fs=await import('node:fs/promises');const path=await import('node:path');await fs.rm(path.resolve(process.env.STORAGE_ROOT||'./storage',originalKey),{force:true});throw e;}
    await enqueueImageProcessing(id);
    await audit(req.user!.id,'media_uploaded','media_asset',id,{name:req.file.originalname,mime:actual.mime,size:req.file.size},req.ip);
    res.status(202).json({id,status:'pending',originalName:req.file.originalname,originalWidth:metadata.width,originalHeight:metadata.height,variantPresets:['homepage_lead','featured_card','standard_card','article_featured','article_body','related_article','advertisement_banner','epaper_cover','admin_thumbnail']});
  }catch(e){next(e)}
});
mediaRouter.post('/:id/retry',requireRole('admin','editor'),async(req:AuthedRequest,res:Response,next:NextFunction)=>{try{const r=await query('SELECT id,status FROM media_assets WHERE id=$1',[req.params.id]);if(!r.rows[0]){res.status(404).json({error:'Media asset not found.'});return;}if(!['failed','ready'].includes(r.rows[0].status)){res.status(409).json({error:'This image is already queued or processing.'});return;}await query("UPDATE media_assets SET status='pending',processing_error=NULL,updated_at=NOW() WHERE id=$1",[req.params.id]);await enqueueImageProcessing(req.params.id);await audit(req.user!.id,'media_processing_retried','media_asset',req.params.id,{},req.ip);res.status(202).json({id:req.params.id,status:'pending'});}catch(e){next(e)}});
mediaRouter.patch('/:id/metadata',async(req:AuthedRequest,res:Response,next:NextFunction)=>{const schema=z.object({altText:z.string().max(500).optional(),caption:z.string().max(1000).optional(),photographerCredit:z.string().max(300).optional()});const p=schema.safeParse(req.body);if(!p.success){res.status(400).json({error:'Invalid media metadata.',details:p.error.flatten()});return;}try{const keys=Object.entries(p.data);if(!keys.length){res.status(400).json({error:'No metadata fields supplied.'});return;}const map:Record<string,string>={altText:'alt_text',caption:'caption',photographerCredit:'photographer_credit'};const sets:string[]=[];const vals:unknown[]=[];for(const[k,v]of keys){vals.push(v);sets.push(`${map[k]}=$${vals.length}`);}vals.push(req.params.id);const r=await query(`UPDATE media_assets SET ${sets.join(', ')},updated_at=NOW() WHERE id=$${vals.length} RETURNING id,alt_text,caption,photographer_credit,status`,vals);if(!r.rows[0]){res.status(404).json({error:'Media asset not found.'});return;}await audit(req.user!.id,'media_metadata_updated','media_asset',req.params.id,{fields:keys.map(k=>k[0])},req.ip);res.json({item:r.rows[0]});}catch(e){next(e)}});
mediaRouter.patch('/:id/crop',async(req:AuthedRequest,res:Response,next:NextFunction)=>{const p=z.object({focalX:z.number().min(0).max(1),focalY:z.number().min(0).max(1),cropConfig:z.record(z.unknown()).optional()}).safeParse(req.body);if(!p.success){res.status(400).json({error:'Focal point must use coordinates between 0 and 1.'});return;}try{const r=await query('UPDATE media_assets SET focal_x=$2,focal_y=$3,crop_config=$4::jsonb,status=\'pending\',updated_at=NOW() WHERE id=$1 RETURNING id',[req.params.id,p.data.focalX,p.data.focalY,JSON.stringify(p.data.cropConfig||{})]);if(!r.rows[0]){res.status(404).json({error:'Media asset not found.'});return;}await enqueueImageProcessing(req.params.id);await audit(req.user!.id,'media_crop_updated','media_asset',req.params.id,{focalX:p.data.focalX,focalY:p.data.focalY},req.ip);res.status(202).json({id:req.params.id,status:'pending'});}catch(e){next(e)}});

// Public delivery is deliberately limited to a small allowlist of generated web variants.
export const publicMediaRouter = Router();
publicMediaRouter.get('/:id/:preset/:format',optionalAuthenticate,async(req:AuthedRequest,res:Response,next:NextFunction)=>{
  const preset=String(req.params.preset);const format=String(req.params.format);
  if(!['homepage_lead','featured_card','standard_card','article_featured','article_body','related_article','advertisement_banner','epaper_cover','admin_thumbnail'].includes(preset)||!['webp','avif','jpg','jpeg'].includes(format)){res.status(404).json({error:'Image variant not found.'});return;}
  try{const assetResult=await query<{id:string;is_public:boolean;status:string}>('SELECT id,is_public,status FROM media_assets WHERE id=$1',[req.params.id]);const asset=assetResult.rows[0];if(!asset){res.status(404).json({error:'Image not found.'});return;}const mediaToken=String(req.query.t||'');const tokenAccess=mediaToken&&verifyMediaPreviewToken(mediaToken,asset.id,preset,format);if(!asset.is_public&&!tokenAccess&&(!req.user||!['admin','editor'].includes(req.user.role))){res.status(404).json({error:'Image not found.'});return;}if(asset.status!=='ready'){res.status(409).json({error:'Image variant is not ready yet.'});return;}const fmt=format==='jpg'?'jpeg':format;const r=await query<{storage_key:string;width:number;height:number;size_bytes:string}>('SELECT storage_key,width,height,size_bytes FROM media_variants WHERE asset_id=$1 AND preset=$2 AND format=$3',[asset.id,preset,fmt]);if(!r.rows[0]){res.status(404).json({error:'Image variant not found.'});return;}const item=r.rows[0];const bytes=await readStorage(item.storage_key);res.setHeader('Content-Type',fmt==='jpeg'?'image/jpeg':`image/${fmt}`);res.setHeader('Content-Length',String(bytes.length));res.setHeader('Cache-Control',asset.is_public?'public, max-age=31536000, immutable':'private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('ETag',`"${asset.id}-${preset}-${fmt}-${item.size_bytes}"`);res.status(200).send(bytes);}catch(e){next(e)}
});
publicMediaRouter.get('/:id/original',authenticate,async(req:AuthedRequest,res:Response,next:NextFunction)=>{try{const r=await query<{original_key:string;original_name:string;detected_mime:string}>('SELECT original_key,original_name,detected_mime FROM media_assets WHERE id=$1',[req.params.id]);if(!r.rows[0]){res.status(404).json({error:'Original image not found.'});return;}const bytes=await readStorage(r.rows[0].original_key);res.setHeader('Content-Type',r.rows[0].detected_mime);res.setHeader('Content-Disposition',`inline; filename="${r.rows[0].original_name.replace(/["\r\n]/g,'_')}"`);res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.send(bytes);}catch(e){next(e)}});
