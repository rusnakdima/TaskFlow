#!/usr/bin/env python3
"""Generate correct Android mipmap icons from source icon.png.

No external dependencies - uses only Python3 stdlib (struct, zlib).
Fixes Tauri's 49x49 hdpi bug and generates adaptive icon XML.
"""

import struct
import zlib
import os
import sys
import json

MIPMAP_SIZES = {
    "mdpi":    (48,  48),
    "hdpi":    (72,  72),
    "xhdpi":   (96,  96),
    "xxhdpi":  (144, 144),
    "xxxhdpi": (192, 192),
}

FOREGROUND_SIZES = {
    "mdpi":    (108, 108),
    "hdpi":    (162, 162),
    "xhdpi":   (216, 216),
    "xxhdpi":  (324, 324),
    "xxxhdpi": (432, 432),
}

ADAPTIVE_ICON_XML = """\
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <background android:drawable="@color/ic_launcher_background"/>
</adaptive-icon>"""

BACKGROUND_COLOR_XML = """\
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">{color}</color>
</resources>"""


def read_png_pixels(filepath):
    """Read a PNG file and return (width, height, rgba_pixels)."""
    with open(filepath, "rb") as f:
        sig = f.read(8)
        if sig != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Not a PNG file: {filepath}")
        width = height = None
        idat_data = b""
        while True:
            raw_len = f.read(4)
            if len(raw_len) < 4:
                break
            length = struct.unpack(">I", raw_len)[0]
            chunk_type = f.read(4)
            data = f.read(length)
            f.read(4)  # CRC
            if chunk_type == b"IHDR":
                width, height = struct.unpack(">II", data[:8])
            elif chunk_type == b"IDAT":
                idat_data += data
            elif chunk_type == b"IEND":
                break

    if width is None or height is None:
        raise ValueError(f"Invalid PNG: {filepath}")

    decompressed = zlib.decompress(idat_data)
    pixels = bytearray()
    stride = width * 4 + 1  # +1 for filter byte
    for y in range(height):
        row_start = y * stride + 1
        pixels.extend(decompressed[row_start : row_start + width * 4])
    return width, height, bytes(pixels)


def create_png(width, height, rgba_pixels):
    """Create a PNG file from raw RGBA pixel data."""

    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        return (
            struct.pack(">I", len(data))
            + chunk
            + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)
        )

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = make_chunk(
        b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    )

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter: none
        idx = y * width * 4
        raw.extend(rgba_pixels[idx : idx + width * 4])

    idat = make_chunk(b"IDAT", zlib.compress(bytes(raw)))
    iend = make_chunk(b"IEND", b"")
    return header + ihdr + idat + iend


def resize_bilinear(src_w, src_h, src_pixels, dst_w, dst_h):
    """Resize RGBA pixels using bilinear interpolation."""
    dst = bytearray(dst_w * dst_h * 4)
    for dy in range(dst_h):
        sy = (dy + 0.5) * src_h / dst_h - 0.5
        y0 = max(0, int(sy))
        y1 = min(src_h - 1, y0 + 1)
        fy = sy - y0
        for dx in range(dst_w):
            sx = (dx + 0.5) * src_w / dst_w - 0.5
            x0 = max(0, int(sx))
            x1 = min(src_w - 1, x0 + 1)
            fx = sx - x0
            for c in range(4):
                v00 = src_pixels[(y0 * src_w + x0) * 4 + c]
                v10 = src_pixels[(y0 * src_w + x1) * 4 + c]
                v01 = src_pixels[(y1 * src_w + x0) * 4 + c]
                v11 = src_pixels[(y1 * src_w + x1) * 4 + c]
                val = (
                    v00 * (1 - fx) * (1 - fy)
                    + v10 * fx * (1 - fy)
                    + v01 * (1 - fx) * fy
                    + v11 * fx * fy
                )
                dst[(dy * dst_w + dx) * 4 + c] = int(val + 0.5)
    return bytes(dst)


def generate_icons(src_icon_path, res_dir, bg_color):
    """Generate all Android mipmap icons and XML configs."""
    src_w, src_h, src_pixels = read_png_pixels(src_icon_path)
    print(f"  Source icon: {src_w}x{src_h}")

    for density in MIPMAP_SIZES:
        mipmap_dir = os.path.join(res_dir, f"mipmap-{density}")
        os.makedirs(mipmap_dir, exist_ok=True)

        # ic_launcher.png and ic_launcher_round.png
        w, h = MIPMAP_SIZES[density]
        resized = resize_bilinear(src_w, src_h, src_pixels, w, h)
        png = create_png(w, h, resized)

        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            path = os.path.join(mipmap_dir, name)
            with open(path, "wb") as f:
                f.write(png)

        # ic_launcher_foreground.png
        fw, fh = FOREGROUND_SIZES[density]
        fg_resized = resize_bilinear(src_w, src_h, src_pixels, fw, fh)
        fg_png = create_png(fw, fh, fg_resized)
        fg_path = os.path.join(mipmap_dir, "ic_launcher_foreground.png")
        with open(fg_path, "wb") as f:
            f.write(fg_png)

        print(
            f"  {density}: launcher {w}x{h}, foreground {fw}x{fh}"
        )

    # mipmap-anydpi-v26
    anydpi_dir = os.path.join(res_dir, "mipmap-anydpi-v26")
    os.makedirs(anydpi_dir, exist_ok=True)
    with open(os.path.join(anydpi_dir, "ic_launcher.xml"), "w") as f:
        f.write(ADAPTIVE_ICON_XML)

    # values/ic_launcher_background.xml
    values_dir = os.path.join(res_dir, "values")
    os.makedirs(values_dir, exist_ok=True)
    with open(os.path.join(values_dir, "ic_launcher_background.xml"), "w") as f:
        f.write(BACKGROUND_COLOR_XML.format(color=bg_color))

    print(f"  Adaptive icon XML + background color ({bg_color}) written")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    src_tauri_dir = os.path.dirname(script_dir)  # src-tauri/

    # Try to read config from tauri.conf.json or use defaults
    config_path = os.path.join(src_tauri_dir, "tauri.conf.json")
    bg_color = "#3DDC84"  # default Android green

    if os.path.exists(config_path):
        try:
            with open(config_path) as f:
                conf = json.load(f)
            identifier = conf.get("identifier", "")
            # Project-specific background colors
            color_map = {
                "com.tcs.taskflow": "#FF3DDC84",
                "com.tcs.voice-assistant": "#3DDC84",
                "com.tcs.pacman3d": "#3DDC84",
                "com.tcs.unichat": "#fff",
                "com.tcs.cleanux": "#3DDC84",
                "com.tcs.lumencast": "#3DDC84",
                "com.tcs.translator": "#3DDC84",
            }
            bg_color = color_map.get(identifier, bg_color)
        except (json.JSONDecodeError, KeyError):
            pass

    src_icon = os.path.join(src_tauri_dir, "icons", "icon.png")
    if not os.path.exists(src_icon):
        print(f"Error: {src_icon} not found")
        sys.exit(1)

    res_dir = os.path.join(
        src_tauri_dir, "gen", "android", "app", "src", "main", "res"
    )

    if not os.path.exists(res_dir):
        print(f"Warning: {res_dir} not found, creating it")
        os.makedirs(res_dir, exist_ok=True)

    print(f"Generating Android icons...")
    generate_icons(src_icon, res_dir, bg_color)
    print("Done!")


if __name__ == "__main__":
    main()
