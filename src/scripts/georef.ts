/**
 * Where on Earth a point of the baked plate is.
 *
 * The bake (scripts/bake-etna.py) takes a Web Mercator mosaic, rotates it about the summit so that geographic bearing
 * `facingBearingDeg` lies along the plate's north-east diagonal (plate bearing 45°), crops `sideKm` around the summit
 * and resamples to `size`². This undoes that: plate uv → bearing and distance from the summit → mercator → lon/lat.
 */
export interface PlateMeta {
  size: number;
  sideKm: number;
  center: [number, number]; // summit lon, lat (degrees)
  facingBearingDeg: number;
}

const R = 6378137; // WGS 84 equatorial radius, as Web Mercator uses it
const DEG = Math.PI / 180;
const NNBSP = " "; // narrow no-break space, the thousands separator used in the captions

export function createGeoref(meta: PlateMeta) {
  const [lon0, lat0] = meta.center;
  const rot = (meta.facingBearingDeg - 45) * DEG; // geographic bearing = plate bearing + rot
  const sideM = meta.sideKm * 1000; // the plate side in ground metres at the summit's latitude
  const n = meta.size;
  const mercPerGround = 1 / Math.cos(lat0 * DEG); // ground metres at lat0 → mercator metres
  const x0 = R * lon0 * DEG;
  const y0 = R * Math.log(Math.tan(Math.PI / 4 + (lat0 * DEG) / 2));
  return {
    /** u west→east, v north→south across the plate (0..1). Returns [lon, lat] in degrees. */
    lonLat(u: number, v: number): [number, number] {
      // sample k of the bake sits at pixel k + 0.5 of n across the crop, which is centred on the summit
      const ox = ((u * (n - 1) + 0.5) / n - 0.5) * sideM;
      const oy = ((v * (n - 1) + 0.5) / n - 0.5) * sideM;
      const d = Math.hypot(ox, oy) * mercPerGround;
      const bearing = Math.atan2(ox, -oy) + rot; // plate bearing (0 = plate north, clockwise) → geographic
      const x = x0 + d * Math.sin(bearing);
      const y = y0 + d * Math.cos(bearing);
      return [x / R / DEG, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / DEG];
    },
  };
}

/** 37°45.1′N — degrees and decimal minutes (a tenth of a minute ≈ 185 m, which ticks at a readable pace). */
export function formatDM(deg: number, hemispheres: [string, string]): string {
  const a = Math.abs(deg);
  let d = Math.floor(a);
  let m = Math.round((a - d) * 600) / 10;
  if (m >= 60) {
    d += 1;
    m = 0;
  }
  return `${d}°${m.toFixed(1).padStart(4, "0")}′${deg < 0 ? hemispheres[1] : hemispheres[0]}`;
}

/** 2 140 m — rounded to `step` metres, thin thousands separator. */
export function formatMetres(metres: number, step = 10): string {
  const v = Math.round(metres / step) * step;
  return `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)}${NNBSP}m`;
}
