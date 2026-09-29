import './style.css';
import { icon } from './icons.ts';
import { defaultTone, fullEdit, operators, ratioCrop, validateEdit, type Edit, type Tone, type ToneOperator, type ExportFormat, type ImageStats } from './core.ts';
import type { Request } from './worker.ts';
import { changeCropField, dragCrop, type CropDrag } from './crop.ts';
import { droppedPhotos, selectedPhotos, isJxr, photoKey, type LocalPhoto } from './files.ts';
import { createLoupe } from './loupe.ts';
import type { PixelDetail } from './detail.ts';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const ratios = ['自由', '原图', '1:1', '4:3', '3:2', '16:9', '9:16', '21:9'];
$('#app').innerHTML = `
<header class="topbar">
  <a href="./" class="brand" aria-label="Luma 首页"><span class="brand-mark">L</span><span>Luma<span class="brand-dot">.</span></span><span class="brand-caption">JXR / HDR STUDIO</span></a>
  <div class="header-actions"><span class="private-pill">${icon('shield')}本地处理 · 照片不上传</span><button id="open-folder" class="button secondary">${icon('folder')}打开文件夹</button><button id="open-top" class="button secondary">${icon('image')}打开照片 <kbd>O</kbd></button><a class="icon-button github" href="https://github.com/IanYet/jxr-editor" target="_blank" rel="noopener" aria-label="GitHub 源码">${icon('github')}</a></div>
</header>
<main class="workspace">
  <nav class="tool-rail" aria-label="编辑工具"><button id="rail-open" class="rail-button" title="打开照片" aria-label="打开照片">${icon('image')}</button><span class="rail-rule"></span><button id="rail-crop" class="rail-button active" title="裁剪与尺寸" aria-label="裁剪与尺寸">${icon('crop')}</button><button id="rail-tone" class="rail-button" title="色调映射" aria-label="色调映射">${icon('tune')}</button><button id="rail-export" class="rail-button" title="导出设置" aria-label="导出设置">${icon('download')}</button><button id="help-button" class="rail-button help-button" title="使用说明" aria-label="使用说明">${icon('info')}</button></nav>
  <section class="editor" aria-label="照片预览">
    <div class="editor-top"><div class="breadcrumb">工作台 <span>/</span> <strong id="filename">未打开照片</strong></div><span id="source-badge" class="tiny-badge">HDR 工作流</span></div>
    <div class="preview-toolbar"><div class="segmented" role="group" aria-label="预览模式"><button id="hdr-mode" class="selected" aria-pressed="true">${icon('sun')}HDR 预览</button><button id="sdr-mode" aria-pressed="false">SDR 映射</button></div><button id="compare" class="text-button" disabled>查看原图</button><div class="zoom-control">${icon('expand')}<select id="zoom" aria-label="预览缩放"><option value="0">适应窗口</option><option value="0.5">50%</option><option value="1">100%</option><option value="2">200%</option></select></div></div>
    <div id="stage" class="stage">
      <div id="empty" class="empty-state"><div class="empty-symbol">${icon('image')}<span>HDR</span></div><p class="eyebrow">MORE LIGHT. MORE DETAIL.</p><h1>让每一束光，都被保留。</h1><p class="empty-description">一次打开多张 JXR，或选择整个文件夹。<br>逐张浏览、独立编辑，保留每一处 HDR 细节。</p><button id="open-main" class="button primary">${icon('upload')}选择 JXR 照片</button><p class="drop-hint">支持多选，也可拖入文件或文件夹 <span>·</span> .jxr / .wdp / .hdp</p><button id="demo" class="demo-link">没有照片？试用 HDR 日出样片 ${icon('arrow')}</button><div class="empty-features"><span>${icon('crop')}自由裁剪</span><span>${icon('sun')}保留 HDR</span><span>${icon('download')}多格式导出</span></div></div>
      <div id="image-frame" class="image-frame" hidden><img id="preview" alt="当前照片预览" draggable="false"><div id="crop-layer" class="crop-layer" hidden><div id="crop-box" class="crop-box" data-handle="move"><span id="crop-size" class="crop-size"></span>${['n', 'e', 's', 'w'].map(h => `<span class="crop-edge ${h}" data-handle="${h}"><i></i></span>`).join('')}${['nw', 'ne', 'sw', 'se'].map(h => `<span class="crop-handle ${h}" data-handle="${h}"></span>`).join('')}</div></div></div>
      <div id="busy" class="busy-overlay" hidden><span class="spinner"></span><strong id="busy-label">正在处理…</strong><button id="cancel" class="text-button">取消</button></div>
      <div id="drop-overlay" class="drop-overlay" hidden>${icon('upload')}松开以打开 JXR 照片</div>
    </div>
    <div class="canvas-footer"><span id="view-description"><span class="status-dot"></span>准备就绪</span><span id="preview-dimensions">线性浮点编辑</span></div>
    <section id="photo-library" class="photo-library" aria-label="照片列表" hidden><div class="library-heading"><div class="library-navigation"><button id="previous-photo" class="icon-button" title="上一张（←）" aria-label="上一张">‹</button><span id="photo-counter" aria-live="polite"></span><button id="next-photo" class="icon-button" title="下一张（→）" aria-label="下一张">›</button></div><span class="library-hint">逐张编辑 · 切换保留设置</span><button id="remove-photo" class="text-button">移出列表</button></div><div id="photo-list" class="photo-list" role="group" aria-label="选择照片"></div></section>
    <div class="display-notice">${icon('info')}<span id="display-notice"></span></div>
    <div class="image-metrics"><div><span>原图尺寸</span><strong id="metric-size">— × — <small>px</small></strong></div><div><span>原图峰值亮度</span><strong id="metric-peak">— <small>nits</small></strong></div><div><span>高光像素占比</span><strong id="metric-hdr">— <small>%</small></strong></div><div><span>处理方式</span><strong class="local-metric">${icon('shield')}完全本地</strong></div></div>
  </section>
  <aside class="inspector" aria-label="编辑设置"><div class="inspector-title"><h2>编辑照片</h2><button id="reset" class="text-button" disabled>${icon('reset')}重置</button></div>
    <div class="inspector-scroll"><fieldset id="edit-controls" disabled>
      <section class="control-section" id="geometry-section"><div class="section-title"><h3>${icon('crop')}裁剪与尺寸</h3><button id="crop-toggle" class="small-button" aria-pressed="false">开始裁剪</button></div><label class="field-label">裁剪比例</label><div class="ratio-grid">${ratios.map((r, i) => `<button class="ratio-button ${i === 0 ? 'selected' : ''}" data-ratio="${r}" aria-pressed="${i === 0}">${r}</button>`).join('')}</div>
      <div id="crop-fields" class="crop-fields" hidden><p class="field-note">拖动边框时显示像素放大镜。选定比例后，裁剪宽高自动联动。</p><div class="input-grid"><label>起点 X<input id="crop-x" type="number" min="0" step="1" value="0"></label><label>起点 Y<input id="crop-y" type="number" min="0" step="1" value="0"></label><label>裁剪宽<input id="crop-w" type="number" min="1" step="1"></label><label>裁剪高<input id="crop-h" type="number" min="1" step="1"></label></div></div>
      <div class="field-heading"><label class="field-label">输出尺寸 <span>px</span></label><button id="lock-ratio" class="text-button active" aria-label="锁定输出宽高比" aria-pressed="true">${icon('link')}锁定比例</button></div><div class="size-inputs"><label><span>宽</span><input id="output-width" type="number" min="1" max="16384" placeholder="—" step="1" aria-label="输出宽度"></label><span class="times">×</span><label><span>高</span><input id="output-height" type="number" min="1" max="16384" placeholder="—" step="1" aria-label="输出高度"></label></div><div class="size-presets"><button data-scale="0.5">50%</button><button data-scale="1">原始大小</button><button data-edge="1920">长边 1920</button></div><p id="edit-error" class="inline-error" role="alert" hidden></p>
      <label class="field-label mirror-label">镜像</label><div class="mirror-buttons"><button id="flip-y" class="button secondary" aria-pressed="false">${icon('flipy')}左右 <span>Y 轴</span></button><button id="flip-x" class="button secondary" aria-pressed="false">${icon('flipx')}上下 <span>X 轴</span></button></div></section>
      <section class="control-section" id="tone-section"><div class="section-title"><h3>${icon('tune')}色调映射</h3><span class="tiny-badge">SDR</span></div><p class="field-note">调整 SDR 预览与 JPEG 基础图层，HDR 亮度保持不变。</p><label for="tone-operator" class="field-label">映射算法</label><select id="tone-operator" class="select-field">${Object.entries(operators).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}</select><p id="tone-description" class="field-note">${operators.hable.description}</p><div class="range-heading"><label for="exposure">曝光补偿</label><output id="exposure-value">0.0 EV</output></div><input id="exposure" type="range" min="-5" max="5" step="0.1" value="0"><div class="range-heading"><label for="white-point">映射白点</label><output id="white-point-value">11.2</output></div><input id="white-point" type="range" min="1" max="32" step="0.1" value="11.2"><p id="white-note" class="field-note" hidden>当前算法不使用白点参数。</p><div id="histogram" class="histogram" aria-label="原图线性亮度直方图"></div><div class="histogram-labels"><span>阴影</span><span>原图亮度分布</span><span>高光</span></div></section>
      <section class="control-section export-section" id="export-section"><div class="section-title"><h3>${icon('download')}导出设置</h3></div><label for="export-format" class="field-label">文件格式</label><select id="export-format" class="select-field"><option value="ultrahdr">Ultra HDR · JPEG</option><option value="jxr">JPEG XR · 浮点 HDR</option><option value="apple">Apple Adaptive HDR · JPEG</option><option value="jpeg">标准 JPEG · SDR</option></select><p id="format-description" class="format-description"></p><div id="quality-control"><div class="range-heading"><label for="quality">JPEG 质量</label><output id="quality-value">92</output></div><input id="quality" type="range" min="50" max="100" step="1" value="92"><div class="range-labels"><span>更小文件</span><span>更好画质</span></div></div></section>
    </fieldset></div><div class="export-footer"><div class="export-summary"><span id="export-size">等待打开照片</span><span id="export-tag">保留 HDR</span></div><button id="export" class="button primary" disabled>${icon('download')}导出照片</button><span class="export-note">文件直接保存到你的设备</span></div>
  </aside>
</main>
<footer class="page-footer"><span>LUMA STUDIO <span class="footer-dot">/</span> 为光影留出空间</span><span>纯浏览器运行 <span class="footer-dot">·</span> <a href="./licenses/NOTICE.txt" target="_blank" rel="noopener">开源致谢</a></span></footer>
<input id="file-input" type="file" accept=".jxr,.wdp,.hdp,image/jxr,image/vnd.ms-photo" multiple hidden>
<input id="folder-input" type="file" webkitdirectory multiple hidden>
<div id="crop-loupe" class="crop-loupe" aria-label="裁剪像素放大镜" data-ready="false" hidden><div class="loupe-heading"><strong>8×</strong><span>原图像素 · SDR</span></div><canvas width="192" height="192" aria-label="鼠标附近的原图像素"></canvas><div class="loupe-coordinates">正在读取像素…</div></div>
<div id="toast" class="toast" role="status" hidden><span id="toast-text"></span><button id="toast-close" class="icon-button" aria-label="关闭提示">${icon('close')}</button></div>
<dialog id="help"><div class="dialog-heading"><h2>保留光影，从这里开始</h2><button id="help-close" class="icon-button" aria-label="关闭说明">${icon('close')}</button></div><p>多选本地 JXR 或打开文件夹 → 从列表逐张浏览 → 独立编辑与导出。快捷键 O 打开，E 导出，← / → 切换照片。文件夹包含子文件夹；其他格式自动跳过。</p><p>本次打开期间，每张照片保留自己的编辑与导出设置。刷新或关闭页面后清空；“移出列表”不会删除本地文件。缩略图在首次查看后显示。</p><p>选定裁剪比例后，手动修改裁剪宽或高会联动另一项。拖动边框或边角时，8 倍放大镜显示鼠标附近的原图像素，绿色线标出裁剪边界。放大镜采用 SDR 映射以便观察，不改变 HDR 数据。</p><p>HDR 预览使用带增益图的 JPEG，由浏览器与显示器共同决定实际显示亮度。SDR 设备仍可编辑和导出 HDR。</p><p>Apple 导出为 Adaptive HDR JPEG（ISO 21496-1），适用于 iOS 18 / macOS 15 及更新系统。它与 Ultra HDR 导出都包含两套兼容元数据。</p><p>JXR 保留线性 scRGB 浮点 HDR；编码有浮点精度损失，不是逐位无损归档。JPEG 不保留透明通道，使用源 RGB。普通 JPEG 会将 HDR 映射到 SDR。</p><p>支持常见的 RGB / RGBA 浮点、半浮点和整数 JXR；按 scRGB 80 nits 白点解释。单图最多 2400 万像素、文件最多 256 MB。HDR JPEG 支持最高 10,000 nits，超出部分会裁切；JXR 保留更高的亮度与负值。JPEG 导出裁切负 RGB 值，不保留相机 EXIF。</p><p>所有处理都在本机进行。示例图来自 <a href="https://github.com/tfx2001/jxr2uhdr" target="_blank" rel="noopener">jxr2uhdr</a>。</p></dialog>`;

interface Info { width: number; height: number; bits: number; stats: ImageStats }
interface PreviewResult { hdr: Uint8Array; sdr: Uint8Array }
interface PhotoState { edit: Edit; tone: Tone; locked: boolean; ratio: number; ratioLabel: string; cropMode: boolean; zoom: number; format: string; quality: string }
interface PhotoEntry extends LocalPhoto { id: number; key: string; state?: PhotoState; thumb?: string; error?: string }
const photos: PhotoEntry[] = [];
let activePhoto: PhotoEntry | undefined, photoSequence = 0;
let info: Info | undefined, edit: Edit = fullEdit({ width: 1, height: 1 }), tone: Tone = { ...defaultTone };
let filename = '', locked = true, cropMode = false, comparing = false, hdrMode = true, ratio = 0;
let working = false, zoom = 0, version = 0, previewTimer = 0;
let currentUrls = { hdr: '', sdr: '' }, sourceUrls = { hdr: '', sdr: '' };
let currentSize = { width: 1, height: 1 };
let worker: Worker | undefined, sequence = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
const baseUrl = new URL('.', location.href).href;
type Job = Request extends infer T ? T extends Request ? Omit<T, 'id' | 'baseUrl'> : never : never;
function request<T>(job: Job, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.progress) { if (working) $('#busy-label').textContent = data.progress; return; }
      const handler = pending.get(data.id); pending.delete(data.id);
      if (data.error) handler?.reject(new Error(data.error)); else handler?.resolve(data.result);
    };
    worker.onerror = () => { const message = '处理引擎已停止，可能是浏览器内存不足。请重新打开照片并尝试较小尺寸。'; savePhotoState(); terminateWorker(message); loupe.hide(); drag = undefined; info = undefined; setBusy(false); $('#empty').hidden = false; $('#image-frame').hidden = true; showToast(message, true); };
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ ...job, id, baseUrl }, transfer); });
}
function terminateWorker(reason: string) {
  worker?.terminate(); worker = undefined;
  for (const handler of pending.values()) handler.reject(new Error(reason));
  pending.clear();
}
const loupe = createLoupe($('#crop-loupe'), (x, y, tone) => request<PixelDetail>({ type: 'detail', x, y, tone }));
function savePhotoState() {
  if (!activePhoto || !info) return;
  activePhoto.state = { edit: structuredClone(edit), tone: { ...tone }, locked, ratio, ratioLabel: $('.ratio-button.selected').dataset.ratio!, cropMode, zoom, format: $<HTMLSelectElement>('#export-format').value, quality: $<HTMLInputElement>('#quality').value };
}
function renderLibrary() {
  $('#photo-library').hidden = !photos.length;
  $('.editor').classList.toggle('has-photos', !!photos.length);
  const index = photos.indexOf(activePhoto!);
  $('#photo-counter').textContent = `${index + 1} / ${photos.length}`;
  $<HTMLButtonElement>('#previous-photo').disabled = index <= 0;
  $<HTMLButtonElement>('#next-photo').disabled = index < 0 || index >= photos.length - 1;
  const list = $('#photo-list'), scroll = list.scrollLeft;
  list.replaceChildren(...photos.map((photo, i) => {
    const button = document.createElement('button'); button.className = 'photo-item'; button.dataset.photoId = String(photo.id);
    button.setAttribute('aria-pressed', String(photo === activePhoto)); button.title = photo.path;
    const thumb = document.createElement('span'); thumb.className = 'photo-thumb';
    if (photo.thumb) { const image = new Image(); image.src = photo.thumb; image.alt = ''; thumb.append(image); } else thumb.textContent = 'JXR';
    const name = document.createElement('span'); name.className = 'photo-name'; name.textContent = photo.file.name;
    const status = document.createElement('small'); status.textContent = `${i + 1} · ${photo.error ? '读取失败' : photo === activePhoto ? '当前照片' : photo.thumb ? '已查看' : '未查看'}`;
    const caption = document.createElement('span'); caption.className = 'photo-caption'; caption.append(name, status);
    button.append(thumb, caption); button.onclick = () => { if (photo !== activePhoto || !info && !working) void openPhoto(photo); };
    return button;
  }));
  list.scrollLeft = scroll;
  const selected = list.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (selected) { const left = selected.offsetLeft - list.offsetLeft; if (left < list.scrollLeft) list.scrollLeft = left; else if (left + selected.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left + selected.offsetWidth - list.clientWidth; }
}
async function addPhotos(incoming: LocalPhoto[], sort = false, failed = 0) {
  const supported = incoming.filter(photo => isJxr(photo.file.name));
  const accepted = supported.filter(photo => photo.file.size <= 256 * 1024 * 1024);
  if (sort) accepted.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  const known = new Map(photos.map(photo => [photo.key, photo]));
  let first: PhotoEntry | undefined;
  for (const photo of accepted) {
    const key = photoKey(photo);
    let entry = known.get(key);
    if (!entry) { entry = { ...photo, id: ++photoSequence, key }; photos.push(entry); known.set(key, entry); }
    first ??= entry;
  }
  if (first) { if (first !== activePhoto || !info && !working) await openPhoto(first); else renderLibrary(); }
  const skipped = incoming.length - supported.length, oversized = supported.length - accepted.length;
  if (!first || skipped || oversized || failed) showToast([
    first ? `列表共 ${photos.length} 张照片。` : '未找到可打开的 JXR 照片。',
    skipped ? `已跳过 ${skipped} 个其他格式文件。` : '',
    oversized ? `${oversized} 个文件超过单图 256 MB 限制。` : '',
    failed ? `${failed} 个项目无法读取。` : '',
  ].filter(Boolean).join(' '), !first);
}
function navigatePhoto(delta: number) {
  const target = photos[photos.indexOf(activePhoto!) + delta];
  if (target) void openPhoto(target);
}
function showToast(message: string, error = false) { $('#toast-text').textContent = message; $('#toast').classList.toggle('error', error); $('#toast').hidden = false; }
function setBusy(value: boolean, label = '') {
  working = value; $('#busy').hidden = !value; $('#busy-label').textContent = label;
  $('#stage').setAttribute('aria-busy', String(value));
  $<HTMLFieldSetElement>('#edit-controls').disabled = value || !info;
  $<HTMLButtonElement>('#export').disabled = value || !info;
  $<HTMLButtonElement>('#reset').disabled = value || !info;
  $<HTMLButtonElement>('#compare').disabled = value || !info;
  $<HTMLButtonElement>('#demo').disabled = value;
}
function replaceUrls(result: PreviewResult, original = false, dimensions = { width: edit.width, height: edit.height }) {
  for (const url of Object.values(currentUrls)) if (url && !Object.values(sourceUrls).includes(url)) URL.revokeObjectURL(url);
  currentUrls = { hdr: URL.createObjectURL(new Blob([result.hdr as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })), sdr: URL.createObjectURL(new Blob([result.sdr as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })) };
  currentSize = dimensions;
  $('#stage').dataset.previewPending = 'false';
  $('#preview').dataset.width = String(dimensions.width); $('#preview').dataset.height = String(dimensions.height);
  if (original) { for (const url of Object.values(sourceUrls)) if (url) URL.revokeObjectURL(url); sourceUrls = { ...currentUrls }; }
  displayImage();
}
function displayImage() {
  const urls = cropMode || comparing ? sourceUrls : currentUrls;
  if (urls.hdr) $<HTMLImageElement>('#preview').src = hdrMode ? urls.hdr : urls.sdr;
  $('#crop-layer').hidden = !cropMode || comparing;
  if (!cropMode || comparing) loupe.hide();
  $('#view-description').textContent = comparing ? '原图 · 按原始尺寸与亮度查看' : cropMode ? '裁剪中 · 原图坐标' : hdrMode ? 'HDR 预览 · 原始亮度保留' : `SDR 预览 · ${operators[tone.operator].label}`;
  $('#preview-dimensions').textContent = info ? `${comparing || cropMode ? info.width : edit.width} × ${comparing || cropMode ? info.height : edit.height} px` : '线性浮点编辑';
  layoutImage();
}
function layoutImage() {
  if (!info) return;
  const stage = $('#stage'), w = cropMode || comparing ? info.width : currentSize.width, h = cropMode || comparing ? info.height : currentSize.height;
  const scale = zoom || Math.max(0.01, Math.min((stage.clientWidth - 64) / w, (stage.clientHeight - 64) / h));
  $('#image-frame').style.width = `${w * scale}px`; $('#image-frame').style.height = `${h * scale}px`;
  drawCrop();
}
new ResizeObserver(layoutImage).observe($('#stage'));
function drawCrop() {
  if (!info) return;
  const { crop } = edit;
  Object.assign($('#crop-box').style, { left: `${100 * crop.x / info.width}%`, top: `${100 * crop.y / info.height}%`, width: `${100 * crop.width / info.width}%`, height: `${100 * crop.height / info.height}%` });
  $('#crop-size').textContent = `${crop.width} × ${crop.height}`;
  for (const [id, value] of Object.entries({ 'crop-x': crop.x, 'crop-y': crop.y, 'crop-w': crop.width, 'crop-h': crop.height })) $<HTMLInputElement>(`#${id}`).value = String(value);
}
function syncControls() {
  $<HTMLInputElement>('#output-width').value = info ? String(edit.width) : '';
  $<HTMLInputElement>('#output-height').value = info ? String(edit.height) : '';
  for (const [id, value] of [['flip-x', edit.flipX], ['flip-y', edit.flipY], ['lock-ratio', locked], ['crop-toggle', cropMode], ['compare', comparing]] as const) {
    $(`#${id}`).classList.toggle('active', value); $(`#${id}`).setAttribute('aria-pressed', String(value));
  }
  $('#crop-toggle').textContent = cropMode ? '完成裁剪' : '开始裁剪'; $('#crop-fields').hidden = !cropMode;
  $('#compare').textContent = comparing ? '返回编辑' : '查看原图';
  $('#export-size').textContent = info ? `${edit.width} × ${edit.height} px` : '等待打开照片';
  drawCrop();
}
function valid(): boolean {
  try { if (info) validateEdit(info, edit); $('#edit-error').hidden = true; return true; }
  catch (error) { $('#edit-error').textContent = (error as Error).message; $('#edit-error').hidden = false; return false; }
}
function changed(render = true) {
  syncControls(); const ok = valid(); $<HTMLButtonElement>('#export').disabled = !ok || working || !info;
  if (!ok) return;
  comparing = false;
  if (render) schedulePreview();
  displayImage();
}
function schedulePreview() {
  const revision = ++version;
  $('#stage').dataset.previewPending = 'true';
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(async () => {
    if (!info || working) return;
    try {
      const dimensions = { width: edit.width, height: edit.height };
      const result = await request<PreviewResult>({ type: 'preview', edit, tone });
      if (revision === version) replaceUrls(result, false, dimensions);
    } catch (error) { if (revision === version) { $('#stage').dataset.previewPending = 'false'; showToast((error as Error).message, true); } }
  }, 230);
}
async function openPhoto(photo: PhotoEntry) {
  savePhotoState(); activePhoto = photo;
  const file = photo.file;
  drag = undefined; loupe.hide(); renderLibrary();
  ++version; window.clearTimeout(previewTimer);
  terminateWorker('已切换照片。');
  info = undefined; filename = file.name;
  $('#filename').textContent = file.name; $('#source-badge').textContent = 'JXR';
  $('#metric-size').textContent = '— × — px'; $('#metric-peak').textContent = '— nits'; $('#metric-hdr').textContent = '— %'; $('#histogram').innerHTML = '';
  $('#empty').hidden = true; $('#image-frame').hidden = true; $('#toast').hidden = true;
  setBusy(true, '正在读取本地照片…');
  const loadVersion = version;
  try {
    const bytes = await file.arrayBuffer();
    if (loadVersion !== version) return;
    const result = await request<Info & PreviewResult & { thumb: Uint8Array }>({ type: 'load', bytes }, [bytes]);
    if (loadVersion !== version) return;
    info = result; const state = photo.state;
    edit = state ? structuredClone(state.edit) : fullEdit(info); tone = state ? { ...state.tone } : { ...defaultTone };
    locked = state?.locked ?? true; ratio = state?.ratio ?? 0; cropMode = state?.cropMode ?? false; comparing = false; zoom = state?.zoom ?? 0;
    $<HTMLSelectElement>('#zoom').value = String(zoom); resetToneControls(); selectRatio(state?.ratioLabel ?? '自由');
    $<HTMLSelectElement>('#export-format').value = state?.format ?? 'ultrahdr'; $<HTMLInputElement>('#quality').value = state?.quality ?? '92'; $('#quality-value').textContent = state?.quality ?? '92'; formatChanged();
    if (photo.thumb) URL.revokeObjectURL(photo.thumb);
    photo.thumb = URL.createObjectURL(new Blob([result.thumb as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })); photo.error = undefined;
    $('#filename').textContent = filename; $('#filename').title = photo.path;
    $('#source-badge').textContent = `${info.bits} bpp · JXR`;
    $('#metric-size').textContent = `${info.width} × ${info.height} px`;
    $('#metric-peak').textContent = `${Math.round(info.stats.peakNits).toLocaleString()} nits`;
    $('#metric-hdr').textContent = `${info.stats.hdrPercent.toFixed(1)} %`;
    const max = Math.max(...info.stats.histogram, 1);
    $('#histogram').innerHTML = info.stats.histogram.map((n, i) => `<i style="height:${Math.max(1, Math.sqrt(n / max) * 100)}%;--bin:${i}" class="${i >= 40 ? 'highlight' : ''}"></i>`).join('');
    $('#empty').hidden = true; $('#image-frame').hidden = false;
    replaceUrls(result, true, info); syncControls(); renderLibrary();
    if (info.stats.maxChannel > 125) showToast('此图存在超过 10,000 nits 的通道值。HDR JPEG 会裁切这些值，JXR 可保留。');
  } catch (error) {
    if (loadVersion !== version) return;
    photo.error = (error as Error).message; renderLibrary(); $('#empty').hidden = false; showToast(`无法打开照片：${photo.error}`, true);
  } finally { if (loadVersion === version) { setBusy(false); const ok = valid(); $<HTMLButtonElement>('#export').disabled = !info || !ok; if (info && photo.state && ok) schedulePreview(); } }
}
function resetToneControls() {
  $<HTMLSelectElement>('#tone-operator').value = tone.operator;
  $<HTMLInputElement>('#exposure').value = String(tone.exposure);
  $<HTMLInputElement>('#white-point').value = String(tone.whitePoint);
  $('#exposure-value').textContent = `${tone.exposure.toFixed(1)} EV`; $('#white-point-value').textContent = tone.whitePoint.toFixed(1);
  $('#tone-description').textContent = operators[tone.operator].description;
  $<HTMLInputElement>('#white-point').disabled = ['aces', 'linear'].includes(tone.operator); $('#white-note').hidden = !['aces', 'linear'].includes(tone.operator);
}
function selectRatio(label: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-ratio]').forEach(button => { button.classList.toggle('selected', button.dataset.ratio === label); button.setAttribute('aria-pressed', String(button.dataset.ratio === label)); });
}
for (const id of ['open-top', 'open-main', 'rail-open']) $(`#${id}`).onclick = () => $<HTMLInputElement>('#file-input').click();
$('#open-folder').onclick = () => $<HTMLInputElement>('#folder-input').click();
for (const id of ['file-input', 'folder-input']) $<HTMLInputElement>(`#${id}`).onchange = event => { const input = event.target as HTMLInputElement; if (input.files?.length) void addPhotos(selectedPhotos(input.files), id === 'folder-input'); input.value = ''; };
$('#previous-photo').onclick = () => navigatePhoto(-1); $('#next-photo').onclick = () => navigatePhoto(1);
$('#remove-photo').onclick = () => {
  if (!activePhoto) return;
  const index = photos.indexOf(activePhoto); savePhotoState();
  if (activePhoto.thumb) URL.revokeObjectURL(activePhoto.thumb);
  photos.splice(index, 1); activePhoto = undefined;
  const next = photos[Math.min(index, photos.length - 1)];
  if (next) { void openPhoto(next); return; }
  ++version; clearTimeout(previewTimer); terminateWorker('照片已移出列表。'); loupe.hide(); drag = undefined;
  for (const url of new Set([...Object.values(currentUrls), ...Object.values(sourceUrls)])) if (url) URL.revokeObjectURL(url);
  currentUrls = sourceUrls = { hdr: '', sdr: '' }; info = undefined; filename = '';
  $('#preview').removeAttribute('src'); $('#filename').textContent = '未打开照片'; $('#source-badge').textContent = 'HDR 工作流';
  $('#metric-size').textContent = '— × — px'; $('#metric-peak').textContent = '— nits'; $('#metric-hdr').textContent = '— %'; $('#histogram').replaceChildren();
  cropMode = false; comparing = false; $('#edit-error').hidden = true; $('#toast').hidden = true;
  $('#empty').hidden = false; $('#image-frame').hidden = true; setBusy(false); syncControls(); displayImage(); renderLibrary();
};
$('#demo').onclick = async () => {
  const demoVersion = ++version;
  setBusy(true, '正在加载日出样片…');
  try { const response = await fetch(new URL('samples/sunrise-hdr.jxr', baseUrl)); if (!response.ok) throw new Error('样片加载失败'); const file = new File([await response.blob()], 'sunrise-hdr.jxr', { lastModified: 0 }); if (demoVersion !== version) return; setBusy(false); await addPhotos([{ file, path: file.name }]); }
  catch (error) { if (demoVersion !== version) return; setBusy(false); showToast((error as Error).message, true); }
};
$('#cancel').onclick = () => { savePhotoState(); ++version; terminateWorker('已取消处理。'); loupe.hide(); drag = undefined; info = undefined; setBusy(false); $('#empty').hidden = false; $('#image-frame').hidden = true; showToast('已取消处理，可从列表重新选择照片。'); };
$('#toast-close').onclick = () => { $('#toast').hidden = true; };
$('#reset').onclick = () => { if (!info) return; edit = fullEdit(info); tone = { ...defaultTone }; cropMode = false; comparing = false; ratio = 0; locked = true; selectRatio('自由'); resetToneControls(); changed(); };
$('#hdr-mode').onclick = () => setMode(true); $('#sdr-mode').onclick = () => setMode(false);
function setMode(hdr: boolean) { hdrMode = hdr; $('#hdr-mode').classList.toggle('selected', hdr); $('#sdr-mode').classList.toggle('selected', !hdr); $('#hdr-mode').setAttribute('aria-pressed', String(hdr)); $('#sdr-mode').setAttribute('aria-pressed', String(!hdr)); displayImage(); }
$('#compare').onclick = () => { comparing = !comparing; syncControls(); displayImage(); };
$<HTMLSelectElement>('#zoom').onchange = event => { zoom = Number((event.target as HTMLSelectElement).value); layoutImage(); };
$('#crop-toggle').onclick = () => { cropMode = !cropMode; comparing = false; syncControls(); displayImage(); };
document.querySelectorAll<HTMLButtonElement>('[data-ratio]').forEach(button => button.onclick = () => {
  if (!info) return;
  const value = button.dataset.ratio!;
  ratio = value === '自由' ? 0 : value === '原图' ? info.width / info.height : Number(value.split(':')[0]) / Number(value.split(':')[1]);
  if (ratio) { edit.crop = ratioCrop(info.width, info.height, ratio); edit.width = edit.crop.width; edit.height = edit.crop.height; }
  cropMode = true; selectRatio(value); changed();
});
$('#lock-ratio').onclick = () => { locked = !locked; syncControls(); };
for (const axis of ['width', 'height'] as const) $<HTMLInputElement>(`#output-${axis}`).onchange = event => {
  const value = Number((event.target as HTMLInputElement).value), previous = edit.width / edit.height;
  edit[axis] = value;
  if (locked) { if (axis === 'width') edit.height = Math.max(1, Math.round(value / previous)); else edit.width = Math.max(1, Math.round(value * previous)); }
  changed();
};
document.querySelectorAll<HTMLButtonElement>('[data-scale], [data-edge]').forEach(button => button.onclick = () => {
  const scale = button.dataset.scale ? Number(button.dataset.scale) : Number(button.dataset.edge) / Math.max(edit.crop.width, edit.crop.height);
  edit.width = Math.max(1, Math.round(edit.crop.width * scale)); edit.height = Math.max(1, Math.round(edit.crop.height * scale)); changed();
});
$('#flip-x').onclick = () => { edit.flipX = !edit.flipX; changed(); }; $('#flip-y').onclick = () => { edit.flipY = !edit.flipY; changed(); };
for (const [id, field] of [['crop-x', 'x'], ['crop-y', 'y'], ['crop-w', 'width'], ['crop-h', 'height']] as const) $<HTMLInputElement>(`#${id}`).onchange = event => {
  edit.crop = changeCropField(edit.crop, field, Number((event.target as HTMLInputElement).value), ratio);
  edit.width = edit.crop.width; edit.height = edit.crop.height; changed();
};
$<HTMLSelectElement>('#tone-operator').onchange = event => { tone.operator = (event.target as HTMLSelectElement).value as ToneOperator; resetToneControls(); changed(); };
for (const [id, key] of [['exposure', 'exposure'], ['white-point', 'whitePoint']] as const) $<HTMLInputElement>(`#${id}`).oninput = event => { tone[key] = Number((event.target as HTMLInputElement).value); resetToneControls(); changed(); };
const formatDescriptions: Record<ExportFormat, string> = {
  ultrahdr: 'SDR 基础图 + RGB 增益图。兼容 Ultra HDR 与 ISO 21496-1，保留高光亮度。',
  apple: 'Apple Adaptive HDR JPEG · ISO 21496-1。适用于 iOS 18 / macOS 15 及更新系统，同时兼容 Ultra HDR。',
  jxr: '128 bpp RGBA 浮点 HDR，保持 scRGB 亮度。高精度编码，不是逐位无损；适合继续编辑。',
  jpeg: '应用所选色调映射，导出普通 sRGB JPEG。不包含 HDR 增益图。',
};
function formatChanged() { const format = $<HTMLSelectElement>('#export-format').value as ExportFormat; $('#format-description').textContent = formatDescriptions[format]; $('#quality-control').hidden = format === 'jxr'; $('#export-tag').textContent = format === 'jpeg' ? 'SDR 映射' : '保留 HDR'; }
$<HTMLSelectElement>('#export-format').onchange = formatChanged; formatChanged();
$<HTMLInputElement>('#quality').oninput = event => { $('#quality-value').textContent = (event.target as HTMLInputElement).value; };
$('#export').onclick = async () => {
  if (!info || working || !valid()) return;
  window.clearTimeout(previewTimer); const exportVersion = ++version;
  const format = $<HTMLSelectElement>('#export-format').value as ExportFormat;
  const quality = Number($<HTMLInputElement>('#quality').value);
  setBusy(true, '正在处理完整分辨率…');
  try {
    const { bytes } = await request<{ bytes: Uint8Array }>({ type: 'export', edit, tone, format, quality });
    if (exportVersion !== version) return;
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: format === 'jxr' ? 'image/jxr' : 'image/jpeg' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${filename.replace(/\.(jxr|wdp|hdp)$/i, '')}-${format}-${edit.width}x${edit.height}.${format === 'jxr' ? 'jxr' : 'jpg'}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast(`已导出 ${link.download} · ${(bytes.byteLength / 1048576).toFixed(2)} MB`);
  } catch (error) { if (exportVersion === version) showToast(`导出失败：${(error as Error).message}`, true); }
  finally { if (exportVersion === version) { setBusy(false); schedulePreview(); } }
};
// Crop interaction is in original-image coordinates, independent of CSS zoom.
let drag: (CropDrag & { pointer: number }) | undefined;
const position = (event: PointerEvent) => { const bounds = $('#crop-layer').getBoundingClientRect(); return { x: Math.max(0, Math.min(info!.width, Math.round((event.clientX - bounds.left) / bounds.width * info!.width))), y: Math.max(0, Math.min(info!.height, Math.round((event.clientY - bounds.top) / bounds.height * info!.height))) }; };
$('#crop-layer').onpointerdown = event => {
  if (!info || working || drag) return;
  if (event.button !== 0) return;
  const pos = position(event); drag = { ...pos, crop: { ...edit.crop }, handle: (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle || 'new', pointer: event.pointerId };
  $('#crop-layer').setPointerCapture(event.pointerId); event.preventDefault();
  if (drag.handle !== 'move') loupe.show({ ...pos, clientX: event.clientX, clientY: event.clientY }, edit.crop, tone);
};
$('#crop-layer').onpointermove = event => {
  if (!drag || !info || drag.pointer !== event.pointerId) return;
  const p = position(event);
  edit.crop = dragCrop(drag, p, info, ratio);
  edit.width = edit.crop.width; edit.height = edit.crop.height; syncControls();
  if (drag.handle !== 'move') loupe.show({ ...p, clientX: event.clientX, clientY: event.clientY }, edit.crop, tone);
};
function endDrag() { loupe.hide(); if (!drag) return; drag = undefined; changed(); }
$('#crop-layer').onpointerup = endDrag; $('#crop-layer').onpointercancel = endDrag; $('#crop-layer').onlostpointercapture = endDrag;
let dropDepth = 0;
window.addEventListener('dragenter', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dropDepth++; $('#drop-overlay').hidden = false; } });
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
window.addEventListener('dragleave', () => { if (--dropDepth <= 0) { dropDepth = 0; $('#drop-overlay').hidden = true; } });
window.addEventListener('drop', event => { event.preventDefault(); dropDepth = 0; $('#drop-overlay').hidden = true; if (event.dataTransfer) void droppedPhotos(event.dataTransfer).then(({ photos, failed }) => addPhotos(photos, true, failed)); });
for (const [button, section] of [['rail-crop', 'geometry-section'], ['rail-tone', 'tone-section'], ['rail-export', 'export-section']]) $(`#${button}`).onclick = () => { $(`#${section}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); document.querySelectorAll('.rail-button').forEach(b => b.classList.remove('active')); $(`#${button}`).classList.add('active'); };
$('#help-button').onclick = () => $<HTMLDialogElement>('#help').showModal(); $('#help-close').onclick = () => $<HTMLDialogElement>('#help').close();
window.addEventListener('keydown', event => { if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).matches('input, select, textarea') || $<HTMLDialogElement>('#help').open) return; if (event.key.toLowerCase() === 'o') $<HTMLInputElement>('#file-input').click(); if (event.key.toLowerCase() === 'e') $<HTMLButtonElement>('#export').click(); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigatePhoto(event.key === 'ArrowLeft' ? -1 : 1); } });
const media = matchMedia('(dynamic-range: high)');
function updateDisplay() { $('#display-notice').textContent = media.matches ? '检测到 HDR 显示能力。实际高光效果取决于浏览器支持、屏幕亮度与系统 HDR 设置。' : '当前显示环境为 SDR：预览将适配屏幕显示，编辑与 HDR 导出仍保留原始亮度。'; }
media.addEventListener('change', updateDisplay); updateDisplay();
