/**
 * Generate simple placeholder PNG icons for the Chrome extension.
 * Uses a minimal PNG encoder (no dependencies).
 * Run: node generate-icons.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, 'icons');
if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 48, 128];
const BG_COLOR = [139, 92, 246]; // #8b5cf6 purple
const FG_COLOR = [255, 255, 255]; // white

/**
 * Create a minimal valid PNG file.
 * Draws a filled purple square with a white "T" letter approximation.
 */
function createPNG(size) {
  // Create pixel data (RGBA)
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Background: rounded rectangle (approximate with circle distance)
      const cx = size / 2, cy = size / 2;
      const radius = size * 0.42;
      const cornerRadius = size * 0.15;

      // Simple filled square with rounded corners
      const inset = size * 0.08;
      const inBounds = x >= inset && x < size - inset && y >= inset && y < size - inset;

      if (inBounds) {
        // Draw "T" shape
        const relX = (x - inset) / (size - 2 * inset);
        const relY = (y - inset) / (size - 2 * inset);

        const isTopBar = relY >= 0.15 && relY <= 0.35;
        const isStem = relX >= 0.38 && relX <= 0.62 && relY >= 0.25 && relY <= 0.85;

        if (isTopBar || isStem) {
          pixels[i] = FG_COLOR[0];
          pixels[i + 1] = FG_COLOR[1];
          pixels[i + 2] = FG_COLOR[2];
          pixels[i + 3] = 255;
        } else {
          pixels[i] = BG_COLOR[0];
          pixels[i + 1] = BG_COLOR[1];
          pixels[i + 2] = BG_COLOR[2];
          pixels[i + 3] = 255;
        }
      } else {
        // Transparent outside
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
      }
    }
  }

  return encodePNG(size, size, pixels);
}

// Minimal PNG encoder
function encodePNG(width, height, pixels) {
  const crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }

  function crc32(data, start, length) {
    let crc = 0xFFFFFFFF;
    for (let i = start; i < start + length; i++) {
      crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function adler32(data) {
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  // Raw scanlines: filter byte (0) + row data
  const rawSize = height * (1 + width * 4);
  const raw = new Uint8Array(rawSize);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // No filter
    for (let x = 0; x < width * 4; x++) {
      raw[rowStart + 1 + x] = pixels[y * width * 4 + x];
    }
  }

  // Deflate with stored blocks (no compression for simplicity)
  const maxBlock = 65535;
  const numBlocks = Math.ceil(raw.length / maxBlock);
  const deflateSize = 2 + raw.length + numBlocks * 5 + 4; // zlib header + blocks + adler32
  const deflated = new Uint8Array(deflateSize);
  let dpos = 0;

  // Zlib header
  deflated[dpos++] = 0x78;
  deflated[dpos++] = 0x01;

  let remaining = raw.length;
  let rpos = 0;
  while (remaining > 0) {
    const blockLen = Math.min(remaining, maxBlock);
    const isLast = remaining <= maxBlock;
    deflated[dpos++] = isLast ? 1 : 0;
    deflated[dpos++] = blockLen & 0xFF;
    deflated[dpos++] = (blockLen >> 8) & 0xFF;
    deflated[dpos++] = (~blockLen) & 0xFF;
    deflated[dpos++] = ((~blockLen) >> 8) & 0xFF;
    deflated.set(raw.subarray(rpos, rpos + blockLen), dpos);
    dpos += blockLen;
    rpos += blockLen;
    remaining -= blockLen;
  }

  // Adler32 checksum
  const adl = adler32(raw);
  deflated[dpos++] = (adl >> 24) & 0xFF;
  deflated[dpos++] = (adl >> 16) & 0xFF;
  deflated[dpos++] = (adl >> 8) & 0xFF;
  deflated[dpos++] = adl & 0xFF;

  const compressedData = deflated.subarray(0, dpos);

  // Build PNG file
  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk('IHDR', ihdr, crc32));

  // IDAT
  chunks.push(makeChunk('IDAT', Buffer.from(compressedData), crc32));

  // IEND
  chunks.push(makeChunk('IEND', Buffer.alloc(0), crc32));

  return Buffer.concat(chunks);
}

function makeChunk(type, data, crc32fn) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const combined = Buffer.concat([typeBytes, data]);
  const crc = crc32fn(combined, 0, combined.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, combined, crcBuf]);
}

// Generate all sizes
for (const size of sizes) {
  const png = createPNG(size);
  const path = join(iconsDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Created ${path} (${png.length} bytes)`);
}

console.log('Done!');
