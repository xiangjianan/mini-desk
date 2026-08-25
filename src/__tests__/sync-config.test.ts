import { describe, expect, it } from "vitest";
import {
  INBOX_FOCUS_THROTTLE_MS,
  INBOX_PLAINTEXT_MAX_CHARS,
  INBOX_PULL_INTERVAL_MS,
  INBOX_WORKER_URL,
} from "../sync/config";

describe("sync configuration", () => {
  it("默认指向自建中继（8443 非常规端口，灰云直解避开备案探针）", () => {
    expect(INBOX_WORKER_URL).toBe("https://relay.minidesk.online:8443");
  });

  it("定时拉取间隔为 5 分钟，聚焦节流保持 1 分钟", () => {
    expect(INBOX_PULL_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(INBOX_FOCUS_THROTTLE_MS).toBe(60 * 1000);
  });

  it("单行明文上限保持 500 字（数据形状，非配额）", () => {
    expect(INBOX_PLAINTEXT_MAX_CHARS).toBe(500);
  });
});
