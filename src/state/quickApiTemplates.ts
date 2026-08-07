import type { QuickApiBodyType, QuickApiHeader, QuickApiMethod } from "../types";

/**
 * A one-tap template for the "api" quick-button type. Selecting one fills the
 * request shape (method / headers / body type / body) so the user only has to
 * supply the endpoint URL and title. The title and URL stay user-specific.
 */
export interface QuickApiTemplate {
  key: "getJson" | "postJson" | "postForm";
  method: QuickApiMethod;
  headers: QuickApiHeader[];
  bodyType: QuickApiBodyType;
  body: string;
}

export const QUICK_API_TEMPLATES: readonly QuickApiTemplate[] = [
  {
    key: "getJson",
    method: "GET",
    headers: [{ key: "Content-Type", value: "application/json" }],
    bodyType: "none",
    body: "",
  },
  {
    key: "postJson",
    method: "POST",
    headers: [{ key: "Content-Type", value: "application/json" }],
    bodyType: "json",
    body: "{}",
  },
  {
    key: "postForm",
    method: "POST",
    headers: [{ key: "Content-Type", value: "application/x-www-form-urlencoded" }],
    bodyType: "form",
    body: "key=value",
  },
];

/** Find a template by key. */
export function findQuickApiTemplate(key: string): QuickApiTemplate | undefined {
  return QUICK_API_TEMPLATES.find((template) => template.key === key);
}
