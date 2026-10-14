#!/usr/bin/env python3
"""Bake a square heightmap of Mount Etna from Mapterhorn terrain tiles.

Output:
  public/terrain/etna.bin   uint16 little-endian, row-major, north at row 0, west at col 0,
                            values are metres above sea level (sea clamped to 0)
  public/terrain/etna.json  metadata (size, extent, min/max elevation)

Usage: python3 -I scripts/bake-etna.py [tile-cache-dir]
Tiles: Mapterhorn (https://mapterhorn.com), Terrarium-encoded 512 px WebP tiles, no API key needed.
Around Etna they are built from the Regione Siciliana 2 m DTM (ATA flights 2012-13, CC BY 4.0) and INGV's
TINITALY 10 m (CC BY 4.0) on a Copernicus GLO-30 base. The Mapzen/AWS tiles used before only had ~25-30 m
data here (EU-DEM / SRTM).
"""
import io, json, math, os, struct, sys, urllib.request
from PIL import Image, ImageMath

SUMMIT_LON, SUMMIT_LAT = 14.9934, 37.7510   # Etna summit craters
SIDE_KM = 80.0                              # plate side length in km (the view only shows the middle; the screen must fit inside the plate)
# The plate is rotated so that its north-east diagonal points along this compass bearing.
# The camera sits at the plate's south-west corner, so it looks along this bearing: 120° puts the
# camera to the WNW of the summit and sends the boulder over the top into the Valle del Bove.
FACING_BEARING_DEG = 120.0
ZOOM = 12                                   # with 512 px tiles ≈ 15 m/px at Etna's latitude, before the final resample
OUT_SIZE = 1024                             # 80 km / 1024 ≈ 78 m per sample (2 MB); the mesh samples it 1:1
TILE_SIZE = 512
TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"

cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp/etna/mapterhorn-tiles"
os.makedirs(cache, exist_ok=True)

def lonlat_to_px(lon, lat, z):
    n = TILE_SIZE * 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    return x, y

def tile(z, x, y):
    path = os.path.join(cache, f"{z}_{x}_{y}.webp")
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        for attempt in range(4):
            try:
                req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y), headers={"User-Agent": "endlessstudio bake-etna"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                break
            except Exception as e:  # noqa: BLE001 - retry any network hiccup
                if attempt == 3:
                    raise
                print(f"retry {z}/{x}/{y}: {e}")
        tmp = path + ".part"
        open(tmp, "wb").write(data)
        os.replace(tmp, path)
    return Image.open(path).convert("RGB")

m_per_px = 2 * math.pi * 6378137 * math.cos(math.radians(SUMMIT_LAT)) / (TILE_SIZE * 2 ** ZOOM)
side_px = int(round(SIDE_KM * 1000 / m_per_px))
# fetch a square big enough to contain the rotated plate (its corners reach side/sqrt2 from the centre)
fetch_px = int(math.ceil(side_px * math.sqrt(2))) + 8
cx, cy = lonlat_to_px(SUMMIT_LON, SUMMIT_LAT, ZOOM)
fx0, fy0 = int(round(cx - fetch_px / 2)), int(round(cy - fetch_px / 2))
fx1, fy1 = fx0 + fetch_px, fy0 + fetch_px
tx0, ty0, tx1, ty1 = fx0 // TILE_SIZE, fy0 // TILE_SIZE, (fx1 - 1) // TILE_SIZE, (fy1 - 1) // TILE_SIZE
print(f"{m_per_px:.1f} m/px, plate {side_px}px, fetch {fetch_px}px, tiles x{tx0}-{tx1} y{ty0}-{ty1} ({(tx1-tx0+1)*(ty1-ty0+1)} tiles)")

mosaic = Image.new("RGB", ((tx1 - tx0 + 1) * TILE_SIZE, (ty1 - ty0 + 1) * TILE_SIZE))
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        mosaic.paste(tile(ZOOM, tx, ty), ((tx - tx0) * TILE_SIZE, (ty - ty0) * TILE_SIZE))

# decode terrarium -> metres as a float image BEFORE any resampling (the RGB encoding must not be interpolated)
r_, g_, b_ = [c.convert("F") for c in mosaic.split()]
elev = ImageMath.eval("max((a * 256 + b + c / 256.0) - 32768.0, 0.0)", a=r_, b=g_, c=b_)
# rotate about the summit so that geographic bearing FACING_BEARING_DEG ends up along the plate's NE diagonal (45°)
rot_deg = FACING_BEARING_DEG - 45.0  # PIL rotates counter-clockwise, which moves bearings down by rot_deg
elev = elev.rotate(rot_deg, resample=Image.BICUBIC, center=(cx - tx0 * TILE_SIZE, cy - ty0 * TILE_SIZE))
x0, y0 = int(round(cx - tx0 * TILE_SIZE - side_px / 2)), int(round(cy - ty0 * TILE_SIZE - side_px / 2))
elev = elev.crop((x0, y0, x0 + side_px, y0 + side_px))
elev = elev.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
ep = elev.load()
vals = [max(0, min(65535, int(round(ep[i, j])))) for j in range(OUT_SIZE) for i in range(OUT_SIZE)]
mn, mx = min(vals), max(vals)
open("public/terrain/etna.bin", "wb").write(struct.pack(f"<{len(vals)}H", *vals))
meta = {
    "size": OUT_SIZE,
    "sideKm": SIDE_KM,
    "metersPerSample": SIDE_KM * 1000 / OUT_SIZE,
    "minElevation": mn,
    "maxElevation": mx,
    "center": [SUMMIT_LON, SUMMIT_LAT],
    "facingBearingDeg": FACING_BEARING_DEG,
    "orientation": f"plate rotated: its north-east diagonal points along bearing {FACING_BEARING_DEG}; row 0 = plate north, col 0 = plate west",
    "source": "Mapterhorn terrain tiles (Regione Siciliana 2 m DTM, INGV TINITALY 10 m, Copernicus GLO-30), Terrarium encoding, zoom " + str(ZOOM),
}
json.dump(meta, open("public/terrain/etna.json", "w"), indent=2)
print(json.dumps(meta, indent=2))
# preview png for eyeballing
prev = elev.point(lambda v: v / max(mx, 1) * 255).convert("L")
prev.save(os.path.join(cache, "preview.png"))
