/**
 * The projects behind the menu's highlighted words: each word opens a card with the project's image (or video), what was
 * built and the stack. Facts from the LinkedIn experience section and the Kpler CV (2026-10-14).
 *
 * Images are 2:1 crops of the screens in endlessstudio/conversaciones/kpler-cv/assets/work (the LinkedIn profile's
 * project media); Marxan's is the larger LinkedIn project image the user supplied on 2026-10-23 (a Kenya National
 * scenario's solutions, 1280×948 centre-cropped to 1280×640); marxan.webp is the older marxanplanning.org stand-in. archaeo.studio is the
 * user's screen recording (a 21 s scroll through its landing, cropped and re-encoded to 1280×640 webm + mp4, poster =
 * its first frame), played only while its card is open; the site sits behind a login, so that word has no link (a hint
 * without `href` still opens its card). Global Fishing Watch plays the user's recording of the map too (its first 19 s,
 * 1920×960 at 30 fps, silent fast-start H.264, poster = first frame). Re-encode from the original with
 * scripts/encode-project-video.swift; the old 832 px export was too small for the wide timeline card.
 * gfw-fishing.webp is the older still. Half-Earth and Tree Equity Score play a 12 s loop of three screenshots each,
 * made with scripts/encode-map-loop.sh (2:1 at 1920×960, 3 s each with 1 s crossfades, back to the first; poster = the
 * first frame). Half-Earth: the globe, then Cameroon's biodiversity and protection, then species richness over
 * California. Tree Equity Score: the score over Jersey City, heat disparity over New York, then a Boston parcel in the
 * planting analyzer. The originals and their sources are in media/ (see media/README.md); the CV's Half-Earth still is
 * the Cameroon one (half-earth-cameroon.webp). half-earth-globe.webp and tree-equity-heat.webp are the older stills.
 */
export interface Hint {
  word: string;
  project: string;
  /** who · when · role */
  meta: string;
  /** what was built, technically, in a sentence */
  work: string;
  stack: string[];
  href?: string;
  /** a still, or the poster when there is a video */
  image: string;
  /** plays while the card is open; WebM is an optional alternative to the MP4 */
  video?: { webm?: string; mp4: string };
}

export const hint = {
  climate: {
    word: "climate commitments",
    project: "Climate Watch",
    meta: "Vizzuality · 2018 · front end",
    work: "A shared component library behind Climate Watch and its India and Indonesia explorers: custom charts for climate indicators, and dashboards users assemble themselves.",
    stack: ["React", "Redux", "D3", "Recharts"],
    href: "https://www.climatewatchdata.org/",
    image: "/projects/climate-watch-ndc.webp",
  },
  soy: {
    word: "soy",
    project: "Trase",
    meta: "Vizzuality · 2019 · front end",
    work: "Redesigns, refactors and the supply-chain flow diagrams that follow soy from Brazilian municipalities to importers, tuned to stay fast.",
    stack: ["React", "Redux", "D3", "Mapbox GL", "Turf"],
    href: "https://trase.earth/",
    image: "/projects/trase-soy.webp",
  },
  marxan: {
    word: "protected areas",
    project: "Marxan Cloud",
    meta: "Vizzuality · 2021 · front end",
    work: "Set the project up from scratch: configuration, CI automations, and the component library and docs (Playbook) the interface is built from.",
    stack: ["TypeScript", "Next.js", "React", "Redux", "deck.gl", "Mapbox GL", "Tailwind", "GitHub Actions"],
    href: "https://marxanplanning.org/",
    image: "/projects/marxan-kenya.webp",
  },
  species: {
    word: "species",
    project: "Half-Earth Project Map",
    meta: "Vizzuality · 2018–2022 · technical lead",
    work: "Led the rebuild from Cesium to an ArcGIS JS app: the architecture from scratch, scalability and performance baselines, a team of four developers.",
    stack: ["ArcGIS JS", "React", "Redux", "D3", "PixiJS", "WebGL", "Service Workers", "Cypress"],
    href: "https://map.half-earthproject.org/",
    image: "/projects/half-earth-maps-poster.webp",
    video: { mp4: "/projects/half-earth-maps.mp4" },
  },
  shade: {
    word: "shade",
    project: "Tree Equity Score",
    meta: "endlessstudio for American Forests · 2022–2026",
    work: "National explorer, planting scenario planner and locality reports, on vector tiles covering every US neighborhood, down to the parcel.",
    stack: ["Next.js", "Blitz.js", "Turborepo", "Mapbox GL", "PMTiles", "Tippecanoe", "Tegola", "D3", "Tailwind", "Flightcontrol"],
    href: "https://www.treeequityscore.org/",
    image: "/projects/tree-equity-heat.webp",
  },
  vessel: {
    word: "vessel",
    project: "Global Fishing Watch",
    meta: "endlessstudio · 2022–2025 · front end",
    work: "Worked on the map's move from MapLibre to deck.gl, with custom GPU shaders and binary data, for exploring single vessels and patterns across thousands of them.",
    stack: ["deck.gl", "WebGL shaders", "React", "Next.js", "Nx", "Terraform", "Google Cloud"],
    href: "https://globalfishingwatch.org/map",
    image: "/projects/gfw-fishing-hq-poster.webp",
    video: { mp4: "/projects/gfw-fishing-hq.mp4" },
  },
  // the timeline shows one card per milestone: the maps and the pipeline together
  treeEquity: {
    word: "Tree Equity Score",
    project: "Tree Equity Score",
    meta: "endlessstudio for American Forests · 2022–2026",
    work: "The national explorer, planting scenario planner and locality reports, and the Python pipeline behind them: shapefiles to GeoJSONL and PMTiles, with schema checks and feature counts validated from source to output.",
    stack: ["Next.js", "Mapbox GL", "PMTiles", "Tippecanoe", "Tegola", "Python", "GeoPandas", "Shapely"],
    href: "https://www.treeequityscore.org/",
    image: "/projects/tree-equity-maps-poster.webp",
    video: { mp4: "/projects/tree-equity-maps.mp4" },
  },
  pipeline: {
    word: "pipeline",
    project: "Tree Equity Score · data pipeline",
    meta: "endlessstudio for American Forests · 2022–2026",
    work: "Owns the Python pipeline from shapefiles to GeoJSONL and PMTiles, with schema checks and feature counts validated from source to output.",
    stack: ["Python", "pandas", "GeoPandas", "Shapely", "GeoJSONL", "Tippecanoe", "PMTiles"],
    href: "https://www.treeequityscore.org/",
    image: "/projects/tree-equity-explorer.webp",
  },
  archaeo: {
    word: "archaeo.studio",
    project: "archaeo.studio",
    meta: "endlessstudio · current practice",
    work: "A data platform for archaeology with spatial views, DuckDB queries and Python notebooks, built with an AI-centred workflow: domain model, architecture, implementation, verification.",
    stack: ["DuckDB", "Python notebooks", "spatial views", "domain modelling", "AI-assisted engineering"],
    image: "/projects/archaeo-studio-poster.webp",
    video: { webm: "/projects/archaeo-studio.webm", mp4: "/projects/archaeo-studio.mp4" },
  },
} satisfies Record<string, Hint>;
