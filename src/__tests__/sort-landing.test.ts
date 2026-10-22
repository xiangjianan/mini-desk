import { afterEach, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { landSortPreview } from "../utils/sortLanding";

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });
it("animates only the floating list to the committed slot, then reveals the real list", async () => {
  const preview = document.body.appendChild(document.createElement("section"));
  const destination = document.body.appendChild(document.createElement("section"));
  const neighbour = document.body.appendChild(document.createElement("section"));
  const neighbourAnimate = vi.fn(); neighbour.animate = neighbourAnimate;
  vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ left: 40, top: 80, width: 200, height: 150 } as DOMRect);
  vi.spyOn(destination, "getBoundingClientRect").mockReturnValue({ left: 10, top: 300, width: 220, height: 150 } as DOMRect);
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const animate = vi.fn(() => ({ finished }) as unknown as Animation); preview.animate = animate;
  landSortPreview(preview, destination);
  expect(destination.style.visibility).toBe("hidden");
  await nextTick();
  expect(animate).toHaveBeenCalledWith([
    expect.objectContaining({ left: "40px", top: "80px" }),
    expect.objectContaining({ left: "10px", top: "300px", opacity: 1 }),
  ], expect.objectContaining({ duration: 180 }));
  expect(neighbourAnimate).not.toHaveBeenCalled();
  expect(preview.isConnected).toBe(true);
  finish(); await finished; await Promise.resolve();
  expect(destination.style.visibility).toBe("");
  expect(preview.isConnected).toBe(false);
});
it("lands immediately for reduced motion", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const preview = document.body.appendChild(document.createElement("section"));
  const destination = document.body.appendChild(document.createElement("section"));
  preview.animate = vi.fn();
  landSortPreview(preview, destination);
  await nextTick();
  expect(preview.animate).not.toHaveBeenCalled();
  expect(preview.isConnected).toBe(false);
  expect(destination.style.visibility).toBe("");
});
