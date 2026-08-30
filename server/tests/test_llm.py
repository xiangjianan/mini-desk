"""llm.polish_capture 单元测试：mock urlopen，不发真实请求。覆盖成功、清洗与各类失败。"""

import json

import llm
import pytest
from llm import polish_capture


class FakeResponse:
    def __init__(self, content: str):
        self._body = json.dumps({"choices": [{"message": {"content": content}}]}).encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


@pytest.fixture
def api(monkeypatch):
    """注入 key 并捕获请求；测试可改 captured["content"] 控制模型返回内容。"""
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    captured: dict = {"content": json.dumps({"items": ["明天买牛奶", "交电费"]}, ensure_ascii=False)}

    def fake_urlopen(request, timeout=None):
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse(captured["content"])

    monkeypatch.setattr(llm, "urlopen", fake_urlopen)
    return captured


class TestSuccess:
    def test_returns_items(self, api):
        assert polish_capture("todo", "明天买牛奶、交电费") == ["明天买牛奶", "交电费"]

    def test_request_shape(self, api):
        polish_capture("note", "一个想法")
        request = api["request"]
        assert request.get_header("Authorization") == "Bearer test-key"
        body = json.loads(request.data)
        assert body["model"] == "deepseek-chat"
        assert body["response_format"] == {"type": "json_object"}
        assert body["messages"][0]["role"] == "system"
        assert json.loads(body["messages"][1]["content"]) == {"kind": "note", "text": "一个想法"}
        assert api["timeout"] == llm.LLM_TIMEOUT_SECONDS


class TestCleaning:
    def test_filters_blank_and_non_string_items(self, api):
        api["content"] = json.dumps({"items": ["有效", "  ", "", 42, None]}, ensure_ascii=False)
        assert polish_capture("todo", "x") == ["有效"]

    def test_all_invalid_returns_none(self, api):
        api["content"] = json.dumps({"items": ["", "  "]})
        assert polish_capture("todo", "x") is None

    def test_caps_to_20_items(self, api):
        api["content"] = json.dumps({"items": [f"条{i}" for i in range(30)]}, ensure_ascii=False)
        assert len(polish_capture("todo", "x")) == 20

    def test_slices_item_to_500_chars(self, api):
        api["content"] = json.dumps({"items": ["长" * 600]}, ensure_ascii=False)
        assert len(polish_capture("todo", "x")[0]) == 500

    def test_collapses_internal_newlines(self, api):
        api["content"] = json.dumps({"items": ["买牛奶\n看保质期"]}, ensure_ascii=False)
        assert polish_capture("todo", "x") == ["买牛奶 看保质期"]


class TestFailures:
    def test_missing_api_key_returns_none(self, api, monkeypatch):
        monkeypatch.delenv("DEEPSEEK_API_KEY")
        assert polish_capture("todo", "x") is None

    def test_urlopen_error_returns_none(self, api, monkeypatch):
        def boom(request, timeout=None):
            raise TimeoutError("30s")

        monkeypatch.setattr(llm, "urlopen", boom)
        assert polish_capture("todo", "x") is None

    def test_non_json_content_returns_none(self, api):
        api["content"] = "不是 JSON"
        assert polish_capture("todo", "x") is None

    def test_missing_items_key_returns_none(self, api):
        api["content"] = json.dumps({"result": []})
        assert polish_capture("todo", "x") is None

    def test_items_not_list_returns_none(self, api):
        api["content"] = json.dumps({"items": "nope"})
        assert polish_capture("todo", "x") is None

    def test_malformed_envelope_returns_none(self, api, monkeypatch):
        class EmptyEnvelope:
            def read(self):
                return b"{}"

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        monkeypatch.setattr(llm, "urlopen", lambda request, timeout=None: EmptyEnvelope())
        assert polish_capture("todo", "x") is None
