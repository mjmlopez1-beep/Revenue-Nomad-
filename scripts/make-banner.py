#!/usr/bin/env python3
"""Build the mountain banner images in public/brand/ from the owner's two source pictures.

Usage:
  python3 scripts/make-banner.py <banner.webp> <logo.webp> [out_dir]

  banner.webp  the mountain banner with "Merlin" lettered on it (2000 x 576, rounded white corners)
  logo.webp    the clean Merlin logo on white (2000 x 667: arch mark + "Merlin", then
               "A REVENUE NOMAD PRODUCT" underneath, which is not used)
  out_dir      default public/brand

Makes:
  merlin-banner-onboarding.webp       2000 x 470  the welcome card in onboarding (1000 CSS px, 2x)
  merlin-banner-onboarding-1000.webp  1000 x 235  the same for phones
  merlin-banner-email.png             1120 x 256  the header of every email (560 px wide, 2x)
  merlin-og-banner.png                1200 x 630  the link preview (OpenGraph / Twitter card)

How: the lettering baked into the photo is soft (the picture was upscaled), so it is painted out
(OpenCV inpaint over the white letters and their dark rim), the photo is upscaled with Lanczos and
a light unsharp mask, and a pure-white logo cut from the clean logo's own anti-aliasing is laid
where the old lettering was: the arch over the old arch, the word over the old word. The logo is
always resampled down from the 2000 px source, so its edges stay sharp at every size.
The link preview is drawn by Chromium (Playwright) from HTML with the app's own Schibsted Grotesk
font file, over the clean banner.

Needs: Pillow, numpy, opencv-python-headless (pip install pillow numpy opencv-python-headless),
node with Playwright (resolved from NODE_PATH or node_modules) for the link preview.
"""
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The photo inside the banner's rounded white frame, in source pixels (x0, y0, x1, y1).
PHOTO = (84, 6, 1914, 558)
# Where the baked lettering sits in that photo (x0, y0, x1, y1, photo pixels): the arch and the word.
BAKED_ARCH = (375, 122, 711, 418)
BAKED_WORD = (782, 162, 1465, 349)
# The logo row of the clean logo: everything above "A REVENUE NOMAD PRODUCT".
LOGO_ROW = 490


def clean_photo(banner: Image.Image) -> np.ndarray:
    """The banner photo with the baked lettering painted out (RGB uint8, photo pixels)."""
    photo = np.asarray(banner.convert("RGB"))[PHOTO[1] : PHOTO[3], PHOTO[0] : PHOTO[2]].copy()
    lo = photo.min(2).astype(np.int16)
    hi = photo.max(2).astype(np.int16)
    # The lettering is near-white and grey; the haze and sky around it are warmer or darker.
    white = (lo > 222) & ((hi - lo) < 25)
    letters = np.zeros(white.shape, bool)
    x0 = BAKED_ARCH[0] - 40
    x1 = BAKED_WORD[2] + 40
    y0 = min(BAKED_ARCH[1], BAKED_WORD[1]) - 30
    y1 = max(BAKED_ARCH[3], BAKED_WORD[3]) + 30
    letters[y0:y1, x0:x1] = white[y0:y1, x0:x1]
    # Grow it over the soft edge and the dark rim the lettering carries.
    mask = cv2.dilate(letters.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    bgr = cv2.cvtColor(photo, cv2.COLOR_RGB2BGR)
    out = cv2.inpaint(bgr, mask, 12, cv2.INPAINT_TELEA).astype(np.float32)
    # Inpainting leaves streaks and hard seams: soften the filled area and feather it into the photo.
    soft = cv2.GaussianBlur(out, (0, 0), 7)
    w = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 6)[..., None]
    out = out * (1 - w) + soft * w
    return cv2.cvtColor(np.clip(out + 0.5, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB)


def white_logo_alpha(logo: Image.Image) -> np.ndarray:
    """Coverage (0..1) of the arch mark and "Merlin" in the clean logo, from its anti-aliasing."""
    rgb = np.asarray(logo.convert("RGB")).astype(np.float32)[:LOGO_ROW]
    bg = np.median(rgb[:20].reshape(-1, 3), axis=0)
    dist = np.abs(rgb - bg).max(2)
    # Each pixel against the solid color next to it: dark pine, lime and orange all become 1.
    solid = cv2.dilate(dist, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    alpha = np.clip(dist / np.maximum(solid, 1), 0, 1)
    alpha[(dist < 6) | (solid < 60)] = 0
    alpha = np.clip((alpha - 0.06) / 0.86, 0, 1)  # compression speckle inside the letters
    # Closes the hairline where the two strokes of the arch overlap.
    return cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))


def bbox(a: np.ndarray, x0: int, x1: int):
    ys, xs = np.nonzero(a[:, x0:x1] > 0.5)
    return xs.min() + x0, ys.min(), xs.max() + x0 + 1, ys.max() + 1


def placements(alpha: np.ndarray):
    """(logo box, photo box) pairs: the arch onto the old arch, the word onto the old word."""
    w = alpha.shape[1]
    gap = int(w * 0.33)  # the arch ends about a third of the way across; the word starts after
    arch = bbox(alpha, 0, gap)
    word = bbox(alpha, gap, w)
    out = []
    for src, dst in ((arch, BAKED_ARCH), (word, BAKED_WORD)):
        sw, sh = src[2] - src[0], src[3] - src[1]
        # One scale per piece (no squashing), fitted to the old piece's height and centered on it.
        k = (dst[3] - dst[1]) / sh
        cx = (dst[0] + dst[2]) / 2
        out.append((src, (cx - sw * k / 2, dst[3] - sh * k, cx + sw * k / 2, dst[3])))
    return out


def compose(photo: np.ndarray, alpha: np.ndarray, scale: float, crop):
    """The banner at `scale` output pixels per photo pixel, cut to `crop` (photo pixels x0,y0,x1,y1)."""
    cx0, cy0, cx1, cy1 = crop
    W = round((cx1 - cx0) * scale)
    H = round((cy1 - cy0) * scale)
    img = Image.fromarray(photo).resize((W, H), Image.LANCZOS, box=(cx0, cy0, cx1, cy1))
    if scale > 1:
        img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=45, threshold=2))
    base = np.asarray(img).astype(np.float32)
    cover = np.zeros((H, W), np.float32)
    A = Image.fromarray(alpha.astype(np.float32), "F")
    for src, dst in placements(alpha):
        # Output pixels the piece lands on, and the exact logo area behind them (sub-pixel).
        X0 = int(np.floor((dst[0] - cx0) * scale)) - 2
        Y0 = int(np.floor((dst[1] - cy0) * scale)) - 2
        X1 = int(np.ceil((dst[2] - cx0) * scale)) + 2
        Y1 = int(np.ceil((dst[3] - cy0) * scale)) + 2
        k = (dst[2] - dst[0]) / (src[2] - src[0])  # photo px per logo px
        to_logo = lambda X, Y: (src[0] + ((X / scale + cx0) - dst[0]) / k, src[1] + ((Y / scale + cy0) - dst[1]) / k)
        sx0, sy0 = to_logo(X0, Y0)
        sx1, sy1 = to_logo(X1, Y1)
        piece = np.asarray(A.resize((X1 - X0, Y1 - Y0), Image.LANCZOS, box=(sx0, sy0, sx1, sy1)))
        piece = np.clip(piece, 0, 1)
        # Clip to the canvas.
        ox0, oy0 = max(X0, 0), max(Y0, 0)
        ox1, oy1 = min(X1, W), min(Y1, H)
        if ox0 >= ox1 or oy0 >= oy1:
            continue
        sub = piece[oy0 - Y0 : oy1 - Y0, ox0 - X0 : ox1 - X0]
        cover[oy0:oy1, ox0:ox1] = np.maximum(cover[oy0:oy1, ox0:ox1], sub)
    # A faint, wide shade under the logo so white reads on the bright haze.
    glow = cv2.GaussianBlur(cover, (0, 0), 14 * scale) * 0.22
    base = base * (1 - glow[..., None]) + np.array([4, 30, 22], np.float32) * glow[..., None]
    out = base * (1 - cover[..., None]) + 255 * cover[..., None]
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def cut(photo_w: int, aspect: float, top: float):
    """A full-width band of the photo with this width/height, `top` photo pixels from the top."""
    h = photo_w / aspect
    return (0, top, photo_w, top + h)


OG_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:SG;src:url(sg.woff2) format('woff2');font-weight:100 900}
html,body{margin:0}
.og{position:relative;width:1200px;height:630px;overflow:hidden;background:#073f2f;font-family:SG,sans-serif}
.bg{position:absolute;inset:0;background:url(bg.png) center top/cover}
.ban{position:absolute;left:-50px;top:40px;width:1300px;height:392px;
 -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 70px,#000 300px,transparent 392px)}
.shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(7,63,47,0) 0%,rgba(7,63,47,0) 52%,rgba(7,63,47,.82) 74%,rgba(7,63,47,.96) 100%)}
.tag{position:absolute;left:0;right:0;bottom:62px;text-align:center;color:#fff}
.tag h1{margin:0;font-size:38px;line-height:46px;font-weight:750;letter-spacing:-.02em;text-shadow:0 1px 12px rgba(0,0,0,.25)}
.tag p{margin:14px 0 0;font-size:17px;letter-spacing:.24em;font-weight:600;color:#cfe3d8;text-transform:uppercase}
</style></head><body><div class="og"><div class="bg"></div><img class="ban" src="ban.png"><div class="shade"></div>
<div class="tag"><h1>Find your next client and the fractional<br>who can introduce you</h1><p>A Revenue Nomad product</p></div></div></body></html>"""

SHOT_JS = """
const { createRequire } = require('node:module');
let pw;
try { pw = require('playwright'); } catch { pw = createRequire(process.cwd() + '/')('playwright'); }
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto('file://' + process.argv[1]);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: process.argv[2] });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
"""


def og(photo: np.ndarray, alpha: np.ndarray, out_png: str):
    pw, ph = photo.shape[1], photo.shape[0]
    tmp = tempfile.mkdtemp(prefix="og-")
    try:
        compose(photo, alpha, 1300 / pw, (0, 0, pw, ph)).save(os.path.join(tmp, "ban.png"))
        # Behind it (only the sky above the banner and the corners show): the clean photo, blurred.
        Image.fromarray(photo).resize((1300, round(ph * 1300 / pw)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(18)).save(os.path.join(tmp, "bg.png"))
        font = os.path.join(ROOT, "node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2")
        shutil.copy(font, os.path.join(tmp, "sg.woff2"))
        html = os.path.join(tmp, "og.html")
        with open(html, "w") as f:
            f.write(OG_HTML)
        shot = os.path.join(tmp, "shot.png")
        subprocess.run(["node", "-e", SHOT_JS, html, shot], check=True, cwd=ROOT)
        Image.open(shot).convert("RGB").save(out_png, optimize=True)
        if os.path.getsize(out_png) > 600_000:
            raise SystemExit(f"{out_png} is over 600 KB")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    banner = Image.open(sys.argv[1])
    logo = Image.open(sys.argv[2])
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, "public/brand")
    if banner.size != (2000, 576):
        raise SystemExit(f"expected the 2000 x 576 banner, got {banner.size}")
    os.makedirs(out, exist_ok=True)
    photo = clean_photo(banner)
    alpha = white_logo_alpha(logo)
    pw = photo.shape[1]

    # Onboarding: 2000 x 470, the band the approved mockup shows (a little below the top).
    ob = compose(photo, alpha, 2000 / pw, cut(pw, 2000 / 470, 58))
    ob.save(os.path.join(out, "merlin-banner-onboarding.webp"), quality=82, method=6)
    ob.resize((1000, 235), Image.LANCZOS).save(os.path.join(out, "merlin-banner-onboarding-1000.webp"), quality=82, method=6)

    # Email: 1120 x 256.
    em = compose(photo, alpha, 1120 / pw, cut(pw, 1120 / 256, 65.4))
    em.save(os.path.join(out, "merlin-banner-email.png"), optimize=True)

    og(photo, alpha, os.path.join(out, "merlin-og-banner.png"))
    for n in ("merlin-banner-onboarding.webp", "merlin-banner-onboarding-1000.webp", "merlin-banner-email.png", "merlin-og-banner.png"):
        p = os.path.join(out, n)
        print(f"{n:38} {Image.open(p).size[0]} x {Image.open(p).size[1]}  {os.path.getsize(p):>8,} bytes")


if __name__ == "__main__":
    main()
