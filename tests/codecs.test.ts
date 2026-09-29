import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import create from '../public/codecs/codecs.mjs';
import { decodeJxr, encode, type CodecModule } from '../src/codec.ts';
import { transform, fullEdit, stats, defaultTone, type FloatImage } from '../src/core.ts';

let module: CodecModule;
before(async () => { module = await create({ wasmBinary: readFileSync(new URL('../public/codecs/codecs.wasm',import.meta.url)), print: () => {} }); });
function constant(width=32,height=24): FloatImage {
  const data=new Float32Array(width*height*4); for(let i=0;i<data.length;i+=4) data.set([4,8,12,1],i);
  return {width,height,data};
}
function decodeHdr(bytes: Uint8Array) {
  const p=module._malloc(bytes.length); module.HEAPU8.set(bytes,p);
  try {
    assert.equal(module._hdr_decode(p,bytes.length),0,module.UTF8ToString(module._hdr_error()));
    const width=module._hdr_width(),height=module._hdr_height(),start=module._hdr_pixels()/4;
    return {width,height,data:module.HEAPF32.slice(start,start+width*height*4),capacity:module._hdr_capacity()};
  } finally { module._free(p); module._hdr_clear(); }
}
test('external real f32 JXR decodes at source dimensions and keeps HDR brightness', () => {
  const im=decodeJxr(module,readFileSync(new URL('./fixtures/sunrise-hdr.jxr',import.meta.url)));
  assert.equal(im.width,3440); assert.equal(im.height,1440); assert.equal(im.bits,128);
  assert(Math.abs(stats(im).peakNits - 9425.426)<1);
  assert(im.data.some(v=>v<0));
  const edit={...fullEdit(im),crop:{x:200,y:300,width:800,height:600},width:64,height:48,flipX:true,flipY:true};
  const expected=transform(im,edit);
  const result=decodeJxr(module,encode(module,expected,'jxr',defaultTone));
  assert.equal(result.width,64); assert.equal(result.height,48);
  let maxError=0;
  for(let i=0;i<result.data.length;i++) maxError=Math.max(maxError,Math.abs(expected.data[i]-result.data[i]) / Math.max(1,Math.abs(expected.data[i])));
  assert(maxError<0.002,`JXR relative error ${maxError}`);
});
test('float JXR export round-trips superwhite values, negative channels and alpha', () => {
  const im=constant(17,19);
  for(let i=0;i<im.data.length;i+=4) im.data.set([-.25,(i%64)/4,30,.5],i);
  const back=decodeJxr(module,encode(module,im,'jxr',defaultTone));
  assert.equal(back.width,17); assert.equal(back.height,19);
  for(let i=0;i<back.data.length;i++) assert(Math.abs(back.data[i]-im.data[i])<.005,`channel ${i}`);
});
test('external real f16 JXR retains its half-float HDR values', () => {
  const image = decodeJxr(module, readFileSync(new URL('../public/samples/blue_colorballs.jxr', import.meta.url)));
  assert.equal(image.bits, 64); assert.equal(image.width, 3840); assert.equal(image.height, 2560);
  assert(Math.abs(stats(image).peakNits - 1382.7655) < 1);
});
test('Ultra HDR and Apple exports contain ISO, XMP, MPF, ICC and reconstruct brightness', () => {
  for(const format of ['ultrahdr','apple'] as const) {
    const im=constant(); const bytes=encode(module,im,format,defaultTone,100);
    const data=Buffer.from(bytes);
    assert.equal(data.readUInt16BE(0),0xffd8);
    for(const marker of ['urn:iso:std:iso:ts:21496:-1','http://ns.adobe.com/hdr-gain-map/1.0/','MPF\0','ICC_PROFILE\0']) assert(data.includes(Buffer.from(marker)),marker);
    const back=decodeHdr(bytes); assert.equal(back.width,32); assert.equal(back.height,24);
    assert(back.capacity>1);
    // At 100% JPEG quality a constant patch should reconstruct within 5%, including 80/203 conversion.
    for(let c=0;c<3;c++) assert(Math.abs(back.data[c]/im.data[c]-1)<.05,`${format} channel ${c}: ${back.data[c]} vs ${im.data[c]}`);
    assert(stats(back).peakNits>500);
  }
});
test('HDR JPEG supports odd dimensions with no silent crop', () => {
  const im=constant(37,19), back=decodeHdr(encode(module,im,'ultrahdr',defaultTone));
  assert.equal(back.width,37); assert.equal(back.height,19);
});
test('full-resolution real photograph exports and reconstructs as HDR', () => {
  const image = decodeJxr(module, readFileSync(new URL('./fixtures/sunrise-hdr.jxr', import.meta.url)));
  const bytes = encode(module, image, 'ultrahdr', defaultTone, 95);
  const back = decodeHdr(bytes);
  assert.equal(back.width, 3440); assert.equal(back.height, 1440);
  const peak = stats(back).peakNits;
  assert(peak > 8000 && peak < 11000, `Full-resolution reconstructed peak: ${peak} nits`);
});
test('HDR remains stable when SDR exposure changes', () => {
  const im=constant();
  const a=decodeHdr(encode(module,im,'ultrahdr',{...defaultTone,exposure:-2},100));
  const b=decodeHdr(encode(module,im,'ultrahdr',{...defaultTone,exposure:1},100));
  for(let c=0;c<3;c++) assert(Math.abs(a.data[c]/b.data[c]-1)<.08);
});
test('SDR JPEG has one JPEG image and contains no HDR extension', () => {
  const encoded=encode(module,constant(),'jpeg',defaultTone);
  const bytes=Buffer.from(encoded);
  assert.equal(bytes.readUInt16BE(0),0xffd8); assert.equal(bytes.readUInt16BE(bytes.length-2),0xffd9);
  for(const marker of ['21496','hdr-gain-map','MPF\0']) assert(!bytes.includes(Buffer.from(marker)));
  const others=encode(module,constant(),'jpeg',{...defaultTone,operator:'linear'});
  assert.notDeepEqual(encoded,others);
});
test('bad and truncated files reject cleanly; next decode still works', () => {
  assert.throws(()=>decodeJxr(module,new Uint8Array([1,2,3,4])));
  const bytes=encode(module,constant(),'jxr',defaultTone);
  assert.throws(()=>decodeJxr(module,bytes.slice(0,50)));
  assert.equal(decodeJxr(module,bytes).width,32);
});
