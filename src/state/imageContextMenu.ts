import type { getUiText } from "./i18n";

type UiText = ReturnType<typeof getUiText>;

export type ImageContextMenuKey =
  | "preview"
  | "close-preview"
  | "copy"
  | "paste"
  | "edit"
  | "delete"
  | "pin-top"
  | "pin-bottom"
  | "tips";

export interface ImageContextMenuItem {
  key: ImageContextMenuKey;
  label: string;
}

export function getImageItemContextMenuItems(
  uiText: UiText,
  previewOpen: boolean,
): ImageContextMenuItem[] {
  return [
    {
      label: previewOpen ? uiText.preview.close : uiText.common.preview,
      key: previewOpen ? "close-preview" : "preview",
    },
    { label: uiText.common.copy, key: "copy" },
    { label: uiText.common.edit, key: "edit" },
    { label: uiText.common.pinToTop, key: "pin-top" },
    { label: uiText.common.pinToBottom, key: "pin-bottom" },
    { label: uiText.common.delete, key: "delete" },
  ];
}

export function getBlankImageContextMenuItems(uiText: UiText): ImageContextMenuItem[] {
  return [
    { label: uiText.images.pasteImage, key: "paste" },
    { label: uiText.common.tips, key: "tips" },
  ];
}
