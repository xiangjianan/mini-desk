import type { GuideKey } from "../types";

export interface TipRotationState {
  guideKey: GuideKey;
  index: number;
}

/** 气泡 anchor 的容器选择器 → 右键「Tips」所用的指南键（涵盖 getCompanionPosition 认的锚点容器，并按各面板容器扩展）。 */
const ANCHOR_SELECTOR_TO_GUIDE: ReadonlyArray<{ selector: string; guideKey: GuideKey }> = [
  { selector: ".image-preview, .preview-main, .preview-stage, .image-panel", guideKey: "images" },
  { selector: ".todo-section, .todo-panel", guideKey: "todos" },
  { selector: ".quick-block", guideKey: "quickButtons" },
  // TextPanel 只在 SpacePanel 内部使用，需先认外层空间容器，否则空间里的文本会被误判成便签。
  { selector: ".space-panel", guideKey: "workspace" },
  { selector: ".text-panel, .split-block, .panel", guideKey: "workspace" },
];

/** GIF 点击的 Tips 与右键菜单「Tips」共用同一份指南文案（GUIDE_MESSAGES），这里只负责定位该用哪个键。 */
export function resolveTipGuideKey(input: { guideKey?: GuideKey | null; anchor?: HTMLElement | null }): GuideKey {
  if (input.guideKey) return input.guideKey;
  const anchor = input.anchor ?? null;
  if (anchor && typeof anchor.closest === "function") {
    for (const entry of ANCHOR_SELECTOR_TO_GUIDE) {
      if (anchor.closest(entry.selector)) return entry.guideKey;
    }
  }
  return "workspace";
}

export function advanceTipRotation(state: TipRotationState | null, guideKey: GuideKey, tipsLength: number): TipRotationState {
  if (tipsLength <= 0) return { guideKey, index: 0 };
  if (!state || state.guideKey !== guideKey) return { guideKey, index: 0 };
  return { guideKey, index: (state.index + 1) % tipsLength };
}
