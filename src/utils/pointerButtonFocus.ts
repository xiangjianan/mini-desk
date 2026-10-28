/** Keep pointer-focused buttons from acquiring a keyboard ring on Space/Enter. */
export function trackPointerButtonFocus(root: Document): () => void {
  let pointerButton: HTMLButtonElement | null = null;
  const clear = () => {
    pointerButton?.removeAttribute("data-pointer-focus");
    pointerButton = null;
  };
  const onPointerDown = (event: PointerEvent) => {
    clear();
    const target = event.target;
    pointerButton = target instanceof Element ? target.closest("button") : null;
    pointerButton?.setAttribute("data-pointer-focus", "");
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab") clear();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (event.target === pointerButton) clear();
  };
  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("keydown", onKeyDown, true);
  root.addEventListener("focusout", onFocusOut, true);
  return () => {
    clear();
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("keydown", onKeyDown, true);
    root.removeEventListener("focusout", onFocusOut, true);
  };
}
