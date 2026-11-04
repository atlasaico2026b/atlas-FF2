"""
Extract the nine node-fitting renders from the supplied catalogue sheet.

The sheet is a JPEG: the "transparent" background is a light checkerboard
(244/252 grey) and every cell carries a navy caption banner. The grid is NOT
uniform, so cells are found with connected-component labelling instead of
arithmetic: the sheet yields exactly 18 blobs — 9 fittings + 9 captions.

For every fitting the checkerboard is turned into a real alpha channel with a
graded matte (so antialiased edges survive), caption navy is dropped, and the
white fringe left by the background is removed by un-compositing.  Output is a
tight-cropped PNG whose longest side is OUT_MAX px.

    python3 scripts/extract-point-icons.py
"""
from PIL import Image
import numpy as np
from scipy import ndimage
import os

SRC = '../files/C1.jpg'
OUT = 'public/point-icons'
REVIEW = '.point-icons-review'
OUT_MAX = 200
SUFFIX = '_v3'

# Fitting ids are keyed by the sheet cell they occupy (row, col).
CELLS = {
    (1, 1): 'water_monitor',
    (1, 2): 'foam_monitor',
    (1, 3): 'water_foam_monitor',
    (1, 4): 'inline_inductor',
    (2, 1): 'hydrant_single',
    (2, 2): 'hydrant_double',
    (2, 3): 'butterfly_valve',
    (2, 4): 'inline_valve',
    (3, 4): 'blind_flange',
}


def load():
    im = Image.open(SRC).convert('RGB')
    return np.asarray(im).astype(np.float64)


def foreground_mask(a):
    """Checkerboard is near-neutral and very light; fittings are chromatic or dark."""
    lum = a.mean(2)
    chroma = a.max(2) - a.min(2)
    mask = (lum < 220) | (chroma > 18)
    mask = ndimage.binary_closing(mask, np.ones((5, 5), bool))
    return ndimage.binary_opening(mask, np.ones((3, 3), bool))


def graded_alpha(patch):
    """Soft matte: 1 inside the artwork, feathering to 0 across the background."""
    lum = patch.mean(2)
    chroma = patch.max(2) - patch.min(2)
    a_lum = np.clip((222.0 - lum) / 16.0, 0, 1)
    a_chr = np.clip((chroma - 9.0) / 12.0, 0, 1)
    a = np.maximum(a_lum, a_chr)
    a[a < 0.10] = 0.0
    return a


def unfringe(patch, alpha, bg=252.0):
    """Undo the white compositing on partially transparent edge pixels."""
    a = alpha[..., None]
    safe = np.clip(a, 0.06, 1.0)
    fg = (patch - (1.0 - safe) * bg) / safe
    edge = (alpha > 0.05) & (alpha < 0.98)
    out = patch.copy()
    out[edge] = np.clip(fg[edge], 0, 255)
    return out


def is_caption(px, h, w):
    """A caption banner is a wide, short, dark blue rectangle.

    Colour alone cannot separate it: the inline valve is a saturated blue
    (b ~ 183) and the banner a navy (b ~ 110), but both are blue-dominant, so
    the shape test does the work and the colour test only confirms it.
    """
    r, g, b = px
    return h < 60 and w > 180 and b - r > 30 and b > g > r and px.mean() < 175


def resize_premultiplied(rgba, size):
    """Resize in premultiplied space so transparent pixels cannot bleed their colour."""
    a = rgba[..., 3:4] / 255.0
    pre = np.concatenate([rgba[..., :3] * a, rgba[..., 3:4]], axis=2)
    img = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), 'RGBA').resize(
        size, Image.Resampling.LANCZOS)
    p = np.asarray(img).astype(np.float64)
    pa = np.clip(p[..., 3:4] / 255.0, 1e-6, 1.0)
    rgb = np.clip(p[..., :3] / pa, 0, 255)
    alpha = p[..., 3:4]
    return np.concatenate([rgb, alpha], axis=2)


def main():
    a = load()
    lab, n = ndimage.label(foreground_mask(a))
    objs = ndimage.find_objects(lab)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(REVIEW, exist_ok=True)

    captions, bodies = [], []
    for i, sl in enumerate(objs, 1):
        area = int((lab[sl] == i).sum())
        if area < 300:
            continue
        ys, xs = sl
        h, w = ys.stop - ys.start, xs.stop - xs.start
        px = a[sl][lab[sl] == i]
        mean = px.mean(0)
        (captions if is_caption(mean, h, w) else bodies).append(
            (i, ys.start, ys.stop, xs.start, xs.stop, area))

    print(f'blobs: {n}   fittings: {len(bodies)}   captions: {len(captions)}')
    assert len(bodies) == 9, f'expected 9 fittings, got {len(bodies)}'
    assert len(captions) == 9, f'expected 9 captions, got {len(captions)}'

    # Caption pixels, taken from the banner blobs themselves. Masking by shape
    # instead of by colour is what keeps the blue inline valve intact.
    caption_mask = np.isin(lab, [c[0] for c in captions])
    caption_mask = ndimage.binary_dilation(caption_mask, np.ones((3, 3), bool))

    placed = {}
    for i, y0, y1, x0, x1, area in bodies:
        row = 1 if y0 < 340 else (2 if y0 < 715 else 3)
        col = 1 if x0 < 400 else (2 if x0 < 760 else (3 if x0 < 1150 else 4))
        placed[(row, col)] = (i, y0, y1, x0, x1)
    assert set(placed) == set(CELLS), f'cell mismatch: {sorted(placed)}'

    made = []
    for cell, ident in sorted(CELLS.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        i, y0, y1, x0, x1 = placed[cell]
        pad = 6
        Y0, Y1 = max(0, y0 - pad), min(a.shape[0], y1 + pad)
        X0, X1 = max(0, x0 - pad), min(a.shape[1], x1 + pad)
        patch = a[Y0:Y1, X0:X1]
        member = lab[Y0:Y1, X0:X1] == i

        alpha = graded_alpha(patch)
        # Keep only the artwork itself (plus its antialiased rim).
        keep = ndimage.binary_dilation(member, np.ones((5, 5), bool))
        alpha = alpha * keep
        # A banner never belongs to the artwork, whatever its colour.
        alpha = np.where(caption_mask[Y0:Y1, X0:X1], 0.0, alpha)

        rgb = unfringe(patch, alpha)
        rgba = np.concatenate([rgb, (alpha * 255)[..., None]], axis=2)

        ay, ax = np.where(alpha > 0.06)
        rgba = rgba[ay.min():ay.max() + 1, ax.min():ax.max() + 1]

        ch, cw = rgba.shape[:2]
        scale = OUT_MAX / max(ch, cw)
        nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
        rgba = resize_premultiplied(rgba, (nw, nh))

        # A faint remaining rim is invisible on the map but visible as a halo on
        # dark ground, so knock out anything below 4% alpha.
        rgba[..., 3][rgba[..., 3] < 10] = 0

        out = rgba.astype(np.uint8)
        path = f'{OUT}/{ident}{SUFFIX}.png'
        Image.fromarray(out, 'RGBA').save(path)
        made.append((ident, nw, nh))
        print(f'  {ident:20s} src {cw:3d}x{ch:3d} -> {nw:3d}x{nh:3d}  aspect {cw/ch:.3f}')

    # Contact sheet on two backgrounds so halos and leftovers are obvious.
    pad, cellw, cellh = 16, OUT_MAX + 24, OUT_MAX + 24
    for name, bg in (('light', (255, 255, 255)), ('dark', (32, 32, 36))):
        sheet = Image.new('RGB', (cellw * 5, cellh * 2), bg)
        for k, (ident, nw, nh) in enumerate(made):
            ic = Image.open(f'{OUT}/{ident}{SUFFIX}.png')
            sheet.paste(ic, ((k % 5) * cellw + (cellw - nw) // 2,
                             (k // 5) * cellh + (cellh - nh) // 2), ic)
        sheet.save(f'{REVIEW}/sheet-{name}.png')

    print('\n' + '\n'.join(f"  {i}: {nw}x{nh}" for i, nw, nh in made))


if __name__ == '__main__':
    main()
