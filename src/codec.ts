import { toneMap, type FloatImage, type Tone, type ExportFormat } from './core.ts';

export interface CodecModule {
  HEAPU8: Uint8Array; HEAPF32: Float32Array;
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array; unlink(path: string): void };
  UTF8ToString(ptr: number): string;
  _malloc(size: number): number; _free(ptr: number): void;
  _jxr_decode(): number; _jxr_encode(ptr: number, width: number, height: number): number;
  _jxr_width(): number; _jxr_height(): number; _jxr_bits(): number; _jxr_pixels(): number; _jxr_clear(): void; _jxr_error(): number;
  _hdr_encode(hdr: number, sdr: number, width: number, height: number, quality: number): number;
  _sdr_encode(sdr: number, width: number, height: number, quality: number): number;
  _hdr_decode(data: number, size: number): number; _hdr_pixels(): number; _hdr_width(): number; _hdr_height(): number; _hdr_capacity(): number; _hdr_clear(): void; _hdr_error(): number;
}
export async function loadCodec(baseUrl: string): Promise<CodecModule> {
  const url = new URL('codecs/codecs.mjs', baseUrl).href;
  const factory = (await import(/* @vite-ignore */ url)).default;
  return factory({ locateFile: (file: string) => new URL(`codecs/${file}`, baseUrl).href });
}
function allocate(module: CodecModule, data: Uint8Array | Float32Array): number {
  const ptr = module._malloc(data.byteLength);
  if (!ptr) throw new Error('浏览器内存不足，请缩小输出尺寸或关闭其他标签页。');
  module.HEAPU8.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ptr);
  return ptr;
}
export function decodeJxr(module: CodecModule, bytes: Uint8Array): FloatImage & { bits: number } {
  if (bytes.length < 16 || bytes[0] !== 0x49 || bytes[1] !== 0x49 || bytes[2] !== 0xbc || bytes[3] !== 1) throw new Error('这不是有效的 JPEG XR 文件，请选择 .jxr、.wdp 或 .hdp 照片。');
  module.FS.writeFile('/input.jxr', bytes);
  try {
    if (module._jxr_decode() < 0) throw new Error(module.UTF8ToString(module._jxr_error()));
    const width = module._jxr_width(), height = module._jxr_height(), ptr = module._jxr_pixels() / 4;
    return { width, height, bits: module._jxr_bits(), data: module.HEAPF32.slice(ptr, ptr + width * height * 4) };
  } finally { module._jxr_clear(); module.FS.unlink('/input.jxr'); }
}
export function encode(module: CodecModule, image: FloatImage, format: ExportFormat, tone: Tone, quality = 92): Uint8Array {
  const buffers: number[] = [];
  const output = format === 'jxr' ? '/output.jxr' : '/output.jpg';
  try {
    let status: number;
    if (format === 'jxr') {
      const hdr = allocate(module, image.data); buffers.push(hdr);
      status = module._jxr_encode(hdr, image.width, image.height);
    } else {
      const sdr = allocate(module, toneMap(image, tone)); buffers.push(sdr);
      if (format === 'jpeg') status = module._sdr_encode(sdr, image.width, image.height, quality);
      else {
        const hdr = allocate(module, image.data); buffers.push(hdr);
        status = module._hdr_encode(hdr, sdr, image.width, image.height, quality);
      }
    }
    if (status < 0) throw new Error(module.UTF8ToString(format === 'jxr' ? module._jxr_error() : module._hdr_error()) || '编码失败，请尝试较小的尺寸。');
    return module.FS.readFile(output).slice();
  } finally {
    for (const ptr of buffers) module._free(ptr);
    try { module.FS.unlink(output); } catch { /* no output on failure */ }
  }
}
