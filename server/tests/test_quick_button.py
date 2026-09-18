"""generate_quick_button：LLM 只出 {"title","type"}，value 确定性回填；mock _post_chat 与 fetch。"""

import json

import llm
import pytest


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    captured = {"content": json.dumps({"title": "GitHub 主页", "type": "link"}, ensure_ascii=False)}

    def fake_post_chat(system_prompt, user_content):
        captured["system_prompt"] = system_prompt
        captured["user_content"] = user_content
        return {"choices": [{"message": {"content": captured["content"]}}]}

    monkeypatch.setattr(llm, "_post_chat", fake_post_chat)
    monkeypatch.setattr(llm, "fetch_link_context", lambda url: None)
    return captured


class TestSuccess:
    def test_link_button_value_is_url_verbatim_from_input(self, api):
        result = llm.generate_quick_button("  https://github.com/x?y=1 代码托管  ")
        assert result == {"title": "GitHub 主页", "type": "link", "value": "https://github.com/x?y=1"}

    def test_text_button_value_is_raw_text_trimmed(self, api):
        api["content"] = json.dumps({"title": "部署命令", "type": "text"}, ensure_ascii=False)
        result = llm.generate_quick_button("  npm run deploy\n# 一键部署  ")
        assert result == {"title": "部署命令", "type": "text", "value": "npm run deploy\n# 一键部署"}

    def test_url_and_page_passed_as_context(self, api, monkeypatch):
        monkeypatch.setattr(llm, "fetch_link_context", lambda url: "Example 站点 | 一个示例")
        llm.generate_quick_button("https://example.com")
        payload = json.loads(api["user_content"])
        assert payload == {"text": "https://example.com", "url": "https://example.com", "page": "Example 站点 | 一个示例"}
        assert api["system_prompt"] == llm.QUICK_SYSTEM_PROMPT

    def test_fetch_failure_degrades_to_url_only_context(self, api):
        llm.generate_quick_button("https://example.com")
        payload = json.loads(api["user_content"])
        assert payload["url"] == "https://example.com"
        assert payload["page"] is None


class TestGuardrails:
    def test_title_clamped_to_15_codepoints(self, api):
        api["content"] = json.dumps({"title": "一二三四五六七八九十一二三四五六", "type": "text"}, ensure_ascii=False)
        result = llm.generate_quick_button("文本")
        assert len(result["title"]) == llm.QUICK_TITLE_MAX_CHARS == 15

    def test_link_without_url_falls_back_to_text(self, api):
        api["content"] = json.dumps({"title": "笔记", "type": "link"}, ensure_ascii=False)
        result = llm.generate_quick_button("纯文本没有链接")
        assert result == {"title": "笔记", "type": "text", "value": "纯文本没有链接"}

    def test_bad_llm_output_returns_none(self, api):
        for content in ["not json", json.dumps({"title": "T"}), json.dumps({"title": "T", "type": "api"}),
                        json.dumps({"title": "  ", "type": "text"}), json.dumps({"title": 1, "type": "text"})]:
            api["content"] = content
            assert llm.generate_quick_button("文本") is None

    def test_post_chat_none_returns_none(self, api, monkeypatch):
        monkeypatch.setattr(llm, "_post_chat", lambda *a: None)
        assert llm.generate_quick_button("文本") is None

    def test_blank_text_returns_none_without_llm(self, api):
        assert llm.generate_quick_button("   ") is None
        assert "user_content" not in api
