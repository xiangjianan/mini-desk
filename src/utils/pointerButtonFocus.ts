/** Keep pointer-focused buttons from acquiring a keyboard ring on Space/Enter. */
export function trackPointerButtonFocus(root: Document): () => void {
  let pointerButton: HTMLButtonElement | null = null;
  const buttonSelector = 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]';
  const skipButtons = (node: ParentNode) => {
    if (node instanceof Element && node.matches(buttonSelector) && node.getAttribute("tabindex") !== "-1") {
      node.setAttribute("tabindex", "-1");
    }
    node.querySelectorAll(buttonSelector).forEach((button) => {
      if (button.getAttribute("tabindex") !== "-1") button.setAttribute("tabindex", "-1");
    });
  };
  skipButtons(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) skipButtons(record.target);
      for (const node of record.addedNodes) if (node instanceof Element) skipButtons(node);
    }
  });
  observer.observe(root.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["tabindex", "role", "type"] });
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
    observer.disconnect();
    clear();
    root.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("keydown", onKeyDown, true);
    root.removeEventListener("focusout", onFocusOut, true);
  };
}
