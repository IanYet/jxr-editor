import type { Crop } from './core.ts';

export interface Point { x: number; y: number }
export interface CropDrag extends Point { crop: Crop; handle: string }

export function changeCropField(crop: Crop, field: keyof Crop, value: number, ratio: number): Crop {
  const next = { ...crop, [field]: value };
  if (ratio > 0) {
    if (field === 'width') next.height = Math.max(1, Math.round(value / ratio));
    if (field === 'height') next.width = Math.max(1, Math.round(value * ratio));
  }
  return next;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function dragCrop(drag: CropDrag, p: Point, bounds: { width: number; height: number }, ratio: number): Crop {
  const c = drag.crop, handle = drag.handle;
  if (handle === 'move') return { ...c, x: clamp(c.x + p.x - drag.x, 0, bounds.width - c.width), y: clamp(c.y + p.y - drag.y, 0, bounds.height - c.height) };
  if (['n', 's', 'e', 'w'].includes(handle)) {
    const horizontal = handle === 'e' || handle === 'w';
    const reverse = handle === 'w' || handle === 'n';
    const anchor = horizontal ? (reverse ? c.x + c.width : c.x) : (reverse ? c.y + c.height : c.y);
    const center = horizontal ? c.y + c.height / 2 : c.x + c.width / 2;
    const limit = horizontal ? bounds.width : bounds.height;
    const crossMax = 2 * Math.min(center, (horizontal ? bounds.height : bounds.width) - center);
    let max = reverse ? anchor : limit - anchor;
    if (ratio) {
      max = Math.min(max, horizontal ? crossMax * ratio : crossMax / ratio);
    }
    const size = Math.round(clamp(reverse ? anchor - (horizontal ? p.x : p.y) : (horizontal ? p.x : p.y) - anchor, 1, max));
    const width = horizontal ? size : ratio ? clamp(Math.round(size * ratio), 1, crossMax) : c.width;
    const height = !horizontal ? size : ratio ? clamp(Math.round(size / ratio), 1, crossMax) : c.height;
    return {
      x: horizontal ? (reverse ? anchor - width : anchor) : clamp(Math.round(center - width / 2), 0, bounds.width - width),
      y: !horizontal ? (reverse ? anchor - height : anchor) : clamp(Math.round(center - height / 2), 0, bounds.height - height),
      width, height,
    };
  }
  const anchorX = handle === 'new' ? drag.x : handle.includes('w') ? c.x + c.width : c.x;
  const anchorY = handle === 'new' ? drag.y : handle.includes('n') ? c.y + c.height : c.y;
  const dx = p.x - anchorX, dy = p.y - anchorY;
  const maxW = dx < 0 ? anchorX : bounds.width - anchorX, maxH = dy < 0 ? anchorY : bounds.height - anchorY;
  if (maxW < 1 || maxH < 1) return { ...c };
  let w = Math.max(1, Math.abs(dx)), h = Math.max(1, Math.abs(dy));
  if (ratio) {
    if (w / h > ratio) h = w / ratio; else w = h * ratio;
    const scale = Math.min(1, maxW / w, maxH / h); w *= scale; h *= scale;
  }
  w = clamp(Math.round(w), 1, maxW); h = clamp(Math.round(h), 1, maxH);
  return { x: dx < 0 ? anchorX - w : anchorX, y: dy < 0 ? anchorY - h : anchorY, width: w, height: h };
}
