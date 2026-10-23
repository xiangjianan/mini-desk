/** Subscribe with an initial value and matching cleanup, including older Safari. */
export function observeMediaQuery(query: string, onChange: (matches: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(query);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  onChange(media.matches);
  if (media.addEventListener) {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener(listener);
  return () => media.removeListener(listener);
}
