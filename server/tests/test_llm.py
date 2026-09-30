"""llm.polish_capture 单元测试：mock urlopen，不发真实请求。覆盖成功、清洗与各类失败。"""

import datetime
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
        assert polish_capture("todo", "明天买牛奶、交电费") == [{"text": "明天买牛奶"}, {"text": "交电费"}]

    def test_request_shape(self, api):
        polish_capture("note", "一个想法")
        request = api["request"]
        assert request.get_header("Authorization") == "Bearer test-key"
        body = json.loads(request.data)
        assert body["model"] == "deepseek-chat"
        assert body["response_format"] == {"type": "json_object"}
        assert body["messages"][0]["role"] == "system"
        assert body["messages"][0]["content"] == llm.SYSTEM_PROMPT
        assert json.loads(body["messages"][1]["content"]) == {"kind": "note", "text": "一个想法"}
        assert api["timeout"] == llm.LLM_TIMEOUT_SECONDS


class TestStyle:
    def test_style_appends_hint_to_system_prompt(self, api):
        polish_capture("note", "一段想法", "tech")
        messages = json.loads(api["request"].data)["messages"]
        assert messages[0]["content"].startswith(llm.SYSTEM_PROMPT)
        assert "语言风格要求" in messages[0]["content"]
        assert llm.STYLE_HINTS["tech"] in messages[0]["content"]
        # 用户消息仍是纯数据载荷：风格只进 system prompt，不与用户文本混合
        assert json.loads(messages[1]["content"]) == {"kind": "note", "text": "一段想法"}

    def test_each_style_has_hint(self):
        for style in ("tech", "concise", "casual"):
            assert llm.STYLE_HINTS[style].strip()

    def test_unknown_style_keeps_base_prompt(self, api):
        polish_capture("note", "一段想法", "formal")
        messages = json.loads(api["request"].data)["messages"]
        assert messages[0]["content"] == llm.SYSTEM_PROMPT

    def test_no_style_keeps_base_prompt(self, api):
        polish_capture("note", "一段想法", None)
        messages = json.loads(api["request"].data)["messages"]
        assert messages[0]["content"] == llm.SYSTEM_PROMPT


class TestCleaning:
    def test_filters_blank_and_non_string_items(self, api):
        api["content"] = json.dumps({"items": ["有效", "  ", "", 42, None, {"notifyAt": 1}, {"text": 42}]}, ensure_ascii=False)
        assert polish_capture("todo", "x") == [{"text": "有效"}]

    def test_all_invalid_returns_none(self, api):
        api["content"] = json.dumps({"items": ["", "  "]})
        assert polish_capture("todo", "x") is None

    def test_caps_to_20_items(self, api):
        api["content"] = json.dumps({"items": [f"条{i}" for i in range(30)]}, ensure_ascii=False)
        assert len(polish_capture("todo", "x")) == 20

    def test_slices_item_to_500_chars(self, api):
        api["content"] = json.dumps({"items": [{"text": "长" * 600}]}, ensure_ascii=False)
        assert len(polish_capture("todo", "x")[0]["text"]) == 500

    def test_collapses_internal_newlines(self, api):
        api["content"] = json.dumps({"items": [{"text": "买牛奶\n看保质期"}]}, ensure_ascii=False)
        assert polish_capture("todo", "x") == [{"text": "买牛奶 看保质期"}]


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


class TestTimeExtraction:
    def _iso_in_range(self, days: int) -> str:
        return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days)).isoformat()

    def test_todo_prompt_appends_now_hint(self, api):
        polish_capture("todo", "x")
        system_content = json.loads(api["request"].data)["messages"][0]["content"]
        assert system_content.startswith(llm.SYSTEM_PROMPT)
        assert "当前基准时间" in system_content

    def test_note_prompt_has_no_now_hint(self, api):
        polish_capture("note", "x")
        system_content = json.loads(api["request"].data)["messages"][0]["content"]
        assert system_content == llm.SYSTEM_PROMPT

    def test_todo_items_carry_notify_at_epoch_ms(self, api):
        iso = self._iso_in_range(1)
        api["content"] = json.dumps({"items": [{"text": "去咖啡厅", "notifyAt": iso}]}, ensure_ascii=False)
        expected = int(datetime.datetime.fromisoformat(iso).timestamp() * 1000)
        assert polish_capture("todo", "x") == [{"text": "去咖啡厅", "notifyAt": expected}]

    def test_no_time_item_omits_notify_at(self, api):
        api["content"] = json.dumps({"items": [{"text": "去咖啡厅"}, {"text": "交电费", "notifyAt": None}]}, ensure_ascii=False)
        assert polish_capture("todo", "x") == [{"text": "去咖啡厅"}, {"text": "交电费"}]

    def test_invalid_notify_at_drops_field_keeps_item(self, api):
        for bad in ["not a time", "", "  ", 42, None, "2200-01-01T00:00:00+00:00", "1999-01-01T00:00:00+00:00"]:
            api["content"] = json.dumps({"items": [{"text": "去咖啡厅", "notifyAt": bad}]}, ensure_ascii=False)
            assert polish_capture("todo", "x") == [{"text": "去咖啡厅"}], bad

    def test_z_suffix_iso_accepted(self, api):
        iso = self._iso_in_range(2).replace("+00:00", "Z")
        api["content"] = json.dumps({"items": [{"text": "开会", "notifyAt": iso}]}, ensure_ascii=False)
        expected = int(datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
        assert polish_capture("todo", "x") == [{"text": "开会", "notifyAt": expected}]

    def test_naive_iso_uses_user_timezone(self, api):
        target = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3)
        naive = target.replace(tzinfo=None).isoformat()
        api["content"] = json.dumps({"items": [{"text": "取快递", "notifyAt": naive}]}, ensure_ascii=False)
        user_tz = datetime.timezone(datetime.timedelta(minutes=480))
        expected = int(target.replace(tzinfo=user_tz).timestamp() * 1000)
        assert polish_capture("todo", "x", None, 480) == [{"text": "取快递", "notifyAt": expected}]

    def test_note_items_never_carry_notify_at(self, api):
        iso = self._iso_in_range(1)
        api["content"] = json.dumps({"items": [{"text": "要点", "notifyAt": iso}]}, ensure_ascii=False)
        assert polish_capture("note", "x") == [{"text": "要点"}]
