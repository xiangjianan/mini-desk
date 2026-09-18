"""快捷动作链接上下文：URL 提取 + SSRF 防护 + fetch_link_context。mock DNS 与 HTTP，不发真实请求。"""

import io
import ipaddress
import urllib.error

import llm
import pytest


class FakeFetchResponse:
    def __init__(self, body="", content_type="text/html", location=None):
        self.headers = {"Content-Type": content_type}
        if location is not None:
            self.headers["Location"] = location
        self._body = body.encode("utf-8")
        self.read_size = None

    def read(self, size=-1):
        self.read_size = size
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


@pytest.fixture
def offline_dns(monkeypatch):
    """字面量 IP 原样返回、域名一律解析到公网 IP：fetch 判定不依赖真实 DNS。"""

    def fake(host, *args, **kwargs):
        try:
            ipaddress.ip_address(host)
        except ValueError:
            return [(0, 0, 0, "", ("93.184.216.34", 0))]
        return [(0, 0, 0, "", (host, 0))]

    monkeypatch.setattr(llm.socket, "getaddrinfo", fake)


def patch_fetch(monkeypatch, items):
    """按次序返回响应（Exception 实例则抛出）；返回 calls 记录 Request。"""
    calls = []
    queue = list(items)

    def fake_open(request):
        calls.append(request)
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(llm, "_open_no_redirect", fake_open)
    return calls


class TestExtractFirstUrl:
    def test_picks_first_url_and_strips_trailing_punctuation(self):
        text = "看这个 https://example.com/a?b=1。 还有 http://other.com/x))"
        assert llm.extract_first_url(text) == "https://example.com/a?b=1"

    def test_none_without_url(self):
        assert llm.extract_first_url("普通文本 ftp://x/y") is None


class TestIsSafeFetchUrl:
    def test_private_loopback_linklocal_literals_rejected(self):
        for host in ("127.0.0.1", "10.0.0.5", "192.168.1.2", "172.16.0.9", "169.254.169.254", "::1", "100.64.0.1"):
            assert llm.is_safe_fetch_url(f"http://{host}/x") is False

    def test_non_http_scheme_or_garbage_rejected(self):
        for url in ("ftp://example.com/x", "javascript:alert(1)", "not-a-url", "http:///nohost"):
            assert llm.is_safe_fetch_url(url) is False

    def test_dns_resolving_to_private_rejected(self, monkeypatch):
        monkeypatch.setattr(llm.socket, "getaddrinfo", lambda host, *a, **k: [(0, 0, 0, "", ("10.1.2.3", 0))])
        assert llm.is_safe_fetch_url("http://internal.corp/") is False

    def test_unresolvable_host_rejected(self, monkeypatch):
        def boom(host, *a, **k):
            raise OSError("dns failure")

        monkeypatch.setattr(llm.socket, "getaddrinfo", boom)
        assert llm.is_safe_fetch_url("http://nosuch.invalid/") is False

    def test_public_http_s_accepted(self, offline_dns):
        assert llm.is_safe_fetch_url("https://example.com/page") is True
        assert llm.is_safe_fetch_url("http://example.com/page") is True


class TestFetchLinkContext:
    def test_extracts_title_and_meta(self, monkeypatch, offline_dns):
        page = ("<html><head><title>  Mini\n Desk  </title>"
                "<meta name='description' content='一个&amp;桌面'></head></html>")
        patch_fetch(monkeypatch, [FakeFetchResponse(page)])
        assert llm.fetch_link_context("https://example.com/") == "Mini Desk | 一个&桌面"

    def test_caps_read_size_context_length_and_ua(self, monkeypatch, offline_dns):
        response = FakeFetchResponse("<title>" + "长" * 1000 + "</title>")
        calls = patch_fetch(monkeypatch, [response])
        context = llm.fetch_link_context("https://example.com/")
        assert response.read_size == llm.QUICK_FETCH_MAX_BYTES
        assert len(context) == llm.QUICK_CONTEXT_MAX_CHARS
        assert calls[0].get_header("User-agent") == llm.FETCH_USER_AGENT

    def test_page_without_meta_returns_none(self, monkeypatch, offline_dns):
        patch_fetch(monkeypatch, [FakeFetchResponse("<html><body></body></html>")])
        assert llm.fetch_link_context("https://example.com/") is None

    def test_non_html_returns_none(self, monkeypatch, offline_dns):
        patch_fetch(monkeypatch, [FakeFetchResponse("{}", content_type="application/json")])
        assert llm.fetch_link_context("https://example.com/api") is None

    def test_fetch_error_returns_none(self, monkeypatch, offline_dns):
        patch_fetch(monkeypatch, [TimeoutError("boom")])
        assert llm.fetch_link_context("https://example.com/") is None

    def test_unsafe_url_never_fetches(self, monkeypatch, offline_dns):
        calls = patch_fetch(monkeypatch, [FakeFetchResponse("<title>x</title>")])
        assert llm.fetch_link_context("http://127.0.0.1:8787/secret") is None
        assert calls == []

    def test_follows_safe_redirect_resolving_relative_location(self, monkeypatch, offline_dns):
        calls = patch_fetch(monkeypatch, [FakeFetchResponse(location="/home"), FakeFetchResponse("<title>Home</title>")])
        assert llm.fetch_link_context("https://example.com/a") == "Home"
        assert calls[1].full_url == "https://example.com/home"

    def test_redirect_into_private_target_returns_none(self, monkeypatch, offline_dns):
        patch_fetch(monkeypatch, [FakeFetchResponse(location="http://169.254.169.254/latest/meta-data")])
        assert llm.fetch_link_context("https://example.com/") is None

    def test_redirect_hop_cap_returns_none(self, monkeypatch, offline_dns):
        responses = [FakeFetchResponse(location=f"/hop{i}") for i in range(llm.QUICK_FETCH_MAX_REDIRECTS + 2)]
        patch_fetch(monkeypatch, responses)
        assert llm.fetch_link_context("https://example.com/") is None


class TestFetchLinkContextHttpErrorRedirects:
    """真实 urllib 在禁跟跳 opener 下把 3xx 抛成 HTTPError（带原响应头）：这条路径必须同样跟跳/拒绝。"""

    def _patch_error_open(self, monkeypatch, handler):
        monkeypatch.setattr(llm, "_open_no_redirect", handler)

    def test_3xx_httperror_with_location_follows_to_next_hop(self, monkeypatch, offline_dns):
        def error_open(request):
            if request.full_url == "https://example.com/a":
                raise urllib.error.HTTPError(request.full_url, 301, "Moved Permanently",
                                             {"Location": "https://example.com/b"}, io.BytesIO(b""))
            return FakeFetchResponse("<title>B</title>")

        self._patch_error_open(monkeypatch, error_open)
        assert llm.fetch_link_context("https://example.com/a") == "B"

    def test_3xx_httperror_into_private_target_returns_none(self, monkeypatch, offline_dns):
        def error_open(request):
            raise urllib.error.HTTPError(request.full_url, 302, "Found",
                                         {"Location": "http://169.254.169.254/x"}, io.BytesIO(b""))

        self._patch_error_open(monkeypatch, error_open)
        assert llm.fetch_link_context("https://example.com/") is None

    def test_non_redirect_httperror_returns_none(self, monkeypatch, offline_dns):
        def error_open(request):
            raise urllib.error.HTTPError(request.full_url, 404, "Not Found", {}, io.BytesIO(b"gone"))

        self._patch_error_open(monkeypatch, error_open)
        assert llm.fetch_link_context("https://example.com/") is None

    def test_3xx_httperror_without_location_returns_none(self, monkeypatch, offline_dns):
        def error_open(request):
            raise urllib.error.HTTPError(request.full_url, 302, "Found", {}, io.BytesIO(b""))

        self._patch_error_open(monkeypatch, error_open)
        assert llm.fetch_link_context("https://example.com/") is None
