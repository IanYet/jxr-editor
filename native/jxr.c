#include <emscripten/emscripten.h>
#include <JXRGlue.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static float *pixels;
static int width, height, format_bits;
static char message[256];
#define API EMSCRIPTEN_KEEPALIVE
#define CHECK(x) do { err = (x); if (err < 0) goto cleanup; } while (0)

API const char *jxr_error(void) { return message; }
API int jxr_width(void) { return width; }
API int jxr_height(void) { return height; }
API int jxr_bits(void) { return format_bits; }
API float *jxr_pixels(void) { return pixels; }
API void jxr_clear(void) { free(pixels); pixels = NULL; }

static float half_float(uint16_t n) {
    float sign = (n & 0x8000) ? -1.f : 1.f;
    int exp = (n >> 10) & 31, mantissa = n & 1023;
    return sign * (exp == 0 ? ldexpf(mantissa, -24) :
        exp == 31 ? (mantissa ? NAN : INFINITY) : ldexpf(1024 + mantissa, exp - 25));
}
static float linear(float n) { return n <= .04045f ? n / 12.92f : powf((n + .055f) / 1.055f, 2.4f); }

// Decode directly into the source pixel format; never pass HDR through 8-bit RGB.
API int jxr_decode(void) {
    ERR err = 0;
    PKImageDecode *dec = NULL;
    struct WMPStream *stream = NULL;
    PKPixelInfo info = {0};
    unsigned char *raw = NULL;
    PKRect rect = {0};
    size_t count = 0, stride = 0;
    jxr_clear();
    message[0] = 0;
    CHECK(CreateWS_File(&stream, "/input.jxr", "rb"));
    CHECK(PKImageDecode_Create_WMP(&dec));
    CHECK(dec->Initialize(dec, stream));
    dec->fStreamOwner = 1;
    CHECK(dec->GetSize(dec, &width, &height));
    if (width < 1 || height < 1 || width > 16384 || height > 16384 ||
        (uint64_t)width * height > 24000000) {
        strcpy(message, "Image exceeds the 24 megapixel / 16384 pixel browser memory limit.");
        err = -1; goto cleanup;
    }
    info.pGUIDPixFmt = &dec->guidPixFormat;
    CHECK(PixelFormatLookup(&info, LOOKUP_FORWARD));
    if ((info.cfColorFormat != CF_RGB && info.cfColorFormat != Y_ONLY) ||
        !(info.bdBitDepth == BD_32F || info.bdBitDepth == BD_16F ||
          info.bdBitDepth == BD_8 || info.bdBitDepth == BD_16 ||
          info.bdBitDepth == BD_16S || info.bdBitDepth == BD_32S)) {
        strcpy(message, "Unsupported JXR pixel format. Use an RGB float, half-float or RGB/gray integer JXR.");
        err = -2; goto cleanup;
    }
    format_bits = info.cbitUnit;
    stride = (size_t)width * (info.cbitUnit / 8);
    count = (size_t)width * height;
    raw = malloc(stride * height);
    pixels = malloc(count * 4 * sizeof(float));
    if (!raw || !pixels) { err = -3; goto cleanup; }
    dec->WMP.wmiSCP.uAlphaMode = (info.grBit & PK_pixfmtHasAlpha) ? 2 : 0;
    dec->WMP.wmiI.cThumbnailWidth = dec->WMP.wmiI.cWidth;
    dec->WMP.wmiI.cThumbnailHeight = dec->WMP.wmiI.cHeight;
    dec->WMP.wmiI.cROIWidth = dec->WMP.wmiI.cWidth;
    dec->WMP.wmiI.cROIHeight = dec->WMP.wmiI.cHeight;
    rect.Width = width; rect.Height = height;
    CHECK(dec->Copy(dec, &rect, raw, (U32)stride));
    for (size_t i = 0; i < count; i++) {
        float v[4] = {0, 0, 0, 1};
        int channels = info.cChannel;
        unsigned char *p = raw + i * (info.cbitUnit / 8);
        for (int c = 0; c < channels && c < 4; c++) {
            if (info.bdBitDepth == BD_32F) v[c] = ((float *)p)[c];
            else if (info.bdBitDepth == BD_16F) v[c] = half_float(((uint16_t *)p)[c]);
            else if (info.bdBitDepth == BD_16S) v[c] = ((int16_t *)p)[c] / 8192.f;
            else if (info.bdBitDepth == BD_32S) v[c] = ((int32_t *)p)[c] / 16777216.f;
            else {
                v[c] = info.bdBitDepth == BD_8 ? p[c] / 255.f : ((uint16_t *)p)[c] / 65535.f;
                if (c < 3) v[c] = linear(v[c]);
            }
            if (!isfinite(v[c])) v[c] = 0;
        }
        if (info.cfColorFormat == Y_ONLY) v[1] = v[2] = v[0];
        if (info.grBit & PK_pixfmtBGR) { float t = v[0]; v[0] = v[2]; v[2] = t; }
        if (!(info.grBit & PK_pixfmtHasAlpha)) v[3] = 1;
        if ((info.grBit & PK_pixfmtPreMul) && v[3] > 0) {
            for (int c = 0; c < 3; c++) v[c] /= v[3];
        }
        memcpy(pixels + i * 4, v, sizeof(v));
    }
cleanup:
    free(raw);
    if (dec) { if (!dec->pStream) dec->pStream = stream; dec->fStreamOwner = 1; dec->Release(&dec); }
    else if (stream) stream->Close(&stream);
    if (err < 0) {
        jxr_clear();
        if (!message[0]) snprintf(message, sizeof(message), "JXR decode failed (%ld). The file may be damaged.", (long)err);
    }
    return err;
}

// QP=1, no chroma subsampling. Keep the original scRGB brightness scale.
API int jxr_encode(float *rgba, int w, int h) {
    ERR err = 0;
    PKImageEncode *enc = NULL;
    struct WMPStream *stream = NULL;
    CWMIStrCodecParam params = {0};
    message[0] = 0;
    if (w < 1 || h < 1 || (uint64_t)w * h > 24000000) return -1;
    params.cfColorFormat = YUV_444;
    params.bdBitDepth = BD_LONG;
    params.bfBitstreamFormat = FREQUENCY;
    params.bProgressiveMode = TRUE;
    params.olOverlap = OL_NONE;
    params.sbSubband = SB_ALL;
    params.uAlphaMode = 2;
    params.uiDefaultQPIndex = 1;
    params.uiDefaultQPIndexAlpha = 1;
    // jxrlib's safe float encoding precision. This is HDR, not bit-exact float archival.
    params.nLenMantissaOrShift = 13;
    CHECK(CreateWS_File(&stream, "/output.jxr", "wb"));
    CHECK(PKImageEncode_Create_WMP(&enc));
    CHECK(enc->Initialize(enc, stream, &params, sizeof(params)));
    CHECK(enc->SetPixelFormat(enc, GUID_PKPixelFormat128bppRGBAFloat));
    CHECK(enc->SetSize(enc, w, h));
    CHECK(enc->SetResolution(enc, 96.f, 96.f));
    CHECK(enc->WritePixels(enc, h, (U8 *)rgba, w * 16));
cleanup:
    if (enc) { if (!enc->pStream) enc->pStream = stream; enc->Release(&enc); }
    else if (stream) stream->Close(&stream);
    if (err < 0) snprintf(message, sizeof(message), "JXR encode failed (%ld).", (long)err);
    return err;
}
