import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CapacityDialog from '../components/CapacityDialog.vue';
import { modalStub } from './helpers/stubs';
vi.mock('naive-ui', async () => {
  const { createNaiveUiStubModule } = await import('./helpers/naive-ui-mock');
  return createNaiveUiStubModule();
});
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
describe('capacity dialog controls', () => {
  it('lets a user select by row without silently choosing the first items', async () => {
    wrapper = mount(CapacityDialog, { props: { show: true, language: 'zh', problem: { kind: 'todos', current: 6, limit: 7, requested: 3 }, items: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] }, global: { stubs: { NModal: modalStub } } });
    expect(wrapper.findAll('[role="checkbox"]').every(item => item.attributes('aria-checked') === 'false')).toBe(true);
    await wrapper.findAll('.capacity-choice')[1].trigger('click');
    expect(wrapper.get('[aria-label="B"]').attributes('aria-checked')).toBe('true');
    await wrapper.findAll('.capacity-choice')[2].trigger('click');
    expect(wrapper.get('[aria-label="C"]').attributes('aria-checked')).toBe('false');
    const add = wrapper.findAll('button').find(button => button.text() === '加入 1 项');
    await add!.trigger('click');
    expect(wrapper.emitted('submit')).toEqual([[['b']]]);
  });
  it('shows the short advice, price and payment status together without another modal', () => {
    wrapper = mount(CapacityDialog, { props: { show: true, language: 'zh', problem: { kind: 'todos', current: 7, limit: 7, requested: 1 }, items: [] }, global: { stubs: { NModal: modalStub } } });
    expect(wrapper.text()).toContain('开发者建议：先别买');
    expect(wrapper.text()).toContain('删掉没那么必要的');
    expect(wrapper.text()).toContain('19.90');
    expect(wrapper.text()).toContain('支付宝');
    expect(wrapper.text()).toContain('收款码待提供');
    expect(wrapper.findAll('.n-modal')).toHaveLength(1);
  });
  it('requires an explicit second confirmation before discarding any draft', async () => {
    wrapper = mount(CapacityDialog, { props: { show: true, language: 'zh', problem: { kind: 'todos', current: 7, limit: 7, requested: 1 }, items: [{ id: 'a', text: 'A' }] }, global: { stubs: { NModal: modalStub } } });
    await wrapper.findAll('button').find(button => button.text() === '放弃草稿')!.trigger('click');
    expect(wrapper.emitted('discard')).toBeUndefined();
    expect(wrapper.text()).toContain('放弃剩余内容？');
    await wrapper.findAll('button').filter(button => button.text() === '放弃草稿').at(-1)!.trigger('click');
    expect(wrapper.emitted('discard')).toHaveLength(1);
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(0);
  });
});
