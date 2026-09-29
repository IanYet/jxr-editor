export interface FloatImage { width: number; height: number; data: Float32Array }
export interface Crop { x: number; y: number; width: number; height: number }
export interface Edit { crop: Crop; width: number; height: number; flipX: boolean; flipY: boolean }
export type ToneOperator = 'hable' | 'reinhard' | 'aces' | 'linear';
export interface Tone { operator: ToneOperator; exposure: number; whitePoint: number }
export type ExportFormat = 'ultrahdr' | 'apple' | 'jxr' | 'jpeg';
export const MAX_PIXELS = 24_000_000;
export const defaultTone: Tone = { operator: 'hable', exposure: 0, whitePoint: 11.2 };
export const operators: Record<ToneOperator, { label: string; description: string }> = {
  hable: { label: 'Hable 胶片', description: '柔和压缩高光，保留阴影层次。适合游戏截图与日落。' },
  reinhard: { label: 'Reinhard', description: '按亮度压缩动态范围，尽量保留原始色相。' },
  aces: { label: 'ACES 拟合', description: '更鲜明的对比与柔和的高光过渡。使用 ACES 近似曲线。' },
  linear: { label: '线性裁切', description: '不压缩高光，超出 SDR 白点的部分会变为白色。' },
};
export function fullEdit(image: Pick<FloatImage, 'width' | 'height'>): Edit {
  return { crop: { x: 0, y: 0, width: image.width, height: image.height }, width: image.width, height: image.height, flipX: false, flipY: false };
}
export function validateEdit(image: Pick<FloatImage, 'width' | 'height'>, edit: Edit): void {
  const { crop, width, height } = edit;
  if (![crop.x, crop.y, crop.width, crop.height, width, height].every(Number.isSafeInteger)) throw new Error('尺寸与裁剪坐标必须为整数。');
  if (crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 || crop.x + crop.width > image.width || crop.y + crop.height > image.height) throw new Error('裁剪区域超出了原图范围。');
  if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > MAX_PIXELS) throw new Error('输出须为 1–16384 像素，且不超过 2400 万像素。');
}
export function ratioCrop(width: number, height: number, ratio: number): Crop {
  if (!Number.isFinite(ratio) || ratio <= 0) return { x: 0, y: 0, width, height };
  const w = Math.min(width, Math.max(1, Math.round(height * ratio)));
  const h = Math.min(height, Math.max(1, Math.round(w / ratio)));
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}
export function fitSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
// Geometry is always applied to linear Float32 pixels. X/Y refer to mirror axes.
export function transform(image: FloatImage, edit: Edit, maxEdge?: number): FloatImage {
  validateEdit(image, edit);
  const { width, height } = maxEdge ? fitSize(edit.width, edit.height, maxEdge) : edit;
  const out = new Float32Array(width * height * 4);
  const { crop } = edit;
  for (let y = 0; y < height; y++) {
    const py = edit.flipX ? height - 1 - y : y;
    const sy = Math.max(crop.y, Math.min(crop.y + crop.height - 1, crop.y + (py + 0.5) * crop.height / height - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(crop.y + crop.height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const px = edit.flipY ? width - 1 - x : x;
      const sx = Math.max(crop.x, Math.min(crop.x + crop.width - 1, crop.x + (px + 0.5) * crop.width / width - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(crop.x + crop.width - 1, x0 + 1), fx = sx - x0;
      const a = (y0 * image.width + x0) * 4, b = (y0 * image.width + x1) * 4;
      const c = (y1 * image.width + x0) * 4, d = (y1 * image.width + x1) * 4;
      for (let ch = 0; ch < 4; ch++) {
        out[(y * width + x) * 4 + ch] = (image.data[a + ch] * (1 - fx) + image.data[b + ch] * fx) * (1 - fy)
          + (image.data[c + ch] * (1 - fx) + image.data[d + ch] * fx) * fy;
      }
    }
  }
  return { width, height, data: out };
}
export function srgbEncode(v: number): number { return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
function hable(x: number): number { return (x * (0.15 * x + 0.05) + 0.004) / (x * (0.15 * x + 0.5) + 0.06) - 1 / 15; }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function toneMap(image: FloatImage, tone: Tone): Uint8Array {
  const out = new Uint8Array(image.data.length);
  const exposure = Math.pow(2, tone.exposure), white = Math.max(0.1, tone.whitePoint);
  const hableWhite = hable(white);
  for (let i = 0; i < out.length; i += 4) {
    const rgb = [0, 1, 2].map(c => Math.max(0, Number.isFinite(image.data[i + c]) ? image.data[i + c] * exposure : 0));
    const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    for (let c = 0; c < 3; c++) {
      let v = rgb[c];
      if (tone.operator === 'hable') v = hable(v * 2) / hableWhite;
      else if (tone.operator === 'reinhard') v *= (1 + luma / (white * white)) / (1 + luma);
      else if (tone.operator === 'aces') v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14);
      out[i + c] = Math.round(clamp(srgbEncode(clamp(v))) * 255);
    }
    out[i + 3] = 255;
  }
  return out;
}
export interface ImageStats { peakNits: number; maxChannel: number; hdrPercent: number; histogram: number[]; negativeCount: number }
export function stats(image: FloatImage): ImageStats {
  let peak = 0, maxChannel = 0, highlights = 0, negativeCount = 0;
  const histogram = Array<number>(64).fill(0);
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
    const lum = Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b);
    peak = Math.max(peak, lum); maxChannel = Math.max(maxChannel, r, g, b);
    if (lum > 1) highlights++;
    if (Math.min(r, g, b) < 0) negativeCount++;
    const bin = Math.min(63, Math.max(0, Math.floor((Math.log2(Math.max(lum, 2 ** -10)) + 10) * 4)));
    histogram[bin]++;
  }
  return { peakNits: peak * 80, maxChannel, hdrPercent: highlights / (image.width * image.height) * 100, histogram, negativeCount };
}
