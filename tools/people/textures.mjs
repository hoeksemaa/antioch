// Converts the Poly Haven JPGs to WebP: color 1024 px, normal and ARM 512 px.
// Usage: node textures.mjs <raw dir> <out dir>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.jpg'))) {
  const size = f.includes('_color') ? 1024 : 512;
  const quality = f.includes('_normal') ? 90 : 82;
  const dst = path.join(out, f.replace('.jpg', '.webp'));
  await sharp(path.join(src, f)).resize(size, size).webp({ quality }).toFile(dst);
  console.log(dst, fs.statSync(dst).size);
}
