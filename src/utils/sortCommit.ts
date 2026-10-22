import { nextTick } from "vue";

/** Vue must commit the final order without replaying the preview's movement. */
export function suppressSortCommitMotion(root: HTMLElement): void {
  root.classList.add("is-sort-committing");
  void nextTick(() => {
    // Flush the committed layout while transition detection is disabled.
    root.getBoundingClientRect();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove("is-sort-committing"));
    });
  });
}
