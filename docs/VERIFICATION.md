# 验证记录

2026-09-29，本地 Linux / Node.js 24 / Chromium。

## 图像与编解码

`npm test`：17 项全部通过。

- 外部 128 bpp f32 JXR：3440×1440，解码亮度峰值约 9425.426 nits，保留负 RGB 和超白值。
- 外部 64 bpp f16 JXR：3840×2560，解码亮度峰值约 1382.766 nits。
- JXR 编码后重新解码：裁剪、缩放、双轴镜像后的尺寸和浮点样本正确；测试误差 `abs(actual-expected)/max(1,abs(expected)) < 0.002`。
- JXR 的负值、超白值和 alpha 往返通过；明确不声称逐位无损。
- Ultra HDR 与 Apple 导出包含 ISO 21496-1、XMP、MPF 和 ICC。两者为同一跨平台双元数据编码。
- HDR JPEG 经 libultrahdr 解码 API 重建，常量色块亮度误差小于 5%，验证 80/203 参考白点换算；SDR 曝光变化不会相应改变 HDR intent。
- 原始 3440×1440 全分辨率照片 HDR JPEG 编码/解码通过，重建峰值落在 8000–11000 nits 的合理区间。
- 奇数尺寸 HDR JPEG 输出不丢行列。
- SDR JPEG 不含 HDR 增益图标记；四种映射得到不同 SDR 结果。
- 损坏输入拒绝后，可继续解码有效图片。

## 浏览器与生产构建

`npm run build`：TypeScript 检查与 Vite 生产构建通过。

`npm run test:e2e`：3 组端到端测试全部通过，包括：

- 真实本地选图、HDR/SDR 切换、拖动裁剪、比例预设、精确缩放、自由宽高、双轴镜像与重置。
- 四种格式实际下载，下载后的 JXR 重新解码、JPEG HDR 标记验证。
- 非法文件、尺寸越界和重新选图恢复。
- 390×844 移动视口不产生横向溢出，样片与 Apple HDR 下载可用。
- 页面没有未处理 JavaScript 异常，没有上传请求。
- 中文本地字体加载，桌面/手机截图人工检查。

相同浏览器测试另对静态生产目录的 `/jxr-editor/` 子路径执行，3 组全部通过，验证 Pages 路径、Worker、WASM、字体和样片加载。

## 公网发布

- 公开源码仓库：https://github.com/IanYet/jxr-editor
- 正式地址：https://ianyet.github.io/jxr-editor/
- Pages：`gh-pages` 分支根目录，HTTPS enforced = true，GitHub 状态为 built。
- 部署提交：`0f112338a3c3b5a545cc3dae74bc06cc329e6f98`；应用源码提交：`f8f3b8325a0d2c0db2ab180df6fde3aeb3551d6a`。
- [GitHub Pages 部署任务](https://github.com/IanYet/jxr-editor/actions/runs/36536872527)：build、report-build-status、deploy 均成功。
- 默认正式地址已返回 HTTPS 200；通过 Chromium 从公网加载正式页面，再次执行相同的 3 组端到端测试，全部通过（14.9 秒）。实际下载了 Ultra HDR、Apple Adaptive HDR、JXR 和 SDR JPEG，并验证尺寸与 HDR 标记。
- 公网验收没有上传照片、未处理的页面异常或移动端横向溢出。

## 真实性边界

浏览器中的照片实际处理、文件编码和 HDR 数值重建均已验证。此环境为无头 Chromium、SDR 显示，无法验证实体 HDR 屏幕的实际发光亮度，也未在真实 iPhone / Mac Photos 上做实机测试。Apple 导出依据 Apple 官方 Adaptive HDR JPEG / ISO 21496-1 格式，明确不是 HEIC。

## 样本与构建校验

- `public/codecs/codecs.wasm` SHA-256：`d9b09614c47f920c287e0bfc7c7322fc2e72faca4e10bf0707591e3e8706067c`
- `sunrise-hdr.jxr` SHA-256：`68fb1c1bb560b681b3d5e53e4584890f8cbd64fd60ea6e9dbbaf2e41f1990979`
- `blue_colorballs.jxr` SHA-256：`e7c5756021a8f78a7afa72eccad6759c2db477a47d41c84879a82aee13678c6d`

源码依赖及样本来源见 README 与 `public/licenses/NOTICE.txt`。
