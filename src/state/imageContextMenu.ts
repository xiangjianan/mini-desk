import type { getUiText } from "./i18n";

type UiText = ReturnType<typeof getUiText>;

export type ImageContextMenuKey =
  | "preview"
  | "close-preview"
  | "copy"
  | "edit"
  | "delete"
  | "paste-before"
  | "paste-after"
  | "paste-replace"
  | "pin-top"
  | "pin-bottom"
  | "tips"
  | "paste";

export interface ImageContextMenuItem {
  key: ImageContextMenuKey;
  label: string;
}

export function getImageItemContextMenuItems(
  uiText: UiText,
  previewOpen: boolean,
  includePasteActions = false,
): ImageContextMenuItem[] {
  return [
    {
      label: previewOpen ? uiText.preview.close : uiText.common.preview,
      key: previewOpen ? "close-preview" : "preview",
    },
    { label: uiText.common.copy, key: "copy" },
    { label: uiText.common.edit, key: "edit" },
    { label: uiText.common.delete, key: "delete" },
    ...(includePasteActions
      ? [
          { label: uiText.images.pasteBefore, key: "paste-before" as const },
          { label: uiText.images.pasteAfter, key: "paste-after" as const },
          { label: uiText.images.pasteReplace, key: "paste-replace" as const },
        ]
      : []),
    { label: uiText.common.pinToTop, key: "pin-top" },
    { label: uiText.common.pinToBottom, key: "pin-bottom" },
    { label: uiText.common.tips, key: "tips" },
  ];
}

export function getBlankImageContextMenuItems(uiText: UiText): ImageContextMenuItem[] {
  return [
    { label: uiText.images.pasteImage, key: "paste" },
    { label: uiText.common.tips, key: "tips" },
  ];
}
