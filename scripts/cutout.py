"""Cut the characters out of their black backdrops, for the hangout scene.

The anime art sits on flat near-black. We clear the backdrop by growing inward from the image
edges through near-black pixels only, so dark hair inside the outline survives. Then the edge
is softened so the cut-out sits naturally on any scene.

    python scripts/cutout.py            # every public/art/anime/*.jpg -> public/art/cutout/*.png
"""

import glob
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "public", "art", "anime")
OUT = os.path.join(ROOT, "public", "art", "cutout")


def cut(path, threshold=22, feather=2.0):
    img = Image.open(path).convert("RGB")
    a = np.asarray(img).astype(np.int16)
    # "Backdrop-like": very dark and colourless.
    bright = a.max(axis=2)
    spread = a.max(axis=2) - a.min(axis=2)
    dark = (bright <= threshold) & (spread <= 14)
    # Only the dark region that touches the border is backdrop.
    labels, _ = ndimage.label(dark)
    edge = np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]))
    edge = edge[edge != 0]
    backdrop = np.isin(labels, edge)
    # Close tiny gaps, then soften the edge.
    backdrop = ndimage.binary_opening(backdrop, iterations=1)
    alpha = (~backdrop).astype(np.float32)
    alpha = ndimage.gaussian_filter(alpha, feather)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    rgba = np.dstack([np.asarray(img), (alpha * 255).astype(np.uint8)])
    out = Image.fromarray(rgba, "RGBA")
    box = out.getbbox()
    if box:
        out = out.crop(box)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC, "*-still.jpg")) + glob.glob(os.path.join(SRC, "*-open.jpg")) + glob.glob(os.path.join(SRC, "*-chibi.jpg")))
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        # still and open must share one crop so the mouth lines up; crop them together below
        out = cut(f)
        out.save(os.path.join(OUT, name + ".png"), optimize=True)
        print(name, out.size)


def paired():
    """Still and open share a crop box so lip-sync frames stay aligned."""
    os.makedirs(OUT, exist_ok=True)
    for still in sorted(glob.glob(os.path.join(SRC, "*-still.jpg"))):
        who = os.path.basename(still)[: -len("-still.jpg")]
        opened = os.path.join(SRC, who + "-open.jpg")
        frames = [still] + ([opened] if os.path.exists(opened) else [])
        cuts = []
        for f in frames:
            img = Image.open(f).convert("RGB")
            full = cut_full(img, bust=True)
            cuts.append(full)
        box = None
        for c in cuts:
            b = c.getbbox()
            if b:
                box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        for f, c in zip(frames, cuts):
            name = os.path.splitext(os.path.basename(f))[0]
            c.crop(box).save(os.path.join(OUT, name + ".png"), optimize=True)
            print(name, box)
    for chibi in sorted(glob.glob(os.path.join(SRC, "*-chibi.jpg"))):
        name = os.path.splitext(os.path.basename(chibi))[0]
        out = cut_full(Image.open(chibi).convert("RGB"))
        out.crop(out.getbbox()).save(os.path.join(OUT, name + ".png"), optimize=True)
        print(name)


def cut_full(img, feather=1.4, bust=False):
    """Backdrop = flat, dark, border-connected pixels near this image's own border colour.

    The line art is darker than most backdrops and has strong edges, so it walls the fill off
    from dark hair and clothes inside the outline."""
    a = np.asarray(img).astype(np.float32)
    lum = a.max(axis=2)
    spread = a.max(axis=2) - a.min(axis=2)
    border = np.concatenate([lum[0], lum[-1], lum[:, 0], lum[:, -1]])
    level = float(np.percentile(border, 97))
    grad = np.hypot(ndimage.sobel(ndimage.gaussian_filter(lum, 1.0), 0), ndimage.sobel(ndimage.gaussian_filter(lum, 1.0), 1))
    flat = (lum <= level + 8) & (lum >= max(0.0, float(np.percentile(border, 1)) - 6)) & (spread <= 16) & (grad < 18)
    labels, _ = ndimage.label(flat)
    if bust:
        # A bust runs off the bottom of the frame: only the top and upper sides are surely backdrop.
        upper = int(labels.shape[0] * 0.5)
        seeds = np.concatenate([labels[0, :], labels[:upper, 0], labels[:upper, -1]])
    else:
        seeds = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    edge = np.unique(seeds)
    edge = edge[edge != 0]
    backdrop = np.isin(labels, edge)
    # The fill stops a pixel or two short of the outline; reach it, then keep the figure solid.
    backdrop = ndimage.binary_dilation(backdrop, iterations=1) & (lum <= level + 14)
    figure = ndimage.binary_fill_holes(~backdrop)
    figure = ndimage.binary_opening(figure, iterations=2)
    alpha = np.clip((ndimage.gaussian_filter(figure.astype(np.float32), feather) - 0.2) / 0.6, 0, 1)
    if bust:
        h = alpha.shape[0]
        fade = np.clip((h - np.arange(h)) / (h * 0.14), 0, 1)[:, None]
        alpha = alpha * fade
    return Image.fromarray(np.dstack([np.asarray(img), (alpha * 255).astype(np.uint8)]), "RGBA")


if __name__ == "__main__":
    paired() if "--single" not in sys.argv else main()
