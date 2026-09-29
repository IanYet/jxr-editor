import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fullEdit, transform, toneMap, defaultTone, stats, ratioCrop, validateEdit, srgbEncode } from '../src/core.ts';

const image = { width: 3, height: 2, data: new Float32Array([1,1,1,1, 2,2,2,1, 4,4,4,1, 8,8,8,1, 16,16,16,1, 32,32,32,1]) };
const reds = (data: Float32Array) => [...data].filter((_, i) => i % 4 === 0);
test('identity retains every HDR channel, negatives and alpha', () => {
  const data = new Float32Array([-.25, 12.75, 100.25, .5]);
  const im = { width: 1, height: 1, data };
  assert.deepEqual(transform(im, fullEdit(im)).data, data);
});
test('X axis means vertical reflection; Y axis means horizontal reflection', () => {
  assert.deepEqual(reds(transform(image, { ...fullEdit(image), flipX: true }).data), [8,16,32,1,2,4]);
  assert.deepEqual(reds(transform(image, { ...fullEdit(image), flipY: true }).data), [4,2,1,32,16,8]);
  assert.deepEqual(reds(transform(image, { ...fullEdit(image), flipX: true, flipY: true }).data), [32,16,8,4,2,1]);
});
test('crop before resampling and mirroring, without clipping bright pixels', () => {
  const result = transform(image, { crop: { x: 1, y: 0, width: 2, height: 2 }, width: 2, height: 2, flipX: false, flipY: true });
  assert.deepEqual(reds(result.data), [4,2,32,16]);
  const half = transform(image, { ...fullEdit(image), width: 1, height: 1 });
  assert.equal(half.data[0], 9);
});
test('linear-light interpolation has predictable values', () => {
  const im = { width: 2, height: 1, data: new Float32Array([0,0,0,1, 8,8,8,1]) };
  assert.deepEqual(reds(transform(im, { ...fullEdit(im), width: 4 }).data), [0,2,6,8]);
});
test('presets fit within image bounds, including portrait and tiny images', () => {
  assert.deepEqual(ratioCrop(400,300,1), { x:50,y:0,width:300,height:300 });
  for (const ratio of [1,4/3,3/2,16/9,9/16,21/9]) for (const [w,h] of [[400,300],[10,100],[1,1]]) {
    const crop = ratioCrop(w,h,ratio); validateEdit({width:w,height:h},{crop,width:crop.width,height:crop.height,flipX:false,flipY:false});
  }
});
test('invalid and excessive dimensions are rejected before memory allocation', () => {
  for (const width of [0,-1,1.5,Infinity,NaN,16385]) assert.throws(() => transform(image, { ...fullEdit(image), width }));
  assert.throws(() => transform(image, {...fullEdit(image),width:6000,height:6000}));
  assert.throws(() => transform(image,{...fullEdit(image),crop:{x:2,y:0,width:3,height:2}}));
});
test('four selectable SDR operators differ, preserve source, and apply sRGB transfer', () => {
  const im = { width:2,height:1,data:new Float32Array([.18,.5,1,1,2,4,8,1]) };
  const before = im.data.slice();
  const results = ['hable','reinhard','aces','linear'].map(operator => toneMap(im,{...defaultTone,operator:operator as typeof defaultTone.operator}));
  assert.equal(new Set(results.map(x => x.join(','))).size,4);
  assert.deepEqual(im.data,before);
  assert.equal(results[3][0],Math.round(srgbEncode(.18)*255));
  assert.equal(results[3][6],255);
  assert(toneMap(im,{...defaultTone,exposure:-2})[1] < toneMap(im,defaultTone)[1]);
});
test('source luminance reports physical scRGB scale, not an 8-bit histogram', () => {
  const s=stats(image); assert.equal(s.peakNits,2560); assert.equal(s.maxChannel,32); assert(Math.abs(s.hdrPercent - 100*5/6) < 1e-10);
  assert.equal(s.histogram.reduce((a,b)=>a+b),6);
});
