import { readClipboardText } from "./clipboard";
import { POLISH_MAX_CHARS, type PolishKind, type PolishResult } from "../sync/polishClient";

/**
 * 本模块承载两条润色流程：智能粘贴（剪贴板全文）与智能润色（编辑器选中文本），共用 polishText 主干。
 * 流程可重入；宿主负责过期判断（如中途切换工作区），insert/apply 闭包应捕获进入流程时的落位上下文。
 */

/** 气泡阶段：working=整理中（长驻，等结果替换），done=成功，fallback=降级（粘贴=插原文，润色=保留原文）。 */
export type SmartPastePhase = "working" | "done" | "fallback";

export interface SmartPasteMessages {
  working: string;
  done: (count: number) => string;
  fallback: string;
  tooLarge: string;
}

/** 两条润色流程（智能粘贴/智能润色）共享的选项基座。 */
interface PolishFlowBase {
  kind: PolishKind;
  /** 宿主注入的润色调用（内部完成配对码管理）；必须不抛异常——任何失败返回 null 或 {fallback:true}。未注入时面板不渲染智能粘贴入口。 */
  polish: (kind: PolishKind, text: string) => Promise<PolishResult>;
  messages: SmartPasteMessages;
  /** 气泡锚点：进入流程时解析一次，贯穿 working→done/fallback。 */
  anchor?: HTMLElement;
  notify: (phase: SmartPastePhase, message: string, anchor: HTMLElement | undefined) => void;
}

export interface SmartPasteOptions extends PolishFlowBase {
  /** 结果落位：成功=整理后的条目；失败/超长=原文的兜底拆分。 */
  insert: (texts: string[]) => void;
  /** 失败兜底时的原文拆分（便签=[原文整体]，提醒=按行拆条）。 */
  fallbackTexts: (raw: string) => string[];
}

/** 智能粘贴/智能润色共用主干：空白预检 → 限长预检 → 气泡「整理中」→ 服务端整理 → 应用/降级。 */
async function polishText(raw: string, base: PolishFlowBase, apply: (texts: string[]) => void, onFallback: () => void): Promise<void> {
  if (!raw.trim()) return;
  const { anchor, notify, messages } = base;
  // raw.length 按 UTF-16 计，服务端按码点计：客户端略严，方向安全。
  if (raw.length > POLISH_MAX_CHARS) {
    onFallback();
    notify("fallback", messages.tooLarge, anchor);
    return;
  }
  notify("working", messages.working, anchor);
  let result: PolishResult = null;
  try {
    result = await base.polish(base.kind, raw);
  } catch {
    result = null; // 宿主包装异常视同网络失败：任何异常都不击穿「最坏=普通粘贴」承诺。
  }
  if (result !== null && "items" in result && result.items.length > 0) {
    apply(result.items);
    notify("done", messages.done(result.items.length), anchor);
    return;
  }
  onFallback();
  notify("fallback", messages.fallback, anchor);
}

/** 智能粘贴编排：读剪贴板 → 共用主干 → 落位/降级。
 *  最坏情况等于普通粘贴：任何失败都插入原文并提示。 */
export async function runSmartPaste(options: SmartPasteOptions): Promise<void> {
  const clipboardText = await readClipboardText();
  if (typeof clipboardText !== "string" || !clipboardText.trim()) return;
  await polishText(clipboardText, options, options.insert, () => options.insert(options.fallbackTexts(clipboardText)));
}

export interface SelectionPolishOptions extends PolishFlowBase {
  /** 待润色的选中文本（调用方从编辑器选区取）。 */
  text: string;
  /** 成功时用整理结果替换选区。 */
  apply: (texts: string[]) => void;
}

/** 智能润色编排（选中文本）：与智能粘贴同主干；失败/超长保留原文，只提示。 */
export async function runSelectionPolish(options: SelectionPolishOptions): Promise<void> {
  await polishText(options.text, options, options.apply, () => undefined);
}

/** 从 uiText 组装两区域各自的文案（done 模板按 kind 区分，{count} 占位替换）。 */
export function smartPasteMessages(
  ui: { app: { polishWorking: string; polishTodoDone: string; polishNoteDone: string; polishFallback: string; polishTooLarge: string } },
  kind: PolishKind,
): SmartPasteMessages {
  const template = kind === "todo" ? ui.app.polishTodoDone : ui.app.polishNoteDone;
  return {
    working: ui.app.polishWorking,
    done: (count) => template.replace("{count}", () => String(count)),
    fallback: ui.app.polishFallback,
    tooLarge: ui.app.polishTooLarge,
  };
}

/** 选中文本润色的文案：done 沿用便签排版口径，失败/超长改为「保留原文」口径。 */
export function selectionPolishMessages(
  ui: { app: { polishWorking: string; polishNoteDone: string; polishKeepFallback: string; polishKeepTooLarge: string } },
): SmartPasteMessages {
  return {
    working: ui.app.polishWorking,
    done: (count) => ui.app.polishNoteDone.replace("{count}", () => String(count)),
    fallback: ui.app.polishKeepFallback,
    tooLarge: ui.app.polishKeepTooLarge,
  };
}
