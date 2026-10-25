import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const destination = path.resolve('dist/schema.sql');
await mkdir(path.dirname(destination), { recursive: true });
await copyFile(path.resolve('sql/schema.sql'), destination);
console.info('Database schema copied to dist/schema.sql');
