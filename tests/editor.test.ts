import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeCropField, dragCrop } from '../src/crop.ts';
import { defaultTone, toneMap, validateEdit } from '../src/core.ts';
import { pixelDetail, DETAIL_SIZE } from '../src/detail.ts';
import { droppedPhotos, selectedPhotos, photoKey, isJxr } from '../src/files.ts';

test('numeric crop edits keep the selected ratio in both directions and preserve the origin', () => {
  const crop = { x: 440, y: 0, width: 2560, height: 1440 };
  assert.deepEqual(changeCropField(crop, 'width', 1024, 16 / 9), { x: 440, y: 0, width: 1024, height: 576 });
  assert.deepEqual(changeCropField(crop, 'height', 720, 16 / 9), { x: 440, y: 0, width: 1280, height: 720 });
  assert.deepEqual(changeCropField(crop, 'height', 640, 9 / 16), { x: 440, y: 0, width: 360, height: 640 });
  assert.deepEqual(changeCropField(crop, 'x', 100, 16 / 9), { ...crop, x: 100 });
  assert.deepEqual(changeCropField(crop, 'width', 800, 0), { ...crop, width: 800 });
  const invalid = changeCropField(crop, 'height', 5000, 16 / 9);
  assert.throws(() => validateEdit({ width: 3440, height: 1440 }, { crop: invalid, width: invalid.width, height: invalid.height, flipX: false, flipY: false }));
});

test('edge drags keep the opposite edge, link the other dimension, and stop at image bounds', () => {
  const crop = { x: 100, y: 100, width: 400, height: 200 }, bounds = { width: 1000, height: 800 };
  assert.deepEqual(dragCrop({ x: 500, y: 200, crop, handle: 'e' }, { x: 700, y: 350 }, bounds, 2), { x: 100, y: 50, width: 600, height: 300 });
  assert.deepEqual(dragCrop({ x: 100, y: 200, crop, handle: 'w' }, { x: 300, y: 450 }, bounds, 0), { x: 300, y: 100, width: 200, height: 200 });
  assert.deepEqual(dragCrop({ x: 300, y: 300, crop, handle: 's' }, { x: 600, y: 800 }, bounds, 2), { x: 0, y: 100, width: 600, height: 300 });
  for (const size of [1, 2, 3, 31, 100]) for (const ratio of [0, 1, 16 / 9, 9 / 16, 21 / 9]) {
    const image = { width: size, height: size };
    for (const handle of ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se', 'new', 'move']) {
      const initial = { x: 0, y: 0, width: size, height: size };
      for (const point of [{ x: 0, y: 0 }, { x: size, y: size }, { x: Math.floor(size / 2), y: Math.floor(size / 2) }]) {
        const result = dragCrop({ ...point, crop: initial, handle }, point, image, ratio);
        validateEdit(image, { crop: result, width: result.width, height: result.height, flipX: false, flipY: false });
      }
    }
  }
});

test('magnifier samples original pixels beyond preview resolution without resampling or changing HDR values', () => {
  const image = { width: 2000, height: 2, data: new Float32Array(2000 * 2 * 4) };
  for (let i = 0; i < 4000; i++) image.data.set(i % 2 ? [4, .2, 0, 1] : [0, .1, 2, .5], i * 4);
  const before = image.data.slice(), mapped = toneMap(image, defaultTone);
  const detail = pixelDetail(image, 1701, 1, defaultTone);
  assert.equal(detail.size, DETAIL_SIZE);
  const row = 1 - detail.y;
  for (let x = 0; x < detail.size; x++) {
    assert.deepEqual(detail.pixels.slice((row * detail.size + x) * 4, (row * detail.size + x + 1) * 4), mapped.slice((image.width + detail.x + x) * 4, (image.width + detail.x + x + 1) * 4));
  }
  assert.deepEqual(image.data, before);
  const edge = pixelDetail(image, 0, 0, defaultTone);
  assert.deepEqual([...edge.pixels.slice(0, 4)], [42, 42, 42, 255]);
  const origin = ((-edge.y) * edge.size - edge.x) * 4;
  assert.deepEqual(edge.pixels.slice(origin, origin + 4), mapped.slice(0, 4));
});

test('folder drops read every batch, recurse into subfolders, and continue past unreadable files', async () => {
  const file = new File(['test'], 'photo.jxr', { lastModified: 1 });
  const entry = (path: string): FileSystemEntry => ({ isFile: true, fullPath: path, file: (resolve: (file: File) => void) => resolve(file) } as unknown as FileSystemEntry);
  const dir = (batches: FileSystemEntry[][]): FileSystemEntry => ({ isDirectory: true, createReader: () => ({ readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(batches.shift() || []) }) } as unknown as FileSystemEntry);
  const broken = { isFile: true, file: (_resolve: unknown, reject: (error: Error) => void) => reject(new Error('unreadable')) } as unknown as FileSystemEntry;
  const directory = dir([Array.from({ length: 100 }, (_, i) => entry(`/album/${i}.jxr`)), [dir([[entry('/album/sub/101.JXR')]]), broken, entry('/album/102.hdp')]]);
  const result = await droppedPhotos({ files: [], items: [{ webkitGetAsEntry: () => directory }] } as unknown as DataTransfer);
  assert.equal(result.photos.length, 102); assert.equal(result.failed, 1);
  assert.equal(result.photos[100].path, 'album/sub/101.JXR');
  assert.equal(result.photos[101].path, 'album/102.hdp');
  const fallback = await droppedPhotos({ files: [file], items: [] } as unknown as DataTransfer);
  assert.deepEqual(fallback.photos, selectedPhotos([file]));
  assert.notEqual(photoKey({ file, path: 'a/photo.jxr' }), photoKey({ file, path: 'b/photo.jxr' }));
  assert(isJxr('PHOTO.JXR')); assert(isJxr('photo.wdp')); assert(!isJxr('photo.jpg'));
});
