/**
 * Bakes the landing's stone into the browser-tab icon: public/favicon.svg (flat-shaded facets as polygons) and
 * public/favicon.ico (16/32/48 px, rasterised here, for browsers without SVG favicons).
 *
 * Same boulder as the scene — the seeded jittered icosahedron of stoneGeometry() — seen from the scene's camera and
 * shaded with the marble shader's formula (half-Lambert pink + pale rim). Keep STONE in sync with CONFIG.stone in
 * src/scripts/sisyphus.ts (that module can't be imported from Node as is).
 *
 *   node scripts/bake-favicon.mjs [preview.png]     (run from the project root; the optional png is a 256 px preview)
 */
import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import * as THREE from "three";

const STONE = {
  facets: { detail: 1, jitter: 0.22, seed: 7, stretch: [1.12, 0.9, 1.0] },
  color: [0.771, 0.446, 1.0],
  glow: [0.886, 1.0, 0.869],
  glowIntensity: 0.344,
};
const CAMERA = { pitchDeg: 36, yawDeg: -45 };
const POSE = new THREE.Euler(0.5, 0.9, 0.2); // the stone's own rotation: a pose that shows a good spread of facets
const BOX = 64; // svg viewBox side
const PAD = 0.03; // margin around the stone, fraction of the box
const ICO_SIZES = [16, 32, 48];
const SUPERSAMPLE = 8; // per axis, for the rasterised sizes

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** stoneGeometry() from sisyphus.ts, verbatim apart from the types. */
function stoneGeometry(r) {
  const { detail, jitter, seed, stretch } = STONE.facets;
  const rnd = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const pos = geo.getAttribute("position");
  const scaleByVertex = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(5)}|${v.y.toFixed(5)}|${v.z.toFixed(5)}`;
    let k = scaleByVertex.get(key);
    if (k === undefined) {
      k = 1 + (rnd() * 2 - 1) * jitter;
      scaleByVertex.set(key, k);
    }
    pos.setXYZ(i, v.x * k * stretch[0], v.y * k * stretch[1], v.z * k * stretch[2]);
  }
  return geo;
}

/** The marble shader's colour for a view-space normal, as display sRGB 0..1. */
function shade(n) {
  const l = new THREE.Vector3(0.35, 0.55, 0.75).normalize();
  const diffuse = THREE.MathUtils.clamp(n.dot(l) * 0.5 + 0.5, 0, 1);
  const rim = Math.pow(1 - Math.min(Math.abs(n.z), 1), 2.25);
  return STONE.color.map((c, i) => {
    const g = STONE.glow[i] * STONE.glowIntensity;
    return THREE.MathUtils.clamp(c * (0.48 + diffuse * 0.62) + g * rim + g * 0.08, 0, 0.995);
  });
}

// --- project the front faces with the scene's camera, painter-sorted (far first)
const camera = new THREE.OrthographicCamera();
{
  const p = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
  const yaw = THREE.MathUtils.degToRad(CAMERA.yawDeg);
  camera.position.set(Math.cos(p) * Math.sin(yaw), Math.sin(p), Math.cos(p) * Math.cos(yaw));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}
const toView = camera.matrixWorldInverse.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(POSE));
const pos = stoneGeometry(1).getAttribute("position");
const faces = [];
for (let i = 0; i < pos.count; i += 3) {
  const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(toView));
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  if (n.z <= 0) continue; // facing away
  faces.push({ pts: [a, b, c], z: (a.z + b.z + c.z) / 3, rgb: shade(n) });
}
faces.sort((f, g) => f.z - g.z);

// fit the silhouette into the box (svg y points down)
const xs = faces.flatMap((f) => f.pts.map((p) => p.x));
const ys = faces.flatMap((f) => f.pts.map((p) => p.y));
const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
const k = (BOX * (1 - 2 * PAD)) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
for (const f of faces) f.xy = f.pts.map((p) => [BOX / 2 + (p.x - cx) * k, BOX / 2 - (p.y - cy) * k]);

// --- svg: one polygon per facet; a hairline stroke in the same colour closes the anti-aliasing seams
const hex = (rgb) => "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" stroke-width="0.4" stroke-linejoin="round">`,
  ...faces.map((f) => {
    const c = hex(f.rgb);
    return `<polygon points="${f.xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}" fill="${c}" stroke="${c}"/>`;
  }),
  "</svg>",
  "",
].join("\n");
writeFileSync("public/favicon.svg", svg);

// --- raster: supersampled point-in-triangle against the painter-sorted facets, front first
function raster(size) {
  const out = Buffer.alloc(size * size * 4);
  const s = BOX / size;
  const edge = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const front = [...faces].reverse();
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hit = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) * s;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) * s;
          for (const f of front) {
            const [p0, p1, p2] = f.xy;
            const e0 = edge(p0, p1, x, y), e1 = edge(p1, p2, x, y), e2 = edge(p2, p0, x, y);
            if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) {
              r += f.rgb[0]; g += f.rgb[1]; b += f.rgb[2]; hit++;
              break;
            }
          }
        }
      }
      const o = (py * size + px) * 4;
      if (hit) {
        out[o] = Math.round((r / hit) * 255);
        out[o + 1] = Math.round((g / hit) * 255);
        out[o + 2] = Math.round((b / hit) * 255);
        out[o + 3] = Math.round((hit / SUPERSAMPLE ** 2) * 255);
      }
    }
  }
  return out;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1)); // filter byte 0 before each row
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ico with png payloads: 6-byte header, a 16-byte entry per image, then the images
const images = ICO_SIZES.map((n) => png(n, raster(n)));
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(ICO_SIZES[i] % 256, e);
  head.writeUInt8(ICO_SIZES[i] % 256, e + 1);
  head.writeUInt16LE(1, e + 4); // planes
  head.writeUInt16LE(32, e + 6); // bits per pixel
  head.writeUInt32LE(img.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync("public/favicon.ico", Buffer.concat([head, ...images]));

if (process.argv[2]) writeFileSync(process.argv[2], png(256, raster(256)));
console.log(`favicon.svg: ${faces.length} facets; favicon.ico: ${ICO_SIZES.join("/")} px`);
