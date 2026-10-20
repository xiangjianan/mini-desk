import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let keyPair: CryptoKeyPair;
let membership: typeof import('../state/membership');
async function license(overrides: Record<string, unknown> = {}) {
  const payload = Buffer.from(JSON.stringify({ id: 'test-license', product: 'mini-desk-capacity', issuedAt: Date.now() - 1000, ...overrides })).toString('base64url');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, new TextEncoder().encode(payload));
  return { payload, signature: Buffer.from(signature).toString('base64url') };
}
beforeEach(async () => {
  localStorage.clear(); vi.resetModules();
  keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  vi.stubEnv('VITE_MEMBERSHIP_API', 'https://payments.example.test');
  vi.stubEnv('VITE_MEMBERSHIP_PUBLIC_KEY', JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.publicKey)));
  membership = await import('../state/membership');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('capacity membership', () => {
  it('accepts only a valid signed entitlement and restores it offline', async () => {
    expect(await membership.acceptCapacityLicense(await license())).toBe(true);
    expect(await membership.loadCapacityLicense()).toBe(true);
    localStorage.setItem('mini-desk-capacity-license-v1', JSON.stringify({ unlocked: true }));
    expect(await membership.loadCapacityLicense()).toBe(false);
  });
  it('rejects expired, future-issued, wrong-product and tampered entitlements', async () => {
    expect(await membership.verifyCapacityLicense(await license({ expiresAt: Date.now() - 1 }))).toBe(false);
    expect(await membership.verifyCapacityLicense(await license({ issuedAt: Date.now() + 100000 }))).toBe(false);
    expect(await membership.verifyCapacityLicense(await license({ product: 'another-product' }))).toBe(false);
    const forged = await license(); forged.payload = Buffer.from(JSON.stringify({ id: 'forged', product: 'mini-desk-capacity', issuedAt: 0 })).toString('base64url');
    expect(await membership.verifyCapacityLicense(forged)).toBe(false);
  });
  it('does not treat pending payment or a server boolean as an entitlement', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ paid: true }) })));
    expect(await membership.checkMembershipOrder({ id: 'order', recoveryCode: 'recovery', expiresAt: Date.now() + 99999, qrUrl: 'weixin://test' })).toBe(false);
    expect(await membership.loadCapacityLicense()).toBe(false);
  });
  it('uses the same idempotency key when retrying an uncertain order creation', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ ok: true, json: async () => ({ id: 'order', qrUrl: 'weixin://test', expiresAt: Date.now() + 99999, recoveryCode: 'recovery' }) });
    vi.stubGlobal('fetch', fetch);
    const offer = { id: 'capacity', amount: 990, currency: 'CNY' as const, channel: 'wechat' as const, description: 'Test', supportUrl: 'https://example.test/support' };
    await expect(membership.createMembershipOrder(offer)).rejects.toThrow();
    await membership.createMembershipOrder(offer);
    expect(JSON.parse(fetch.mock.calls[0][1].body).idempotencyKey).toBe(JSON.parse(fetch.mock.calls[1][1].body).idempotencyKey);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('amount');
  });
  it('keeps purchase unavailable without both a backend and verification key', async () => {
    vi.stubEnv('VITE_MEMBERSHIP_API', ''); vi.resetModules(); membership = await import('../state/membership');
    expect(membership.membershipConfigured()).toBe(false);
    await expect(membership.getMembershipOffer()).rejects.toThrow('unavailable');
  });
  it('restores only the signed license returned by the recovery endpoint', async () => {
    const signed = await license(); const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({ license: signed }) })); vi.stubGlobal('fetch', fetch);
    expect(await membership.restoreMembership(' recovery ')).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body! as string)).toEqual({ recoveryCode: 'recovery' });
  });
});
