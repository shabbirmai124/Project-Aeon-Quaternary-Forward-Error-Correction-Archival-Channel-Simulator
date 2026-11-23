export interface GrayscaleMatrix {
  width: number;
  height: number;
  pixels: Uint8Array;
}

const MAGIC_HEADER = [0x41, 0x45]; // 'AE'

export function encodeImageMatrixToBytes(matrix: GrayscaleMatrix): Uint8Array {
  const out = new Uint8Array(4 + matrix.pixels.length);
  out[0] = MAGIC_HEADER[0];
  out[1] = MAGIC_HEADER[1];
  out[2] = matrix.width & 0xff;
  out[3] = matrix.height & 0xff;
  out.set(matrix.pixels, 4);
  return out;
}

export function decodeBytesToImageMatrix(
  bytes: Uint8Array,
  fallbackWidth: number,
  fallbackHeight: number,
): GrayscaleMatrix {
  if (bytes.length >= 4 && bytes[0] === MAGIC_HEADER[0] && bytes[1] === MAGIC_HEADER[1]) {
    const w = Math.max(8, Math.min(128, bytes[2] || fallbackWidth));
    const h = Math.max(8, Math.min(128, bytes[3] || fallbackHeight));
    const expected = w * h;
    const pixels = new Uint8Array(expected);
    pixels.set(bytes.slice(4, 4 + expected));
    return { width: w, height: h, pixels };
  }

  const expected = fallbackWidth * fallbackHeight;
  const pixels = new Uint8Array(expected);
  const src = bytes.slice(4);
  pixels.set(src.slice(0, expected));
  return { width: fallbackWidth, height: fallbackHeight, pixels };
}

export async function loadImageToGrayscaleMatrix(
  srcUrl: string,
  targetSize = 56,
): Promise<GrayscaleMatrix> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      // Center-crop square region
      const minSide = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - minSide) / 2);
      const sy = Math.floor((img.height - minSide) / 2);
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

      const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
      const rgba = imageData.data;
      const pixels = new Uint8Array(targetSize * targetSize);

      for (let i = 0; i < pixels.length; i++) {
        const o = i * 4;
        // Luminance Rec. 709
        pixels[i] = Math.round(
          0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2],
        );
      }

      resolve({ width: targetSize, height: targetSize, pixels });
    };
    img.onerror = () => reject(new Error('Failed to load image asset'));
    img.src = srcUrl;
  });
}

export function createDeterministicFallbackMatrix(size = 56): GrayscaleMatrix {
  const pixels = new Uint8Array(size * size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const spiral = Math.sin(r * 0.45 - angle * 2) * 0.5 + 0.5;
      const disc = r < size * 0.42 ? 1 : 0.25;
      pixels[y * size + x] = Math.round(spiral * disc * 235 + 15);
    }
  }
  return { width: size, height: size, pixels };
}

export function renderGrayscaleMatrixToCanvas(
  canvas: HTMLCanvasElement | null,
  matrix: GrayscaleMatrix | null,
): void {
  if (!canvas || !matrix) return;
  canvas.width = matrix.width;
  canvas.height = matrix.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.createImageData(matrix.width, matrix.height);
  for (let i = 0; i < matrix.pixels.length; i++) {
    const v = matrix.pixels[i];
    const o = i * 4;
    imgData.data[o] = v;
    imgData.data[o + 1] = v;
    imgData.data[o + 2] = v;
    imgData.data[o + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
