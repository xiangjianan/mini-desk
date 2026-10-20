import { describe, expect, it } from 'vitest';
import { defaultWorkspace } from '../state/defaults';
import { checkCapacity, checkWorkspaceGrowth } from '../state/capacity';
import { loadCapacityDrafts, saveCapacityDrafts } from '../state/capacityDrafts';

describe('workspace capacity', () => {
  it('counts only visible actions, including the other category', () => {
    const ws = defaultWorkspace();
    ws.quickButtons = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: 'x', type: 'text', value: 'x', hidden: false }));
    ws.quickButtons.push({ ...ws.quickButtons[0], id: 'hidden', hidden: true });
    expect(checkCapacity(ws, 'quick')?.current).toBe(12);
    ws.quickButtons[0].hidden = true;
    expect(checkCapacity(ws, 'quick')).toBeUndefined();
  });
  it('limits each category and open-reminder list independently', () => {
    const ws = defaultWorkspace();
    ws.todos.morning = Array.from({ length: 7 }, (_, i) => ({ id: String(i), text: 'x', done: false }));
    ws.todos.morning.push({ id: 'done', text: 'done', done: true });
    expect(checkCapacity(ws, 'todos', 1, 'morning')).toMatchObject({ current: 7, limit: 7 });
    expect(checkCapacity(ws, 'todos', 1, 'other')).toBeUndefined();
    expect(checkCapacity(ws, 'todos', 1, 'morning', true)).toBeUndefined();
  });
  it('permits edits and shrinking of old oversized data but blocks growth', () => {
    const ws = defaultWorkspace(); ws.images = Array.from({ length: 15 }, (_, i) => ({ id: String(i), createdAt: i }));
    expect(checkWorkspaceGrowth(ws, { ...ws, images: ws.images.slice(1) })).toBeUndefined();
    expect(checkWorkspaceGrowth(ws, { ...ws, images: ws.images.map(v => ({ ...v, src: 'new' })) })).toBeUndefined();
    expect(checkWorkspaceGrowth(ws, { ...ws, images: [...ws.images, { id: 'new', createdAt: 99 }] })?.kind).toBe('images');
  });
  it('checks new lists, tags, merges and unhide before mutation', () => {
    const ws = defaultWorkspace(); ws.quickTags = Array.from({ length: 4 }, (_, i) => ({ id: String(i), title: String(i) }));
    expect(checkWorkspaceGrowth(ws, { ...ws, quickTags: [...ws.quickTags, { id: '5', title: '5' }] })?.kind).toBe('tags');
    ws.quickButtons = Array.from({ length: 13 }, (_, i) => ({ id: String(i), title: 'x', type: 'text', value: 'x', hidden: i === 12, tagId: '0' }));
    expect(checkWorkspaceGrowth(ws, { ...ws, quickButtons: ws.quickButtons.map(b => ({ ...b, hidden: false })) })?.kind).toBe('quick');
  });
  it('persists drafts and rejects malformed persisted values', () => {
    localStorage.clear();
    expect(saveCapacityDrafts([{ kind: 'todos', workspaceId: 'default', target: 'morning', items: [{ text: 'keep me' }] }])).toBe(true);
    expect(loadCapacityDrafts()[0]).toMatchObject({ items: [{ text: 'keep me' }] });
    localStorage.setItem('mini-desk-capacity-drafts-v1', '[{"kind":"todos","workspaceId":"x","target":3,"items":[null]}]');
    expect(loadCapacityDrafts()).toEqual([]);
  });
});

describe('cross-tab image capacity', () => {
  it('does not merge two independent additions past the free cap', async () => {
    const { defaultState, STORAGE_KEY } = await import('../state/defaults');
    const { saveStateWithConflictCheck } = await import('../state/storage');
    const baseline = defaultState();
    baseline.sync = { clientId: 'local', revision: 1, updatedAt: 1 };
    baseline.workspaces[0].images = Array.from({ length: 9 }, (_, i) => ({ id: String(i), createdAt: i }));
    const remote = structuredClone(baseline);
    remote.sync = { clientId: 'other', revision: 2, updatedAt: 2 };
    remote.workspaces[0].images.push({ id: 'remote', createdAt: 10 });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    baseline.workspaces[0].images.push({ id: 'local', createdAt: 11 });
    const result = saveStateWithConflictCheck(baseline, { clientId: 'local', scope: 'images', imageCapacity: 10 });
    expect(result.status).toBe('conflict');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).workspaces[0].images).toHaveLength(10);
  });
});
