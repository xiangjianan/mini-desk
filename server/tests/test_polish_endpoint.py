"""智能粘贴端点：注册制鉴权 + 结构校验 + kind 分支 + LLM 降级标记 + CORS。"""

import pytest

import llm as llm_module

ORIGIN = "https://todolist.pages.dev"
KEY = "a" * 64


@pytest.fixture(autouse=True)
def _registered(client):
    client.post(f"/inbox/{KEY}/register", headers={"Origin": ORIGIN})


@pytest.fixture
def polish(monkeypatch):
    """可控润色桩：默认两条结果；改 result 控制成败，calls 记录调用。"""
    stub = lambda: None  # noqa: E731
    stub.result = ["明天买牛奶", "交电费"]
    stub.calls = []

    def fake(kind, text, style=None):
        stub.calls.append((kind, text, style))
        return stub.result

    monkeypatch.setattr(llm_module, "polish_capture", fake)
    return stub


@pytest.fixture
def quick(monkeypatch):
    """快捷动作按钮桩：默认 link 结果；改 result 控制成败，calls 记录调用。"""
    stub = lambda: None  # noqa: E731
    stub.result = {"title": "GitHub 主页", "type": "link", "value": "https://github.com"}
    stub.calls = []

    def fake(text):
        stub.calls.append(text)
        return stub.result

    monkeypatch.setattr(llm_module, "generate_quick_button", fake)
    return stub


def post_polish(client, kind, text, key=KEY, style=None):
    payload = {"kind": kind, "text": text}
    if style is not None:
        payload["style"] = style
    return client.post(f"/polish/{key}", json=payload, headers={"Origin": ORIGIN})


class TestSuccess:
    def test_todo_kind_returns_items_and_passes_text(self, client, polish):
        response = post_polish(client, "todo", "买牛奶、交电费")

        assert response.status_code == 200
        assert response.get_json() == {"items": ["明天买牛奶", "交电费"]}
        assert polish.calls == [("todo", "买牛奶、交电费", None)]

    def test_note_kind_branch(self, client, polish):
        polish.result = ["1、要点A"]
        response = post_polish(client, "note", "一段想法")
        assert response.get_json() == {"items": ["1、要点A"]}
        assert polish.calls == [("note", "一段想法", None)]

    def test_style_passes_through_to_llm(self, client, polish):
        response = post_polish(client, "note", "一段想法", style="concise")

        assert response.status_code == 200
        assert polish.calls == [("note", "一段想法", "concise")]


class TestFallback:
    def test_llm_failure_returns_fallback_marker(self, client, polish):
        polish.result = None
        response = post_polish(client, "todo", "原文")
        assert response.status_code == 200
        assert response.get_json() == {"items": None, "fallback": True}

    def test_empty_llm_result_also_falls_back(self, client, polish):
        polish.result = []
        response = post_polish(client, "todo", "原文")
        assert response.get_json() == {"items": None, "fallback": True}


class TestAuth:
    def test_unknown_code_404_without_llm(self, client, polish):
        response = post_polish(client, "todo", "x", key="c" * 64)
        assert response.status_code == 404
        assert response.get_json() == {"error": "unknown_code"}
        assert polish.calls == []

    def test_revoked_code_410_without_llm(self, client, polish):
        client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN})
        response = post_polish(client, "todo", "x")
        assert response.status_code == 410
        assert response.get_json() == {"error": "revoked"}
        assert polish.calls == []


class TestValidation:
    def test_invalid_kind_400(self, client, polish):
        for kind in ["memo", 1, None]:
            response = client.post(f"/polish/{KEY}", json={"kind": kind, "text": "x"}, headers={"Origin": ORIGIN})
            assert response.status_code == 400
        assert polish.calls == []

    def test_invalid_style_400_without_llm(self, client, polish):
        for style in ["formal", 1, True, {}]:
            response = post_polish(client, "note", "x", style=style)
            assert response.status_code == 400
            assert response.get_json() == {"error": "bad_request"}
        assert polish.calls == []

    def test_blank_or_non_string_text_400(self, client, polish):
        for text in ["", "   ", 42, None]:
            response = client.post(f"/polish/{KEY}", json={"kind": "todo", "text": text}, headers={"Origin": ORIGIN})
            assert response.status_code == 400
        assert polish.calls == []

    def test_non_dict_body_400(self, client, polish):
        response = client.post(f"/polish/{KEY}", data="junk", content_type="text/plain", headers={"Origin": ORIGIN})
        assert response.status_code == 400
        assert polish.calls == []

    def test_over_2000_chars_413(self, client, polish):
        response = post_polish(client, "todo", "长" * 2001)
        assert response.status_code == 413
        assert response.get_json() == {"error": "too_large"}
        assert polish.calls == []

    def test_exactly_2000_chars_accepted(self, client, polish):
        polish.result = ["ok"]
        response = post_polish(client, "todo", "长" * 2000)
        assert response.status_code == 200


class TestCors:
    def test_whitelisted_origin_echoed(self, client, polish):
        response = post_polish(client, "todo", "x")
        assert response.headers["Access-Control-Allow-Origin"] == ORIGIN
        assert "POST" in response.headers["Access-Control-Allow-Methods"]

    def test_options_preflight_204(self, client):
        response = client.options(f"/polish/{KEY}", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"})
        assert response.status_code == 204


class TestQuickKind:
    def test_quick_returns_button_and_passes_text(self, client, quick, polish):
        response = post_polish(client, "quick", "https://github.com 代码托管")

        assert response.status_code == 200
        assert response.get_json() == {"button": {"title": "GitHub 主页", "type": "link", "value": "https://github.com"}}
        assert quick.calls == ["https://github.com 代码托管"]
        assert polish.calls == []  # quick 不走 polish_capture。

    def test_quick_llm_failure_returns_fallback_marker(self, client, quick):
        quick.result = None
        response = post_polish(client, "quick", "文本")
        assert response.status_code == 200
        assert response.get_json() == {"button": None, "fallback": True}

    def test_quick_raising_llm_also_falls_back(self, client, monkeypatch):
        def boom(text):
            raise RuntimeError("should not surface")

        monkeypatch.setattr(llm_module, "generate_quick_button", boom)
        response = post_polish(client, "quick", "文本")
        assert response.status_code == 200
        assert response.get_json() == {"button": None, "fallback": True}
