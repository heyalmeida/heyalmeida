/**
 * Minimal, dependency-free PNG decoder.
 *
 * It only exists so `render-ascii.mjs --image photo.png` can turn a picture into
 * ASCII art without pulling in `sharp`, `canvas` or Python's Pillow. Supported:
 * 8/16-bit, non-interlaced, colour types 0 (gray), 2 (RGB), 3 (palette),
 * 4 (gray+alpha) and 6 (RGBA). Anything else throws with an actionable message.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAMPLES_PER_PIXEL = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, bytesPerPixel, bytesPerRow) {
  const out = new Uint8Array(height * bytesPerRow);
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[y * (bytesPerRow + 1)];
    const rowStart = y * (bytesPerRow + 1) + 1;
    const outStart = y * bytesPerRow;
    const priorStart = (y - 1) * bytesPerRow;

    for (let x = 0; x < bytesPerRow; x += 1) {
      const value = raw[rowStart + x];
      const left = x >= bytesPerPixel ? out[outStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? out[priorStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[priorStart + x - bytesPerPixel] : 0;

      let reconstruct;
      switch (filterType) {
        case 0:
          reconstruct = value;
          break;
        case 1:
          reconstruct = value + left;
          break;
        case 2:
          reconstruct = value + up;
          break;
        case 3:
          reconstruct = value + ((left + up) >> 1);
          break;
        case 4:
          reconstruct = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`Unsupported PNG filter type ${filterType} on row ${y}`);
      }
      out[outStart + x] = reconstruct & 0xff;
    }
  }
  return out;
}

/**
 * @param {string} file path to a .png
 * @returns {{ width:number, height:number, luminance:Float32Array }} luminance is 0..1, alpha flattened onto white
 */
export function decodePng(file) {
  const buffer = readFileSync(file);
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error(`${file} is not a PNG file (bad signature).`);
  }

  let offset = 8;
  let header = null;
  let palette = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (!header) throw new Error(`${file} has no IHDR chunk.`);
  if (header.interlace !== 0) {
    throw new Error(
      `${file} uses Adam7 interlacing, which is not supported. Re-export it as a non-interlaced PNG.`,
    );
  }
  if (header.bitDepth !== 8 && header.bitDepth !== 16) {
    throw new Error(`${file} uses a ${header.bitDepth}-bit palette/grayscale format; re-export as 8-bit RGB(A).`);
  }

  const channels = SAMPLES_PER_PIXEL[header.colorType];
  if (!channels) throw new Error(`${file} uses an unsupported colour type (${header.colorType}).`);

  const bytesPerSample = header.bitDepth / 8;
  const bytesPerPixel = channels * bytesPerSample;
  const bytesPerRow = header.width * bytesPerPixel;
  const expected = header.height * (bytesPerRow + 1);

  const raw = inflateSync(Buffer.concat(idatChunks));
  if (raw.length < expected) {
    throw new Error(`${file} looks truncated (${raw.length} of ${expected} bytes decompressed).`);
  }

  const pixels = unfilter(raw, header.width, header.height, bytesPerPixel, bytesPerRow);
  const luminance = new Float32Array(header.width * header.height);

  const sample = (index) => (bytesPerSample === 2 ? pixels[index * 2] : pixels[index]);

  for (let i = 0; i < luminance.length; i += 1) {
    const base = i * channels;
    let r;
    let g;
    let b;
    let alpha = 255;

    switch (header.colorType) {
      case 0:
        r = sample(base);
        g = r;
        b = r;
        break;
      case 4:
        r = sample(base);
        g = r;
        b = r;
        alpha = sample(base + 1);
        break;
      case 2:
        r = sample(base);
        g = sample(base + 1);
        b = sample(base + 2);
        break;
      case 6:
        r = sample(base);
        g = sample(base + 1);
        b = sample(base + 2);
        alpha = sample(base + 3);
        break;
      case 3: {
        const entry = sample(base) * 3;
        if (!palette || entry + 2 >= palette.length) throw new Error(`${file} has an invalid palette.`);
        r = palette[entry];
        g = palette[entry + 1];
        b = palette[entry + 2];
        break;
      }
      default:
        throw new Error(`${file} uses an unsupported colour type (${header.colorType}).`);
    }

    // Composite onto white so transparent backgrounds become blank ASCII.
    const alphaRatio = alpha / 255;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luminance[i] = luma * alphaRatio + (1 - alphaRatio);
  }

  return { width: header.width, height: header.height, luminance };
}