import { Router } from 'express';
import { authenticate } from '../auth.js';
import { query } from '../db.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get('/stats',async(_req,res,next)=>{try{const [articles,editions,ads,media,events]=await Promise.all([
  query<{status:string;count:string}>('SELECT status,COUNT(*)::text AS count FROM articles GROUP BY status'),
  query<{count:string}>('SELECT COUNT(*)::text AS count FROM editions WHERE status=\'published\' AND date_trunc(\'month\',publication_date::timestamp)=date_trunc(\'month\',CURRENT_DATE::timestamp)'),
  query<{active:string;impressions:string;clicks:string}>('SELECT COUNT(*) FILTER(WHERE status=\'active\')::text AS active FROM advertisements'),
  query<{count:string}>('SELECT COUNT(*)::text AS count FROM media_assets WHERE status=\'failed\''),
  query<{impressions:string;clicks:string}>('SELECT COUNT(*) FILTER(WHERE event_type=\'impression\')::text AS impressions,COUNT(*) FILTER(WHERE event_type=\'click\')::text AS clicks FROM ad_events WHERE created_at>=NOW()-INTERVAL \'7 days\'')
]);const counts=Object.fromEntries(articles.rows.map(r=>[r.status,Number(r.count)]));const totalAds=events.rows[0]||{impressions:'0',clicks:'0'};res.json({published:counts.published||0,pending:counts.submitted||0,drafts:counts.draft||0,editions:Number(editions.rows[0]?.count||0),activeAds:Number(ads.rows[0]?.active||0),failedImages:Number(media.rows[0]?.count||0),reads:'—',change:'—',adImpressions:Number(totalAds.impressions||0),adClicks:Number(totalAds.clicks||0)});}catch(e){next(e)}});
