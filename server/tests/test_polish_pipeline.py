"""明文速记流水线：POST 秒回 + 后台润色拆行入库 + 兜底存原文 + 同 id 幂等 + 旧密文直存兼容。"""

import json
import threading
import time

import pytest

import app as app_module
import llm as llm_module

ORIGIN = "https://todolist.pages.dev"
KEY = "a" * 64


def post_plain(client, item_id, kind, text):
    payload = json.dumps({"kind": kind, "text": text, "createdAt": 1}, ensure_ascii=False)
    return client.post(f"/inbox/{KEY}", json={"id": item_id, "payload": payload}, headers={"Origin": ORIGIN})


def rows(client):
    return client.get(f"/inbox/{KEY}", headers={"Origin": ORIGIN}).get_json()["items"]


@pytest.fixture(autouse=True)
def _registered(client):
    client.post(f"/inbox/{KEY}/register", headers={"Origin": ORIGIN})


@pytest.fixture(autouse=True)
def inline_worker(monkeypatch):
    """后台线程改同步跑：POST 返回即已入库，断言无竞态。"""
    monkeypatch.setattr(app_module, "spawn_worker", lambda target: target())


@pytest.fixture
def polish(monkeypatch):
    """可控润色桩：默认两条结果；改 result 控制成败，calls 记录调用。"""
    stub = lambda: None  # noqa: E731
    stub.result = ["明天买牛奶", "交电费"]
    stub.calls = []

    def fake(kind, text):
        stub.calls.append((kind, text))
        return stub.result

    monkeypatch.setattr(llm_module, "polish_capture", fake)
    return stub


class TestPolishedStore:
    def test_post_acks_and_stores_split_rows(self, client, polish):
        response = post_plain(client, "i1", "todo", "明天买牛奶、交电费")

        assert response.status_code == 200
        assert response.get_json() == {"ok": True}
        assert polish.calls == [("todo", "明天买牛奶、交电费")]
        items = rows(client)
        assert [item["id"] for item in items] == ["i1#0", "i1#1"]
        payloads = [json.loads(item["payload"]) for item in items]
        assert [p["text"] for p in payloads] == ["明天买牛奶", "交电费"]
        assert all(p["kind"] == "todo" for p in payloads)
        assert len({item["createdAt"] for item in items}) == 1

    def test_note_numbered_paragraphs_stored_as_rows(self, client, polish):
        polish.result = ["1、要点A", "2、要点B"]
        post_plain(client, "n1", "note", "一段想法")
        assert [json.loads(i["payload"])["text"] for i in rows(client)] == ["1、要点A", "2、要点B"]

    def test_real_thread_path_delivers_after_polish(self, client, polish, monkeypatch):
        # 还原为真实后台线程语义：ack 先行，润色完成后条目才可见。
        monkeypatch.setattr(app_module, "spawn_worker", lambda target: threading.Thread(target=target, daemon=True).start())
        monkeypatch.setattr(
            llm_module,
            "polish_capture",
            lambda kind, text: (time.sleep(0.3), ["慢润色结果"])[1],
        )

        assert post_plain(client, "slow", "todo", "慢条目").status_code == 200
        assert rows(client) == []  # 润色完成前拉取为空

        deadline = time.time() + 5
        while time.time() < deadline:
            items = rows(client)
            if items:
                assert [item["id"] for item in items] == ["slow#0"]
                assert json.loads(items[0]["payload"])["text"] == "慢润色结果"
                return
            time.sleep(0.05)
        pytest.fail("后台线程未在 5s 内完成入库")

    def test_read_once_still_applies(self, client, polish):
        post_plain(client, "i1", "todo", "x")
        assert len(rows(client)) == 2
        assert rows(client) == []


class TestFallback:
    def test_llm_failure_stores_raw_text_with_original_id(self, client, polish):
        polish.result = None
        post_plain(client, "i1", "todo", "原文内容")

        items = rows(client)
        assert [item["id"] for item in items] == ["i1"]
        assert json.loads(items[0]["payload"])["text"] == "原文内容"

    def test_empty_polish_result_stores_raw_text(self, client, polish):
        polish.result = []
        post_plain(client, "i1", "todo", "原文")

        items = rows(client)
        assert [item["id"] for item in items] == ["i1"]
        assert json.loads(items[0]["payload"])["text"] == "原文"


class TestIdempotency:
    def test_retry_same_id_last_attempt_wins(self, client, polish):
        polish.result = None
        post_plain(client, "i1", "todo", "原文")
        polish.result = ["润色A", "润色B"]
        post_plain(client, "i1", "todo", "原文")

        assert [item["id"] for item in rows(client)] == ["i1#0", "i1#1"]


class TestSyncValidation:
    def test_invalid_plain_shape_400(self, client, polish):
        for payload in ['{"kind":"other","text":"x"}', '{"kind":"todo"}', '{"kind":"todo","text":"  "}', "123", '"str"']:
            response = client.post(f"/inbox/{KEY}", json={"id": "i1", "payload": payload}, headers={"Origin": ORIGIN})
            assert response.status_code == 400, payload
        assert polish.calls == []

    def test_plain_id_longer_than_61_rejected_400(self, client, polish):
        payload = json.dumps({"kind": "todo", "text": "x"}, ensure_ascii=False)
        response = client.post(
            f"/inbox/{KEY}", json={"id": "i" * 62, "payload": payload}, headers={"Origin": ORIGIN}
        )
        assert response.status_code == 400
        assert polish.calls == []

    def test_plain_payload_too_large_413(self, client, polish):
        payload = json.dumps({"kind": "todo", "text": "长" * 2100}, ensure_ascii=False)
        response = client.post(f"/inbox/{KEY}", json={"id": "i1", "payload": payload}, headers={"Origin": ORIGIN})
        assert response.status_code == 413
        assert polish.calls == []

    def test_oversized_payload_413_before_parse(self, client, polish):
        response = client.post(
            f"/inbox/{KEY}", json={"id": "i1", "payload": "[" * 200000}, headers={"Origin": ORIGIN}
        )
        assert response.status_code == 413

    def test_deeply_nested_short_payload_stored_as_legacy(self, client, polish):
        # 深嵌套短串：解析抛 RecursionError → 按非 JSON 走旧密文直存，不 500。
        response = client.post(
            f"/inbox/{KEY}", json={"id": "i1", "payload": "[" * 1100}, headers={"Origin": ORIGIN}
        )
        assert response.status_code == 200
        assert polish.calls == []
        assert rows(client)[0]["payload"] == "[" * 1100

    def test_unknown_code_404(self, client, polish):
        fresh = "c" * 64
        payload = json.dumps({"kind": "todo", "text": "x"}, ensure_ascii=False)
        response = client.post(f"/inbox/{fresh}", json={"id": "i1", "payload": payload}, headers={"Origin": ORIGIN})
        assert response.status_code == 404
        assert response.get_json() == {"error": "unknown_code"}
        assert polish.calls == []

    def test_revoked_code_410(self, client, polish):
        client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN})
        response = post_plain(client, "i1", "todo", "x")
        assert response.status_code == 410
        assert polish.calls == []


class TestLegacyCipherPassthrough:
    def test_non_json_payload_stored_as_is_without_llm(self, client, polish):
        response = client.post(f"/inbox/{KEY}", json={"id": "i1", "payload": "AAA"}, headers={"Origin": ORIGIN})

        assert response.status_code == 200
        assert polish.calls == []
        assert rows(client)[0]["payload"] == "AAA"


class TestRetention:
    def test_worker_sweeps_stale_rows(self, client, polish, db):
        now = int(time.time() * 1000)
        with db.cursor() as cursor:
            cursor.execute(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s)",
                (KEY, "stale", "OLD", now - 31 * 24 * 3600 * 1000),
            )

        post_plain(client, "fresh", "todo", "新条目")

        ids = [item["id"] for item in rows(client)]
        assert "stale" not in ids
        assert "fresh#0" in ids
