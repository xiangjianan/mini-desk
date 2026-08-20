/**
 * NDropdown 的共享测试桩（quick-buttons / todo-panel / space-panel 三份
 * 原地拷贝的统一归宿）。规范：
 * - 把选项、子级、孙级逐层渲染为带 `data-key` 的 `.dropdown-option` 按钮，
 *   测试可用 `[data-key="..."]` 精确选中任意层级，避免依赖文案；
 * - 保留 `disabled` 语义：禁用项渲染为 disabled 且点击不 emit select；
 * - 某层没有 children 时该层惰性跳过，二级菜单（便签 / 快捷动作）与
 *   三级菜单（提醒条目「移动到空间 → 空间 → 列表」）可直接复用同一份桩。
 */
export const menuDropdownStub = {
  props: ["options"],
  emits: ["select"],
  template: `
    <div>
      <slot />
      <template v-for="option in options" :key="option.key">
        <button
          class="dropdown-option"
          :data-key="option.key"
          :disabled="option.disabled"
          type="button"
          @click="!option.disabled && $emit('select', option.key)"
        >{{ option.label }}</button>
        <template v-for="child in option.children ?? []" :key="child.key">
          <button
            class="dropdown-option"
            :data-key="child.key"
            :disabled="child.disabled"
            type="button"
            @click="!child.disabled && $emit('select', child.key)"
          >{{ child.label }}</button>
          <button
            v-for="grandchild in child.children ?? []"
            :key="grandchild.key"
            class="dropdown-option"
            :data-key="grandchild.key"
            :disabled="grandchild.disabled"
            type="button"
            @click="!grandchild.disabled && $emit('select', grandchild.key)"
          >{{ grandchild.label }}</button>
        </template>
      </template>
    </div>
  `,
};
