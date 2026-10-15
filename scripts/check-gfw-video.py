# Run: python3 scripts/check-gfw-video.py [optional MP4 path]
# Guard against reintroducing the undersized timeline export, without third-party dependencies.
from pathlib import Path
import re
import struct
import sys


def atoms(data, start=0, end=None):
    end = len(data) if end is None else end
    while start + 8 <= end:
        size, kind = struct.unpack_from('>I4s', data, start)
        header = 8
        if size == 1:
            size = struct.unpack_from('>Q', data, start + 8)[0]
            header = 16
        elif size == 0:
            size = end - start
        assert size >= header and start + size <= end
        yield kind, start, start + header, start + size
        start += size


def child(data, parent, kind):
    return next(atom for atom in atoms(data, parent[2], parent[3]) if atom[0] == kind)


root = Path(__file__).resolve().parents[1]
projects = (root / 'src/data/projects.ts').read_text()
vessel = re.search(r'\n  vessel: \{(.*?)\n  \},', projects, re.S).group(1)
mp4 = re.search(r'mp4:\s*"([^"]+)"', vessel).group(1)
poster = re.search(r'image:\s*"([^"]+)"', vessel).group(1)
assert (root / 'public' / poster.lstrip('/')).is_file(), 'The selected poster must exist'
path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'public' / mp4.lstrip('/')
data = path.read_bytes()
root = list(atoms(data))
moov = next(atom for atom in root if atom[0] == b'moov')
assert moov[1] < next(atom[1] for atom in root if atom[0] == b'mdat'), 'MP4 must support fast start'
header = child(data, moov, b'mvhd')[2]
assert data[header] == 0
scale, duration = struct.unpack_from('>II', data, header + 12)
assert duration / scale == 19, 'Keep the requested 19-second cut'
tracks = []
for track in atoms(data, moov[2], moov[3]):
    if track[0] != b'trak':
        continue
    mdia = child(data, track, b'mdia')
    hdlr = child(data, mdia, b'hdlr')[2]
    kind = data[hdlr + 8:hdlr + 12]
    tracks.append(kind)
    if kind != b'vide':
        continue
    tkhd = child(data, track, b'tkhd')
    width, height = (n / 65536 for n in struct.unpack_from('>II', data, tkhd[3] - 8))
    assert width >= 1920, f'Video is too small for the timeline: {width}×{height}'
    assert width / height == 2, 'Maintain the card aspect ratio'
    stbl = child(data, child(data, mdia, b'minf'), b'stbl')
    stsd = child(data, stbl, b'stsd')[2]
    assert data[stsd + 12:stsd + 16] == b'avc1', 'Use broadly compatible H.264'
    stts = child(data, stbl, b'stts')[2]
    entries = struct.unpack_from('>I', data, stts + 4)[0]
    frames = sum(struct.unpack_from('>I', data, stts + 8 + i * 8)[0] for i in range(entries))
    assert frames == 570, f'Expected 19 seconds at 30 fps, received {frames} frames'
assert tracks == [b'vide'], 'Strip audio and unrelated tracks'
assert len(data) <= 10_000_000, 'Keep the web export under 10 MB'
print(f'PASS: {path}: {width:g}×{height:g}, 19 seconds, 30 fps, H.264, silent, fast-start, {len(data):,} bytes')
