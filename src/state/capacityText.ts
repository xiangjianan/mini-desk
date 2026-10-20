import type { AppLanguage } from '../types';
export const capacityText = {
  zh: {
    title: '给重要的留点空间', developer: '开发者建议：先别买。',
    advice: '扩容要花钱，也可能多添事。删掉没那么必要的，省钱也省心。',

    kinds: { images: '贴图', quick: '可见动作', tags: '自建标签', todos: '未完成提醒', lists: '提醒列表' },
    full: '{kind} {count} / {limit}',
    units: { images: '张', quick: '个', tags: '个', todos: '条', lists: '个' }, atCapacity: '已满',
    queued: '{count} 项待处理',
    batch: '本次 {count} 项，可加入 {remaining} 项',
    tidyKinds: { images: '整理贴图', quick: '整理或隐藏动作', tags: '整理标签', todos: '整理提醒', lists: '整理列表' },
    select: '已选 {count} / {limit}', add: '加入 {count} 项', tidy: '去整理', buy: '解锁容量',
    retained: '余下文字已存为草稿。', imageRetained: '图片暂存本页，离开后需重新选择。', tools: '草稿操作', limitHint: '容量不足 · 处理', added: '已加入 {count} 项，剩余 {remaining} 项。',
    resume: '处理草稿', pending: '{count} 条速记待处理', close: '稍后处理', discard: '放弃草稿', confirmDiscard: '放弃剩余内容？',
    unavailable: '收款码待提供，暂未开放购买。', channel: '支付宝', qrPending: '收款码待提供', once: '一次性',
    retry: '重试', error: '未完成，请重试。草稿已保留。', storageError: '草稿未保存，请先复制或下载。',
    copy: '复制', download: '下载', copied: '已复制',
    input: '先写下来', placeholder: '先记下，稍后整理', submit: '添加内容',
    imageWarning: '待添加图片尚未加入桌面，离开页面后需要重新选择文件。',
    oldDraft: '选择要保留的草稿', original: '原草稿', incoming: '本次输入', replaceWarning: '保留一份，另一份将放弃。也可先复制两份。', keepOriginal: '保留原草稿', useIncoming: '保留本次输入', copyBoth: '复制两份内容',
    unlocked: '已解锁更多空间。装什么，还是由你决定。',
    purchase: '解锁全部数量限制', restore: '恢复购买', recovery: '购买恢复码', checkPayment: '核对支付结果', expired: '二维码已过期，请重新获取。',
    loading: '正在获取支付信息…', verifying: '正在核对付款和授权…', waiting: '等待付款；付款后点击核对支付结果。', paymentError: '支付信息暂不可用，请稍后重试。请勿重复付款。',
    same: '剩余容量已变化，请重新选择。', remaining: '剩余 {count} 个位置',
  },
  en: {
    title: 'Make room for what matters', developer: 'Developer’s advice: don’t buy yet.',
    advice: 'More room costs money and may add work. Let go of what you no longer need; save both.',

    kinds: { images: 'Images', quick: 'Visible actions', tags: 'Custom tags', todos: 'Open reminders', lists: 'Reminder lists' },
    units: { images: '', quick: '', tags: '', todos: '', lists: '' }, atCapacity: 'Full', queued: '{count} items pending',
    full: '{kind} {count} / {limit}', batch: '{count} items; room for {remaining}',
    tidyKinds: { images: 'Review images', quick: 'Review or hide actions', tags: 'Review tags', todos: 'Review reminders', lists: 'Review lists' },
    select: 'Selected {count} / {limit}', add: 'Add {count}', tidy: 'Review content', buy: 'Unlock capacity',
    retained: 'Remaining text saved as a draft.', imageRetained: 'Images last for this page session only.', tools: 'Draft options', limitHint: 'Capacity · Review', added: 'Added {count}; {remaining} remaining.', resume: 'Review draft', pending: '{count} captures to review', close: 'Decide later',
    discard: 'Discard draft', confirmDiscard: 'Discard remaining content?',
    unavailable: 'Purchases unavailable; payment QR code pending.', channel: 'Alipay', qrPending: 'Payment QR code pending', once: 'One-time', retry: 'Retry', error: 'Could not finish. Please retry; your draft is still here.',
    storageError: 'Draft not saved. Copy or download it first.', copy: 'Copy', download: 'Download', copied: 'Copied',
    input: 'Write it down first', placeholder: 'Capture now, review later', submit: 'Add content',
    imageWarning: 'Pending images have not been added. You will need to select them again after leaving this page.', oldDraft: 'Choose a draft to keep', original: 'Existing draft', incoming: 'New input', replaceWarning: 'Keep one and discard the other. You can copy both first.', keepOriginal: 'Keep existing', useIncoming: 'Keep new input', copyBoth: 'Copy both texts',
    unlocked: 'More room is unlocked. What belongs here is still your choice.', purchase: 'Unlock all quantity limits', restore: 'Restore purchase', recovery: 'Purchase recovery code',
    checkPayment: 'Check payment', expired: 'This QR code has expired. Request a new one.', loading: 'Loading payment details…', verifying: 'Checking payment and entitlement…',
    waiting: 'Waiting for payment. Check the result after paying.', paymentError: 'Payment details are unavailable. Retry later; please avoid paying twice.', same: 'Capacity changed. Please review your selection.', remaining: '{count} places remaining',
  },
};
export function getCapacityText(language: AppLanguage = 'zh') { return capacityText[language]; }
export function fillCapacity(text: string, values: Record<string, string | number>): string { return text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match)); }
