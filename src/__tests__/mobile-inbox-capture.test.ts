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

async function fillAndSend(wrapper: ReturnType<typeof mountCapture>, text: string) {
  await wrapper.find('[data-testid="mobile-inbox-text"]').setValue(text);
  await wrapper.find('[data-testid="mobile-inbox-send"]').trigger("click");
}

function draftValue(wrapper: ReturnType<typeof mountCapture>): string {
  return (wrapper.get('[data-testid="mobile-inbox-text"]').element as HTMLTextAreaElement).value;
}

/** 发送链路含真实 PBKDF2（百毫秒级），轮询断言而非一次性 await。 */
async function until(assertion: () => void): Promise<void> {
  await vi.waitFor(assertion, { timeout: 4000, interval: 20 });
}

function lastPayload(): string {
  const call = postMock.mock.calls.at(-1);
  if (!call) throw new Error("postInboxItem 未被调用");
  const [, , payload] = call;
  if (typeof payload !== "string") throw new Error("payload 不是字符串");
  return payload;
}

describe("MobileInboxCapture", () => {
  it("渲染标题、待办/便签切换与输入框", () => {
    const wrapper = mountCapture();

    expect(wrapper.get(".mobile-inbox-heading").text()).toBe("手机速记");
    expect(wrapper.get(".mobile-inbox-toggle").attributes("role")).toBe("group");
    expect(wrapper.get('[data-testid="mobile-inbox-kind-todo"]').text()).toBe("提醒事项");
    expect(wrapper.get('[data-testid="mobile-inbox-kind-todo"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-testid="mobile-inbox-kind-note"]').text()).toBe("便签");
    expect(wrapper.get('[data-testid="mobile-inbox-kind-note"]').attributes("aria-pressed")).toBe("false");
    expect(wrapper.get('[data-testid="mobile-inbox-text"]').attributes("placeholder")).toBe("记点什么…");
    expect(wrapper.get('[data-testid="mobile-inbox-send"]').text()).toBe("发送");
  });

  it("切换按钮以 aria-pressed 表达选中态（toggle button 语义）", async () => {
    const wrapper = mountCapture();

    await wrapper.get('[data-testid="mobile-inbox-kind-note"]').trigger("click");

    expect(wrapper.get('[data-testid="mobile-inbox-kind-todo"]').attributes("aria-pressed")).toBe("false");
    expect(wrapper.get('[data-testid="mobile-inbox-kind-note"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-testid="mobile-inbox-kind-note"]').classes()).toContain("is-active");
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
      expect(queueWrapper.get('[data-testid="mobile-inbox-error"]').text()).toBe("收件队列已满，请在电脑端轮换配对码"),
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

  it("切到便签后 kind 为 note（解密回验）", async () => {
    const wrapper = mountCapture();

    await wrapper.get('[data-testid="mobile-inbox-kind-note"]').trigger("click");
    await fillAndSend(wrapper, "一个想法");

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
    const send = wrapper.get('[data-testid="mobile-inbox-send"]');
    await wrapper.find('[data-testid="mobile-inbox-text"]').setValue("只发一次");

    void send.trigger("click");
    await send.trigger("click");
    await until(() => expect(postMock).toHaveBeenCalledTimes(1));

    expect(postMock).toHaveBeenCalledTimes(1);
    await until(() => expect(wrapper.get(".mobile-inbox-status").text()).toContain("已发送"));
  });
});
