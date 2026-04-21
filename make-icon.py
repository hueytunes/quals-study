#!/usr/bin/env python3
"""Quals Study Bible app icon: indigo gradient rounded-square with a
stylised open-book glyph. Matches the Lab Calc visual family with a
scholarly color shift."""
from PIL import Image, ImageDraw

def make_icon(size: int, out_path: str) -> None:
    # Indigo gradient background
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    top = (91, 99, 214)    # --coral (indigo)
    bot = (62, 69, 169)    # --coral-deep
    d = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size, size), radius=int(size * 0.22), fill=255
    )

    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    # Stylised open book: two page rectangles meeting at a spine.
    d2 = ImageDraw.Draw(icon)
    cx = size // 2
    cy = int(size * 0.52)
    page_w = int(size * 0.34)
    page_h = int(size * 0.40)
    radius = int(size * 0.035)

    WHITE = (255, 250, 243, 255)
    CREAM = (248, 240, 225, 255)

    # Left page (slightly tilted)
    left = [
        (cx - page_w - int(size * 0.01), cy - page_h // 2 + int(size * 0.03)),
        (cx - int(size * 0.015),         cy - page_h // 2 - int(size * 0.01)),
        (cx - int(size * 0.015),         cy + page_h // 2),
        (cx - page_w - int(size * 0.01), cy + page_h // 2 + int(size * 0.03)),
    ]
    d2.polygon(left, fill=WHITE)
    # Right page
    right = [
        (cx + int(size * 0.015),         cy - page_h // 2 - int(size * 0.01)),
        (cx + page_w + int(size * 0.01), cy - page_h // 2 + int(size * 0.03)),
        (cx + page_w + int(size * 0.01), cy + page_h // 2 + int(size * 0.03)),
        (cx + int(size * 0.015),         cy + page_h // 2),
    ]
    d2.polygon(right, fill=WHITE)

    # Spine (thin dark line centered)
    spine_h = page_h + int(size * 0.02)
    d2.rectangle(
        (cx - int(size * 0.008), cy - spine_h // 2,
         cx + int(size * 0.008), cy + spine_h // 2 + int(size * 0.015)),
        fill=(62, 69, 169, 255),
    )

    # Text lines on both pages (subtle cream ticks)
    line_h = max(2, int(size * 0.012))
    line_gap = int(size * 0.055)
    num_lines = 4
    for i in range(num_lines):
        y = cy - int(page_h * 0.3) + i * line_gap
        # Left
        d2.rounded_rectangle(
            (cx - page_w + int(size * 0.04), y,
             cx - int(size * 0.05), y + line_h),
            radius=line_h // 2,
            fill=CREAM,
        )
        # Right
        d2.rounded_rectangle(
            (cx + int(size * 0.05), y,
             cx + page_w - int(size * 0.04), y + line_h),
            radius=line_h // 2,
            fill=CREAM,
        )

    # Small bookmark ribbon top-right of right page
    ribbon_w = int(size * 0.04)
    ribbon_h = int(size * 0.14)
    rx = cx + int(size * 0.18)
    ry = cy - page_h // 2 - int(size * 0.01)
    d2.polygon([
        (rx, ry),
        (rx + ribbon_w, ry),
        (rx + ribbon_w, ry + ribbon_h),
        (rx + ribbon_w // 2, ry + ribbon_h - int(size * 0.03)),
        (rx, ry + ribbon_h),
    ], fill=(229, 106, 79, 255))  # warm coral accent on the bookmark

    icon.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path} ({size}x{size})")


if __name__ == "__main__":
    make_icon(180, "apple-touch-icon.png")
    make_icon(192, "icon-192.png")
    make_icon(512, "icon-512.png")
