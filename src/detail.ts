import { toneMap, type FloatImage, type Tone } from './core.ts';

export const DETAIL_SIZE = 24;
export interface PixelDetail { x: number; y: number; size: number; pixels: Uint8Array }

// Copy native pixels directly, without resizing or lossy preview encoding.
export function pixelDetail(image: FloatImage, x: number, y: number, tone: Tone): PixelDetail {
  const size = DETAIL_SIZE;
  const left = Math.round(x) - size / 2, top = Math.round(y) - size / 2;
  const data = new Float32Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    const sy = top + row;
    if (sy < 0 || sy >= image.height) continue;
    const start = Math.max(0, left), end = Math.min(image.width, left + size);
    if (end > start) data.set(image.data.subarray((sy * image.width + start) * 4, (sy * image.width + end) * 4), (row * size + start - left) * 4);
  }
  const pixels = toneMap({ width: size, height: size, data }, tone);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    if (top + row < 0 || top + row >= image.height || left + col < 0 || left + col >= image.width) {
      const offset = (row * size + col) * 4, shade = (row + col) % 2 ? 30 : 42;
      pixels.set([shade, shade, shade, 255], offset);
    }
  }
  return { x: left, y: top, size, pixels };
}
