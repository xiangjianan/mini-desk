import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MobileInboxCapture from "../components/MobileInboxCapture.vue";
import { decryptInboxPayload } from "../sync/crypto";
import type { InboxPostResult } from "../sync/inboxClient";

const CODE = "AB2CDE4FGHJK";

const postMock = vi.fn(async (_keyHash: string, _id: string, _payload: string): Promise<InboxPostResult> => ({ ok: true }));

// 组件只依赖 postInboxItem；加密/哈希走真实 WebCrypto，便于解密回验。
vi.mock("../sync/inboxClient", () => ({
  postInboxItem: (keyHash: string, id: string, payload: string) => postMock(keyHash, id, payload),
}));

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue({ ok: true });
});

function mountCapture() {
  return mount(MobileInboxCapture, { props: { code: CODE, language: "zh" } });
}

async function fillAndSend(wrapper: ReturnType<typeof mountCapture>, text: string, kind: "todo" | "note" = "todo") {
  await wrapper.find('[data-testid="mobile-inbox-text"]').setValue(text);
  await wrapper.find(`[data-testid="mobile-inbox-send-${kind}"]`).trigger("click");
}

function draftValue(wrapper: ReturnType<typeof mountCapture>): string {
  return (wrapper.get('[data-testid="mobile-inbox-text"]').element as HTMLTextAreaElement).value;
}

/** 发送链路含真实 PBKDF2（百毫秒级），轮询断言而非一次性 await。 */
async function until(assertion: () => void, timeout = 4000): Promise<void> {
  await vi.waitFor(assertion, { timeout, interval: 20 });
}

function lastPayload(): string {
  const call = postMock.mock.calls.at(-1);
  if (!call) throw new Error("postInboxItem 未被调用");
  const [, , payload] = call;
  if (typeof payload !== "string") throw new Error("payload 不是字符串");
  return payload;
}

describe("MobileInboxCapture", () => {
  it("渲染标题、双发送按钮与输入框（无类型切换）", () => {
    const wrapper = mountCapture();

    expect(wrapper.get(".mobile-inbox-heading").text()).toBe("手机速记");
    expect(wrapper.find(".mobile-inbox-toggle").exists()).toBe(false);
    expect(wrapper.find(".mobile-inbox-tab").exists()).toBe(false);
    expect(wrapper.get('[data-testid="mobile-inbox-send-todo"]').text()).toBe("发送到提醒");
    expect(wrapper.get('[data-testid="mobile-inbox-send-note"]').text()).toBe("发送到便签");
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("想到什么就记下来，可多行…");
  });

  it("提交成功：keyHash 为 64 位 hex、payload 可解密、显示已发送并清空输入", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "买牛奶");

    await until(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [keyHash, id, payload] = postMock.mock.calls[0];
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(typeof payload).toBe("string");
    expect(payload.length).toBeGreaterThan(40);
    expect(await decryptInboxPayload(CODE, payload)).toMatchObject({ kind: "todo", text: "买牛奶" });
    await until(() => expect(wrapper.get(".mobile-inbox-status").text()).toContain("已发送"));
    expect(wrapper.get(".mobile-inbox-status").attributes("role")).toBe("status");
    expect(wrapper.get(".mobile-inbox-status").attributes("aria-live")).toBe("polite");
    expect(draftValue(wrapper)).toBe("");
  });

  it("空白文本不提交；网络失败显示网络异常且文本保留", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "   ");
    expect(postMock).not.toHaveBeenCalled();

    postMock.mockResolvedValue({ ok: false, reason: "network" });
    await fillAndSend(wrapper, "离线时记的话");
    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("网络异常，请检查网络后重试"));
    expect(wrapper.get('[data-testid="mobile-inbox-error"]').attributes("role")).toBe("status");
    expect(wrapper.get('[data-testid="mobile-inbox-error"]').attributes("aria-live")).toBe("polite");
    expect(draftValue(wrapper)).toBe("离线时记的话");
  });

  it("失败原因映射：rate_limited 与 queue_full 给出针对性提示", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "rate_limited" });
    const rateWrapper = mountCapture();
    await fillAndSend(rateWrapper, "超限内容");
    await until(() =>
      expect(rateWrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("今日发送次数已用完，明天再试"),
    );

    postMock.mockResolvedValue({ ok: false, reason: "queue_full" });
    const queueWrapper = mountCapture();
    await fillAndSend(queueWrapper, "队列满内容");
    await until(() =>
      expect(queueWrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("收件队列已满，请在电脑端重置配对码"),
    );
  });

  it("失败原因映射：too_large / bad_request / server", async () => {
    const cases = [
      ["too_large", "内容过长，请精简后重试"],
      ["bad_request", "内容无效，请修改后重试"],
      ["server", "服务暂时不可用，请稍后重试"],
    ] as const;
    for (const [reason, message] of cases) {
      postMock.mockResolvedValue({ ok: false, reason });
      const wrapper = mountCapture();
      await fillAndSend(wrapper, `失败-${reason}`);
      await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe(message));
    }
  });

  it("点「发送到便签」kind 为 note（解密回验）", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "一个想法", "note");

    await until(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(await decryptInboxPayload(CODE, lastPayload())).toMatchObject({ kind: "note", text: "一个想法" });
  });

  it("超长文本截断为 500 字后提交", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "长".repeat(520));

    await until(() => expect(postMock).toHaveBeenCalledTimes(1));
    const plain = await decryptInboxPayload(CODE, lastPayload());
    expect(plain?.text.length).toBe(500);
  });

  it("发送中不重复提交", async () => {
    const wrapper = mountCapture();
    const send = wrapper.get('[data-testid="mobile-inbox-send-todo"]');
    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("只发一次");

    void send.trigger("click");
    await send.trigger("click");
    await until(() => expect(postMock).toHaveBeenCalledTimes(1));

    expect(postMock).toHaveBeenCalledTimes(1);
    await until(() => expect(wrapper.get(".mobile-inbox-status").text()).toContain("已发送"));
  });

  it("多行待办按行拆分逐条发送：空行跳过、提示已发送 N 条、清空输入", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "买牛奶\n\n  买鸡蛋  \n取快递");

    await until(() => expect(postMock).toHaveBeenCalledTimes(3));
    const plains = await Promise.all(
      postMock.mock.calls.map(async ([, , payload]) => await decryptInboxPayload(CODE, payload)),
    );
    expect(plains.map((plain) => plain?.text)).toEqual(["买牛奶", "买鸡蛋", "取快递"]);
    expect(plains.every((plain) => plain?.kind === "todo")).toBe(true);
    await until(() => expect(wrapper.get(".mobile-inbox-status").text()).toContain("已发送 3 条"));
    expect(draftValue(wrapper)).toBe("");
  });

  it("中途失败：未发送的行（含失败行）放回输入框，已成功行不重复", async () => {
    let call = 0;
    postMock.mockImplementation(async () => (call++ === 0 ? { ok: true } : { ok: false, reason: "network" }));
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "第一条\n第二条\n第三条");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("网络异常，请检查网络后重试"));
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(draftValue(wrapper)).toBe("第二条\n第三条");
  });

  it("无行数上限：21 行也全部逐条发送并提示 21 条", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, Array.from({ length: 21 }, (_, i) => `第${i + 1}行`).join("\n"));

    // 21 次串行 PBKDF2 在整包并发下可能超过默认 4s 轮询窗口，放宽到 15s 消除偶发失败
    await until(() => expect(postMock).toHaveBeenCalledTimes(21), 15000);
    await until(() => expect(wrapper.get(".mobile-inbox-status").text()).toContain("已发送 21 条"));
    expect(draftValue(wrapper)).toBe("");
  }, 20000);

  it("便签多行同样按行拆分（kind 均为 note）", async () => {
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "想法一\n想法二", "note");

    await until(() => expect(postMock).toHaveBeenCalledTimes(2));
    const plains = await Promise.all(
      postMock.mock.calls.map(async ([, , payload]) => await decryptInboxPayload(CODE, payload)),
    );
    expect(plains.map((plain) => plain?.text)).toEqual(["想法一", "想法二"]);
    expect(plains.every((plain) => plain?.kind === "note")).toBe(true);
  });

  it("失败原因映射：code_revoked 提示配对码已失效", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "code_revoked" });
    const wrapper = mountCapture();
    await fillAndSend(wrapper, "死码内容");
    await until(() =>
      expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码已失效，可能已在桌面端被清除"),
    );
  });

  it("占位词为通用文案并同步 aria-label", () => {
    const wrapper = mountCapture();

    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("想到什么就记下来，可多行…");
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("aria-label")).toBe("想到什么就记下来，可多行…");
  });

  it("草稿经 v-model 上提：外部初始值渲染、输入回传、卸载重挂不丢", async () => {
    const wrapper = mount(MobileInboxCapture, { props: { code: CODE, language: "zh", modelValue: "外部草稿" } });
    expect(draftValue(wrapper)).toBe("外部草稿");

    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("补充一行");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toBe("补充一行");

    // 换码场景：组件卸载后父级带着同一 v-model 值重挂，草稿仍在输入框。
    wrapper.unmount();
    const reborn = mount(MobileInboxCapture, { props: { code: "ZZ9YXW8VTSRQ", language: "zh", modelValue: "补充一行" } });
    expect(draftValue(reborn)).toBe("补充一行");
  });

  it("410 失效：显示失效提示与换码按钮，点击 emit change-code，草稿保留", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "code_revoked" });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "死码内容");

    await until(() =>
      expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码已失效，可能已在桌面端被清除"),
    );
    expect(draftValue(wrapper)).toBe("死码内容");
    const change = wrapper.get('[data-testid="mobile-inbox-revoked-change"]');
    expect(change.text()).toBe("去更换配对码");
    await change.trigger("click");
    expect(wrapper.emitted("change-code")).toHaveLength(1);
  });

  it("多行发送中途 410：已成功行不重发，剩余行回输入框且换码按钮可见", async () => {
    let call = 0;
    postMock.mockImplementation(async () => (call++ === 0 ? { ok: true } : { ok: false, reason: "code_revoked" }));
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "第一条\n第二条");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码已失效，可能已在桌面端被清除"));
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(draftValue(wrapper)).toBe("第二条");
    expect(wrapper.find('[data-testid="mobile-inbox-revoked-change"]').exists()).toBe(true);
  });

  it("非失效错误不渲染换码按钮", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "network" });
    const wrapper = mountCapture();
    await fillAndSend(wrapper, "离线内容");
    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("网络异常，请检查网络后重试"));
    expect(wrapper.find('[data-testid="mobile-inbox-revoked-change"]').exists()).toBe(false);
  });

  it("发送成功：所用按钮进入 ✓已发送 态并自动复位，另一按钮不受影响", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "动画内容", "note");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-send-note"]').text()).toContain("已发送"));
    expect(wrapper.get('[data-testid="mobile-inbox-send-note"]').classes()).toContain("is-sent");
    expect(wrapper.get('[data-testid="mobile-inbox-send-todo"]').text()).toBe("发送到提醒");
    expect(vibrate).toHaveBeenCalledWith(20);

    // 真实定时器等待自动复位（≈2.5s）。
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(wrapper.get('[data-testid="mobile-inbox-send-note"]').text()).toBe("发送到便签");
    expect(wrapper.find(".mobile-inbox-status").exists()).toBe(false);
  }, 10000);

  it("发送遇 unknown_code：显示未注册文案且换码按钮可见", async () => {
    postMock.mockResolvedValue({ ok: false, reason: "unknown_code" });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "未注册码内容");

    await until(() =>
      expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("配对码不存在，请到桌面端重新配对"),
    );
    expect(wrapper.find('[data-testid="mobile-inbox-revoked-change"]').exists()).toBe(true);
    expect(draftValue(wrapper)).toBe("未注册码内容");
  });

  it("发送失败：错误行带抖动标记并触发失败触觉", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    postMock.mockResolvedValue({ ok: false, reason: "network" });
    const wrapper = mountCapture();

    await fillAndSend(wrapper, "抖动内容");

    await until(() => expect(wrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("网络异常，请检查网络后重试"));
    expect(wrapper.get('[data-testid="mobile-inbox-error"]').classes()).toContain("is-shake");
    expect(vibrate).toHaveBeenCalledWith([40, 60, 40]);
  });

  it("多行输入实时提示按行拆分的条数，单行/空时不提示", async () => {
    const wrapper = mountCapture();
    expect(wrapper.find('[data-testid="mobile-inbox-split-hint"]').exists()).toBe(false);

    // 单行：只有一条，无需提示。
    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("单独一条");
    expect(wrapper.find('[data-testid="mobile-inbox-split-hint"]').exists()).toBe(false);

    // 多行（含空行与首尾空白）：按 trim 后的非空行计数，帮助用户理解「每行=一条」。
    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("买牛奶\n\n  买鸡蛋  \n取快递");
    const hint = wrapper.get('[data-testid="mobile-inbox-split-hint"]');
    expect(hint.text()).toBe("发送时将按行拆成 3 条");
    expect(hint.attributes("aria-live")).toBe("polite");

    // 清空后提示隐藏。
    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("");
    expect(wrapper.find('[data-testid="mobile-inbox-split-hint"]').exists()).toBe(false);
  });

  it("拆分提示文案中英齐全", async () => {
    const en = mount(MobileInboxCapture, { props: { code: CODE, language: "en" } });
    await en.find('[data-testid="mobile-inbox-text"]').setValue("a\nb\nc");
    expect(en.get('[data-testid="mobile-inbox-split-hint"]').text()).toBe("Will be split by line into 3 items");
  });
});
