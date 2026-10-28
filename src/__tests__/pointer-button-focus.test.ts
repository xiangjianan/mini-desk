import { expect, it } from "vitest";
import { trackPointerButtonFocus } from "../utils/pointerButtonFocus";

it("suppresses pointer-origin focus rings until focus changes or Tab navigation begins", () => {
  const dispose = trackPointerButtonFocus(document);
  const button = document.createElement("button");
  const icon = document.createElement("span");
  button.append(icon);
  document.body.append(button);
  try {
    icon.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    button.focus();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(button.hasAttribute("data-pointer-focus")).toBe(true);
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(button.hasAttribute("data-pointer-focus")).toBe(false);
    icon.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    button.blur();
    expect(button.hasAttribute("data-pointer-focus")).toBe(false);
  } finally {
    dispose();
    button.remove();
  }
});
