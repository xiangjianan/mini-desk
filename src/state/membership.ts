/** Product price confirmed by the owner; the server still owns order verification and signing. */
export const CAPACITY_MEMBERSHIP_AMOUNT = 1990;
export const CAPACITY_MEMBERSHIP_CHANNEL = 'alipay' as const;
export interface CapacityLicense { payload: string; signature: string }
export interface MembershipOffer { id: string; amount: number; currency: 'CNY'; channel: 'wechat' | 'alipay'; description: string; supportUrl: string }
export interface MembershipOrder { id: string; qrUrl: string; expiresAt: number; recoveryCode: string }
const KEY = 'mini-desk-capacity-license-v1';
const API = (import.meta.env.VITE_MEMBERSHIP_API ?? '').replace(/\/+$/, '');
const PUBLIC_KEY = import.meta.env.VITE_MEMBERSHIP_PUBLIC_KEY ?? '';
export function membershipConfigured(): boolean { return Boolean(API && PUBLIC_KEY); }
function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export async function verifyCapacityLicense(license: unknown, now = Date.now()): Promise<boolean> {
  try {
    if (!PUBLIC_KEY || !license || typeof license !== 'object') return false;
    const { payload, signature } = license as CapacityLicense;
    if (typeof payload !== 'string' || typeof signature !== 'string') return false;
    const claims = JSON.parse(new TextDecoder().decode(bytes(payload)));
    if (claims.product !== 'mini-desk-capacity' || typeof claims.id !== 'string' || !claims.id ||
      typeof claims.issuedAt !== 'number' || !Number.isFinite(claims.issuedAt) || claims.issuedAt > now ||
      (claims.expiresAt !== undefined && (typeof claims.expiresAt !== 'number' || !Number.isFinite(claims.expiresAt) || claims.expiresAt <= now))) return false;
    const key = await crypto.subtle.importKey('jwk', JSON.parse(PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(signature), new TextEncoder().encode(payload));
  } catch { return false; }
}
export async function loadCapacityLicense(): Promise<boolean> {
  try { return verifyCapacityLicense(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return false; }
}
export async function acceptCapacityLicense(license: unknown): Promise<boolean> {
  if (!await verifyCapacityLicense(license)) return false;
  localStorage.setItem(KEY, JSON.stringify(license));
  return true;
}
async function request(path: string, body?: unknown): Promise<unknown> {
  if (!membershipConfigured()) throw new Error('unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('payment-unavailable');
    return await response.json();
  } finally { clearTimeout(timer); }
}
export async function getMembershipOffer(): Promise<MembershipOffer> {
  const value = await request('/offer') as MembershipOffer;
  if (!value || typeof value.id !== 'string' || !Number.isSafeInteger(value.amount) || value.amount <= 0 || value.currency !== 'CNY' || !['wechat', 'alipay'].includes(value.channel) || typeof value.description !== 'string' || typeof value.supportUrl !== 'string' || !/^https:\/\//.test(value.supportUrl)) throw new Error('invalid-offer');
  return value;
}
export async function createMembershipOrder(offer: MembershipOffer): Promise<MembershipOrder> {
  const keyName = 'mini-desk-capacity-order-key-v1';
  let saved: { offerId: string; key: string } | undefined;
  try { saved = JSON.parse(localStorage.getItem(keyName) ?? 'null') ?? undefined; } catch { /* Start a fresh key. */ }
  const key = saved?.offerId === offer.id && typeof saved.key === 'string' ? saved.key : crypto.randomUUID();
  localStorage.setItem(keyName, JSON.stringify({ offerId: offer.id, key }));
  const value = await request('/orders', { offerId: offer.id, idempotencyKey: key }) as MembershipOrder;
  if (!value || typeof value.id !== 'string' || !/^(weixin:\/\/|https:\/\/)/.test(value.qrUrl) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || typeof value.recoveryCode !== 'string' || !value.recoveryCode) throw new Error('invalid-order');
  return value;
}
export async function checkMembershipOrder(order: MembershipOrder): Promise<boolean> {
  const value = await request(`/orders/${encodeURIComponent(order.id)}`, { recoveryCode: order.recoveryCode }) as { license?: unknown };
  return value?.license ? acceptCapacityLicense(value.license) : false;
}
export async function restoreMembership(code: string): Promise<boolean> {
  const value = await request('/restore', { recoveryCode: code.trim() }) as { license?: unknown };
  return acceptCapacityLicense(value?.license);
}
