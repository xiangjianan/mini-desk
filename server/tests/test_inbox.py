"""中继契约测试：语义对照 worker/__tests__/inbox-worker.test.ts（去掉其 429/409 限流用例）。"""


class TestHealthz:
    def test_returns_ok_without_cors(self, client):
        response = client.get("/healthz")

        assert response.status_code == 200
        assert response.get_json() == {"ok": True}
        assert "Access-Control-Allow-Origin" not in response.headers
