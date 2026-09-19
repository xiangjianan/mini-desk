"""Origin 闸门契约：带陌生 Origin 的请求一律 403（预检也在内，跨站 JSON POST 连预检都过不去）；
无 Origin（curl/监控）放行，healthz 永远放行。白名单未配置时 fail-closed（空表全拒）。"""

import pytest

from conftest import ORIGIN, make_client

EVIL = "https://evil.example"
KEY = "c" * 64


@pytest.fixture
def bare_client(db, monkeypatch):
    """未配置白名单的实例：模拟忘记 export ALLOWED_ORIGINS 的部署。"""
    return make_client(monkeypatch, "")


class TestOriginGate:
    def test_foreign_origin_get_inbox_403(self, client):
        response = client.get(f"/inbox/{KEY}", headers={"Origin": EVIL})

        assert response.status_code == 403
        assert response.get_json() == {"error": "origin_not_allowed"}
        # 403 响应仍走 CORS 头链路：ACAO 回落到白名单首个，绝不回显陌生 Origin。
        assert response.headers.get("Access-Control-Allow-Origin") == ORIGIN

    def test_foreign_origin_post_polish_403_before_business(self, client):
        # 闸门在业务逻辑之前：无需注册 key，也不应走到 key 校验/LLM 那一步。
        response = client.post(f"/polish/{KEY}", json={"kind": "todo", "text": "x"}, headers={"Origin": EVIL})

        assert response.status_code == 403
        assert response.get_json() == {"error": "origin_not_allowed"}

    def test_foreign_origin_preflight_403(self, client):
        response = client.open(
            f"/inbox/{KEY}", method="OPTIONS", headers={"Origin": EVIL, "Access-Control-Request-Method": "POST"}
        )

        assert response.status_code == 403

    def test_no_origin_passes_through(self, client):
        # curl/监控探活不带 Origin：放行（unknown 是注册制语义，而不是闸门 403）。
        response = client.get(f"/inbox/{KEY}/status")

        assert response.status_code == 200
        assert response.get_json() == {"status": "unknown"}

    def test_healthz_exempt_from_origin_gate(self, client):
        assert client.get("/healthz", headers={"Origin": EVIL}).status_code == 200


class TestFailClosed:
    def test_unset_whitelist_rejects_all_origins(self, bare_client):
        # fail-closed：白名单为空时，任何带 Origin 的请求都 403（合法流量部署时必须显式配置白名单）。
        assert bare_client.get(f"/inbox/{KEY}", headers={"Origin": ORIGIN}).status_code == 403
