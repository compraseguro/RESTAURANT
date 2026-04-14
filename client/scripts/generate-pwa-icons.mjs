/**
 * Genera icon-192.png e icon-512.png desde public/favicon.svg (rojo + R).
 * Ejecutar: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svg = readFileSync(join(publicDir, 'favicon.svg'));

await sharp(svg).resize(192, 192).png().toFile(join(publicDir, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(join(publicDir, 'icon-512.png'));
console.log('OK: public/icon-192.png, public/icon-512.png');
