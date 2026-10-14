import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Official Mapterhorn TileJSON endpoint, as used in their terrain example.
const MAPTERHORN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
    terrainSource: {
      type: "raster-dem",
      url: MAPTERHORN_TILEJSON,
    },
    hillshadeSource: {
      type: "raster-dem",
      url: MAPTERHORN_TILEJSON,
    },
  },
  layers: [
    {
      id: "osm-context",
      type: "raster",
      source: "osm",
      paint: { "raster-opacity": 0.08, "raster-saturation": -1, "raster-contrast": 0.25 },
    },
    {
      id: "mapterhorn-hillshade",
      type: "hillshade",
      source: "hillshadeSource",
      paint: {
        "hillshade-shadow-color": "#15120d",
        "hillshade-highlight-color": "#ffffff",
        "hillshade-accent-color": "#7f7566",
        "hillshade-exaggeration": 0.95,
      },
    },
  ],
  terrain: { source: "terrainSource", exaggeration: 1.35 },
  sky: {},
} as any;

const CHAPTERS = [
  {
    kicker: "01 / ridge",
    title: "A wolf does not read borders.",
    body:
      "The trail begins as a sequence of small decisions: snow depth, scent, slope, hunger. In the Alps those decisions cross national lines before they cross a highway.",
    // Start from the exact region used in Mapterhorn's terrain example so relief is unmistakable.
    view: { longitude: 8.0587, latitude: 46.4768, zoom: 11.7, pitch: 60, bearing: -18.6 },
  },
  {
    kicker: "02 / pressure",
    title: "Mountains are living infrastructure.",
    body:
      "Forests, pastures, ski domains and villages form a shifting mosaic. Each patch changes what movement costs for animals and what safety means for people.",
    view: { longitude: 7.84, latitude: 46.14, zoom: 10.85, pitch: 58, bearing: 24 },
  },
  {
    kicker: "03 / encounter",
    title: "The path touches human systems.",
    body:
      "At valley floors the track meets light, roads, livestock, tourists and waste. Conflict is rarely a point on a map; it is the place where many layers become visible at once.",
    view: { longitude: 7.78, latitude: 46.045, zoom: 11.2, pitch: 60, bearing: 64 },
  },
  {
    kicker: "04 / climate",
    title: "A warmer line moves uphill.",
    body:
      "Earlier snowmelt opens passes, drought stresses forests, and prey move. Climate does not replace the social story — it tightens the links between every part of it.",
    view: { longitude: 7.88, latitude: 46.16, zoom: 10.75, pitch: 56, bearing: 118 },
  },
  {
    kicker: "05 / system",
    title: "Complexity becomes readable when it moves.",
    body:
      "A prototype like this lets a reader follow one animal while still seeing terrain, land use and settlements. The trail becomes a guide through an interdependent system.",
    view: { longitude: 7.92, latitude: 46.22, zoom: 10.45, pitch: 52, bearing: 166 },
  },
] as const;

type ViewState = (typeof CHAPTERS)[number]["view"];

type Trip = {
  id: string;
  color: [number, number, number];
  path: [number, number, number][];
  timestamps: number[];
};

const WOLF_TRIPS: Trip[] = [
  {
    id: "dispersing-female",
    color: [236, 178, 103],
    path: [
      [7.625, 45.91, 1700],
      [7.653, 45.925, 2050],
      [7.682, 45.946, 2350],
      [7.704, 45.971, 2550],
      [7.724, 45.995, 2210],
      [7.75, 46.018, 1760],
      [7.78, 46.04, 1630],
      [7.817, 46.075, 1500],
      [7.858, 46.12, 1420],
      [7.902, 46.175, 980],
      [7.94, 46.235, 720],
    ],
    timestamps: [0, 95, 190, 280, 370, 470, 560, 665, 775, 900, 1000],
  },
  {
    id: "pack-scout",
    color: [177, 194, 146],
    path: [
      [7.66, 45.935, 1900],
      [7.704, 45.935, 2400],
      [7.74, 45.951, 3000],
      [7.765, 45.982, 2600],
      [7.747, 46.011, 2000],
      [7.72, 46.035, 1700],
      [7.735, 46.065, 1650],
      [7.77, 46.095, 1550],
    ],
    timestamps: [90, 180, 285, 390, 520, 650, 800, 930],
  },
];

const LAND_USE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { kind: "forest", label: "subalpine forest" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.6, 45.9],
            [7.69, 45.91],
            [7.74, 45.98],
            [7.69, 46.04],
            [7.61, 46.02],
            [7.6, 45.9],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { kind: "pasture", label: "summer pasture" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.69, 45.93],
            [7.79, 45.94],
            [7.82, 46.02],
            [7.74, 46.06],
            [7.69, 46.01],
            [7.69, 45.93],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { kind: "tourism", label: "ski / tourism domain" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.71, 45.96],
            [7.82, 45.97],
            [7.86, 46.04],
            [7.78, 46.09],
            [7.72, 46.04],
            [7.71, 45.96],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { kind: "urban", label: "settled valley" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.735, 46.0],
            [7.795, 46.015],
            [7.96, 46.205],
            [7.93, 46.255],
            [7.83, 46.13],
            [7.74, 46.035],
            [7.735, 46.0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { kind: "glacier", label: "glacier / snow" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.76, 45.93],
            [7.91, 45.935],
            [8.04, 46.045],
            [8.01, 46.13],
            [7.86, 46.09],
            [7.78, 46.02],
            [7.76, 45.93],
          ],
        ],
      },
    },
  ],
} as any;

const PLACES = [
  { name: "Cervinia", coordinates: [7.63, 45.935] },
  { name: "Zermatt", coordinates: [7.749, 46.02] },
  { name: "Taesch", coordinates: [7.779, 46.068] },
  { name: "Visp", coordinates: [7.882, 46.294] },
] as const;

const LAND_COLORS: Record<string, [number, number, number, number]> = {
  forest: [89, 116, 72, 52],
  pasture: [215, 165, 91, 48],
  tourism: [179, 94, 68, 54],
  urban: [74, 64, 53, 58],
  glacier: [188, 215, 226, 50],
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function ease(t: number) {
  return t * t * (3 - 2 * t);
}

function interpolateView(a: ViewState, b: ViewState, t: number): ViewState {
  const k = ease(t);
  return {
    longitude: a.longitude + (b.longitude - a.longitude) * k,
    latitude: a.latitude + (b.latitude - a.latitude) * k,
    zoom: a.zoom + (b.zoom - a.zoom) * k,
    pitch: a.pitch + (b.pitch - a.pitch) * k,
    bearing: a.bearing + (b.bearing - a.bearing) * k,
  };
}

function cssRgba(color: [number, number, number, number]) {
  const [r, g, b, a] = color;
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

export default function ScrollyStory() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const node = scrollerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const rawScroll = Math.max(0, -rect.top);
      const narrativeStart = window.innerHeight;
      const narrativeSpan = window.innerHeight * (CHAPTERS.length - 1);
      const nextProgress = clamp((rawScroll - narrativeStart) / narrativeSpan);
      setProgress(nextProgress);
      setActive(Math.min(CHAPTERS.length - 1, Math.round(nextProgress * (CHAPTERS.length - 1))));
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialView = CHAPTERS[0].view;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [initialView.longitude, initialView.latitude],
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
      interactive: false,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.setTerrain({ source: "terrainSource", exaggeration: 1.35 });
    });

    mapRef.current = map;
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const viewState = useMemo(() => {
    const scaled = progress * (CHAPTERS.length - 1);
    const index = Math.min(CHAPTERS.length - 2, Math.floor(scaled));
    return interpolateView(CHAPTERS[index].view, CHAPTERS[index + 1].view, scaled - index);
  }, [progress]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.jumpTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      pitch: viewState.pitch,
      bearing: viewState.bearing,
    });
  }, [viewState]);

  const currentTime = progress * 1120;
  const landUseOpacity = clamp((progress - 0.18) / 0.16);

  const layers = useMemo(() => {
    return [
      new GeoJsonLayer({
        id: "land-use",
        data: LAND_USE,
        pickable: true,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 1,
        getLineColor: [245, 236, 214, Math.round(165 * landUseOpacity)],
        getFillColor: (feature: any) => {
          const color = LAND_COLORS[feature.properties.kind] ?? [255, 255, 255, 40];
          return [color[0], color[1], color[2], Math.round(color[3] * landUseOpacity)];
        },
        parameters: { depthTest: false },
        updateTriggers: { getFillColor: [active] },
      } as any),
      new TripsLayer({
        id: "wolf-trips",
        data: WOLF_TRIPS,
        getPath: (d: Trip) => d.path,
        getTimestamps: (d: Trip) => d.timestamps,
        getColor: (d: Trip) => d.color,
        currentTime,
        trailLength: 260,
        widthMinPixels: 4,
        widthMaxPixels: 9,
        jointRounded: true,
        capRounded: true,
        fadeTrail: true,
        shadowEnabled: false,
        parameters: { depthTest: false },
      } as any),
      new ScatterplotLayer({
        id: "places",
        data: PLACES,
        getPosition: (d: any) => d.coordinates,
        getFillColor: [42, 36, 23, 230],
        getLineColor: [250, 246, 236, 230],
        stroked: true,
        radiusUnits: "meters",
        getRadius: 240,
        lineWidthMinPixels: 1.5,
        parameters: { depthTest: false },
      } as any),
      new TextLayer({
        id: "place-labels",
        data: PLACES,
        getPosition: (d: any) => d.coordinates,
        getText: (d: any) => d.name,
        getSize: 13,
        getColor: [42, 36, 23, 235],
        getAngle: -8,
        getPixelOffset: [0, -18],
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        background: true,
        getBackgroundColor: [250, 246, 236, 210],
        backgroundPadding: [5, 3],
        parameters: { depthTest: false },
      } as any),
    ];
  }, [active, currentTime, landUseOpacity]);

  return (
    <main ref={scrollerRef} className="scrolly-shell">
      <header className="story-header">
        <a href="#top" className="brand">endless <em>studio</em></a>
        <div className="chapter-counter">{String(active + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}</div>
      </header>

      <div className="map-stage" aria-hidden="true">
        <div ref={mapContainerRef} className="maplibre-stage" />
        <DeckGL
          viewState={viewState as any}
          controller={false}
          layers={layers}
          parameters={{ clearColor: [0, 0, 0, 0] }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
        <div className="map-vignette" />
        <div className="legend-card">
          <span>land use</span>
          {Object.entries({ forest: "forest", pasture: "pasture", tourism: "tourism", urban: "settlement", glacier: "snow / ice" }).map(
            ([key, label]) => (
              <div key={key} className="legend-row">
                <i style={{ background: cssRgba(LAND_COLORS[key]) }} />
                {label}
              </div>
            )
          )}
        </div>
      </div>

      <section id="top" className="story-panel hero-panel">
        <div className="story-copy hero-copy">
          <p className="eyebrow">scrollytelling prototype · Matterhorn terrain · animal movement</p>
          <h1>Following one trail through many systems.</h1>
          <p>
            A clean first prototype using MapLibre terrain from Mapterhorn's official TileJSON endpoint, with deck.gl trip layers and simple land-use overlays.
            Scroll to move the camera and let the text change the scale of the story.
          </p>
          <a className="scroll-cue" href="#chapter-0">begin ↓</a>
        </div>
      </section>

      {CHAPTERS.map((chapter, index) => (
        <section id={`chapter-${index}`} className="story-panel" key={chapter.kicker}>
          <article className={`story-copy ${active === index ? "is-active" : ""}`}>
            <p className="eyebrow">{chapter.kicker}</p>
            <h2>{chapter.title}</h2>
            <p>{chapter.body}</p>
          </article>
        </section>
      ))}

      <section className="story-panel closing-panel">
        <div className="story-copy">
          <p className="eyebrow">prototype notes</p>
          <h2>Next: replace placeholders with live datasets.</h2>
          <p>
            The terrain comes from Mapterhorn Terrarium-encoded elevation tiles. The trails and land-use polygons are illustrative,
            structured so they can be swapped for GPS collars, CORINE/Copernicus land cover, roads, climate rasters and conflict reports.
          </p>
        </div>
      </section>
    </main>
  );
}
