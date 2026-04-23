#!/usr/bin/env python3
import os
import struct
import subprocess
import sys
import zlib
from collections import deque
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def read_png(path):
    data = Path(path).read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Input is not a PNG file")

    offset = len(PNG_SIGNATURE)
    width = height = color_type = bit_depth = None
    idat = bytearray()

    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", chunk_data
            )
            if bit_depth != 8 or compression != 0 or filter_method != 0 or interlace != 0:
                raise ValueError("Only 8-bit non-interlaced PNG input is supported")
            if color_type not in (2, 6):
                raise ValueError("Only RGB/RGBA PNG input is supported")
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    channels = 4 if color_type == 6 else 3
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    previous = [0] * stride
    pixels = []
    source = 0

    for _ in range(height):
        filter_type = raw[source]
        source += 1
        scanline = list(raw[source : source + stride])
        source += stride

        for index, value in enumerate(scanline):
            left = scanline[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0

            if filter_type == 1:
                scanline[index] = (value + left) & 0xFF
            elif filter_type == 2:
                scanline[index] = (value + up) & 0xFF
            elif filter_type == 3:
                scanline[index] = (value + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                predictor = paeth(left, up, upper_left)
                scanline[index] = (value + predictor) & 0xFF
            elif filter_type != 0:
                raise ValueError(f"Unsupported PNG filter: {filter_type}")

        for x in range(width):
            base = x * channels
            if channels == 4:
                pixels.append(tuple(scanline[base : base + 4]))
            else:
                pixels.append((*scanline[base : base + 3], 255))

        previous = scanline

    return width, height, pixels


def paeth(left, up, upper_left):
    estimate = left + up - upper_left
    left_distance = abs(estimate - left)
    up_distance = abs(estimate - up)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= up_distance and left_distance <= upper_left_distance:
        return left
    if up_distance <= upper_left_distance:
        return up
    return upper_left


def write_png(path, width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row_start = y * width
        for x in range(width):
            raw.extend(pixels[row_start + x])

    chunks = []
    chunks.append(make_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
    chunks.append(make_chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
    chunks.append(make_chunk(b"IEND", b""))
    Path(path).write_bytes(PNG_SIGNATURE + b"".join(chunks))


def make_chunk(chunk_type, data):
    checksum = zlib.crc32(chunk_type)
    checksum = zlib.crc32(data, checksum)
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", checksum & 0xFFFFFFFF)


def remove_edge_white(width, height, pixels):
    result = list(pixels)
    visited = set()
    queue = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    def is_background(pixel):
        red, green, blue, alpha = pixel
        return alpha > 0 and red >= 245 and green >= 245 and blue >= 245

    while queue:
        x, y = queue.popleft()
        if x < 0 or x >= width or y < 0 or y >= height or (x, y) in visited:
            continue
        visited.add((x, y))
        index = y * width + x
        if not is_background(result[index]):
            continue

        result[index] = (255, 255, 255, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return result


def crop_to_visible(width, height, pixels, padding_ratio=0.03):
    visible = [
        (index % width, index // width)
        for index, pixel in enumerate(pixels)
        if pixel[3] > 8
    ]
    if not visible:
        return width, height, pixels

    min_x = min(x for x, _ in visible)
    max_x = max(x for x, _ in visible)
    min_y = min(y for _, y in visible)
    max_y = max(y for _, y in visible)
    content_width = max_x - min_x + 1
    content_height = max_y - min_y + 1
    padding = max(0, round(max(content_width, content_height) * padding_ratio))

    min_x = max(0, min_x - padding)
    min_y = max(0, min_y - padding)
    max_x = min(width - 1, max_x + padding)
    max_y = min(height - 1, max_y + padding)

    cropped_width = max_x - min_x + 1
    cropped_height = max_y - min_y + 1
    cropped = []

    for y in range(min_y, max_y + 1):
        row_start = y * width
        cropped.extend(pixels[row_start + min_x : row_start + max_x + 1])

    return cropped_width, cropped_height, cropped


def fit_to_square(width, height, pixels):
    size = max(width, height)
    x_offset = (size - width) // 2
    y_offset = (size - height) // 2
    square = [(255, 255, 255, 0)] * (size * size)

    for y in range(height):
        for x in range(width):
            square[(y + y_offset) * size + x + x_offset] = pixels[y * width + x]

    return size, size, square


def create_ico(path, png_paths):
    images = [Path(p).read_bytes() for p in png_paths]
    entries = []
    offset = 6 + 16 * len(images)

    for png_path, image in zip(png_paths, images):
        size = int(Path(png_path).stem.split("x")[0])
        entries.append((size, len(image), offset))
        offset += len(image)

    header = struct.pack("<HHH", 0, 1, len(images))
    directory = bytearray()
    for size, length, image_offset in entries:
        encoded_size = 0 if size >= 256 else size
        directory.extend(struct.pack("<BBBBHHII", encoded_size, encoded_size, 0, 0, 1, 32, length, image_offset))

    Path(path).write_bytes(header + bytes(directory) + b"".join(images))


def run(command):
    subprocess.run(command, check=True)


def main():
    if len(sys.argv) != 3:
        print("Usage: generate_app_icons.py INPUT_PNG ICON_DIR", file=sys.stderr)
        return 1

    source = Path(sys.argv[1])
    icon_dir = Path(sys.argv[2])
    icon_dir.mkdir(parents=True, exist_ok=True)

    width, height, pixels = read_png(source)
    transparent_pixels = remove_edge_white(width, height, pixels)
    width, height, transparent_pixels = crop_to_visible(width, height, transparent_pixels)
    width, height, transparent_pixels = fit_to_square(width, height, transparent_pixels)
    transparent_source = icon_dir / "icon.png"
    write_png(transparent_source, width, height, transparent_pixels)

    png_sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }

    for filename, size in png_sizes.items():
        run(["sips", "-z", str(size), str(size), str(transparent_source), "--out", str(icon_dir / filename)])

    iconset = icon_dir / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    iconset_sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }

    for filename, size in iconset_sizes.items():
        run(["sips", "-z", str(size), str(size), str(transparent_source), "--out", str(iconset / filename)])

    run(["iconutil", "-c", "icns", str(iconset), "-o", str(icon_dir / "icon.icns")])
    ico_sources = []
    for size in (16, 32, 48, 64, 128, 256):
        output = icon_dir / f"{size}x{size}.ico.png"
        run(["sips", "-z", str(size), str(size), str(transparent_source), "--out", str(output)])
        ico_sources.append(output)
    create_ico(icon_dir / "icon.ico", ico_sources)

    for path in ico_sources:
        path.unlink(missing_ok=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
