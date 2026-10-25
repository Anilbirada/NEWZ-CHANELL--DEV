import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const configuredRoot = process.env.STORAGE_ROOT || './storage';
export const storageRoot = path.resolve(configuredRoot);

export async function ensureStorage() {
  await Promise.all([
    fs.mkdir(path.join(storageRoot, 'originals'), { recursive: true }),
    fs.mkdir(path.join(storageRoot, 'variants'), { recursive: true }),
    fs.mkdir(path.join(storageRoot, 'editions'), { recursive: true }),
    fs.mkdir(path.join(storageRoot, 'exports'), { recursive: true }),
  ]);
}

export function safePath(key: string) {
  const absolute = path.resolve(storageRoot, key);
  if (!absolute.startsWith(`${storageRoot}${path.sep}`)) throw new Error('Invalid storage key.');
  return absolute;
}

export async function writeStorage(key: string, bytes: Buffer) {
  const target = safePath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: 'wx' });
  return target;
}

export async function readStorage(key: string) {
  return fs.readFile(safePath(key));
}

export async function removeStorage(key: string) {
  await fs.rm(safePath(key), { force: true });
}
