import type { GuideKey } from "../types";

export interface TipPickState {
  guideKey: GuideKey;
  index: number;
}

/** 气泡 anchor 的容器选择器 → 右键「Tips」/GIF 点击随机抽取所用的指南键（按各面板容器匹配）。 */
const ANCHOR_SELECTOR_TO_GUIDE: ReadonlyArray<{ selector: string; guideKey: GuideKey }> = [
  { selector: ".image-preview, .preview-main, .preview-stage, .image-panel", guideKey: "images" },
  { selector: ".todo-section, .todo-panel", guideKey: "todos" },
  { selector: ".quick-block", guideKey: "quickButtons" },
  // TextPanel 只在 SpacePanel 内部使用，需先认外层空间容器，否则空间里的文本会被误判成便签。
  { selector: ".space-panel", guideKey: "workspace" },
  { selector: ".text-panel, .split-block, .panel", guideKey: "workspace" },
];

/** GIF 点击的 Tips 与右键菜单「Tips」共用同一份指南文案（GUIDE_MESSAGES），两条路径都按区域随机抽取。 */
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

/** 从区域文案池随机挑一条：新区域在全池均匀随机；同区域连点时在「除上一条外」
 * 均匀随机（池长 > 1 时不与上一条相同，避免连点重复同一句）。 */
export function pickRandomTip(state: TipPickState | null, guideKey: GuideKey, tipsLength: number): TipPickState {
  if (tipsLength <= 1) return { guideKey, index: 0 };
  if (!state || state.guideKey !== guideKey) {
    return { guideKey, index: Math.floor(Math.random() * tipsLength) };
  }
  const index = (state.index + 1 + Math.floor(Math.random() * (tipsLength - 1))) % tipsLength;
  return { guideKey, index };
}
