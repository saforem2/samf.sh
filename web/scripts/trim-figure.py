#!/usr/bin/env python3
"""Trim the uniform bottom/right margin off a screenshot.

Perfetto's timeline canvas is always full-viewport height, so a DOM-measured
crop cannot tell where the last track row ends. Measuring the pixels can:
scan up from the bottom while each row is a single flat colour, and cut there.
"""
import os
import sys
import tempfile
from PIL import Image

def flat(px, w, y, tol=8, max_outliers=12):
    """True if row y is one flat colour apart from a few vertical rules.

    Perfetto draws a gutter divider and faint gridlines straight down the
    empty area below the last track, so an exact flat test never fires.
    Allow a small number of differing columns."""
    r0, g0, b0 = px[w // 2, y][:3]
    bad = 0
    for x in range(0, w, 2):
        r, g, b = px[x, y][:3]
        if abs(r - r0) > tol or abs(g - g0) > tol or abs(b - b0) > tol:
            bad += 1
            if bad > max_outliers:
                return False
    return True

def main(path, pad=10):
    src = Image.open(path)
    fmt = src.format
    im = src.convert("RGB")
    w, h = im.size
    px = im.load()
    y = h - 1
    while y > h // 4 and flat(px, w, y):
        y -= 1
    bottom = min(h, y + 1 + pad)
    if bottom >= h:
        print(f"{path}: nothing to trim ({w}x{h})")
        return
    # Save beside the original and rename over it, so a failed save cannot
    # truncate the only copy.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)))
    os.close(fd)
    try:
        im.crop((0, 0, w, bottom)).save(tmp, format=fmt)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise
    print(f"{path}: {w}x{h} -> {w}x{bottom} (trimmed {h - bottom}px)")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        main(p)
