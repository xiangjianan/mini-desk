import type { PolishStyle } from "../sync/polishClient";

/** AI 润色子菜单的风格项：key 同时用于菜单项与 select 反查 style，保持单一来源。 */
export const POLISH_STYLE_ENTRIES: { key: string; style: PolishStyle; labelKey: "polishStyleTech" | "polishStyleConcise" | "polishStyleCasual" }[] = [
  { key: "smart-polish-tech", style: "tech", labelKey: "polishStyleTech" },
  { key: "smart-polish-concise", style: "concise", labelKey: "polishStyleConcise" },
  { key: "smart-polish-casual", style: "casual", labelKey: "polishStyleCasual" },
];

