import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const destination = path.resolve(dir, '../dist/schema.sql');
const source = path.resolve(dir, '../sql/schema.sql');

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
console.info('Database schema copied to dist/schema.sql');
