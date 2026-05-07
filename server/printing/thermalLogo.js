/**
 * Logo del restaurante → raster ESC/POS (GS v 0) para tickets térmicos.
 */

const fs = require('fs');
const path = require('path');
const { getUploadsRoot } = require('../uploadsPath');

function resolveLogoFsPath(logoUrl) {
  let s = String(logoUrl || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname || '';
    } catch (_) {
      return '';
    }
  }
  let rel = s.replace(/^\/+/, '');
  if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);
  const full = path.join(getUploadsRoot(), rel);
  return fs.existsSync(full) ? full : '';
}

function maxLogoWidthDots(paperWidthMm) {
  return Number(paperWidthMm) <= 58 ? 384 : 576;
}

/** GS v 0 m=0: bitmap 1 bit, filas = heightDots, ancho en bytes = ceil(widthDots/8). */
function escposGsV0Raster(bitmapRows, widthDots, heightDots) {
  const widthBytes = Math.ceil(widthDots / 8);
  const expected = widthBytes * heightDots;
  if (bitmapRows.length !== expected) {
    throw new Error(`raster: esperado ${expected} bytes, hay ${bitmapRows.length}`);
  }
  const xL = widthBytes & 255;
  const xH = (widthBytes >> 8) & 255;
  const yL = heightDots & 255;
  const yH = (heightDots >> 8) & 255;
  const header = Buffer.from([0x1d, 0x76, 0x30, 0, xL, xH, yL, yH]);
  return Buffer.concat([header, bitmapRows]);
}

/**
 * @param {string} logoUrl — ruta tipo `/uploads/...` o relativa bajo uploads
 * @param {number} paperWidthMm — 58 u 80
 * @returns {Promise<Buffer|null>}
 */
async function logoToEscPosRaster(logoUrl, paperWidthMm) {
  const abs = resolveLogoFsPath(logoUrl);
  if (!abs) return null;
  let Jimp;
  try {
    // eslint-disable-next-line global-require
    Jimp = require('jimp');
  } catch (_) {
    console.warn('[printing] jimp no disponible; omitiendo logo térmico');
    return null;
  }
  try {
    const maxW = maxLogoWidthDots(paperWidthMm);
    const maxH = 220;
    const image = await Jimp.read(abs);
    image.contain(maxW, maxH);
    image.greyscale();
    const w = image.getWidth();
    const h = image.getHeight();
    const widthBytes = Math.ceil(w / 8);
    const out = Buffer.alloc(widthBytes * h, 0);
    for (let y = 0; y < h; y += 1) {
      for (let xb = 0; xb < widthBytes; xb += 1) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          const x = xb * 8 + bit;
          let black = 0;
          if (x < w) {
            const { r } = Jimp.intToRGBA(image.getPixelColor(x, y));
            black = r < 148 ? 1 : 0;
          }
          if (black) byte |= 0x80 >> bit;
        }
        out[y * widthBytes + xb] = byte;
      }
    }
    return escposGsV0Raster(out, w, h);
  } catch (e) {
    console.warn('[printing] logo térmico:', e.message || e);
    return null;
  }
}

module.exports = { logoToEscPosRaster, resolveLogoFsPath, maxLogoWidthDots };
