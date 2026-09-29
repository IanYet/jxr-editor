import type { Crop, Tone } from './core.ts';
import type { PixelDetail } from './detail.ts';

interface DetailPosition { x: number; y: number; clientX: number; clientY: number }
interface DetailJob { position: DetailPosition; crop: Crop; tone: Tone }

export function createLoupe(element: HTMLElement, read: (x: number, y: number, tone: Tone) => Promise<PixelDetail>) {
  const canvas = element.querySelector('canvas')!, context = canvas.getContext('2d')!;
  const patch = document.createElement('canvas'), patchContext = patch.getContext('2d')!;
  const label = element.querySelector<HTMLElement>('.loupe-coordinates')!;
  let generation = 0, running = false, desired: DetailJob | undefined;
  async function pump() {
    if (running) return;
    running = true;
    try {
      while (desired) {
        const job = desired, current = generation; desired = undefined;
        try {
          const detail = await read(job.position.x, job.position.y, job.tone);
          if (current !== generation || element.hidden) continue;
          patch.width = patch.height = detail.size;
          patchContext.putImageData(new ImageData(new Uint8ClampedArray(detail.pixels), detail.size, detail.size), 0, 0);
          context.imageSmoothingEnabled = false;
          context.drawImage(patch, 0, 0, canvas.width, canvas.height);
          const scale = canvas.width / detail.size;
          // Thin pixel grid, with the crop boundary drawn in green at exact pixel edges.
          context.lineWidth = 1; context.strokeStyle = '#0002'; context.beginPath();
          for (let i = 0; i <= detail.size; i++) { context.moveTo(i * scale, 0); context.lineTo(i * scale, canvas.height); context.moveTo(0, i * scale); context.lineTo(canvas.width, i * scale); }
          context.stroke();
          const c = job.crop;
          context.lineWidth = 2; context.strokeStyle = '#d3f791';
          context.strokeRect((c.x - detail.x) * scale, (c.y - detail.y) * scale, c.width * scale, c.height * scale);
          const cx = (job.position.x - detail.x) * scale, cy = (job.position.y - detail.y) * scale;
          const crosshair = () => { context.beginPath(); context.moveTo(cx - 10, cy); context.lineTo(cx + 10, cy); context.moveTo(cx, cy - 10); context.lineTo(cx, cy + 10); context.stroke(); };
          context.lineWidth = 3; context.strokeStyle = '#000b'; crosshair();
          context.lineWidth = 1; context.strokeStyle = '#fff'; crosshair();
          canvas.dataset.sourceX = String(job.position.x); canvas.dataset.sourceY = String(job.position.y);
          canvas.dataset.sourceSize = String(detail.size);
          label.textContent = `X ${job.position.x} · Y ${job.position.y}`;
          element.dataset.ready = 'true';
        } catch { if (current === generation) label.textContent = '像素细节暂不可用'; }
      }
    } finally { running = false; }
  }
  return {
    show(position: DetailPosition, crop: Crop, tone: Tone) {
      element.hidden = false;
      const width = element.offsetWidth, height = element.offsetHeight;
      let left = position.clientX + 24, top = position.clientY - height - 22;
      if (left + width > innerWidth - 8) left = position.clientX - width - 24;
      if (top < 8) top = position.clientY + 24;
      element.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`;
      element.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, top))}px`;
      desired = { position, crop: { ...crop }, tone: { ...tone } };
      void pump();
    },
    hide() { generation++; desired = undefined; element.hidden = true; element.dataset.ready = 'false'; label.textContent = '正在读取像素…'; context.clearRect(0, 0, canvas.width, canvas.height); },
  };
}
