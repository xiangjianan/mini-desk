/** Share one idle timer policy across native and Naive UI desk scroll surfaces. */
export const SCROLLBAR_IDLE_MS = 800;

export function installScrollActivity(root: HTMLElement): () => void {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  function show(surface: HTMLElement): void {
    const previous = timers.get(surface);
    if (previous !== undefined) clearTimeout(previous);
    surface.classList.add("is-scrolling");
    timers.set(surface, setTimeout(() => {
      surface.classList.remove("is-scrolling");
      timers.delete(surface);
    }, SCROLLBAR_IDLE_MS));
  }

  function onScroll(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".workbench-zone")) return;
    // The text mirror follows the textarea; it is not an independent scroll surface.
    if (target.classList.contains("text-mirror")) return;
    show(target);
    const scrollbar = target.closest<HTMLElement>(".n-scrollbar");
    if (scrollbar && scrollbar !== target) show(scrollbar);
  }

  // Scroll does not bubble. Capture also covers dynamically mounted lists and tabs.
  root.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    root.removeEventListener("scroll", onScroll, true);
    for (const [surface, timer] of timers) {
      clearTimeout(timer);
      surface.classList.remove("is-scrolling");
    }
    timers.clear();
  };
}
