# endlessstudio — website

Astro 5 + React + Tailwind v4.

## Landing (`/`)

`src/pages/index.astro` renders the Sisyphus scene (`src/components/SisyphusScene.astro` + `src/scripts/sisyphus.ts`, three.js):
real Etna terrain (an 80 km plate, 4.5× vertical exaggeration) in greys that lighten with altitude up to white peaks, filling the
whole screen, and a faceted pink stone that crawls up the slope facing the camera in heaves, tips over the summit and falls under
gravity down the far side until the terrain hides it, forever. The look descends from the cables.gl patch
<https://cables.gl/p/rsP5Ki>:

- terrain shading = a grey ramp sampled like the ColorMap op (linearly filtered, clamped ends) over elevation normalised
  0..3000 m (`rampMaxElevation`), plus slope darkening, on a PBR material under a hard raking key light;
- the viewport is fitted *inside* the projected plate for any aspect ratio (`fitHalfWidth` in the module), so terrain covers
  every pixel; `halfWidthMax` caps the zoom-out on very wide screens and `targetY` sets where the summit sits vertically;
- the stone's shading is the patch's TerrainHeightMarble shader (half-Lambert `rgb(0.771, 0.446, 1.0)` plus a pale rim glow),
  written without tone mapping, on a jittered icosahedron with flat normals;
- a post pass over an HDR render target applies "Photographic" (Reinhard) tone mapping, the sRGB transfer and animated film
  grain (`CONFIG.post`: exposure, grain amount, grain cell size, grain frame rate);
- the only shadow is the stone's, from a real shadow map kept cheap: the terrain receives shadows but never casts them, so
  the shadow pass draws the stone alone, and the sun's shadow camera is a small box that follows the stone
  (`CONFIG.shadow`: map size, box half-width), so a 512² map is crisp. The relief itself reads from the ramp, the slope
  darkening and the raking key light.

The page is meant to stay cheap on an integrated GPU: the mesh is 512² (`CONFIG.segments`, half the bake), the HDR target
is 2× multisampled at a device pixel ratio of 1, frames are capped at `CONFIG.quality.maxFps` (40; a 60 Hz screen can
only land on 30 or 60, so it shows 30), and the loop pauses when the tab is hidden or the window loses focus.

The fall is a small rigid-body simulation written in the module (no physics engine): gravity, contact with the height field with
restitution and friction, rolling without slipping on the ground, free tumbling in the air; after `physics.diveAfter` seconds the
stone sinks below the surface so the terrain hides it, then it respawns at the base.

A small tag follows the stone with its live latitude, longitude (degrees and decimal minutes) and the ground altitude
under it: `src/scripts/georef.ts` turns plate uv into lon/lat by undoing the bake's rotation and Web Mercator (using
`center`, `facingBearingDeg` and `sideKm` from `etna.json`), and the scene projects the stone to the screen each frame.
The tag hides while the stone is off screen, still growing at the base, or behind the mountain (a short march through
the height field towards the camera). The Mapterhorn credit (CC BY 4.0 sources) lives at the bottom of the menu.

The wordmark top left is the three s of endle·sss·tudio (`.wordmark`, Fraunces). Clicking it opens the menu: the plate's
relief sinks to a flat, faded map (`terrain.scale.y` → `menu.minRelief`, material opacity → `menu.ghost`) while the stone
rolls in an arc up to the top centre of the screen and turns slowly there; the climb is held and resumes where it was when
the menu closes (the move plays backwards). The stone lands centred in the `.menu-emblem` box of the menu markup, as wide
as that box, so its place and size are decided by CSS. The menu copy and links under it are placeholders. The tween runs
on wall-clock time (`menu.duration`), independent of frame rate; Escape closes the menu too.

- Tunables live in the `CONFIG` object at the top of `src/scripts/sisyphus.ts` (camera pitch, exaggeration, palette and its
  normalisation, stone size/facets/speed/heaves/switchbacks, gravity/restitution/friction, when the drop hides).
- In dev, `window.__sisyphus.seek(0.9)` freezes the stone at 90% of the climb, `seek(1)` starts the fall, `tick(0.5)` advances
  the frozen simulation by half a second, `play()` resumes, `recolor(5200)` re-runs the elevation ramp with another Max
  Elevation, `menu(true)` opens the menu state, `menuProgress` reports the tween (0 scene … 1 menu) and `lonLat(u, v)` georeferences a
  plate point.
- The heightmap is baked offline so the page needs no tile server at runtime:

```sh
python3 -I scripts/bake-etna.py          # writes public/terrain/etna.bin + etna.json
```

It fetches Mapterhorn terrain tiles (<https://mapterhorn.com>, Terrarium-encoded 512 px WebP, no key) at zoom 12 (≈15 m/px),
rotates the 80 km plate so the camera looks WNW→ESE (the only direction where the far side is steep enough to hide the
stone), and stores metres as 16-bit samples (1024², 2 MB; the terrain mesh samples it every other sample at 156 m). Around Etna,
Mapterhorn is built from the Regione Siciliana 2 m DTM (2012-13, CC BY 4.0) and INGV's TINITALY 10 m (CC BY 4.0) on a
Copernicus GLO-30 base; the Mapzen/AWS tiles used before only had ~25-30 m data here (EU-DEM / SRTM), so the craters, the
Valle del Bove rim and the flank cones are now resolved.

The earlier scrollytelling prototype (deck.gl + MapLibre terrain) now lives at `/story`.

---


```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
