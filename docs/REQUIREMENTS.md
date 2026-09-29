# 交付要求与验证

用户要求：纯 Web JXR 编辑器；本地选图并保留亮度查看；自由及预设比例编辑大小；X/Y 镜像；HDR 导出 Ultra HDR JPEG、JXR、Apple HDR；可选色调映射导出 SDR JPEG；上传 IanYet/jxr-editor 公开仓库并部署 GitHub Pages。

实现约定：
- 全部像素操作在浏览器 Worker 的线性 scRGB Float32 数据上进行，1.0 对应 80 nits；预览和 JPEG 编码才产生派生图像。
- 自由尺寸缩放、锁定比例、预设裁剪比例、可拖动裁剪框和精确坐标；编辑不覆盖原图，支持重置。
- X 轴镜像为上下翻转，Y 轴镜像为左右翻转，在界面明确说明。
- HDR 预览采用浏览器原生 gain-map JPEG 显示，SDR 屏幕有准确状态提示且导出保留 HDR。
- Apple HDR 使用 Apple Adaptive HDR JPEG / ISO 21496-1，面向 iOS 18 / macOS 15 及更新系统，不冒充 HEIC。
- Ultra HDR 和 Apple Adaptive HDR 导出都含兼容 XMP 和 ISO 元数据，可跨平台使用。
- 映射算法包括 Hable、Reinhard、ACES 拟合、线性裁切；曝光只影响 SDR 渲染，不改变 HDR 原始亮度。

必须验证：
1. 真实外部 JXR 样本 f32/f16 解码、HDR 峰值与几何操作保留超白数据。
2. JXR 导出后重新解码，与编辑后的 Float32 像素比较尺寸、方向、亮度。
3. Ultra HDR / Apple JPEG 经 libultrahdr 独立解码路径验证，含正确 MPF、gain map、ISO 元数据；203/80 白点换算。
4. 普通 JPEG 不含 gain map，映射算法输出不同、SDR 范围正确。
5. 浏览器真实选图、裁剪/缩放/镜像、四种下载，错误输入、移动布局、无图/处理中状态。
6. 生产构建和 Pages 子路径资源有效，远程仓库、Pages 部署和线上实际访问均确认。

参考：https://github.com/tfx2001/jxr2uhdr ，https://github.com/google/libultrahdr ，https://developer.apple.com/videos/play/wwdc2024/10177/

## 多图浏览与精确裁剪改进

用户追加的三个要求：

1. 一次打开多个文件或一个文件夹，逐张查看；编辑和导出仍独立进行。
2. 选定裁剪比例后，手动修改裁剪宽或高，另一项按比例计算，不切回自由比例。
3. 拖动裁剪边界时显示鼠标附近小范围像素放大镜，以辅助判断边界。

验收覆盖：

- 多文件选择、文件夹选择、拖入文件或文件夹；目录包含子目录并读取完整批次，跳过不支持的文件。
- 照片列表与前后导航、切换后恢复独立裁剪 / 映射 / 导出设置、取消或快速切换不显示过期结果、损坏文件可继续切换。
- 修改裁剪宽高与起点后保留选中比例；自由比例可独立修改；边界与四角拖动保持有效整数坐标。
- 放大镜直接取原图 24 × 24 像素，以 8 倍最近邻显示和像素网格标记；绿色边线显示裁剪边界，松开即隐藏。SDR 映射仅用于放大镜显示。
- 桌面 / 手机布局、原有导出功能回归、生产构建和 Pages 公网交互。
