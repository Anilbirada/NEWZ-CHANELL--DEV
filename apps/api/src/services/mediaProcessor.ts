import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { query } from '../db.js';
import { readStorage, writeStorage } from './storage.js';

type Preset = { name: string; width: number; height: number; fit: 'cover' | 'inside'; quality: number };
const presets: Preset[] = [
  { name: 'homepage_lead', width: 1440, height: 960, fit: 'cover', quality: 84 },
  { name: 'featured_card', width: 960, height: 640, fit: 'cover', quality: 82 },
  { name: 'standard_card', width: 640, height: 440, fit: 'cover', quality: 80 },
  { name: 'article_featured', width: 1600, height: 1100, fit: 'cover', quality: 86 },
  { name: 'article_body', width: 1400, height: 1800, fit: 'inside', quality: 84 },
  { name: 'related_article', width: 480, height: 320, fit: 'cover', quality: 78 },
  { name: 'advertisement_banner', width: 1600, height: 500, fit: 'cover', quality: 86 },
  { name: 'epaper_cover', width: 720, height: 1020, fit: 'inside', quality: 84 },
  { name: 'admin_thumbnail', width: 360, height: 260, fit: 'cover', quality: 76 },
];
const formats: Array<'webp' | 'avif' | 'jpeg'> = ['webp', 'avif', 'jpeg'];

function focalCrop(width: number, height: number, targetWidth: number, targetHeight: number, focalX: number, focalY: number) {
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = width / height;
  let left = 0, top = 0, cropWidth = width, cropHeight = height;
  if (sourceRatio > targetRatio) {
    cropWidth = Math.max(1, Math.round(height * targetRatio));
    left = Math.max(0, Math.min(width - cropWidth, Math.round(focalX * width - cropWidth / 2)));
  } else {
    cropHeight = Math.max(1, Math.round(width / targetRatio));
    top = Math.max(0, Math.min(height - cropHeight, Math.round(focalY * height - cropHeight / 2)));
  }
  return { left, top, width: cropWidth, height: cropHeight };
}

export async function processMediaAsset(assetId: string) {
  const result = await query<{
    id: string; original_key: string; original_width: number; original_height: number; focal_x: string; focal_y: string;
  }>('SELECT id, original_key, original_width, original_height, focal_x, focal_y FROM media_assets WHERE id = $1', [assetId]);
  const asset = result.rows[0];
  if (!asset) throw new Error('Media asset was not found.');
  await query("UPDATE media_assets SET status = 'processing', processing_error = NULL, updated_at = NOW() WHERE id = $1", [assetId]);
  try {
    const original = await readStorage(asset.original_key);
    // Rotate into pixels first so all later crop calculations use orientation-correct dimensions.
    const rotated = await sharp(original, { limitInputPixels: Number(process.env.MAX_IMAGE_PIXELS || 40_000_000) }).rotate().toBuffer({ resolveWithObject: true });
    const sourceWidth = rotated.info.width;
    const sourceHeight = rotated.info.height;
    const focalX = Math.max(0, Math.min(1, Number(asset.focal_x ?? 0.5)));
    const focalY = Math.max(0, Math.min(1, Number(asset.focal_y ?? 0.5)));
    const outputs: Array<{ preset: string; format: string; key: string; width: number; height: number; size: number }> = [];

    for (const preset of presets) {
      for (const format of formats) {
        const ext = format === 'jpeg' ? 'jpg' : format;
        const key = `variants/${assetId}/${preset.name}.${ext}`;
        let pipeline = sharp(rotated.data, { limitInputPixels: Number(process.env.MAX_IMAGE_PIXELS || 40_000_000) });
        if (preset.fit === 'cover') {
          const crop = focalCrop(sourceWidth, sourceHeight, preset.width, preset.height, focalX, focalY);
          pipeline = pipeline.extract(crop).resize(preset.width, preset.height, { fit: 'fill', withoutEnlargement: true });
        } else {
          pipeline = pipeline.resize(preset.width, preset.height, { fit: 'inside', withoutEnlargement: true });
        }
        if (format === 'webp') pipeline = pipeline.webp({ quality: preset.quality, effort: 4 });
        if (format === 'avif') pipeline = pipeline.avif({ quality: Math.max(45, preset.quality - 14), effort: 4 });
        if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true });
        const output = await pipeline.toBuffer({ resolveWithObject: true });
        const uniqueTempKey = `${key}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await writeStorage(uniqueTempKey, output.data);
        // Atomic local replacement keeps readers from seeing partially written variant files.
        const fs = await import('node:fs/promises');
        const pathMod = await import('node:path');
        const targetPath = pathMod.resolve(process.env.STORAGE_ROOT || './storage', key);
        await fs.mkdir(pathMod.dirname(targetPath), { recursive: true });
        await fs.rename(pathMod.resolve(process.env.STORAGE_ROOT || './storage', uniqueTempKey), targetPath);
        outputs.push({ preset: preset.name, format, key, width: output.info.width, height: output.info.height, size: output.data.length });
      }
    }

    await query('DELETE FROM media_variants WHERE asset_id = $1', [assetId]);
    for (const output of outputs) {
      await query(
        `INSERT INTO media_variants (asset_id, preset, format, storage_key, width, height, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (asset_id, preset, format) DO UPDATE SET storage_key = EXCLUDED.storage_key, width = EXCLUDED.width, height = EXCLUDED.height, size_bytes = EXCLUDED.size_bytes`,
        [assetId, output.preset, output.format, output.key, output.width, output.height, output.size],
      );
    }
    await query("UPDATE media_assets SET status = 'ready', processing_error = NULL, updated_at = NOW() WHERE id = $1", [assetId]);
    return { assetId, variantCount: outputs.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown image processing error';
    await query("UPDATE media_assets SET status = 'failed', processing_error = $2, updated_at = NOW() WHERE id = $1", [assetId, message.slice(0, 1000)]);
    throw error;
  }
}

export const supportedPresets = presets.map(({ name, width, height, fit }) => ({ name, width, height, fit }));
