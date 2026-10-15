/**
 * The landing's grain, in one of four modes:
 *   film  — the scene's post-pass grain, a new pattern GRAIN_HZ times a second (moves)
 *   still — the same grain, one pattern that never changes
 *   paper — no grain in the scene; a still noise layer over the whole page, text included, blended in overlay
 *   none
 * `amount` is the same scale in every mode: the grain's amplitude in display space, which for the paper layer is its
 * opacity (overlay over a mid tone moves it by about as much). `size` is the grain cell, CSS px.
 *
 * Reduced motion keeps the grain but never lets it move (film becomes still). ?grain=<mode>&amount=…&size=… in the
 * URL overrides both the default and reduced motion, and opens a small panel to try the modes live (mountGrainLab); the panel keeps the URL in step, so a link
 * to the page as it looks can be shared.
 */

export type GrainMode = "film" | "still" | "paper" | "none";

export interface Grain {
  mode: GrainMode;
  amount: number;
  size: number;
}

/** what the site shows by default */
export const GRAIN: Grain = { mode: "paper", amount: 0.09, size: 0.5 };

const MODES: GrainMode[] = ["film", "still", "paper", "none"];

/** The grain for this visit, and whether the URL asked for it (then the lab opens). */
export function pageGrain(): { grain: Grain; fromUrl: boolean } {
  const q = new URLSearchParams(location.search);
  if (q.has("grain")) {
    const mode = q.get("grain") as GrainMode;
    const num = (key: string, fallback: number) => {
      const v = Number(q.get(key));
      return q.has(key) && Number.isFinite(v) ? v : fallback;
    };
    return {
      grain: {
        mode: MODES.includes(mode) ? mode : GRAIN.mode,
        amount: num("amount", GRAIN.amount),
        size: num("size", GRAIN.size),
      },
      fromUrl: true,
    };
  }
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { grain: still && GRAIN.mode === "film" ? { ...GRAIN, mode: "still" } : GRAIN, fromUrl: false };
}

/** The scene's share of it: amplitude, cell size, and whether the pattern changes. */
export const sceneGrain = (g: Grain) => ({
  amount: g.mode === "film" || g.mode === "still" ? g.amount : 0,
  size: g.size,
  moving: g.mode === "film",
});

/** A 256² tile of grey noise, made once; the paper layer tiles it at `size` px per cell. */
let tile = "";
const noiseTile = () => {
  if (tile) return tile;
  const n = 256;
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tile = canvas.toDataURL("image/png");
  return tile;
};

/** Show or hide the paper layer (a fixed, full-page element) for `g`. */
export function paintPaper(layer: HTMLElement, g: Grain) {
  const on = g.mode === "paper" && g.amount > 0;
  layer.hidden = !on;
  if (!on) return;
  layer.style.backgroundImage = `url(${noiseTile()})`;
  layer.style.backgroundSize = `${256 * g.size}px`;
  layer.style.opacity = String(g.amount);
}

/** The panel: mode, amount and size, applied live and written back to the URL. */
export function mountGrainLab(initial: Grain, apply: (g: Grain) => void) {
  const g = { ...initial };
  const form = document.createElement("form");
  form.className = "grain-lab";
  form.dataset.keepMenu = ""; // clicks in here never toggle the menu
  form.innerHTML = `
    <p class="grain-lab-title">grain</p>
    <div class="grain-lab-modes">${MODES.map(
      (m) => `<label><input type="radio" name="mode" value="${m}"${m === g.mode ? " checked" : ""}>${m}</label>`,
    ).join("")}</div>
    <label class="grain-lab-range">amount
      <input type="range" name="amount" min="0" max="0.25" step="0.005" value="${g.amount}">
      <output name="amountOut"></output></label>
    <label class="grain-lab-range">size
      <input type="range" name="size" min="0.5" max="4" step="0.25" value="${g.size}">
      <output name="sizeOut"></output></label>
    <p class="grain-lab-url"></p>`;
  const field = <T extends Element>(name: string) => form.elements.namedItem(name) as unknown as T;
  const sync = () => {
    field<HTMLOutputElement>("amountOut").value = g.amount.toFixed(3);
    field<HTMLOutputElement>("sizeOut").value = `${g.size} px`;
    const query = `?grain=${g.mode}&amount=${g.amount}&size=${g.size}`;
    form.querySelector(".grain-lab-url")!.textContent = query;
    history.replaceState(null, "", query + location.hash);
  };
  form.addEventListener("input", () => {
    g.mode = (new FormData(form).get("mode") as GrainMode) ?? g.mode;
    g.amount = Number(field<HTMLInputElement>("amount").value);
    g.size = Number(field<HTMLInputElement>("size").value);
    apply({ ...g });
    sync();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  // the timeline climbs on the arrow keys: keep them for the sliders
  form.addEventListener("keydown", (e) => e.stopPropagation());
  document.body.append(form);
  sync();
}
