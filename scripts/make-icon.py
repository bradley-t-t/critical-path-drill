#!/usr/bin/env python3
"""Draws build/icon.png, the one source image electron-builder turns into a Mac .icns and a
Windows .ico. Three white task boxes in a chain are the critical path; the pale box hanging
below is the branch with slack. Run it with: npm run icon"""

from PIL import Image, ImageDraw

SIZE = 1024
BLUE = (31, 95, 191, 255)
WHITE = (255, 255, 255, 255)
PALE = (255, 255, 255, 115)
GRID = (31, 95, 191, 70)


def head(d, tip, way, width, fill):
    x, y = tip
    s = width * 2.2
    if way == "right":
        d.polygon([(x - s, y - s), (x - s, y + s), (x, y)], fill=fill)
    elif way == "up":
        d.polygon([(x - s, y + s), (x + s, y + s), (x, y)], fill=fill)


def elbow(d, points, way, width, fill):
    """A line through the given corners, with an arrowhead on the last leg."""
    tip = points[-1]
    back = width * 2.2
    stop = (tip[0] - back, tip[1]) if way == "right" else (tip[0], tip[1] + back)
    d.line([p for xy in points[:-1] + [stop] for p in xy], fill=fill, width=width, joint="curve")
    head(d, tip, way, width, fill)


def box(d, x, y, w, h, fill, grid):
    d.rounded_rectangle([x, y, x + w, y + h], radius=18, fill=fill)
    if grid:
        d.line([x + 14, y + h * 0.42, x + w - 14, y + h * 0.42], fill=GRID, width=7)
        d.line([x + w / 3, y + 14, x + w / 3, y + h * 0.42], fill=GRID, width=7)
        d.line([x + w * 2 / 3, y + 14, x + w * 2 / 3, y + h * 0.42], fill=GRID, width=7)


img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([64, 64, 960, 960], radius=200, fill=BLUE)

W, H, TOP, GAP = 176, 136, 372, 108
XS = [140, 424, 708]
for x in XS:
    box(d, x, TOP, W, H, WHITE, True)
for x in XS[:-1]:
    elbow(d, [(x + W + 10, TOP + H / 2), (x + W + GAP - 10, TOP + H / 2)], "right", 22, WHITE)

SX, SY, SW, SH = 424, 644, 176, 104
box(d, SX, SY, SW, SH, PALE, False)
mid = SY + SH / 2
elbow(d, [(XS[0] + W / 2, TOP + H + 10), (XS[0] + W / 2, mid), (SX - 10, mid)], "right", 11, PALE)
elbow(d, [(SX + SW + 10, mid), (XS[2] + W / 2, mid), (XS[2] + W / 2, TOP + H + 10)], "up", 11, PALE)

img.save("build/icon.png")
print("wrote build/icon.png")
