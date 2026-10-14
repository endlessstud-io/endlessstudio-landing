/**
 * The landing's cursor: an SVG eye that follows the pointer and blinks now and then.
 *
 * Only for a mouse-like pointer (touch keeps no cursor at all); the native pointer is hidden by the
 * `has-eye-cursor` class, which is set only once the eye is live, so a failed script never leaves the page
 * without a cursor.
 */

const BLINK = {
  /** ms between blinks, picked uniformly */
  minGap: 2200,
  maxGap: 6800,
  /** chance that a blink comes twice in a row */
  double: 0.18,
  /** ms for one close + open */
  duration: 200,
  /** how far the lids close (scaleY of the eye) */
  closed: 0.1,
};

export function mountEyeCursor(eye: SVGSVGElement): () => void {
  const lid = eye.querySelector<SVGGElement>("[data-eye-lid]");
  if (!lid || !matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};

  const root = document.documentElement;
  root.classList.add("has-eye-cursor");

  const move = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    eye.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    eye.dataset.visible = "true";
  };
  const leave = (e: PointerEvent) => {
    if (!e.relatedTarget) eye.dataset.visible = "false";
  };
  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerdown", move, { passive: true });
  document.addEventListener("pointerout", leave);

  const blink = () =>
    lid.animate(
      [{ transform: "scaleY(1)" }, { transform: `scaleY(${BLINK.closed})`, offset: 0.4 }, { transform: "scaleY(1)" }],
      { duration: BLINK.duration, easing: "ease-in-out" },
    );

  let timer = 0;
  const schedule = () => {
    timer = window.setTimeout(() => {
      blink();
      if (Math.random() < BLINK.double) window.setTimeout(blink, BLINK.duration + 60);
      schedule();
    }, BLINK.minGap + Math.random() * (BLINK.maxGap - BLINK.minGap));
  };
  schedule();

  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerdown", move);
    document.removeEventListener("pointerout", leave);
    root.classList.remove("has-eye-cursor");
  };
}
