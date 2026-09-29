#include <emscripten/emscripten.h>
#include <ultrahdr_api.h>
#include <ultrahdr/gainmapmath.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <jpeglib.h>
#include <setjmp.h>

static char message[256];
static std::vector<float> decoded;
static int decoded_width, decoded_height;
static float decoded_capacity;
#define API extern "C" EMSCRIPTEN_KEEPALIVE
API const char *hdr_error() { return message; }

static bool check(uhdr_error_info_t status) {
    if (status.error_code == UHDR_CODEC_OK) return true;
    snprintf(message, sizeof(message), "%s", status.has_detail ? status.detail : "HDR codec error");
    return false;
}
static int save(const char *path, const void *data, size_t size) {
    FILE *file = fopen(path, "wb");
    if (!file) { strcpy(message, "Cannot create output file."); return -1; }
    bool ok = fwrite(data, 1, size, file) == size;
    fclose(file);
    return ok ? 0 : -1;
}

API int hdr_encode(const float *rgba, unsigned char *sdr, int w, int h, int quality) {
    message[0] = 0;
    if (w < 2 || h < 2 || (uint64_t)w * h > 24000000) {
        strcpy(message, "HDR JPEG dimensions must be at least 2 x 2 and at most 24 megapixels."); return -1;
    }
    size_t size = (size_t)w * h * 4;
    std::vector<uint16_t> half(size);
    float peak = 203.f;
    for (size_t i = 0; i < size; i++) {
        if (i % 4 == 3) half[i] = ultrahdr::floatToHalf(1.f);
        else {
            // The JXR scRGB reference white is 80 nits; libultrahdr uses 203 nits.
            float v = std::isfinite(rgba[i]) ? std::max(0.f, rgba[i]) : 0.f;
            peak = std::max(peak, v * 80.f);
            half[i] = ultrahdr::floatToHalf(std::min(v * (80.f / 203.f), 10000.f / 203.f));
        }
    }
    uhdr_raw_image_t hdr{}, base{};
    hdr.fmt = UHDR_IMG_FMT_64bppRGBAHalfFloat;
    hdr.cg = UHDR_CG_BT_709; hdr.ct = UHDR_CT_LINEAR; hdr.range = UHDR_CR_FULL_RANGE;
    hdr.w = w; hdr.h = h; hdr.planes[0] = half.data(); hdr.stride[0] = w;
    base = hdr; base.fmt = UHDR_IMG_FMT_32bppRGBA8888; base.ct = UHDR_CT_SRGB; base.planes[0] = sdr;
    auto *enc = uhdr_create_encoder();
    if (!enc) return -1;
    int result = -1;
    if (check(uhdr_enc_set_raw_image(enc, &hdr, UHDR_HDR_IMG)) &&
        check(uhdr_enc_set_raw_image(enc, &base, UHDR_SDR_IMG)) &&
        check(uhdr_enc_set_quality(enc, quality, UHDR_BASE_IMG)) &&
        check(uhdr_enc_set_quality(enc, quality, UHDR_GAIN_MAP_IMG)) &&
        check(uhdr_enc_set_using_multi_channel_gainmap(enc, 1)) &&
        check(uhdr_enc_set_gainmap_scale_factor(enc, 1)) &&
        check(uhdr_enc_set_target_display_peak_brightness(enc, std::min(10000.f, peak))) &&
        check(uhdr_encode(enc))) {
        auto *out = uhdr_get_encoded_stream(enc);
        if (out) result = save("/output.jpg", out->data, out->data_sz);
    }
    uhdr_release_encoder(enc);
    return result;
}

struct JpegError { jpeg_error_mgr pub; jmp_buf jump; };
static void jpeg_fail(j_common_ptr c) {
    c->err->format_message(c, message);
    longjmp(((JpegError *)c->err)->jump, 1);
}
API int sdr_encode(unsigned char *rgba, int w, int h, int quality) {
    jpeg_compress_struct c{};
    JpegError err{};
    c.err = jpeg_std_error(&err.pub); err.pub.error_exit = jpeg_fail;
    unsigned char *out = nullptr;
    unsigned long size = 0;
    if (setjmp(err.jump)) { jpeg_destroy_compress(&c); free(out); return -1; }
    jpeg_create_compress(&c);
    jpeg_mem_dest(&c, &out, &size);
    c.image_width = w; c.image_height = h;
    c.input_components = 4; c.in_color_space = JCS_EXT_RGBA;
    jpeg_set_defaults(&c);
    jpeg_set_quality(&c, quality, TRUE);
    // 4:4:4 avoids colored fringes on screenshots and fine detail.
    for (int i = 0; i < 3; i++) c.comp_info[i].h_samp_factor = c.comp_info[i].v_samp_factor = 1;
    jpeg_start_compress(&c, TRUE);
    while (c.next_scanline < c.image_height) {
        JSAMPROW row = rgba + (size_t)c.next_scanline * w * 4;
        jpeg_write_scanlines(&c, &row, 1);
    }
    jpeg_finish_compress(&c);
    int result = save("/output.jpg", out, size);
    jpeg_destroy_compress(&c); free(out);
    return result;
}

// Independent decoder path for verification and HDR JPEG re-import.
API int hdr_decode(unsigned char *data, int size) {
    message[0] = 0; decoded.clear();
    uhdr_compressed_image_t image{};
    image.data = data; image.data_sz = image.capacity = size;
    image.cg = UHDR_CG_UNSPECIFIED; image.ct = UHDR_CT_UNSPECIFIED; image.range = UHDR_CR_UNSPECIFIED;
    auto *dec = uhdr_create_decoder();
    int result = -1;
    if (!dec) return result;
    if (check(uhdr_dec_set_image(dec, &image)) &&
        check(uhdr_dec_set_out_img_format(dec, UHDR_IMG_FMT_64bppRGBAHalfFloat)) &&
        check(uhdr_dec_set_out_color_transfer(dec, UHDR_CT_LINEAR)) && check(uhdr_dec_probe(dec))) {
        decoded_width = uhdr_dec_get_image_width(dec); decoded_height = uhdr_dec_get_image_height(dec);
        if ((uint64_t)decoded_width * decoded_height <= 24000000 && check(uhdr_decode(dec))) {
            const auto *out = uhdr_get_decoded_image(dec);
            const auto *meta = uhdr_dec_get_gainmap_metadata(dec);
            decoded_capacity = meta ? meta->hdr_capacity_max : 1;
            decoded.resize((size_t)out->w * out->h * 4);
            auto *half = (uint16_t *)out->planes[0];
            for (unsigned y = 0; y < out->h; y++) for (unsigned x = 0; x < out->w * 4; x++) {
                float value = ultrahdr::halfToFloat(half[y * out->stride[0] * 4 + x]);
                decoded[(size_t)y * out->w * 4 + x] = x % 4 == 3 ? value : value * (203.f / 80.f);
            }
            result = 0;
        }
    }
    uhdr_release_decoder(dec);
    return result;
}
API float *hdr_pixels() { return decoded.data(); }
API int hdr_width() { return decoded_width; }
API int hdr_height() { return decoded_height; }
API float hdr_capacity() { return decoded_capacity; }
API void hdr_clear() { std::vector<float>().swap(decoded); }
