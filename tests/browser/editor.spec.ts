import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import create from '../../public/codecs/codecs.mjs';
import { decodeJxr } from '../../src/codec';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const fixture=path.join(root,'public/samples/sunrise-hdr.jxr');
test('local JXR editing and all four download formats work without uploading photos',async({page},testInfo)=>{
  const errors:string[]=[]; const outgoing:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()!=='GET')outgoing.push(request.url());});
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].find(font => font.family === 'Luma Chinese')?.status)).toBe('loaded');
  await expect(page.locator('#export')).toBeDisabled();
  await page.screenshot({path:testInfo.outputPath('empty-desktop.png')});
  await page.locator('#file-input').setInputFiles(fixture);
  await expect(page.locator('#export')).toBeEnabled({timeout:45000});
  await expect(page.locator('#metric-size')).toContainText('3440 × 1440');
  await expect(page.locator('#metric-peak')).toContainText('9,425');
  await expect(page.locator('#preview')).toBeVisible();
  await page.locator('#toast-close').click();
  await page.screenshot({path:testInfo.outputPath('photo-desktop.png')});
  await page.locator('[data-ratio="16:9"]').click();
  await expect(page.locator('#crop-layer')).toBeVisible();
  await expect(page.locator('#crop-w')).toHaveValue('2560');
  // Drag the crop horizontally, then apply a precise smaller crop and output size.
  const box=await page.locator('#crop-box').boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);
  await page.mouse.down(); await page.mouse.move(box!.x+box!.width/2+30,box!.y+box!.height/2,{steps:5}); await page.mouse.up();
  expect(Number(await page.locator('#crop-x').inputValue())).toBeGreaterThan(440);
  await page.screenshot({path:testInfo.outputPath('crop-desktop.png')});
  await page.locator('#crop-toggle').click();
  await page.locator('#output-width').fill('320'); await page.locator('#output-width').press('Tab');
  await expect(page.locator('#output-height')).toHaveValue('180');
  await page.locator('#flip-x').click(); await page.locator('#flip-y').click();
  await expect(page.locator('#flip-x')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#flip-y')).toHaveAttribute('aria-pressed','true');
  await page.locator('#sdr-mode').click();
  await page.locator('#tone-operator').selectOption('reinhard');
  await expect(page.locator('#view-description')).toContainText('Reinhard');
  await page.locator('#lock-ratio').click();
  await page.locator('#output-height').fill('183'); await page.locator('#output-height').press('Tab');
  await expect(page.locator('#output-width')).toHaveValue('320');
  for(const format of ['ultrahdr','apple','jxr','jpeg']){
    await page.locator('#export-format').selectOption(format);
    const downloadPromise=page.waitForEvent('download'); await page.locator('#export').click(); const download=await downloadPromise;
    expect(download.suggestedFilename()).toContain(`${format}-320x183`);
    const bytes=readFileSync((await download.path())!);
    if(format==='jxr'){
      const module=await create({wasmBinary:readFileSync(path.join(root,'public/codecs/codecs.wasm'))});
      const decoded=decodeJxr(module,bytes); expect(decoded.width).toBe(320); expect(decoded.height).toBe(183); expect(decoded.data.some(v=>v>1)).toBe(true);
    }else{
      expect(bytes.readUInt16BE(0)).toBe(0xffd8);
      expect(bytes.includes(Buffer.from('urn:iso:std:iso:ts:21496:-1'))).toBe(format!=='jpeg');
    }
    await expect(page.locator('#export')).toBeEnabled();
  }
  await page.locator('#reset').click(); await expect(page.locator('#output-width')).toHaveValue('3440');
  await expect(page.locator('#flip-x')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#tone-operator')).toHaveValue('hable');
  expect(errors).toEqual([]); expect(outgoing).toEqual([]);
});
test('invalid input, output bounds, and reopening recover without a reload',async({page})=>{
  await page.goto('./');
  await page.locator('#file-input').setInputFiles({name:'broken.jxr',mimeType:'image/jxr',buffer:Buffer.from('not a valid image')});
  await expect(page.locator('#toast')).toContainText('不是有效'); await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#file-input').setInputFiles(fixture);
  await expect(page.locator('#export')).toBeEnabled({timeout:45000});
  await page.locator('#output-width').fill('20000'); await page.locator('#output-width').press('Tab');
  await expect(page.locator('#edit-error')).toBeVisible(); await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#reset').click(); await expect(page.locator('#edit-error')).toBeHidden(); await expect(page.locator('#export')).toBeEnabled();
});
test('mobile layout, bundled example, and native download are usable',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:testInfo.outputPath('mobile-empty.png'),fullPage:true});
  await page.locator('#demo').click(); await expect(page.locator('#export')).toBeEnabled({timeout:45000});
  await page.locator('[data-ratio="9:16"]').click();
  await page.locator('#crop-toggle').click();
  await page.locator('#output-width').fill('180'); await page.locator('#output-width').press('Tab');
  await expect(page.locator('#output-height')).toHaveValue('320');
  await page.locator('#export-format').selectOption('apple');
  const download=page.waitForEvent('download');await page.locator('#export').click();expect((await download).suggestedFilename()).toContain('apple');
  await page.locator('#toast-close').click(); await page.evaluate(()=>window.scrollTo(0,0));
  await expect(page.locator('#stage')).toHaveAttribute('data-preview-pending','false');
  await expect(page.locator('#preview')).toHaveAttribute('data-width','180');
  await expect(page.locator('#preview')).toHaveAttribute('data-height','320');
  await page.screenshot({path:testInfo.outputPath('mobile-photo.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
