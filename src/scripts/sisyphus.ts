/**
 * Sisyphus — the endlessstudio landing scene.
 *
 * A square plate of real terrain (Mount Etna, baked by scripts/bake-etna.py)
 * is displaced from a heightmap and shaded in greys that lighten with altitude,
 * seen through an orthographic isometric camera that is zoomed so the terrain
 * fills the screen (the viewport is fitted inside the plate for any aspect). A faceted pink stone crawls up the slope
 * that faces the camera in laboured heaves, tips over the summit and falls
 * under gravity down the far side, tumbling and bouncing until it drops out
 * of sight — then it is back at the base. Forever.
 *
 * The look descends from the cables.gl patch "landing" (https://cables.gl/p/rsP5Ki):
 * an elevation colour ramp sampled like the ColorMap op (now a grey scale), a PBR
 * terrain under a studio environment, the custom TerrainHeightMarble shader for
 * the stone (flat half-Lambert pink with a pale rim glow), "Photographic" tone
 * mapping and film grain, both applied in a post pass over an HDR render target.
 *
 * The fall is a small rigid-body simulation of our own: gravity, contact with
 * the height field (restitution + friction), rolling without slipping while on
 * the ground and free tumbling in the air. No physics engine dependency.
 *
 * The only shadow is the stone's, from a real shadow map kept cheap: the terrain receives
 * shadows but does not cast them, so the shadow pass draws the stone alone, and the sun's
 * shadow camera is a small box that follows the stone, so a 512² map is crisp. The relief
 * itself reads from the elevation ramp, the slope darkening and the raking key light. The
 * loop is frame-capped and pauses when the tab is hidden or the window loses focus.
 *
 * The wordmark opens the menu: the plate's relief sinks until the mountain is a flat, faded map and the stone rolls
 * up to the top centre of the screen (an HTML anchor decides exactly where, and how big), where it turns slowly over
 * the menu copy. Closing reverses the move and the climb resumes where it was held.
 *
 * A small HTML tag follows the stone with its live latitude, longitude and the ground altitude under it (plate uv →
 * lon/lat via georef.ts), hidden whenever the stone is out of sight: off screen, not yet grown, or behind the mountain
 * (a short march through the height field towards the camera decides that).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createGeoref, formatDM, formatMetres, type PlateMeta } from "./georef";

const CONFIG = {
  terrainUrl: "/terrain/etna",
  segments: 512, // half the 1024² Mapterhorn bake (156 m per cell, ≈5 px on a laptop screen); 4× fewer triangles than 1:1
  exaggeration: 4.5,
  pitchDeg: 36,
  yawDeg: -45, // camera sits south-west of the plate
  // The frustum is fitted per aspect ratio so the viewport lies inside the plate (full-bleed terrain);
  // halfWidthMax caps the zoom-out on very wide screens.
  halfWidthMax: 0.64,
  fitMargin: 0.985,
  targetY: 0.13, // look at a point above the plate so the summit sits in the upper third
  background: "#0b5f64",
  // Terrain shading: a grey ramp sampled like the cables ColorMap op (small texture, linear filter, clamped ends:
  // colour k sits at t = (k + 0.5) / N). t = elevation / rampMaxElevation. Darker low ground, white peaks.
  palette: ["#2a2d31", "#4b4f54", "#777b80", "#a3a6a9", "#d0d2d3", "#f6f6f5"],
  rampMaxElevation: 3000, // metres
  slopeShade: 0.42, // how much steep faces darken towards the low tone — a hillshade feel that keeps gullies legible
  shadow: {
    mapSize: 512, // the shadow camera is only `halfSize` wide, so a small map is already sub-pixel
    halfSize: 0.15, // half-width of the shadow camera's box around the stone, world units (stone radius 0.028, up to ~3× in the menu)
  },
  quality: {
    maxPixelRatio: 1, // HiDPI screens render at 1×; the grain hides it and the fill rate is a quarter of 2×
    msaa: 2, // samples of the HDR target
    maxFps: 40, // frames are skipped to stay under this; on a 60 Hz screen that lands on 30 (frames can only show on vsync)
  },
  stone: {
    radius: 0.028, // ~4% of the screen width at the fitted zoom
    // TerrainHeightMarble shader inputs from the patch
    color: [0.771, 0.446, 1.0] as [number, number, number],
    glow: [0.886, 1.0, 0.869] as [number, number, number],
    glowIntensity: 0.344,
    // faceted boulder: a jittered icosahedron with flat normals
    facets: { detail: 1, jitter: 0.22, seed: 7, stretch: [1.12, 0.9, 1.0] as [number, number, number] },
    baseSpeed: 0.12, // plate units per second on flat ground
    // uv on the plate (u west→east, v north→south, plate space). Just below the bottom edge of a 16:10 screen,
    // so the stone crawls into view from the base and respawns out of sight.
    start: { u: 0.27, v: 0.73 },
    // gentle switchbacks on the way up, echoing the hand-drawn Trail op in the patch
    wobble: { amplitude: 0.045, periods: 1.5 },
    // the push comes in heaves: speed swings between 1 and 1 - pulse at hz
    crawl: { pulse: 0.45, hz: 1.25 },
    physics: {
      gravity: 1.5, // world units / s² — a miniature's gravity
      restitution: 0.32,
      friction: 1.6, // tangential damping on contact, per second
      shove: 0.35, // extra speed from the last push over the crest
      diveAfter: 1.0, // seconds of falling before it sinks out of sight (the terrain hides it)
      diveLength: 0.8,
    },
    restAtBase: 0.9, // seconds of stillness before each climb
  },
  menu: {
    duration: 1.5, // seconds for the relief to sink and the stone to settle at the top; the close plays it backwards
    ghost: 0.22, // opacity the flattened map keeps behind the menu
    lift: 0.2, // peak of the stone's arc on the way up, world units
    tumble: 5.0, // rad/s at the top of the arc
    spin: 0.3, // rad/s about the vertical while the stone waits above the menu
    minRelief: 0.002, // never scale the plate's height to exactly zero (singular normal matrix → black)
  },
  post: {
    exposure: 1.0, // Reinhard ("Photographic") exposure
    grain: 0.06, // film grain amplitude in display space (0..1)
    grainSize: 1.5, // grain cell size in device pixels
    grainHz: 24, // how often the grain pattern changes
  },
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Small seeded PRNG so the stone is the same on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class HeightField {
  constructor(
    readonly data: Uint16Array,
    readonly n: number,
    readonly scale: number, // metres → world units
  ) {}

  /** Bilinear sample. u,v in [0,1], returns world-space height. */
  sample(u: number, v: number): number {
    const n = this.n;
    const x = clamp(u, 0, 1) * (n - 1);
    const y = clamp(v, 0, 1) * (n - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, n - 1);
    const y1 = Math.min(y0 + 1, n - 1);
    const fx = x - x0;
    const fy = y - y0;
    const d = this.data;
    const h0 = d[y0 * n + x0] * (1 - fx) + d[y0 * n + x1] * fx;
    const h1 = d[y1 * n + x0] * (1 - fx) + d[y1 * n + x1] * fx;
    return (h0 * (1 - fy) + h1 * fy) * this.scale;
  }

  /** Surface normal in world space (plate spans x,z ∈ [-1, 1], so one uv unit is two world units). */
  normalAt(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 1 / this.n;
    const dx = this.sample(u + e, v) - this.sample(u - e, v);
    const dz = this.sample(u, v + e) - this.sample(u, v - e);
    return out.set(-dx / (4 * e), 1, -dz / (4 * e)).normalize();
  }

  /** Highest sample along the plate's two edges nearest the camera (west u=0 and south v=1), world units. */
  nearEdgeHeight(): number {
    let best = 0;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      best = Math.max(best, this.data[i * n], this.data[(n - 1) * n + i]);
    }
    return best * this.scale;
  }

  /** uv of the highest sample. */
  summit(): { u: number; v: number } {
    let best = 0;
    let idx = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > best) {
        best = this.data[i];
        idx = i;
      }
    }
    return { u: (idx % this.n) / (this.n - 1), v: Math.floor(idx / this.n) / (this.n - 1) };
  }
}

const PALETTE = CONFIG.palette.map((c) => new THREE.Color(c));

/** Sample the palette the way a linearly filtered, edge-clamped texture would. */
function paletteColor(t: number, out: THREE.Color) {
  const n = PALETTE.length;
  const x = clamp(t, 0, 1) * n - 0.5; // texel centres at 0.5, 1.5, …
  const i0 = clamp(Math.floor(x), 0, n - 1);
  const i1 = clamp(i0 + 1, 0, n - 1);
  const k = clamp(x - i0, 0, 1);
  return out.copy(PALETTE[i0]).lerp(PALETTE[i1], k);
}

function buildTerrain(hf: HeightField) {
  const seg = CONFIG.segments;
  const count = (seg + 1) * (seg + 1);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let j = 0; j <= seg; j++) {
    const v = j / seg;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const k = j * (seg + 1) + i;
      positions[k * 3] = (u - 0.5) * 2;
      positions[k * 3 + 1] = hf.sample(u, v);
      positions[k * 3 + 2] = (v - 0.5) * 2;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const cc = a + seg + 1;
      const d = cc + 1;
      indices.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  colorizeTerrain(geo, hf, CONFIG.rampMaxElevation);
  return geo;
}

/** Vertex colours = palette over normalised elevation, plus a little slope darkening so gullies read. */
function colorizeTerrain(geo: THREE.BufferGeometry, hf: HeightField, rampMaxElevation: number) {
  const positions = geo.getAttribute("position") as THREE.BufferAttribute;
  const normals = geo.getAttribute("normal") as THREE.BufferAttribute;
  const colors = geo.getAttribute("color") as THREE.BufferAttribute;
  const rampMax = rampMaxElevation * hf.scale; // world units
  const c = new THREE.Color();
  const shade = PALETTE[1];
  for (let k = 0; k < positions.count; k++) {
    paletteColor(positions.getY(k) / rampMax, c);
    const steep = 1 - normals.getY(k); // 0 flat … 1 vertical
    c.lerp(shade, clamp(steep * 2.2, 0, 1) * CONFIG.slopeShade);
    colors.setXYZ(k, c.r, c.g, c.b);
  }
  colors.needsUpdate = true;
}

/** A faceted boulder: icosahedron with each unique vertex pushed in or out, flat-shaded. */
export function stoneGeometry(r: number) {
  const { detail, jitter, seed, stretch } = CONFIG.stone.facets;
  const rnd = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(r, detail); // non-indexed: every triangle owns its vertices
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const scaleByVertex = new Map<string, number>();
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
  geo.computeVertexNormals(); // non-indexed geometry → per-face normals → facets
  return geo;
}

/**
 * Port of the patch's TerrainHeightMarble shader: half-Lambert base colour plus a pale rim glow, unlit otherwise.
 * The patch writes these values straight to the screen; here the frame goes through the post pass (Reinhard +
 * sRGB), so the shader pre-inverts that pass and the stone ends up with exactly the same colours.
 */
function marbleMaterial() {
  const b = CONFIG.stone;
  return new THREE.ShaderMaterial({
    uniforms: {
      baseColor: { value: new THREE.Vector3(...b.color) },
      glowColor: { value: new THREE.Vector3(...b.glow) },
      glowIntensity: { value: b.glowIntensity },
      exposure: { value: CONFIG.post.exposure },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      uniform float glowIntensity;
      uniform float exposure;
      varying vec3 vNormalView;
      vec3 srgbToLinear(vec3 c) {
        vec3 lo = c / 12.92;
        vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
        return mix(lo, hi, step(vec3(0.04045), c));
      }
      void main() {
        vec3 n = normalize(vNormalView);
        vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
        float diffuse = clamp(dot(n, lightDir) * 0.5 + 0.5, 0.0, 1.0);
        float rim = pow(1.0 - clamp(abs(n.z), 0.0, 1.0), 2.25);
        vec3 col = baseColor * (0.48 + diffuse * 0.62);
        col += glowColor * rim * glowIntensity;
        col += glowColor * 0.08 * glowIntensity;
        // undo the post pass: display value → linear → inverse Reinhard
        vec3 t = srgbToLinear(clamp(col, 0.0, 0.995));
        gl_FragColor = vec4(t / (1.0 - t) / exposure, 1.0);
      }
    `,
  });
}

async function loadHeightField() {
  const [meta, buf] = await Promise.all([
    fetch(`${CONFIG.terrainUrl}.json`).then((r) => r.json()),
    fetch(`${CONFIG.terrainUrl}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const data = new Uint16Array(buf); // little-endian, as every browser platform is
  const scale = (2 / (meta.sideKm * 1000)) * CONFIG.exaggeration;
  return { hf: new HeightField(data, meta.size, scale), meta: meta as PlateMeta & { maxElevation: number } };
}

export interface SisyphusHandle {
  /** Open or close the menu state (relief down, stone at `stoneAnchor`). */
  setMenu(open: boolean): void;
  dispose(): void;
}

export interface SisyphusOptions {
  /** HTML element over the canvas; in the menu the stone sits centred in it, as wide as it is. */
  stoneAnchor?: HTMLElement | null;
  /** HTML element moved to the stone's right every frame, with [data-lat], [data-lon] and [data-alt] children. */
  stoneTag?: HTMLElement | null;
}

export async function mountSisyphus(canvas: HTMLCanvasElement, opts: SisyphusOptions = {}): Promise<SisyphusHandle> {
  const { hf, meta } = await loadHeightField();
  const geo = createGeoref(meta);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.quality.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the post pass

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();

  // --- camera: orthographic isometric
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
  const target = new THREE.Vector3(0, CONFIG.targetY, 0);
  const viewDir = new THREE.Vector3(); // unit vector from the scene towards the camera
  {
    const p = THREE.MathUtils.degToRad(CONFIG.pitchDeg);
    const yaw = THREE.MathUtils.degToRad(CONFIG.yawDeg);
    viewDir.set(Math.cos(p) * Math.sin(yaw), Math.sin(p), Math.cos(p) * Math.cos(yaw));
    camera.position.copy(viewDir).multiplyScalar(12).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  // --- lights
  const sun = new THREE.DirectionalLight("#fff3e0", 2.4);
  sun.position.set(-3.2, 2.0, -1.6); // low light from the north-west rakes across the gullies
  const sunDir = sun.position.clone().normalize(); // towards the sun
  // the stone is the only caster, so the shadow camera is a small box that follows it (see followStone)
  sun.castShadow = true;
  sun.shadow.mapSize.set(CONFIG.shadow.mapSize, CONFIG.shadow.mapSize);
  sun.shadow.camera.left = -CONFIG.shadow.halfSize;
  sun.shadow.camera.right = CONFIG.shadow.halfSize;
  sun.shadow.camera.top = CONFIG.shadow.halfSize;
  sun.shadow.camera.bottom = -CONFIG.shadow.halfSize;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 6;
  sun.shadow.bias = -0.0002; // nothing self-shadows (the stone's own material ignores shadows), so almost none is needed
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight("#d8dde0", "#1a1c1e", 0.3));

  // --- terrain plate
  // the patch's PbrMaterial: roughness 0.468, metalness 0 — a soft sheen under the studio environment. `transparent`
  // from the start because the menu fades the plate: three bakes the opaque/transparent choice into the shader program,
  // and at opacity 1 the picture is identical (depth testing sorts out the stone).
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
    envMapIntensity: 0.5,
    transparent: true,
  });
  const ceiling = meta.maxElevation * hf.scale; // nothing on the plate is higher than this
  const terrain = new THREE.Mesh(buildTerrain(hf), terrainMaterial);
  terrain.receiveShadow = true; // but never casts: that would mean drawing the whole mesh into the shadow map every frame
  scene.add(terrain);

  // --- the stone
  const r = CONFIG.stone.radius;
  const stone = new THREE.Mesh(stoneGeometry(r), marbleMaterial());
  stone.castShadow = true;
  scene.add(stone);
  /** Keep the sun's shadow box centred on the stone. Position and target move together, so the light direction is unchanged. */
  const followStone = () => {
    sun.target.position.copy(stone.position);
    sun.position.copy(stone.position).addScaledVector(sunDir, 3);
  };

  // --- post pass: the scene renders into an HDR target; a fullscreen quad applies Reinhard tone mapping,
  // the sRGB transfer and animated film grain (the patch's Noise_v2 op, with motion)
  const hdrTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: CONFIG.quality.msaa });
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: hdrTarget.texture },
      exposure: { value: CONFIG.post.exposure },
      grain: { value: CONFIG.post.grain },
      grainSize: { value: CONFIG.post.grainSize * renderer.getPixelRatio() },
      seed: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float exposure;
      uniform float grain;
      uniform float grainSize;
      uniform float seed;
      varying vec2 vUv;
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      vec3 linearToSrgb(vec3 c) {
        vec3 lo = c * 12.92;
        vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
        return mix(lo, hi, step(vec3(0.0031308), c));
      }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        c *= exposure;
        c = clamp(c / (1.0 + c), 0.0, 1.0); // Reinhard, the patch's "Photographic"
        c = linearToSrgb(c);
        vec2 cell = floor(gl_FragCoord.xy / grainSize);
        float g = hash(cell + vec2(seed, seed * 0.37)) - 0.5;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += g * grain * (0.55 + 0.45 * (1.0 - lum)); // a little stronger in the shadows, like film
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // --- the climb: a line in plan from the south-west base to the summit, with fading switchbacks
  const summit = hf.summit();
  const start = CONFIG.stone.start;
  const dirUV = new THREE.Vector2(summit.u - start.u, summit.v - start.v);
  const toSummit = dirUV.length();
  dirUV.normalize();
  const perpUV = new THREE.Vector2(-dirUV.y, dirUV.x);
  const { amplitude, periods } = CONFIG.stone.wobble;
  const uvAt = (s: number) => {
    // switchbacks fade out over the last stretch so the crest is approached straight on
    const k = clamp(s / toSummit, 0, 1);
    const w = amplitude * Math.sin(k * periods * Math.PI * 2) * (1 - smoothstep(clamp((k - 0.7) / 0.3, 0, 1)));
    return { u: start.u + dirUV.x * s + perpUV.x * w, v: start.v + dirUV.y * s + perpUV.y * w };
  };
  const worldAt = (s: number, out: THREE.Vector3) => {
    const { u, v } = uvAt(s);
    return out.set((u - 0.5) * 2, hf.sample(u, v), (v - 0.5) * 2);
  };

  // --- animation state
  type Phase = "rest" | "climb" | "fall";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const P = CONFIG.stone.physics;
  let frozen = false;
  let phase: Phase = "rest";
  let s = 0; // climb progress along the path, uv units
  let rest = CONFIG.stone.restAtBase;
  let tClimb = 0;
  let tFall = 0;
  const pos = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const motion = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  // rigid body during the fall
  const p = new THREE.Vector3(); // centre
  const vel = new THREE.Vector3();
  const omega = new THREE.Vector3(); // angular velocity, world axis × rad/s
  const n = new THREE.Vector3();

  /** Park the stone at the base of the climb (hidden; it grows in while resting). */
  const toBase = () => {
    phase = "rest";
    rest = CONFIG.stone.restAtBase;
    s = 0;
    tClimb = 0;
    worldAt(0, pos);
    stone.position.set(pos.x, pos.y + r, pos.z);
    stone.scale.setScalar(0.001);
  };

  /** Hand the stone over to gravity at its current spot, moving in `dir` at `speed`. */
  const beginFall = (dir: THREE.Vector3, speed: number) => {
    phase = "fall";
    tFall = 0;
    p.copy(stone.position);
    vel.copy(dir).multiplyScalar(speed * (1 + P.shove));
    const { u, v } = uvAt(s);
    omega.crossVectors(hf.normalAt(u, v, n), vel).divideScalar(r);
  };

  const climbSpeedAt = (s: number, t: number) => {
    worldAt(s, prev);
    worldAt(s + 0.004, ahead);
    const slope = (ahead.y - prev.y) / (0.004 * 2); // rise over plan run, world units
    const heave = 1 - CONFIG.stone.crawl.pulse * 0.5 * (1 + Math.sin(t * CONFIG.stone.crawl.hz * Math.PI * 2));
    // Sisyphus labours uphill; the rare downhill stretch of a switchback is easier
    return CONFIG.stone.baseSpeed * heave * (slope > 0 ? 1 / (1 + 2.6 * slope) : 1 + 1.2 * Math.min(-slope, 1));
  };

  if (reduceMotion) {
    // a still: part way up, no motion
    phase = "climb";
    s = toSummit * 0.55;
    worldAt(s, pos);
    stone.position.set(pos.x, pos.y + r, pos.z);
  } else {
    toBase();
  }

  // --- the menu: relief sinks to a faded flat map, the stone rolls up to the anchor and waits there
  const M = CONFIG.menu;
  const menu = {
    open: false,
    k: 0, // 0 = scene, 1 = menu; moves towards `open` at 1/duration per second, eased on use
    from: new THREE.Vector3(), // the stone's position and scale when the menu opened, restored on close
    fromScale: 1,
    to: new THREE.Vector3(),
    toScale: 1,
    rollAxis: new THREE.Vector3(1, 0, 0),
  };
  const nearPt = new THREE.Vector3();
  const farPt = new THREE.Vector3();
  const lastTo = new THREE.Vector3(); // menu.to on the previous frame, to roll the stone when the anchor moves
  /** Where the stone goes: resting on the flat plate under the anchor's centre, its diameter spanning the anchor's width. */
  const menuTarget = () => {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    let x = 0;
    let y = 0.55;
    let diameterPx = Math.min(cw, ch) * 0.16;
    const anchor = opts.stoneAnchor;
    if (anchor) {
      const a = anchor.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      x = ((a.left + a.width / 2 - c.left) / c.width) * 2 - 1;
      y = 1 - ((a.top + a.height / 2 - c.top) / c.height) * 2;
      diameterPx = a.width;
    }
    const worldPerPx = (camera.right - camera.left) / cw; // orthographic: constant across the screen
    menu.toScale = clamp((diameterPx * worldPerPx) / (2 * r), 0.2, 6);
    const h = r * menu.toScale; // centre height when resting on the flattened plate
    nearPt.set(x, y, -1).unproject(camera);
    farPt.set(x, y, 1).unproject(camera).sub(nearPt).normalize();
    menu.to.copy(nearPt).addScaledVector(farPt, (h - nearPt.y) / farPt.y);
  };
  const setMenu = (open: boolean) => {
    if (open === menu.open) return;
    menu.open = open;
    if (open && menu.k === 0) {
      menu.from.copy(stone.position);
      menu.fromScale = stone.scale.x;
      menuTarget();
      menu.rollAxis.crossVectors(up, motion.subVectors(menu.to, menu.from)).normalize();
      if (menu.rollAxis.lengthSq() < 0.5) menu.rollAxis.set(1, 0, 0);
    }
  };
  function menuStep(dt: number) {
    const goal = menu.open ? 1 : 0;
    if (menu.k === 0 && goal === 0) return;
    if (menu.k !== goal) {
      const rate = reduceMotion ? 1 : dt / M.duration;
      menu.k = menu.k < goal ? Math.min(goal, menu.k + rate) : Math.max(goal, menu.k - rate);
    }
    const e = smoothstep(menu.k);
    terrain.scale.y = Math.max(M.minRelief, 1 - e);
    terrainMaterial.opacity = 1 - e * (1 - M.ghost);
    lastTo.copy(menu.to);
    menuTarget(); // follows layout changes while the menu is up, and the anchor when it moves (the timeline)
    stone.position.lerpVectors(menu.from, menu.to, e);
    stone.position.y += Math.sin(e * Math.PI) * M.lift;
    stone.scale.setScalar(THREE.MathUtils.lerp(menu.fromScale, menu.toScale, e));
    if (!reduceMotion) {
      stone.rotateOnWorldAxis(menu.rollAxis, M.tumble * Math.sin(e * Math.PI) * dt);
      stone.rotateOnWorldAxis(up, M.spin * e * dt);
      // landed: it rolls wherever the anchor takes it
      if (menu.k === 1) {
        motion.subVectors(menu.to, lastTo);
        const d = motion.length();
        if (d > 1e-6) stone.rotateOnWorldAxis(axis.crossVectors(up, motion).normalize(), d / (r * menu.toScale));
      }
    }
  }

  function step(dt: number) {
    if (reduceMotion || frozen || menu.k > 0) return;

    if (phase === "rest") {
      rest -= dt;
      const k = smoothstep(clamp(1 - rest / CONFIG.stone.restAtBase, 0, 1));
      stone.scale.setScalar(Math.max(k, 0.001));
      if (rest <= 0) {
        phase = "climb";
        stone.scale.setScalar(1);
      }
      return;
    }

    if (phase === "climb") {
      tClimb += dt;
      const speed = climbSpeedAt(s, tClimb); // also fills `prev` with the point at s
      s += (speed * dt) / 2; // s is in uv units; the plate is 2 world units wide
      worldAt(s, pos);
      motion.subVectors(pos, prev);
      const dist = motion.length();
      if (dist > 0) {
        motion.divideScalar(dist);
        axis.crossVectors(up, motion).normalize();
        stone.rotateOnWorldAxis(axis, dist / r); // rolling
      }
      stone.position.set(pos.x, pos.y + r, pos.z);
      if (s >= toSummit) beginFall(motion, speed);
      return;
    }

    // --- fall: gravity, contact with the height field, rolling on the ground, tumbling in the air
    tFall += dt;
    vel.y -= P.gravity * dt;
    p.addScaledVector(vel, dt);
    const u = p.x / 2 + 0.5;
    const v = p.z / 2 + 0.5;
    const ground = hf.sample(u, v) + r;
    if (p.y < ground) {
      p.y = ground;
      hf.normalAt(u, v, n);
      const vn = vel.dot(n);
      if (vn < 0) vel.addScaledVector(n, -(1 + P.restitution) * vn); // bounce
      vel.multiplyScalar(Math.max(0, 1 - P.friction * dt)); // friction
      omega.crossVectors(n, vel).divideScalar(r); // rolling without slipping
    }
    const w = omega.length();
    if (w > 1e-6) stone.rotateOnWorldAxis(axis.copy(omega).divideScalar(w), w * dt);
    // out of sight: it sinks below the surface, which the terrain then hides, while shrinking
    const dive = clamp((tFall - P.diveAfter) / P.diveLength, 0, 1);
    stone.scale.setScalar(1 - smoothstep(dive) * 0.55);
    stone.position.set(p.x, p.y - dive * dive * 3.2 * r, p.z);
    if (dive >= 1 || u < 0 || u > 1 || v < 0 || v > 1) toBase();
  }

  // --- the stone's tag: live coordinates and ground altitude beside the stone, hidden while it is out of sight
  const tag = opts.stoneTag ?? null;
  const tagLat = tag?.querySelector<HTMLElement>("[data-lat]") ?? null;
  const tagLon = tag?.querySelector<HTMLElement>("[data-lon]") ?? null;
  const tagAlt = tag?.querySelector<HTMLElement>("[data-alt]") ?? null;
  const probe = new THREE.Vector3();
  const screenPt = new THREE.Vector3();
  let tagText = "";
  let tagShown = false;
  /** Is the stone's centre in the camera's line of sight? March from it towards the camera through the height field. */
  const stoneInSight = () => {
    const stride = 0.005;
    probe.copy(stone.position);
    for (let t = 0; t < 3; t += stride) {
      probe.addScaledVector(viewDir, stride);
      if (probe.y > ceiling) return true;
      const u = probe.x / 2 + 0.5;
      const v = probe.z / 2 + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return true;
      if (hf.sample(u, v) > probe.y) return false;
    }
    return true;
  };
  function updateTag() {
    if (!tag) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    screenPt.copy(stone.position).project(camera);
    const sx = ((screenPt.x + 1) / 2) * cw;
    const sy = ((1 - screenPt.y) / 2) * ch;
    const show =
      menu.k === 0 && stone.scale.x > 0.6 && sx >= 0 && sx <= cw && sy >= 0 && sy <= ch && stoneInSight();
    if (show !== tagShown) {
      tagShown = show;
      tag.dataset.visible = String(show);
    }
    if (!show) return;
    const rPx = (r * stone.scale.x * cw) / (camera.right - camera.left); // the stone's radius on screen
    tag.style.transform = `translate(${(sx + rPx).toFixed(1)}px, ${sy.toFixed(1)}px) translateY(-50%)`;
    const u = stone.position.x / 2 + 0.5;
    const v = stone.position.z / 2 + 0.5;
    const [lon, lat] = geo.lonLat(u, v);
    const latText = formatDM(lat, ["N", "S"]);
    const lonText = formatDM(lon, ["E", "W"]);
    const altText = formatMetres(hf.sample(u, v) / hf.scale);
    const text = latText + lonText + altText;
    if (text !== tagText) {
      tagText = text;
      if (tagLat) tagLat.textContent = latText;
      if (tagLon) tagLon.textContent = lonText;
      if (tagAlt) tagAlt.textContent = altText;
    }
  }

  // --- resize: fit the viewport inside the projected plate so terrain covers every pixel
  const pitch = THREE.MathUtils.degToRad(CONFIG.pitchDeg);
  const nearEdge = hf.nearEdgeHeight();
  const fitHalfWidth = (aspect: number) => {
    const a = Math.SQRT2; // the plate's half-diagonal on screen, horizontally
    const b = Math.SQRT2 * Math.sin(pitch); // … and vertically, for a flat plate
    const bNear = b - Math.cos(pitch) * nearEdge; // the near edges are lifted by their own elevation
    const c = Math.cos(pitch) * CONFIG.targetY; // looking above the plate shifts it down the screen by this
    const top = (1 - c / b) / (1 / a + 1 / (aspect * b));
    const bottom = (1 + c / bNear) / (1 / a + 1 / (aspect * bNear));
    return Math.min(CONFIG.halfWidthMax, top, bottom) * CONFIG.fitMargin;
  };
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const aspect = w / h;
    const halfW = fitHalfWidth(aspect);
    const halfH = halfW / aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const dpr = renderer.getPixelRatio();
    hdrTarget.setSize(Math.round(w * dpr), Math.round(h * dpr));
  }
  resize();
  window.addEventListener("resize", resize);

  // --- loop
  let last = performance.now();
  let raf = 0;
  let running = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // frame cap: skip vsync ticks until at least a cap interval has passed (4 ms slack absorbs timer jitter)
    if (now - last < 1000 / CONFIG.quality.maxFps - 4) return;
    const elapsed = (now - last) / 1000;
    last = now;
    menuStep(Math.min(elapsed, 1)); // wall-clock: the menu takes its 1.5 s whatever the frame rate
    step(Math.min(elapsed, 0.05)); // the physics gets a capped step for stability
    followStone();
    updateTag();
    if (!reduceMotion) postMaterial.uniforms.seed.value = Math.floor(now / (1000 / CONFIG.post.grainHz)) % 1024;
    renderer.setRenderTarget(hdrTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  };
  const start_ = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop_ = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  // no rendering while the tab is hidden or the window is behind another one: the scene is pure decoration
  document.addEventListener("visibilitychange", () => (document.hidden ? stop_() : start_()));
  window.addEventListener("blur", stop_);
  window.addEventListener("focus", () => !document.hidden && start_());
  start_();
  canvas.dataset.ready = "true";

  if (import.meta.env.DEV) {
    // scrub from the console: __sisyphus.seek(0.5) freezes the stone half-way up; seek(1) starts the fall
    (window as any).__sisyphus = {
      seek(k: number, freeze = true) {
        frozen = freeze;
        stone.scale.setScalar(1);
        if (k >= 1) {
          s = toSummit;
          worldAt(s - 0.004, prev);
          worldAt(s, pos);
          stone.position.set(pos.x, pos.y + r, pos.z);
          beginFall(motion.subVectors(pos, prev).normalize(), CONFIG.stone.baseSpeed * 0.6);
        } else {
          phase = "climb";
          s = clamp(k, 0, 1) * toSummit;
          worldAt(s, pos);
          stone.position.set(pos.x, pos.y + r, pos.z);
        }
      },
      /** advance the simulation by `seconds` while frozen (for screenshots of the fall) */
      tick(seconds: number) {
        const was = frozen;
        frozen = false;
        for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
        frozen = was;
      },
      play() {
        frozen = false;
      },
      /** open / close the menu state without the wordmark */
      menu(open: boolean) {
        setMenu(open);
      },
      /** re-run the elevation ramp with a different Max Elevation (metres) */
      recolor(rampMaxElevation: number) {
        colorizeTerrain(terrain.geometry, hf, rampMaxElevation);
      },
      get progress() {
        return phase === "fall" ? 1 + tFall : phase === "rest" ? 0 : s / toSummit;
      },
      get phase() {
        return phase;
      },
      /** 0 = scene, 1 = menu */
      get menuProgress() {
        return menu.k;
      },
      /** plate uv → [lon, lat] */
      lonLat: geo.lonLat,
      scene,
      camera,
      renderer,
    };
  }

  return {
    setMenu,
    dispose() {
      stop_();
      window.removeEventListener("resize", resize);
      hdrTarget.dispose();
      renderer.dispose();
    },
  };
}
