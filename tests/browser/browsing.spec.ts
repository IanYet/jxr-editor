import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import create from '../../public/codecs/codecs.mjs';
import { encode } from '../../src/codec';
import { defaultTone } from '../../src/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let bytes: Buffer;
test.beforeAll(async () => {
  const module = await create({ wasmBinary: readFileSync(path.join(root, 'public/codecs/codecs.wasm')) });
  const data = new Float32Array(256 * 144 * 4);
  for (let y = 0; y < 144; y++) for (let x = 0; x < 256; x++) data.set([x % 2 ? 2 : .1, y / 144, x / 256, 1], (y * 256 + x) * 4);
  bytes = Buffer.from(encode(module, { width: 256, height: 144, data }, 'jxr', defaultTone, 92));
});
const upload = (name: string) => ({ name, mimeType: 'image/jxr', buffer: bytes });
async function ready(page: Page, name: string) {
  await expect(page.locator('#filename')).toHaveText(name);
  await expect(page.locator('#export')).toBeEnabled();
}
async function number(page: Page, selector: string, value: string) {
  await page.locator(selector).fill(value); await page.locator(selector).press('Tab');
}

test('multi-file navigation remembers independent edits and exports only the current photo', async ({ page }, testInfo) => {
  const errors: string[] = [], uploads: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') uploads.push(request.url()); });
  await page.goto('./');
  await page.locator('#file-input').setInputFiles([upload('first.jxr'), upload('second.JXR'), upload('third.hdp')]);
  await ready(page, 'first.jxr');
  await expect(page.locator('.photo-item')).toHaveCount(3);
  await expect(page.locator('#photo-counter')).toHaveText('1 / 3');
  await page.locator('[data-ratio="16:9"]').click();
  await number(page, '#crop-w', '80'); await expect(page.locator('#crop-h')).toHaveValue('45');
  await page.locator('#flip-y').click();
  await page.locator('#tone-operator').selectOption('reinhard');
  await page.locator('#export-format').selectOption('jxr');
  await page.locator('#next-photo').click(); await ready(page, 'second.JXR');
  await expect(page.locator('#output-width')).toHaveValue('256');
  await expect(page.locator('#flip-y')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#tone-operator')).toHaveValue('hable');
  await number(page, '#output-width', '128');
  await page.locator('#export-format').selectOption('jpeg');
  await page.locator('#previous-photo').click(); await ready(page, 'first.jxr');
  await expect(page.locator('#crop-w')).toHaveValue('80'); await expect(page.locator('#crop-h')).toHaveValue('45');
  await expect(page.locator('[data-ratio="16:9"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#flip-y')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tone-operator')).toHaveValue('reinhard');
  await expect(page.locator('#export-format')).toHaveValue('jxr');
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  const pending = page.waitForEvent('download'); await page.locator('#export').click(); await pending;
  expect(downloads).toEqual(['first-jxr-80x45.jxr']);
  await page.locator('#toast-close').click();
  await page.locator('#next-photo').focus(); await page.keyboard.press('ArrowRight'); await ready(page, 'second.JXR');
  await expect(page.locator('#output-width')).toHaveValue('128'); await expect(page.locator('#export-format')).toHaveValue('jpeg');
  await expect(page.locator('#flip-y')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-ratio="自由"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tone-operator')).toHaveValue('hable');
  await page.screenshot({ path: testInfo.outputPath('photo-library.png') });
  // Switching during decoding discards stale replies from the previous photo.
  await page.locator('#next-photo').click(); await page.locator('#previous-photo').click(); await ready(page, 'second.JXR');
  await expect(page.locator('#output-width')).toHaveValue('128');
  await page.locator('#file-input').setInputFiles(upload('fourth.wdp')); await ready(page, 'fourth.wdp');
  await expect(page.locator('.photo-item')).toHaveCount(4);
  await page.locator('#remove-photo').click(); await ready(page, 'third.hdp');
  await expect(page.locator('.photo-item')).toHaveCount(3);
  expect(errors).toEqual([]); expect(uploads).toEqual([]);
});

test('folder selection includes nested JXR files and skips unrelated files on mobile', async ({ page }, testInfo) => {
  const folder = mkdtempSync(path.join(tmpdir(), 'jxr-folder-'));
  try {
    mkdirSync(path.join(folder, 'nested'));
    writeFileSync(path.join(folder, '01.jxr'), bytes);
    writeFileSync(path.join(folder, 'nested', '02.WDP'), bytes);
    writeFileSync(path.join(folder, 'notes.txt'), 'skip this file');
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto('./');
    await page.locator('#folder-input').setInputFiles(folder);
    await ready(page, '01.jxr'); await expect(page.locator('.photo-item')).toHaveCount(2);
    await expect(page.locator('#toast')).toContainText('已跳过 1');
    await page.locator('#toast-close').click();
    await page.locator('#next-photo').click(); await ready(page, '02.WDP');
    await expect(page.locator('.photo-item').nth(1)).toHaveAttribute('title', /nested\/02.WDP$/);
    await expect(page.locator('#next-photo')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('mobile-folder.png'), fullPage: true });
    await page.locator('#remove-photo').click(); await ready(page, '01.jxr');
    await page.locator('#remove-photo').click(); await expect(page.locator('#photo-library')).toBeHidden();
    await expect(page.locator('#export')).toBeDisabled(); await expect(page.locator('#empty')).toBeVisible();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('crop fields retain the chosen aspect ratio and native-pixel magnifier follows edge and corner drags', async ({ page }, testInfo) => {
  await page.goto('./'); await page.locator('#file-input').setInputFiles(path.join(root, 'public/samples/sunrise-hdr.jxr'));
  await ready(page, 'sunrise-hdr.jxr'); await page.locator('#toast-close').click();
  await page.locator('[data-ratio="16:9"]').click();
  await number(page, '#crop-w', '1024'); await expect(page.locator('#crop-h')).toHaveValue('576');
  await number(page, '#crop-h', '720'); await expect(page.locator('#crop-w')).toHaveValue('1280');
  await number(page, '#crop-x', '500'); await number(page, '#crop-y', '100');
  await expect(page.locator('[data-ratio="16:9"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#lock-ratio').click();
  await number(page, '#crop-w', '1600'); await expect(page.locator('#crop-h')).toHaveValue('900');
  await expect(page.locator('[data-ratio="自由"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#stage')).toHaveAttribute('data-preview-pending', 'false');
  for (const selector of ['.crop-edge.e', '.crop-handle.se']) {
    const handle = (await page.locator(selector).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 15, handle.y + handle.height / 2 - 8, { steps: 4 });
    await expect(page.locator('#crop-loupe')).toBeVisible();
    await expect(page.locator('#crop-loupe')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#crop-loupe canvas')).toHaveAttribute('data-source-size', '24');
    const sampling = await page.locator('#crop-loupe canvas').evaluate((element: HTMLCanvasElement) => {
      const ctx = element.getContext('2d')!;
      return { smoothing: ctx.imageSmoothingEnabled, unique: new Set(ctx.getImageData(0, 0, 192, 192).data).size, x: Number(element.dataset.sourceX) };
    });
    expect(sampling.smoothing).toBe(false); expect(sampling.unique).toBeGreaterThan(16); expect(sampling.x).toBeGreaterThan(1500);
    await page.screenshot({ path: testInfo.outputPath(`magnifier-${selector.includes('edge') ? 'edge' : 'corner'}.png`) });
    await page.mouse.up(); await expect(page.locator('#crop-loupe')).toBeHidden();
    const w = Number(await page.locator('#crop-w').inputValue()), h = Number(await page.locator('#crop-h').inputValue());
    expect(Math.abs(w - h * 16 / 9)).toBeLessThanOrEqual(1);
  }
  await page.locator('[data-ratio="自由"]').click();
  const height = await page.locator('#crop-h').inputValue(); await number(page, '#crop-w', '800');
  await expect(page.locator('#crop-h')).toHaveValue(height);
});

test('a broken file in a collection does not prevent opening the next photo', async ({ page }) => {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles([{ name: 'broken.jxr', mimeType: 'image/jxr', buffer: Buffer.from('invalid') }, upload('good.jxr')]);
  await expect(page.locator('#toast')).toContainText('不是有效'); await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#next-photo').click(); await ready(page, 'good.jxr');
  await expect(page.locator('#photo-counter')).toHaveText('2 / 2');
  await expect(page.locator('.photo-item').first()).toContainText('读取失败');
});

test('dropping several files adds them to the same browsable collection', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(data => {
    const transfer = new DataTransfer();
    for (const name of ['drop-1.jxr', 'drop-2.hdp']) transfer.items.add(new File([new Uint8Array(data)], name, { type: 'image/jxr' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, Array.from(bytes));
  await ready(page, 'drop-1.jxr'); await expect(page.locator('.photo-item')).toHaveCount(2);
  await page.locator('#next-photo').click(); await ready(page, 'drop-2.hdp');
});
