import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { processMediaAsset } from './mediaProcessor.js';

const queueName = 'vachana-image-processing';
let queue: Queue | null = null;
let worker: Worker | null = null;
let redisConnection: Redis | null = null;

export async function initializeImageQueue() {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured: image processing will use a local in-process fallback. Configure Redis for resilient production jobs.');
    return;
  }
  redisConnection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  redisConnection.on('error', (error: Error) => console.error('Image queue Redis error:', error.message));
  queue = new Queue(queueName, { connection: redisConnection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 500, removeOnFail: 1000 } });
  worker = new Worker(queueName, async (job) => processMediaAsset(String(job.data.assetId)), { connection: redisConnection, concurrency: Number(process.env.IMAGE_WORKER_CONCURRENCY || 2) });
  worker.on('completed', (job, result) => console.info('Image processing completed:', job.id, result));
  worker.on('failed', (job, error: Error) => console.error('Image processing job failed:', job?.id, error.message));
  await queue.waitUntilReady();
  await worker.waitUntilReady();
  console.info('Image processing queue connected.');
}

export async function enqueueImageProcessing(assetId: string) {
  if (queue) {
    const existing = await queue.getJob(assetId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') return existing.id;
      await existing.remove();
    }
    const job = await queue.add('process-asset', { assetId }, { jobId: assetId });
    return job.id;
  }
  // Suitable only for local development. Production deployments should use Redis/BullMQ.
  queueMicrotask(() => {
    void processMediaAsset(assetId).catch((error) => console.error('Local image processing failed:', error instanceof Error ? error.message : error));
  });
  return `local-${assetId}`;
}

export async function closeImageQueue() {
  await Promise.allSettled([worker?.close(), queue?.close()]);
  if (redisConnection) await redisConnection.quit().catch(() => undefined);
}
