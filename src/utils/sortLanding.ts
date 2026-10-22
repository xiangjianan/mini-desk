import { nextTick } from "vue";

/** Only the floating list lands; its neighbours already occupy their final slots. */
export function landSortPreview(preview: HTMLElement, destination: HTMLElement): void {
  const visibility = destination.style.visibility;
  destination.style.visibility = "hidden";
  function finish(): void {
    destination.style.visibility = visibility;
    preview.remove();
  }
  void nextTick(() => {
    if (!destination.isConnected || !preview.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const from = preview.getBoundingClientRect();
    const to = destination.getBoundingClientRect();
    const animation = preview.animate([
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: "none", opacity: 0.8 },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, transform: "none", opacity: 1 },
    ], { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" });
    void animation.finished.then(finish, finish);
  });
}
