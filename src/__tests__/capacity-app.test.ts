import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { mountApp } from './helpers/mount-app';
import { defaultState, defaultWorkspace, STORAGE_KEY } from '../state/defaults';
import { loadState, normalizeImportedState } from '../state/storage';
import QuickButtons from '../components/QuickButtons.vue';
import TodoPanel from '../components/TodoPanel.vue';
import ImagePanel from '../components/ImagePanel.vue';
import CapacityDialog from '../components/CapacityDialog.vue';
import { applyInboxItems } from '../sync/pull';
import { loadCapacityDrafts } from '../state/capacityDrafts';

vi.mock('naive-ui', async () => {
  const { createNaiveUiStubModule } = await import('./helpers/naive-ui-mock');
  return createNaiveUiStubModule();
});
vi.mock('../state/images', async (original) => ({
  ...await original<typeof import('../state/images')>(),
  hydrateStoredImages: vi.fn(async (images) => images), storeImagePayload: vi.fn(async () => {}),
  pruneStoredImagePayloads: vi.fn(async () => {}),
}));
let wrapper: ReturnType<typeof mountApp> | undefined;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
function seed(count = 7) {
  const state = defaultState();
  state.workspaces[0].todos.morning = Array.from({ length: count }, (_, i) => ({ id: `t${i}`, text: `Task ${i}`, done: false }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}
async function settle() { await nextTick(); await flushPromises(); await nextTick(); }

describe('capacity integration', () => {
  it('blocks the eighth task but allows edits and completion; the blocked input survives remount', async () => {
    seed(); wrapper = mountApp(); await settle();
    const panel = wrapper.getComponent(TodoPanel);
    panel.vm.$emit('create', 'morning'); await settle();
    const dialog = wrapper.getComponent(CapacityDialog);
    expect(dialog.props('show')).toBe(true);
    expect(panel.props('todos').morning).toHaveLength(7);
    dialog.vm.$emit('input', 'Do not lose this'); await settle();
    expect(loadCapacityDrafts()[0]).toMatchObject({ kind: 'input', text: 'Do not lose this' });
    panel.vm.$emit('update', 'morning', 't0', 'Edited');
    panel.vm.$emit('complete', 'morning', 't1', true); await settle();
    expect(dialog.props('problem').current).toBe(6);
    dialog.vm.$emit('submit', []); await settle();
    expect(panel.props('todos').morning.filter(todo => !todo.done)).toHaveLength(7);
    expect(panel.props('todos').morning.some(todo => todo.text === 'Do not lose this')).toBe(true);
    expect(loadCapacityDrafts()).toEqual([]);
  });
  it('does not silently truncate batches; selection adds only chosen items and retains the remainder after refresh', async () => {
    seed(5); wrapper = mountApp(); await settle();
    wrapper.getComponent(TodoPanel).vm.$emit('createFromText', 'morning', ['A', 'B', 'C', 'D', 'E']); await settle();
    const dialog = wrapper.getComponent(CapacityDialog);
    expect(loadState().workspaces[0].todos.morning).toHaveLength(5);
    expect(dialog.props('items')).toHaveLength(5);
    dialog.vm.$emit('submit', ['1', '3']); await settle();
    expect(loadState().workspaces[0].todos.morning.map(todo => todo.text)).toEqual(expect.arrayContaining(['B', 'D']));
    expect(loadCapacityDrafts()[0]).toMatchObject({ items: [{ text: 'A' }, { text: 'C' }, { text: 'E' }] });
    wrapper.unmount(); wrapper = mountApp(); await settle();
    await wrapper.get('[data-testid="capacity-resume"]').trigger('click');
    expect(wrapper.getComponent(CapacityDialog).props('items').map(item => item.text)).toEqual(['A', 'C', 'E']);
  });
  it('hidden actions release a place; unhide and cross-tag moves are checked', async () => {
    const state = seed(0);
    state.workspaces[0].quickButtons = Array.from({ length: 13 }, (_, i) => ({ id: `q${i}`, title: `Action ${i}`, value: 'x', type: 'text', hidden: i === 12 }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); wrapper = mountApp(); await settle();
    const panel = wrapper.getComponent(QuickButtons);
    panel.vm.$emit('toggleHidden', 'q12'); await settle();
    expect(panel.props('buttons').find(b => b.id === 'q12')?.hidden).toBe(true);
    panel.vm.$emit('toggleHidden', 'q0');
    panel.vm.$emit('toggleHidden', 'q12'); await settle();
    expect(panel.props('buttons').filter(b => !b.hidden)).toHaveLength(12);
    expect(panel.props('buttons').find(b => b.id === 'q12')?.hidden).toBe(false);
  });
  it('new tag plus new action is atomic when tag capacity is full', async () => {
    const state = seed(0); state.workspaces[0].quickTags = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, title: `Group ${i}` }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); wrapper = mountApp(); await settle();
    wrapper.getComponent(QuickButtons).vm.$emit('save', { title: 'New', value: 'text', type: 'text', tagTitle: 'Fifth' }); await settle();
    expect(wrapper.getComponent(QuickButtons).props('tags')).toHaveLength(4);
    expect(wrapper.getComponent(QuickButtons).props('buttons')).toHaveLength(0);
    expect(loadCapacityDrafts()[0]).toMatchObject({ kind: 'quick', items: [{ title: 'New', tagTitle: 'Fifth' }] });
  });
  it('blocks a fourth list and moving an open reminder to a full destination without removing the source', async () => {
    const state = seed();
    state.workspaces[0].todoLists.push({ id: 'second', title: 'Second', collapsed: false, compact: false }, { id: 'third', title: 'Third', collapsed: false, compact: false });
    state.workspaces[0].todos.second = [{ id: 'source', text: 'Keep', done: false }]; state.workspaces[0].todos.third = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); wrapper = mountApp(); await settle();
    const panel = wrapper.getComponent(TodoPanel);
    panel.vm.$emit('createList', undefined, 'Fourth'); await settle();
    expect(panel.props('todoLists')).toHaveLength(3);
    panel.vm.$emit('move', { period: 'second', id: 'source' }, 'morning'); await settle();
    expect(panel.props('todos').second).toHaveLength(1);
    expect(panel.props('todos').morning).toHaveLength(7);
  });
  it('rejects whole-tag moves across workspaces without mutating either workspace', async () => {
    const state = seed(0); const target = defaultWorkspace('target');
    state.workspaces[0].quickTags = [{ id: 'move', title: 'Move' }];
    state.workspaces[0].quickButtons = [{ id: 'move-action', title: 'Move', type: 'text', value: 'x', hidden: false, tagId: 'move' }];
    target.quickTags = Array.from({ length: 4 }, (_, i) => ({ id: `g${i}`, title: `Group ${i}` })); state.workspaces.push(target);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); wrapper = mountApp(); await settle();
    wrapper.getComponent(QuickButtons).vm.$emit('moveTagToWorkspace', 'move', 'target'); await settle();
    const saved = loadState(); expect(saved.workspaces[0].quickButtons).toHaveLength(1); expect(saved.workspaces[1].quickButtons).toHaveLength(0);
  });
  it('queues an entire oversized image drop without persisting any of its images', async () => {
    const state = seed(0); state.workspaces[0].images = Array.from({ length: 9 }, (_, i) => ({ id: `image${i}`, src: 'data:image/png;base64,a', createdAt: i }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); wrapper = mountApp(); await settle();
    wrapper.getComponent(ImagePanel).vm.$emit('dropFiles', [new File(['a'], 'A.png', { type: 'image/png' }), new File(['b'], 'B.png', { type: 'image/png' })]); await settle();
    expect(wrapper.getComponent(ImagePanel).props('images')).toHaveLength(9);
    expect(wrapper.getComponent(CapacityDialog).props('items')).toHaveLength(2);
    expect(wrapper.getComponent(CapacityDialog).props('problem').current).toBe(9);
  });
  it('partially accepts pending captures and keeps unrelated drafts when discarding the remainder', async () => {
    const state = seed(6);
    state.workspaces[0].pendingInbox = [{ id: 'incoming-a', text: 'Capture A', createdAt: 1 }, { id: 'incoming-b', text: 'Capture B', createdAt: 2 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem('mini-desk-capacity-drafts-v1', JSON.stringify([{ kind: 'input', workspaceId: 'default', target: 'morning', text: 'Separate draft' }]));
    wrapper = mountApp(); await settle();
    await wrapper.get('[data-testid="capacity-pending-inbox"]').trigger('click');
    wrapper.getComponent(CapacityDialog).vm.$emit('submit', ['incoming-b']); await settle();
    expect(loadState().workspaces[0].todos.morning.some(todo => todo.text === 'Capture B')).toBe(true);
    expect(loadState().workspaces[0].pendingInbox?.map(item => item.id)).toEqual(['incoming-a']);
    wrapper.getComponent(CapacityDialog).vm.$emit('discard'); await settle();
    expect(loadState().workspaces[0].pendingInbox ?? []).toEqual([]);
    expect(loadCapacityDrafts()[0]).toMatchObject({ text: 'Separate draft' });
  });
  it('keeps both text drafts until the user explicitly chooses whether to replace', async () => {
    seed();
    localStorage.setItem('mini-desk-capacity-drafts-v1', JSON.stringify([{ kind: 'input', workspaceId: 'default', target: 'morning', text: 'Original draft' }]));
    wrapper = mountApp(); await settle();
    wrapper.getComponent(TodoPanel).vm.$emit('createFromText', 'morning', ['New A', 'New B']); await settle();
    expect(loadCapacityDrafts()).toHaveLength(2);
    expect(wrapper.get('.capacity-replacement-dialog').text()).toContain('Original draft');
    expect(wrapper.get('.capacity-replacement-dialog').text()).toContain('New A');
    wrapper.unmount(); wrapper = mountApp(); await settle();
    await wrapper.findAll('button').find(button => button.text() === '用本次内容替换原草稿')!.trigger('click');
    expect(loadCapacityDrafts()).toHaveLength(1);
    expect(loadCapacityDrafts()[0]).toMatchObject({ kind: 'todos', items: [{ text: 'New A' }, { text: 'New B' }] });
  });
  it('rolls back every image metadata entry if persisting a prepared batch fails', async () => {
    const state = seed(0);
    state.workspaces[0].images = Array.from({ length: 8 }, (_, i) => ({ id: `old${i}`, createdAt: i }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); wrapper = mountApp(); await settle();
    const originalSet = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    });
    try {
      wrapper.getComponent(ImagePanel).vm.$emit('dropFiles', [new File(['a'], 'A.png', { type: 'image/png' }), new File(['b'], 'B.png', { type: 'image/png' })]);
      await vi.waitFor(() => expect(wrapper!.findComponent(CapacityDialog).exists()).toBe(true));
      expect(wrapper.getComponent(ImagePanel).props('images')).toHaveLength(8);
      expect(wrapper.getComponent(CapacityDialog).props('items')).toHaveLength(2);
      expect(loadState().workspaces[0].images).toHaveLength(8);
    } finally { spy.mockRestore(); }
  });
  it('does not render a fake payable code when payment is unconfigured', async () => {
    seed(); wrapper = mountApp(); await settle(); wrapper.getComponent(TodoPanel).vm.$emit('create', 'morning'); await settle();
    const dialog = wrapper.getComponent(CapacityDialog);
    const buy = dialog.findAll('button').find(button => button.text() === '仍然需要更多空间');
    await buy!.trigger('click'); await settle();
    expect(dialog.text()).toContain('暂未开放购买'); expect(dialog.text()).toContain('19.90'); expect(dialog.text()).toContain('支付宝'); expect(dialog.find('.capacity-qr').exists()).toBe(false);
  });
});

describe('pending capture persistence', () => {
  it('stages the entire overflow batch with stable identities and survives serialization', () => {
    const ws = defaultWorkspace(); ws.inbox = { code: 'AB2CDE4FGHJK', lastSeenAt: 0, todoListId: 'morning', noteTarget: 'workspace' };
    ws.todos.morning = Array.from({ length: 6 }, (_, i) => ({ id: String(i), text: 'x', done: false }));
    const batch = [{ messageId: 'm1', kind: 'todo' as const, text: 'A', createdAt: 1 }, { messageId: 'm2', kind: 'todo' as const, text: 'B', createdAt: 2 }];
    const first = applyInboxItems(ws, batch, 2); const retried = applyInboxItems(first, batch, 2);
    expect(first.todos.morning).toHaveLength(6); expect(retried.pendingInbox).toHaveLength(2);
    const state = defaultState(); state.workspaces = [retried];
    expect(normalizeImportedState(JSON.parse(JSON.stringify(state))).workspaces[0].pendingInbox).toEqual(first.pendingInbox);
  });
});
