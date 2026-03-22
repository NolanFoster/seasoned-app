#!/usr/bin/env python3
"""
Generate PWA icon assets for the Seasoned recipe app.
Requires: Python 3.7+, Pillow

Generates:
- icon-192x192.png (standard PWA)
- icon-512x512.png (standard PWA)
- icon-maskable-512x512.png (Android adaptive)
- apple-touch-icon.png (iOS, 180x180)
"""

import sys
import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow", file=sys.stderr)
    sys.exit(1)

# Brand colors
BG_COLOR = (13, 26, 15)       # #0d1a0f dark green
GOLD     = (200, 169, 110)    # #c8a96e gold
HIGHLIGHT = (230, 205, 155)   # lighter gold for bowl highlight

OUTPUT_DIR = Path(__file__).parent.parent / "recipe-app" / "public"


def draw_spoon(draw: ImageDraw.ImageDraw, size: int, safe_size: int | None = None) -> None:
    """
    Draw a stylized spoon centered on a canvas of `size` x `size`.
    If safe_size is provided, constrain the design to a centered safe_size x safe_size region.
    """
    canvas = safe_size if safe_size else size
    # Margin offsets when a safe zone is active
    offset = (size - canvas) // 2

    # Proportions (relative to canvas/safe area)
    margin_pct   = 0.13   # 13% margin on each side
    bowl_w_pct   = 0.42   # bowl width as % of canvas
    bowl_h_pct   = 0.32   # bowl height as % of canvas
    bowl_top_pct = 0.10   # bowl top edge from top of canvas
    handle_w_pct = 0.09   # handle width as % of canvas

    margin    = canvas * margin_pct
    bowl_w    = canvas * bowl_w_pct
    bowl_h    = canvas * bowl_h_pct
    bowl_top  = offset + canvas * bowl_top_pct
    bowl_left = offset + (canvas - bowl_w) / 2
    bowl_bot  = bowl_top + bowl_h

    handle_w  = canvas * handle_w_pct
    handle_cx = offset + canvas / 2  # center x

    # Handle goes from just below bowl to near bottom margin
    handle_top = bowl_bot - canvas * 0.02  # slight overlap with bowl bottom
    handle_bot = offset + canvas * (1 - margin_pct)

    # --- Draw handle (tapered trapezoid, wider at top, pointed at bottom) ---
    # Top of handle is handle_w wide, bottom tapers to a thin point (2px each side)
    half_top = handle_w / 2
    half_bot = max(1.5, handle_w * 0.08)

    handle_poly = [
        (handle_cx - half_top, handle_top),
        (handle_cx + half_top, handle_top),
        (handle_cx + half_bot, handle_bot),
        (handle_cx - half_bot, handle_bot),
    ]
    draw.polygon(handle_poly, fill=GOLD)

    # --- Draw spoon bowl (filled ellipse) ---
    bowl_bbox = [bowl_left, bowl_top, bowl_left + bowl_w, bowl_bot]
    draw.ellipse(bowl_bbox, fill=GOLD)

    # --- Subtle highlight on bowl (smaller lighter ellipse, upper-left quadrant) ---
    hl_w = bowl_w * 0.40
    hl_h = bowl_h * 0.35
    hl_left = bowl_left + bowl_w * 0.18
    hl_top2  = bowl_top  + bowl_h * 0.12
    draw.ellipse(
        [hl_left, hl_top2, hl_left + hl_w, hl_top2 + hl_h],
        fill=HIGHLIGHT,
    )


def generate_icon(size: int, output_path: Path, maskable: bool = False, opaque: bool = False) -> None:
    mode = "RGB" if opaque else "RGBA"
    bg = BG_COLOR if opaque else (*BG_COLOR, 255)

    img  = Image.new(mode, (size, size), bg)
    draw = ImageDraw.Draw(img)

    if maskable:
        # Safe zone: inner 75% of canvas (384px for 512px canvas)
        safe_size = int(size * 0.75)
        draw_spoon(draw, size, safe_size=safe_size)
    else:
        draw_spoon(draw, size)

    img.save(output_path, "PNG", optimize=True, compress_level=9)
    kb = output_path.stat().st_size / 1024
    print(f"  Created {output_path.name} ({size}x{size}px, {kb:.1f} KB)")


def main() -> None:
    if not OUTPUT_DIR.exists():
        print(f"ERROR: output directory not found: {OUTPUT_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"Generating PWA icons → {OUTPUT_DIR}")

    icons = [
        # (size, filename, maskable, opaque)
        (192, "icon-192x192.png",          False, False),
        (512, "icon-512x512.png",          False, False),
        (512, "icon-maskable-512x512.png", True,  False),
        (180, "apple-touch-icon.png",      False, True),
    ]

    errors = 0
    for size, name, maskable, opaque in icons:
        try:
            generate_icon(size, OUTPUT_DIR / name, maskable=maskable, opaque=opaque)
        except Exception as exc:
            print(f"  ERROR generating {name}: {exc}", file=sys.stderr)
            errors += 1

    if errors:
        print(f"\n{errors} icon(s) failed to generate.", file=sys.stderr)
        sys.exit(1)

    print("\nAll icons generated successfully.")


if __name__ == "__main__":
    main()
