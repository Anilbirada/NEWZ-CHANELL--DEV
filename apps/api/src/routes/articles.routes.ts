import { Router } from 'express';
import { z } from 'zod';
import { query, pool, audit } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import type { AuthedRequest } from '../types.js';
import { createMediaPreviewToken } from '../services/mediaTokens.js';

export const articleRouter = Router();
export const publicArticleRouter = Router();

const articleSchema = z.object({
  titleEn: z.string().max(300).optional().default(''), titleKn: z.string().max(300).optional().default(''),
  subtitleEn: z.string().max(500).optional().default(''), subtitleKn: z.string().max(500).optional().default(''),
  summaryEn: z.string().max(3000).optional().default(''), summaryKn: z.string().max(3000).optional().default(''),
  bodyEn: z.string().max(200_000).optional().default(''), bodyKn: z.string().max(200_000).optional().default(''),
  language: z.enum(['English','Kannada','Bilingual']).default('English'), categoryLabel: z.string().min(1).max(100).default('Karnataka'),
  authorName: z.string().max(150).optional().default(''), featuredMediaId: z.string().uuid().optional().nullable(),
});
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || `story-${Date.now()}`;
const statusToPublic = (s: string) => ({ draft: 'Draft', submitted: 'Pending review', approved: 'Pending review', rejected: 'Rejected', published: 'Published', archived: 'Archived' } as Record<string,string>)[s] || s;

articleRouter.use(authenticate);
articleRouter.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const status = String(req.query.status || ''); const search = String(req.query.search || '').trim();
    const values: unknown[] = []; const where: string[] = [];
    if (status) { values.push(status.toLowerCase().replace('pending review','submitted')); where.push(`a.status = $${values.length}`); }
    if (search) { values.push(`%${search}%`); where.push(`(a.title_en ILIKE $${values.length} OR a.title_kn ILIKE $${values.length} OR a.slug ILIKE $${values.length} OR a.author_name ILIKE $${values.length})`); }
    if (req.user?.role === 'editor') { values.push(req.user.id); where.push(`(a.created_by = $${values.length} OR a.status IN ('submitted','approved','published'))`); }
    const result = await query(`SELECT a.*, m.status AS media_status, m.id AS joined_media_id,
       CASE WHEN m.id IS NOT NULL THEN '/api/media/' || m.id::text || '/article_featured/webp' ELSE NULL END AS image_url
       FROM articles a LEFT JOIN media_assets m ON m.id = a.featured_media_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.updated_at DESC LIMIT 250`, values);
    res.json({ items: result.rows.map(r => ({ ...r, image_url: r.joined_media_id ? `/api/media/${r.joined_media_id}/article_featured/webp?t=${createMediaPreviewToken(r.joined_media_id, 'article_featured', 'webp')}` : null, displayStatus: statusToPublic(r.status) })) });
  } catch (error) { next(error); }
});

articleRouter.post('/', requireRole('admin','editor'), async (req: AuthedRequest, res, next) => {
  const parsed = articleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Article validation failed.', details: parsed.error.flatten() }); return; }
  const data = parsed.data;
  const mainTitle = data.titleEn || data.titleKn;
  if (mainTitle.trim().length < 8) { res.status(400).json({ error: 'Add a headline with at least 8 characters.' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const baseSlug = slugify(mainTitle); const slug = `${baseSlug}-${Math.random().toString(36).slice(2,7)}`;
    const inserted = await client.query(`INSERT INTO articles (slug,title_en,title_kn,subtitle_en,subtitle_kn,summary_en,summary_kn,body_en,body_kn,language,category_label,author_name,featured_media_id,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
      [slug,data.titleEn,data.titleKn,data.subtitleEn,data.subtitleKn,data.summaryEn,data.summaryKn,data.bodyEn,data.bodyKn,data.language,data.categoryLabel,data.authorName || req.user!.displayName,data.featuredMediaId || null,req.user!.id]);
    await client.query('INSERT INTO article_revisions (article_id,revision_number,snapshot,changed_by,change_note) VALUES ($1,1,$2::jsonb,$3,$4)', [inserted.rows[0].id,JSON.stringify(inserted.rows[0]),req.user!.id,'Initial draft']);
    await client.query('COMMIT');
    await audit(req.user!.id,'article_created','article',inserted.rows[0].id,{slug},req.ip);
    res.status(201).json({ item: inserted.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});

articleRouter.patch('/:id', requireRole('admin','editor'), async (req: AuthedRequest, res, next) => {
  const parsed = articleSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Article validation failed.', details: parsed.error.flatten() }); return; }
  try {
    const existing = await query<{id:string;created_by:string;status:string}>('SELECT id, created_by, status FROM articles WHERE id=$1', [req.params.id]);
    const old = existing.rows[0]; if (!old) { res.status(404).json({error:'Story not found.'}); return; }
    if (req.user!.role === 'editor' && old.created_by !== req.user!.id) { res.status(403).json({error:'Editors can only edit their own stories.'}); return; }
    if (!['draft','rejected'].includes(old.status) && req.user!.role !== 'admin') { res.status(409).json({error:'This story is in review or published. An administrator must return it to draft before editing.'}); return; }
    const data = parsed.data;
    const fieldMap: Record<string,string> = {titleEn:'title_en',titleKn:'title_kn',subtitleEn:'subtitle_en',subtitleKn:'subtitle_kn',summaryEn:'summary_en',summaryKn:'summary_kn',bodyEn:'body_en',bodyKn:'body_kn',language:'language',categoryLabel:'category_label',authorName:'author_name',featuredMediaId:'featured_media_id'};
    const entries = Object.entries(data).filter(([k]) => fieldMap[k]);
    const values: unknown[] = []; const sets: string[] = [];
    for (const [key,value] of entries) { values.push(value ?? null); sets.push(`${fieldMap[key]} = $${values.length}`); }
    if (!sets.length) { res.status(400).json({error:'No editable fields supplied.'}); return; }
    values.push(req.params.id); values.push(req.user!.id);
    const updated = await query(`UPDATE articles SET ${sets.join(', ')}, status=CASE WHEN status='rejected' THEN 'draft' ELSE status END, updated_by=$${values.length}, updated_at=NOW() WHERE id=$${values.length-1} RETURNING *`,values);
    const rev = await query<{next:number}>('SELECT COALESCE(MAX(revision_number),0)+1 AS next FROM article_revisions WHERE article_id=$1',[req.params.id]);
    await query('INSERT INTO article_revisions (article_id,revision_number,snapshot,changed_by,change_note) VALUES ($1,$2,$3::jsonb,$4,$5)',[req.params.id,rev.rows[0].next,JSON.stringify(updated.rows[0]),req.user!.id,'Article updated']);
    await audit(req.user!.id,'article_updated','article',req.params.id,{fields:entries.map(([k])=>k)},req.ip);
    res.json({item:updated.rows[0]});
  } catch(error) { next(error); }
});

articleRouter.patch('/:id/status', requireRole('admin','editor'), async (req: AuthedRequest, res, next) => {
  const schema = z.object({status:z.enum(['Draft','Pending review','Published','Rejected']), comment:z.string().max(2000).optional().default('')});
  const parsed=schema.safeParse(req.body); if(!parsed.success){res.status(400).json({error:'Invalid status request.'});return;}
  const requested=parsed.data.status; const comment=parsed.data.comment;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const r=await client.query('SELECT * FROM articles WHERE id=$1 FOR UPDATE',[req.params.id]); const article=r.rows[0];
    if(!article){await client.query('ROLLBACK');res.status(404).json({error:'Story not found.'});return;}
    if(req.user!.role==='editor' && article.created_by!==req.user!.id){await client.query('ROLLBACK');res.status(403).json({error:'Editors can only submit their own stories.'});return;}
    let nextStatus:string; let action:string;
    if(requested==='Pending review'){
      if(req.user!.role!=='editor'&&req.user!.role!=='admin'){await client.query('ROLLBACK');res.status(403).json({error:'Not allowed.'});return;}
      if(!['draft','rejected'].includes(article.status)){await client.query('ROLLBACK');res.status(409).json({error:'Only a draft or returned story can be submitted for review.'});return;}
      nextStatus='submitted';action='article_submitted';
    } else if(requested==='Draft'){
      if(req.user!.role==='editor' && article.status==='published'){await client.query('ROLLBACK');res.status(403).json({error:'Only an administrator can unpublish a story.'});return;}
      nextStatus='draft';action='article_returned_to_draft';
    } else if(requested==='Rejected'){
      if(req.user!.role!=='admin'){await client.query('ROLLBACK');res.status(403).json({error:'Only an administrator can reject a story.'});return;}
      if(!['submitted','approved'].includes(article.status)){await client.query('ROLLBACK');res.status(409).json({error:'Only a submitted or approved story can be rejected.'});return;}
      nextStatus='rejected';action='article_rejected';
    } else {
      if(req.user!.role!=='admin'){await client.query('ROLLBACK');res.status(403).json({error:'Only an administrator can publish a story.'});return;}
      if(!['submitted','approved'].includes(article.status)){await client.query('ROLLBACK');res.status(409).json({error:'Only a submitted story can be approved and published.'});return;}
      const publishBody=article.language==='Kannada'?String(article.body_kn||''):article.language==='English'?String(article.body_en||''):[article.body_en,article.body_kn].filter(Boolean).join('\n');
      if(publishBody.trim().length<20){await client.query('ROLLBACK');res.status(409).json({error:'Add the full article body before publishing. The story currently has too little body text.'});return;}
      if(article.featured_media_id){const featured=await client.query('SELECT status FROM media_assets WHERE id=$1 FOR SHARE',[article.featured_media_id]);if(!featured.rows[0]||featured.rows[0].status!=='ready'){await client.query('ROLLBACK');res.status(409).json({error:'The featured image is still processing or unavailable. Wait until it is ready, then publish the story.'});return;}}
      nextStatus='published';action='article_approved_and_published';
    }
    const updated=await client.query(`UPDATE articles SET status=$2, reviewer_comment=$3, submitted_by=CASE WHEN $2='submitted' THEN $4 ELSE submitted_by END,
       reviewed_by=CASE WHEN $2 IN ('published','rejected') THEN $4 ELSE reviewed_by END,
       published_by=CASE WHEN $2='published' THEN $4 ELSE published_by END,
       published_at=CASE WHEN $2='published' THEN NOW() WHEN $2='draft' THEN NULL ELSE published_at END,
       updated_by=$4, updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,nextStatus,comment,req.user!.id]);
    if(nextStatus==='published' && article.featured_media_id) await client.query('UPDATE media_assets SET is_public=TRUE, updated_at=NOW() WHERE id=$1 AND status=\'ready\'',[article.featured_media_id]);
    if(nextStatus!=='published' && article.featured_media_id) await client.query(`UPDATE media_assets SET is_public=FALSE, updated_at=NOW() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM articles WHERE featured_media_id=$1 AND status='published')`,[article.featured_media_id]);
    await client.query('COMMIT');
    await audit(req.user!.id,action,'article',req.params.id,{from:article.status,to:nextStatus,comment},req.ip);
    res.json({item:updated.rows[0],message:`Story ${requested.toLowerCase()} successfully.`});
  }catch(error){await client.query('ROLLBACK');next(error)}finally{client.release()}
});

publicArticleRouter.get('/', async (req,res,next)=>{
  try{const search=String(req.query.search||'').trim();const values:unknown[]=[];let clause="a.status='published'";if(search){values.push(`%${search}%`);clause+=` AND (a.title_en ILIKE $1 OR a.title_kn ILIKE $1 OR a.summary_en ILIKE $1 OR a.summary_kn ILIKE $1)`;}const result=await query(`SELECT a.id,a.slug,a.title_en,a.title_kn,a.subtitle_en,a.subtitle_kn,a.summary_en,a.summary_kn,a.body_en,a.body_kn,a.language,a.category_label,a.author_name,a.published_at,m.id AS media_id,
       CASE WHEN m.id IS NOT NULL THEN '/api/media/' || m.id::text || '/article_featured/webp' ELSE NULL END AS image_url
       FROM articles a LEFT JOIN media_assets m ON m.id=a.featured_media_id WHERE ${clause} ORDER BY a.published_at DESC NULLS LAST LIMIT 100`,values);res.json({items:result.rows});}catch(error){next(error)}
});
publicArticleRouter.get('/:slug',async(req,res,next)=>{try{const r=await query(`SELECT a.*,m.id AS media_id,CASE WHEN m.id IS NOT NULL THEN '/api/media/'||m.id::text||'/article_featured/webp' ELSE NULL END AS image_url FROM articles a LEFT JOIN media_assets m ON m.id=a.featured_media_id WHERE a.slug=$1 AND a.status='published'`,[req.params.slug]);if(!r.rows[0]){res.status(404).json({error:'Published story not found.'});return;}res.json({item:r.rows[0]});}catch(error){next(error)}});
