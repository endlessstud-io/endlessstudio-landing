/**
 * Behaviour of the project words (ProjectHint.astro): each card opens towards the side of the screen with more room, and
 * its video (if any) plays only while it is open. Called once by the component that holds the words.
 */
export function initProjectHints(root: ParentNode = document) {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const hint of root.querySelectorAll<HTMLElement>("[data-hint]")) {
    const video = hint.querySelector("video");
    const open = () => {
      const r = hint.getBoundingClientRect();
      hint.dataset.side = r.left + r.width / 2 < window.innerWidth / 2 ? "right" : "left";
      hint.dataset.vert = window.innerHeight - r.bottom > r.top ? "below" : "above";
      if (video && !still) video.play().catch(() => {});
    };
    const close = () => {
      if (!video) return;
      video.pause();
      video.currentTime = 0;
    };
    hint.addEventListener("pointerenter", open);
    hint.addEventListener("focus", open);
    hint.addEventListener("pointerleave", close);
    hint.addEventListener("blur", close);
  }
}
