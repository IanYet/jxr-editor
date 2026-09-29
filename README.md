# Luma · JXR HDR 编辑器

纯浏览器 JXR 照片编辑器。照片、浮点像素、裁剪和编码全部留在设备上，没有上传接口或后端。

**在线使用：<https://ianyet.github.io/jxr-editor/>**

内置示例为微软 Windows HDR 壁纸 **blue_colorballs.jxr（蓝色彩球）**，3840 × 2560、64 bpp 半浮点 HDR。点击“试用 Windows HDR 壁纸”即可加载。

## 功能

- 多选或拖入 `.jxr` / `.wdp` / `.hdp`，也可打开或拖入整个文件夹（包含子目录，自动跳过其他格式）；支持 RGB/RGBA 32 位浮点、16 位半浮点及常见整数格式。
- 照片列表、上一张 / 下一张浏览。各张照片独立编辑、独立导出；切换保留各自设置，仅当前照片占用完整浮点像素内存。缩略图首次查看后生成。列表和编辑设置保留至本次页面关闭或刷新，移出列表不会删除原文件。
- 原生 HDR JPEG 预览、SDR 映射预览、原图对比；显示原图尺寸、亮度峰值和直方图。
- 在 Float32 线性光数据上裁剪、双线性缩放、镜像；可以精确输入坐标、自由尺寸或锁定比例。
- 比例预设：原图、1:1、4:3、3:2、16:9、9:16、21:9；输入裁剪宽或高会按选定比例联动另一项，保留所选比例；自由比例下可分别输入。越界值提示修正。
- 可拖动裁剪框、四条边和四个角。调整边界时显示 8 倍像素放大镜，从原图直接取样 24 × 24 像素，用 SDR 映射显示，绿色线标出裁剪边界，不改变 HDR 数据。
- X 轴镜像 = 上下翻转，Y 轴镜像 = 左右翻转。
- 四类导出：Ultra HDR JPEG、浮点 JXR、Apple Adaptive HDR JPEG、普通 SDR JPEG。
- SDR 映射可选 Hable、Reinhard、ACES 拟合和线性裁切，支持曝光和白点调整。
- 响应式中文界面；快捷键 `O` 打开、`E` 导出、`←` / `→` 切换照片。

## HDR 与兼容性

JXR 按线性 **scRGB、1.0 = 80 nits** 解释。该约定适用于常见 Windows / NVIDIA HDR 截图；不是任意自定义 ICC、PQ 或 HLG JXR 的通用色彩管理器。

编辑保留原始浮点数值。只有 JPEG 导出才生成 SDR 基础层和 HDR 增益图。编码前以 `80 / 203` 转换到 libultrahdr 的线性参考白点。SDR 曝光和映射算法改变 SDR 外观，HDR intent 仍使用原始亮度。

| 导出 | 文件 | 亮度与用途 |
| --- | --- | --- |
| Ultra HDR | `.jpg` | RGB 增益图 + XMP + ISO 21496-1 + MPF + ICC；普通解码器显示 SDR 基础层 |
| Apple Adaptive HDR | `.jpg` | 同时写入 ISO 21496-1 与 Ultra HDR 元数据；用于 iOS 18 / macOS 15 及后续系统 |
| JPEG XR | `.jxr` | 128 bpp RGBA Float，保持 scRGB、负值和透明通道，QP=1 / 4:4:4；13 位尾数编码有精度损失，不是逐位无损归档 |
| 标准 JPEG | `.jpg` | 按所选映射导出 sRGB SDR，不含增益图 |

Apple Adaptive HDR JPEG 是 Apple 官方支持的 HDR 照片格式，**并非 HEIC**。两种 HDR JPEG 选项采用相同的双格式元数据，以便跨 Apple 和其他 Ultra HDR 解码器使用。参见 [Apple WWDC24：Adaptive HDR](https://developer.apple.com/videos/play/wwdc2024/10177/) 与 [libultrahdr](https://github.com/google/libultrahdr)。

显示 HDR 需要支持 gain-map JPEG 的浏览器、HDR 屏幕和相应系统设置。页面检测 `(dynamic-range: high)` 并提示显示环境；SDR 显示器上的预览不代表 HDR 信息丢失。无头浏览器测试可核对编码与亮度重建，但不能验证实体屏幕发光效果或 Apple Photos 的具体设备表现。

当前内存预算：单图不超过 **2400 万像素**，单边不超过 **16384 px**，文件不超过 **256 MB**。HDR JPEG 的最小尺寸为 2 × 2。预览最长边 1500 px，下载按实际输出尺寸编码。HDR JPEG 裁切负 RGB 值以及超过 10,000 nits 的通道值；需要保留这些数值时使用 JXR。JPEG 使用源 RGB，忽略透明通道。导出不复制原始 EXIF、GPS 或相机元数据。

## 本地开发与验证

需要 Node.js 24+。预编译的单线程 WebAssembly 模块已包含在 `public/codecs`，日常前端开发不需要 C++ 工具链，也不需要 COOP/COEP 或 SharedArrayBuffer。

```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

如果使用现有 Chromium，可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。`TEST_BASE_URL` 可指向已启动的生产服务或已部署 Pages，运行相同的端到端测试。公网测试需要网络代理时可设置 `TEST_PROXY`。

验证包含两份真实 JXR（128 bpp f32 与 64 bpp f16）、JXR 重新解码像素误差、HDR JPEG 80/203 白点与亮度重建、ISO/XMP/MPF/ICC 结构、奇数输出尺寸、四种映射、损坏文件恢复，以及浏览器多选 / 文件夹 / 多文件拖入、独立编辑状态恢复、裁剪比例联动、原图像素放大镜、镜像、全部下载和手机布局。目录遍历另覆盖超过 100 个项目和嵌套目录。

## 重建编解码器

需要 Emscripten **4.0.12**、CMake 3.16+、Git 和 Make。

```sh
source /path/to/emsdk/emsdk_env.sh
npm run build:codecs
npm test
```

构建脚本将依赖放入忽略的 `.codec-build/deps`；也可通过 `DEPS_DIR` 指定。固定源码版本：

- jxrlib：`f7521879862b9085318e814c6157490dd9dbbdb4`，BSD-2-Clause。
- libultrahdr：`v1.4.0` / `d52a0d13814ca399fc8a07e23de1d2c63f0e8404`，Apache-2.0。
- libjpeg-turbo：`3.0.1`，其 IJG/BSD/zlib 条款见随附许可证。

`native/jxr.c` 负责原生像素格式解码和浮点 JXR 编码；`native/hdr.cpp` 负责 HDR/SDR JPEG 编码和独立 HDR 解码验证；`src/core.ts` 负责线性几何与 SDR 映射；`src/worker.ts` 在独立线程处理全分辨率像素。

## GitHub Pages

Vite 使用相对资源路径，可部署在 `/jxr-editor/`。生产文件发布到 `gh-pages` 分支，Pages source 设置为该分支的根目录，包含 `.nojekyll`。

```sh
npm test && npm run build
bash scripts/deploy-pages.sh
```

首次发布需有目标仓库的写权限，且已将 `origin` 配置为自己的仓库。脚本不创建仓库或改变其他仓库配置。

## 开源致谢

实现参考 [tfx2001/jxr2uhdr](https://github.com/tfx2001/jxr2uhdr) 的浮点处理与 80/203 参考白点换算，其日出样本保留用于回归测试（提交 `d2c133846ee262b33b8a7bb1514add2f6c35b55e`）。内置蓝色彩球示例采用项目所有者提供的微软 Windows HDR 壁纸原文件。使用微软 jxrlib、Google libultrahdr 和 libjpeg-turbo。第三方来源及许可证说明随页面分发，见 [public/licenses](public/licenses/)。
