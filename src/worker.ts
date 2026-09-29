/// <reference lib="webworker" />
import { decodeJxr, encode, loadCodec, type CodecModule } from './codec.ts';
import { stats, transform, fullEdit, defaultTone, type FloatImage, type Edit, type Tone, type ExportFormat } from './core.ts';
import { pixelDetail } from './detail.ts';

export type Request = { id: number; baseUrl: string } & (
  | { type: 'load'; bytes: ArrayBuffer }
  | { type: 'preview'; edit: Edit; tone: Tone; original?: boolean }
  | { type: 'detail'; x: number; y: number; tone: Tone }
  | { type: 'export'; edit: Edit; tone: Tone; format: ExportFormat; quality: number }
);
let modulePromise: Promise<CodecModule> | undefined;
let original: FloatImage | undefined;
function jpegPreview(image: FloatImage): FloatImage {
  if (image.width > 1 && image.height > 1) return image;
  return transform(image, { ...fullEdit(image), width: image.width * 2, height: image.height * 2 });
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => { queue = queue.then(() => handle(event.data)); };
async function handle(request: Request) {
  const { id } = request;
  const progress = (label: string) => self.postMessage({ id, progress: label });
  try {
    if (!modulePromise) progress('正在加载本地 HDR 引擎…');
    const module = await (modulePromise ??= loadCodec(request.baseUrl));
    if (request.type === 'load') {
      progress('正在解码 JXR 浮点亮度…');
      const image = decodeJxr(module, new Uint8Array(request.bytes));
      original = image;
      const info = { width: image.width, height: image.height, bits: image.bits, stats: stats(image) };
      progress('正在生成 HDR 预览…');
      const preview = jpegPreview(transform(image, fullEdit(image), 1500));
      const sdr = encode(module, preview, 'jpeg', defaultTone, 88);
      const hdr = encode(module, preview, 'ultrahdr', defaultTone, 88);
      const thumb = encode(module, jpegPreview(transform(image, fullEdit(image), 160)), 'jpeg', defaultTone, 75);
      self.postMessage({ id, result: { ...info, hdr, sdr, thumb } }, [hdr.buffer, sdr.buffer, thumb.buffer]);
    } else {
      if (!original) throw new Error('请先打开一张 JXR 照片。');
      if (request.type === 'detail') {
        const result = pixelDetail(original, request.x, request.y, request.tone);
        self.postMessage({ id, result }, [result.pixels.buffer]);
        return;
      }
      let image = transform(original, request.type === 'preview' && request.original ? fullEdit(original) : request.edit, request.type === 'preview' ? 1500 : undefined);
      if (request.type === 'preview') {
        image = jpegPreview(image);
        const sdr = encode(module, image, 'jpeg', request.tone, 88);
        const hdr = encode(module, image, 'ultrahdr', request.tone, 88);
        self.postMessage({ id, result: { hdr, sdr } }, [hdr.buffer, sdr.buffer]);
      } else {
        progress(`正在编码 ${request.format === 'jxr' ? 'JXR' : request.format === 'jpeg' ? 'SDR JPEG' : 'HDR JPEG'}…`);
        const bytes = encode(module, image, request.format, request.tone, request.quality);
        self.postMessage({ id, result: { bytes } }, [bytes.buffer]);
      }
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
}
