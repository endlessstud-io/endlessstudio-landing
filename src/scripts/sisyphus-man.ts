/**
 * Sisyphus for the work timeline: a stick figure in thin strokes who pushes the scene's stone along the profile.
 *
 * He is posed from scratch on every frame, with no keyframes. He leans further into steeper ground, and his hands
 * slide down the back of the stone until his hips sit at their height over the line under him. Where that still isn't
 * enough, he stands up straighter. Arms and legs are two-bone IK; a foot the leg can't reach steps in closer along
 * the line. His steps follow the distance the stone travels, in both directions: when it rolls back down, he gives
 * way backwards. While the stone rests he holds it, heaving slowly.
 *
 * Lengths are in stone radii. pose() takes and returns screen px (y down); inside, y points up.
 */

type V = [number, number];

const FIG = {
  // the body, in stone radii: 1.9 standing, so the stone is a little taller than he is
  thigh: 0.475,
  shin: 0.475,
  torso: 0.57,
  upperArm: 0.34,
  forearm: 0.32,
  neck: 0.06,
  head: 0.16,
  hip: 0.82, // hip height over the ground, in leg lengths: knees a little bent
  lean: 0.84, // torso angle over the horizontal on flat ground, rad; less (further forward) uphill
  hands: [Math.PI - 0.7, Math.PI + 0.9] as V, // how far the hands may slide around the back of the stone, rad
  stance: [0.18, -0.55] as V, // the feet while he holds the stone (near forward, far braced behind), leg lengths from the hip
  stride: 0.4, // half a stride while walking, in leg lengths
  cadence: 4, // strides per second at most; when the stone goes faster, his feet skid
  heave: 2.6, // rad/s of the slow heave while he holds the stone
};

export interface SisyphusPose {
  /** polylines in screen px: the near arm and leg (one line through the body), the far ones (drawn dimmer) */
  near: V[][];
  far: V[][];
  head: V;
  headRadius: number;
}

/** Two-bone IK from `a` towards `b`: the middle joint, and the end (b, or as far towards it as the bones reach).
 *  bend 1 puts the joint left of a→b (knees forward when facing +x with y up), -1 right of it (elbows down). */
function limb(a: V, b: V, l1: number, l2: number, bend: number): [V, V] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), 1e-6), (l1 + l2) * 0.999);
  const dir = Math.atan2(dy, dx);
  const k = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return [
    [a[0] + l1 * Math.cos(dir + bend * k), a[1] + l1 * Math.sin(dir + bend * k)],
    [a[0] + d * Math.cos(dir), a[1] + d * Math.sin(dir)],
  ];
}

export function createSisyphus() {
  let phase = 0; // gait cycles walked; its fraction is where the near foot is in its cycle
  let amp = 0; // 0 = braced, holding the stone; 1 = full stride
  let clock = 0; // seconds, for the heave
  let lastX = Number.NaN;

  return {
    /** Forget where the stone was (after a resize, so the jump isn't walked). */
    reset() {
      lastX = Number.NaN;
    },

    /**
     * The pose behind a stone whose bottom centre is at (x, y) px, radius r px. ground(x) is the screen y of the line
     * at x, which starts at x = start (his feet stay on it). dt is seconds since the last pose; 0 keeps him still (no
     * steps, no heave).
     */
    pose(x: number, y: number, r: number, ground: (x: number) => number, start: number, dt: number): SisyphusPose {
      const g = (gx: number) => -ground(gx); // y up from here on
      const leg = (FIG.thigh + FIG.shin) * r;
      const dx = Number.isNaN(lastX) ? 0 : x - lastX;
      lastX = x;
      if (dt > 0) {
        clock += dt;
        // the feet stay put while on the ground (60 % of a cycle, one full stride), up to the cadence
        const cap = FIG.cadence * dt;
        phase += Math.max(-cap, Math.min(cap, (dx * 0.6) / (2 * FIG.stride * leg)));
        amp += (Math.min(1, Math.abs(dx) / dt / (3 * r)) - amp) * Math.min(1, 8 * dt);
      }

      const c: V = [x, -y + r]; // the stone's centre
      const reach = 0.92 * (FIG.upperArm + FIG.forearm) * r; // arms almost straight
      const torso = FIG.torso * r;
      const dip = amp * (0.5 - 0.5 * Math.cos(4 * Math.PI * phase)); // the hips dip once per step
      const hipHeight = leg * (FIG.hip + 0.025 * Math.sin(FIG.heave * clock) - 0.05 * dip);

      /** hands at angle `theta` round the stone, torso at `lean` (the arms rise at 0.4 of it) */
      const body = (theta: number, lean: number) => {
        const hand: V = [c[0] + 0.92 * r * Math.cos(theta), c[1] + 0.92 * r * Math.sin(theta)];
        const shoulder: V = [hand[0] - reach * Math.cos(0.4 * lean), hand[1] - reach * Math.sin(0.4 * lean)];
        const hip: V = [shoulder[0] - torso * Math.cos(lean), shoulder[1] - torso * Math.sin(lean)];
        return { theta, lean, hand, shoulder, hip, height: hip[1] - g(hip[0]) };
      };
      /** bisect t in [lo, hi] for hips at hipHeight; the hips get lower as t grows */
      const solve = (lo: number, hi: number, at: (t: number) => ReturnType<typeof body>) => {
        let b = at(lo);
        for (let i = 0; i < 14; i++) {
          b = at((lo + hi) / 2);
          if (b.height > hipHeight) lo = (lo + hi) / 2;
          else hi = (lo + hi) / 2;
        }
        return b;
      };
      // the climb under him, from the ground two radii back up to the stone
      const climb = Math.atan2(g(x) - g(x - 2 * r), 2 * r);
      const lean = Math.min(1.2, Math.max(0.4, FIG.lean - 0.6 * climb));
      let b = solve(FIG.hands[0], FIG.hands[1], (theta) => body(theta, lean));
      if (b.height > hipHeight + 0.02 * r) b = solve(lean, 1.4, (l) => body(FIG.hands[1], l));
      const { hip, shoulder } = b;
      const handFar = body(b.theta - 0.15, b.lean).hand; // the far hand a little higher

      /** A foot at gait phase q: blended by amp from its braced spot `rest` (leg lengths from the hip) to the stride. */
      const foot = (q: number, rest: number): V => {
        q -= Math.floor(q);
        const swing = q >= 0.6; // 60 % on the ground, sliding back under him as he moves; 40 % in the air
        const k = swing ? (q - 0.6) / 0.4 : q / 0.6;
        const along = swing ? 2 * k * k * (3 - 2 * k) - 1 : 1 - 2 * k; // +1 front … -1 back
        const lift = swing ? 0.25 * leg * amp * Math.sin(Math.PI * k) : 0;
        const at = (fx: number): V => [fx, g(fx) + lift];
        const reaches = (fx: number) => Math.hypot(fx - hip[0], g(fx) + lift - hip[1]) <= 0.98 * leg;
        let fx = Math.max(start, hip[0] + leg * (rest + (FIG.stride * along - 0.15 - rest) * amp));
        if (!reaches(fx)) {
          // out of reach (steep ground): the farthest spot towards the hips that the leg reaches
          let near = hip[0];
          for (let i = 0; i < 10; i++) {
            const mid = (near + fx) / 2;
            if (reaches(mid)) near = mid;
            else fx = mid;
          }
          fx = near;
        }
        return at(fx);
      };
      const [kneeNear, footNear] = limb(hip, foot(phase, FIG.stance[0]), FIG.thigh * r, FIG.shin * r, 1);
      const [kneeFar, footFar] = limb(hip, foot(phase + 0.5, FIG.stance[1]), FIG.thigh * r, FIG.shin * r, 1);
      const [elbowNear, wristNear] = limb(shoulder, b.hand, FIG.upperArm * r, FIG.forearm * r, -1);
      const [elbowFar, wristFar] = limb(shoulder, handFar, FIG.upperArm * r, FIG.forearm * r, -1);
      const nod = b.lean - 0.2; // the head bowed a little towards the stone
      const h = (FIG.neck + FIG.head) * r;
      const head: V = [shoulder[0] + h * Math.cos(nod), shoulder[1] + h * Math.sin(nod)];

      const screen = (p: V): V => [p[0], -p[1]];
      return {
        near: [[footNear, kneeNear, hip, shoulder, elbowNear, wristNear].map(screen)],
        far: [[footFar, kneeFar, hip].map(screen), [shoulder, elbowFar, wristFar].map(screen)],
        head: screen(head),
        headRadius: FIG.head * r,
      };
    },
  };
}

const polylines = (lines: V[][]) =>
  lines.map((l) => "M" + l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")).join("");

export function drawSisyphus(
  parts: { near: SVGPathElement; far: SVGPathElement; head: SVGCircleElement },
  pose: SisyphusPose,
) {
  parts.near.setAttribute("d", polylines(pose.near));
  parts.far.setAttribute("d", polylines(pose.far));
  parts.head.setAttribute("cx", pose.head[0].toFixed(1));
  parts.head.setAttribute("cy", pose.head[1].toFixed(1));
  parts.head.setAttribute("r", pose.headRadius.toFixed(1));
}
