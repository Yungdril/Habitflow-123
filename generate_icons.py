#!/usr/bin/env python3
"""
generate_icons.py — Run this once to generate all PNG icon sizes
Requires: pip install cairosvg Pillow

Usage:
  pip install cairosvg Pillow
  python3 generate_icons.py
"""

import os
import sys

SIZES = [72, 96, 128, 144, 152, 180, 192, 512]
SVG_PATH = "icons/icon.svg"
OUT_DIR = "icons"

def generate():
    try:
        import cairosvg
        from PIL import Image
        import io
    except ImportError:
        print("Installing dependencies...")
        os.system("pip install cairosvg Pillow")
        import cairosvg
        from PIL import Image
        import io

    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"Reading {SVG_PATH}...")
    with open(SVG_PATH, 'rb') as f:
        svg_data = f.read()

    for size in SIZES:
        out_path = f"{OUT_DIR}/icon-{size}.png"
        png_bytes = cairosvg.svg2png(
            bytestring=svg_data,
            output_width=size,
            output_height=size
        )
        with open(out_path, 'wb') as f:
            f.write(png_bytes)
        print(f"  ✓ {out_path} ({size}x{size})")

    # Also generate favicon.ico (multi-size: 16, 32, 48)
    print("  Generating favicon.ico...")
    favicon_sizes = [16, 32, 48]
    images = []
    for s in favicon_sizes:
        png = cairosvg.svg2png(bytestring=svg_data, output_width=s, output_height=s)
        img = Image.open(io.BytesIO(png)).convert("RGBA")
        images.append(img)

    images[0].save(
        "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in favicon_sizes],
        append_images=images[1:]
    )
    print("  ✓ favicon.ico")

    print(f"\nAll {len(SIZES)} icon sizes generated!")
    print("Add these to your HTML <head>:")
    print("""
  <link rel="icon" type="image/x-icon" href="favicon.ico"/>
  <link rel="icon" type="image/svg+xml" href="icons/icon.svg"/>
  <link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png"/>
  <link rel="manifest" href="manifest.json"/>
  <meta name="theme-color" content="#E8631A"/>
    """)

if __name__ == "__main__":
    generate()