import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TextPanel from '../components/TextPanel.vue';
import { handleTextareaTab, moveTextareaLineWithMarks, renumberOrderedListText } from '../utils/textEditor';
import { translateMarksForEdit } from '../utils/textMarks';
import type { LineItem, TextMark } from '../types';

const mark = (start: number, end: number): TextMark => ({ type: 'highlight', color: 'amber', start, end });
function textarea(value: string, start = 0, end = start) {
  const field = document.createElement('textarea');
  field.value = value;
  field.setSelectionRange(start, end);
  return field;
}
function panel(lines: LineItem[]) {
  return mount(TextPanel, { props: { titleId: 'note', title: '记事本', lines } });
}

describe('notebook editing audit regressions', () => {
  it.each(['unchanged', '3. first\n8. second'])('does not emit an update when an unchanged editor loses focus: %s', async (text) => {
    const wrapper = panel([{ text, indent: 0, marks: [mark(0, 3)] }]);
    const field = wrapper.get('textarea');
    await field.trigger('click');
    await field.trigger('focus');
    await field.trigger('blur');
    expect(wrapper.emitted('update')).toBeUndefined();
    await field.trigger('click');
    await field.setValue('changed');
    await field.trigger('blur');
    expect(wrapper.emitted('update')!.at(-1)![0]).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'changed' })]));
    wrapper.unmount();
  });

  it.each(['', '- ', '1. '])('preserves highlighting when Enter splits %s before the highlighted text', async (prefix) => {
    const content = `${prefix}before highlight`;
    const start = content.indexOf('highlight');
    const lines: LineItem[] = [{ text: content, indent: 0, marks: [mark(start, start + 9)] }];
    if (prefix === '1. ') lines.push({ text: '2. following', indent: 0 });
    const wrapper = panel(lines);
    await wrapper.get('textarea').trigger('click');
    const field = wrapper.get('textarea').element as HTMLTextAreaElement;
    const original = field.value;
    field.setSelectionRange(start, start);
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    const result = wrapper.emitted('update')!.at(-1)![0] as LineItem[];
    const highlighted = result.flatMap(line => (line.marks ?? []).map(m => line.text.slice(m.start, m.end)));
    expect(highlighted).toEqual(['highlight']);
    if (prefix === '1. ') expect(result.map(l => l.text)).toEqual(['1. before ', '2. highlight', '3. following']);
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true });
    expect(field.value).toBe(original);
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect((wrapper.emitted('update')!.at(-1)![0] as LineItem[]).flatMap(l => (l.marks ?? []).map(m => l.text.slice(m.start, m.end)))).toEqual(['highlight']);
    wrapper.unmount();
  });

  it.each([false, true])('does not change an unselected next line when outdent=%s', (outdent) => {
    const prefix = outdent ? '    - ' : '';
    const value = `${prefix}first\n${prefix}second\nthird`;
    const field = textarea(value, 0, value.indexOf('\n') + 1);
    handleTextareaTab(field, outdent);
    expect(field.value).toBe(outdent ? 'first\n    - second\nthird' : '    - first\nsecond\nthird');
  });

  it('handles a leading blank line without looping or skipping the selection start', () => {
    const field = textarea('\nfirst\nsecond', 0, 7);
    handleTextareaTab(field);
    expect(field.value).toBe('    - \n    - first\nsecond');
    const single = textarea('\n    - child', 11);
    handleTextareaTab(single, true);
    expect(single.value).toBe('\n- child');
  });

  it('moves unchanged nested marks when renumbered parent prefixes shrink', () => {
    const before = '1. a\n10. b\n    - highlighted\n11. c';
    const next = renumberOrderedListText(before);
    const start = before.indexOf('highlighted');
    const marks: TextMark[] = [mark(start, start + 11), { type: 'underline', start, end: start + 11 },
      { type: 'strike', start, end: start + 11 }, { type: 'color', color: 'blue', start, end: start + 11 }];
    for (const moved of translateMarksForEdit(marks, before, next)) {
      expect(next.slice(moved.start, moved.end)).toBe('highlighted');
    }
  });

  it.each([-1, 1] as const)('moves formatting with list content in direction %s', (direction) => {
    const value = '1. alpha\n2. bravo';
    const word = direction === -1 ? 'bravo' : 'alpha';
    const start = value.indexOf(word);
    const field = textarea(value, start);
    const state = moveTextareaLineWithMarks(field, direction, [mark(start, start + 5)])!;
    expect(state.text).toBe('1. bravo\n2. alpha');
    expect(state.text.slice(state.marks[0].start, state.marks[0].end)).toBe(word);
  });

  it('moves marks on both mixed-format lines and preserves unaffected text', () => {
    const value = 'before\n    - child\n1. parent\nafter';
    const a = value.indexOf('child');
    const b = value.indexOf('parent');
    const end = value.indexOf('after');
    const state = moveTextareaLineWithMarks(textarea(value, b), -1,
      [mark(0, 6), mark(a, a + 5), mark(b, b + 6), mark(end, end + 5)])!;
    expect(state.text).toBe('before\n1. parent\n    - child\nafter');
    expect(state.marks.map(m => state.text.slice(m.start, m.end))).toEqual(['before', 'parent', 'child', 'after']);
  });

  it('does not inherit numbering from a separate parent branch', () => {
    const value = '- parentA\n    1. childA\n- parentB\n        - childB';
    const field = textarea(value, value.length);
    handleTextareaTab(field, true);
    expect(field.value).toBe('- parentA\n    1. childA\n- parentB\n    - childB');
  });

  it('renumbers long lists after multiple deletions and leaves standalone years alone', () => {
    const value = Array.from({ length: 105 }, (_, i) => `${i + 1}. item${i + 1}`).filter((_, i) => i < 95 || i > 99).join('\n');
    expect(renumberOrderedListText(value).split('\n').slice(-5)).toEqual([
      '96. item101', '97. item102', '98. item103', '99. item104', '100. item105',
    ]);
    expect(renumberOrderedListText('2026. 年份\n2027. 年份')).toBe('2026. 年份\n2027. 年份');
    expect(renumberOrderedListText('1. notes\n2026. 05 launch window')).toBe('1. notes\n2026. 05 launch window');
    const long = Array.from({ length: 1005 }, (_, i) => `${i + 1}. item`).filter((_, i) => i < 995 || i > 999).join('\n');
    expect(renumberOrderedListText(long).split('\n').at(-1)).toBe('1000. item');
  });

  it('restores moved text and marks through undo and redo', async () => {
    const wrapper = panel([{ text: '1. alpha', indent: 0 },
      { text: '2. bravo', indent: 0, marks: [mark(3, 8)] }]);
    await wrapper.get('textarea').trigger('click');
    const field = wrapper.get('textarea').element as HTMLTextAreaElement;
    field.setSelectionRange(field.value.indexOf('bravo'), field.value.indexOf('bravo'));
    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowUp', ctrlKey: true });
    expect(field.value).toBe('1. bravo\n2. alpha');
    expect((wrapper.emitted('update')!.at(-1)![0] as LineItem[])[0].marks).toEqual([mark(3, 8)]);
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true });
    expect(field.value).toBe('1. alpha\n2. bravo');
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect(field.value).toBe('1. bravo\n2. alpha');
    expect((wrapper.emitted('update')!.at(-1)![0] as LineItem[])[0].marks).toEqual([mark(3, 8)]);
    wrapper.unmount();
  });

  it('clears redo after a new edit and supports Ctrl+Y', async () => {
    const wrapper = panel([{ text: 'A', indent: 0 }]);
    await wrapper.get('textarea').trigger('click');
    await wrapper.get('textarea').setValue('AB');
    await wrapper.get('textarea').setValue('ABC');
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.get('textarea').trigger('keydown', { key: 'y', ctrlKey: true });
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('ABC');
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true });
    await wrapper.get('textarea').setValue('ABD');
    await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('ABD');
    wrapper.unmount();
  });

  it('moves formatting even when both line texts are identical', async () => {
    const wrapper = panel([{ text: '- same', indent: 0 },
      { text: '- same', indent: 0, marks: [mark(2, 6)] }]);
    await wrapper.get('textarea').trigger('click');
    const field = wrapper.get('textarea').element as HTMLTextAreaElement;
    field.setSelectionRange(field.value.length, field.value.length);
    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowUp', metaKey: true });
    const lines = wrapper.emitted('update')!.at(-1)![0] as LineItem[];
    expect(lines[0].marks).toEqual([mark(2, 6)]);
    expect(lines[1].marks).toBeUndefined();
    await wrapper.get('textarea').trigger('keydown', { key: 'z', metaKey: true });
    expect((wrapper.emitted('update')!.at(-1)![0] as LineItem[])[1].marks).toEqual([mark(2, 6)]);
    wrapper.unmount();
  });

  it('undoes and redoes formatting without changing text', async () => {
    const wrapper = panel([{ text: 'ABC', indent: 0 }]);
    await wrapper.get('textarea').trigger('click');
    const field = wrapper.get('textarea').element as HTMLTextAreaElement;
    field.setSelectionRange(0, 3);
    await wrapper.get('textarea').trigger('keydown', { key: 'h', metaKey: true, shiftKey: true });
    await wrapper.get('textarea').trigger('keydown', { key: 'z', metaKey: true });
    expect((wrapper.emitted('update')!.at(-1)![0] as LineItem[])[0].marks).toBeUndefined();
    await wrapper.get('textarea').trigger('keydown', { key: 'z', metaKey: true, shiftKey: true });
    expect((wrapper.emitted('update')!.at(-1)![0] as LineItem[])[0].marks).toEqual([mark(0, 3)]);
    wrapper.unmount();
  });

  it.each(['edit', 'roundtrip', 'unmount', 'format'] as const)('drops stale clipboard results after %s', async (change) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let resolveText!: (text: string) => void;
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { readText: vi.fn(() => new Promise<string>(r => { resolveText = r; })) } });
    const wrapper = panel([{ text: 'ABC', indent: 0 }]);
    try {
      const pending = (wrapper.vm as unknown as { appendPaste: () => Promise<void> }).appendPaste();
      const field = wrapper.get('textarea').element as HTMLTextAreaElement;
      if (change === 'unmount') wrapper.unmount();
      else if (change === 'format') {
        field.setSelectionRange(0, 3);
        await wrapper.get('textarea').trigger('keydown', { key: 'h', ctrlKey: true, shiftKey: true });
      } else {
        await wrapper.get('textarea').setValue('012345');
        if (change === 'roundtrip') await wrapper.get('textarea').trigger('keydown', { key: 'z', ctrlKey: true });
      }
      const before = field.value;
      resolveText('X');
      await pending;
      expect(field.value).toBe(before);
    } finally {
      wrapper.unmount();
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('renders underline and strikethrough together', () => {
    const wrapper = panel([{ text: 'abc', indent: 0, marks: [
      { type: 'strike', start: 0, end: 3 }, { type: 'underline', start: 0, end: 3 },
    ] }]);
    const styles = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
    const rule = styles.match(/\.text-mirror \.mark-strike\.mark-underline\s*\{[^}]+\}/)![0];
    const style = document.createElement('style');
    style.textContent = rule;
    document.head.appendChild(style);
    try {
      expect(getComputedStyle(wrapper.get('.mark-strike.mark-underline').element).textDecoration).toBe('underline line-through');
    } finally { style.remove(); wrapper.unmount(); }
  });
});
