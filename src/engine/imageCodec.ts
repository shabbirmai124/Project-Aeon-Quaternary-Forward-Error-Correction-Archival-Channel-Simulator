/**
 * Project Aeon — Grayscale Image Serialization & Reconstruction Utility
 * Converts HTMLImageElement / File / URL into a compact deterministic 8-bit grayscale
 * binary stream with a 4-byte header [magic=0xA1, width, height, channels=1]
 * so both naive corrupted streams and RS+TMR recovered streams can be rendered side-by-side.
 */

export interface SerializedGrayscaleImage {
  width: number;
  height: number;
  bytes: Uint8Array; // 4-byte header + width * height grayscale pixels
  previewDataUrl: string;
}

export const DEFAULT_IMAGE_DIM = 36; // 36x36 = 1,296 pixel bytes (+4 header = 1,300 bytes)

export async function loadImageToGrayscaleBytes(
  src: string,
  targetSize = DEFAULT_IMAGE_DIM
): Promise<SerializedGrayscaleImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    el.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Center-crop square to preserve aspect ratio cleanly
  const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx = ((img.naturalWidth || img.width) - minSide) / 2;
  const sy = ((img.naturalHeight || img.height) - minSide) / 2;
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

  const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
  const pixels = imgData.data;
  const payload = new Uint8Array(4 + targetSize * targetSize);
  payload[0] = 0xa1;
  payload[1] = targetSize;
  payload[2] = targetSize;
  payload[3] = 1;

  for (let i = 0; i < targetSize * targetSize; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    // ITU-R BT.601 luminance grayscale conversion
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    payload[4 + i] = lum;
  }

  return {
    width: targetSize,
    height: targetSize,
    bytes: payload,
    previewDataUrl: grayscaleBytesToDataUrl(payload, targetSize, targetSize),
  };
}

/**
 * Renders an 8-bit grayscale payload (with or without corrupted header) back into a sharp
 * upscaled data URL for side-by-side Original / Corrupted / Recovered Proof-of-Concept plates.
 */
export function grayscaleBytesToDataUrl(
  bytes: Uint8Array,
  fallbackWidth = DEFAULT_IMAGE_DIM,
  fallbackHeight = DEFAULT_IMAGE_DIM
): string {
  const width = bytes.length >= 4 && bytes[0] === 0xa1 && bytes[1] >= 8 && bytes[1] <= 128 ? bytes[1] : fallbackWidth;
  const height = bytes.length >= 4 && bytes[0] === 0xa1 && bytes[2] >= 8 && bytes[2] <= 128 ? bytes[2] : fallbackHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const out = imgData.data;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const val = bytes[4 + i] ?? 0;
    const o = i * 4;
    out[o] = val;
    out[o + 1] = val;
    out[o + 2] = val;
    out[o + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function fileToObjectUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read uploaded file'));
    reader.readAsDataURL(file);
  });
}
