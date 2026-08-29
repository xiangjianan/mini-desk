"""中继契约测试：覆盖中继协议的读即消费、注册三态与保留期清理（无限流用例）。"""

import time

import pytest

ORIGIN = "https://todolist.pages.dev"
KEY = "a" * 64
OTHER = "b" * 64


def post(client, key_hash, body, origin=ORIGIN):
    return client.post(f"/inbox/{key_hash}", json=body, headers={"Origin": origin})


def get(client, key_hash, origin=ORIGIN):
    return client.get(f"/inbox/{key_hash}", headers={"Origin": origin})


def register(client, key_hash, origin=ORIGIN):
    return client.post(f"/inbox/{key_hash}/register", headers={"Origin": origin})


@pytest.fixture(autouse=True)
def _preregistered_keys(client):
    """注册制默认钥匙：既有契约用例零改动直接可用；unknown 语义用独立新 hash 覆盖。"""
    register(client, KEY)
    register(client, OTHER)


class TestHealthz:
    def test_returns_ok_without_cors(self, client):
        response = client.get("/healthz")

        assert response.status_code == 200
        assert response.get_json() == {"ok": True}
        assert "Access-Control-Allow-Origin" not in response.headers


class TestContract:
    def test_post_get_roundtrip_sorted_with_cors(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "AAA"}).status_code == 200
        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).status_code == 200

        response = get(client, KEY)

        assert response.status_code == 200
        items = response.get_json()["items"]
        assert [item["id"] for item in items] == ["i1", "i2"]
        assert items[0]["payload"] == "AAA"
        assert items[0]["createdAt"] > 0
        assert response.headers["Access-Control-Allow-Origin"] == ORIGIN

    def test_post_ok_body(self, client):
        response = post(client, KEY, {"id": "i1", "payload": "AAA"})

        assert response.status_code == 200
        assert response.get_json() == {"ok": True}

    def test_duplicate_id_overwrites(self, client):
        post(client, KEY, {"id": "i1", "payload": "AAA"})
        post(client, KEY, {"id": "i1", "payload": "CCC"})

        items = get(client, KEY).get_json()["items"]

        assert len(items) == 1
        assert items[0]["payload"] == "CCC"

    def test_key_hash_isolation(self, client):
        post(client, KEY, {"id": "i1", "payload": "AAA"})

        assert get(client, OTHER).get_json()["items"] == []

    def test_invalid_paths_and_bodies(self, client):
        assert client.get("/nope").status_code == 404
        assert client.get("/nope").get_json() == {"error": "not_found"}
        assert post(client, "XYZ", {"id": "i1", "payload": "AAA"}).status_code == 404
        assert post(client, "a" * 63, {"id": "i1", "payload": "AAA"}).status_code == 404
        assert post(client, KEY, {"id": "", "payload": "AAA"}).status_code == 400
        assert post(client, KEY, {"id": "x" * 65, "payload": "AAA"}).status_code == 400
        assert post(client, KEY, {"id": "i1"}).status_code == 400
        assert post(client, KEY, {"id": "i1", "payload": 123}).status_code == 400
        assert client.post(f"/inbox/{KEY}", data="not-json", content_type="application/json").status_code == 400

    def test_payload_too_large_returns_413(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "A" * 6000}).status_code == 413

    def test_no_write_limit_500_posts(self, client):
        for index in range(500):
            assert post(client, KEY, {"id": f"item-{index}", "payload": "AAA"}).status_code == 200

        assert len(get(client, KEY).get_json()["items"]) == 500

    def test_method_not_allowed_with_allow_header(self, client):
        response = client.put(f"/inbox/{KEY}", headers={"Origin": ORIGIN})

        assert response.status_code == 405
        assert response.headers["Allow"] == "GET, POST, DELETE, OPTIONS"
        assert response.get_json() == {"error": "method_not_allowed"}

    def test_cors_whitelist_and_preflight(self, client):
        evil = get(client, KEY, origin="https://evil.example")
        assert evil.headers.get("Access-Control-Allow-Origin") != "https://evil.example"

        preflight = client.open(f"/inbox/{KEY}", method="OPTIONS", headers={"Origin": ORIGIN})
        assert preflight.status_code == 204
        assert preflight.headers["Access-Control-Allow-Origin"] == ORIGIN
        assert preflight.headers["Vary"] == "Origin"


class TestRetention:
    def test_post_purges_rows_older_than_30_days(self, client, db):
        now = int(time.time() * 1000)
        with db.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s)",
                [
                    (KEY, "stale", "OLD", now - 31 * 24 * 3600 * 1000),
                    (KEY, "recent", "KEEP", now - 29 * 24 * 3600 * 1000),
                ],
            )

        assert post(client, KEY, {"id": "fresh", "payload": "NEW"}).status_code == 200

        ids = [item["id"] for item in get(client, KEY).get_json()["items"]]
        assert "stale" not in ids
        assert "recent" in ids
        assert "fresh" in ids


class TestConsumeOnRead:
    def test_each_item_served_exactly_once(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "AAA"}).status_code == 200

        first = get(client, KEY).get_json()["items"]
        second = get(client, KEY).get_json()["items"]

        assert [item["id"] for item in first] == ["i1"]
        assert second == []

        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).status_code == 200
        third = get(client, KEY).get_json()["items"]
        assert [item["id"] for item in third] == ["i2"]

    def test_consumption_is_per_key_hash(self, client):
        post(client, KEY, {"id": "shared", "payload": "AAA"})
        post(client, OTHER, {"id": "shared", "payload": "BBB"})

        assert [item["id"] for item in get(client, KEY).get_json()["items"]] == ["shared"]
        assert [item["id"] for item in get(client, OTHER).get_json()["items"]] == ["shared"]

    def test_retention_purges_read_rows_too(self, client, db):
        now = int(time.time() * 1000)
        with db.cursor() as cursor:
            cursor.execute(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at, read_at) VALUES (%s, %s, %s, %s, %s)",
                (KEY, "stale-read", "OLD", now - 31 * 24 * 3600 * 1000, now - 30 * 24 * 3600 * 1000),
            )

        assert post(client, KEY, {"id": "fresh", "payload": "NEW"}).status_code == 200

        with db.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM inbox_items WHERE id = 'stale-read'")
            assert cursor.fetchone()[0] == 0


class TestRevocation:
    def test_delete_removes_items_and_revokes_future_posts(self, client):
        assert post(client, KEY, {"id": "i1", "payload": "AAA"}).status_code == 200

        assert client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN}).status_code == 200
        assert client.delete(f"/inbox/{KEY}").get_json() == {"ok": True}  # 幂等

        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).status_code == 410
        assert post(client, KEY, {"id": "i2", "payload": "BBB"}).get_json() == {"error": "revoked"}
        assert get(client, KEY).get_json()["items"] == []

    def test_delete_unknown_key_still_ok(self, client):
        assert client.delete(f"/inbox/{OTHER}").get_json() == {"ok": True}

    def test_delete_invalid_key_hash_404(self, client):
        assert client.delete("/inbox/XYZ").status_code == 404
        assert client.delete("/inbox/XYZ").get_json() == {"error": "not_found"}

    def test_revocation_is_per_key_hash(self, client):
        post(client, KEY, {"id": "i1", "payload": "AAA"})
        client.delete(f"/inbox/{KEY}")
        assert post(client, OTHER, {"id": "i1", "payload": "BBB"}).status_code == 200

    def test_revoked_keys_survive_retention_sweep(self, client, db):
        now = int(time.time() * 1000)
        with db.cursor() as cursor:
            cursor.execute(
                "INSERT INTO pairing_keys (key_hash, registered_at, revoked_at) VALUES (%s, %s, %s) "
                "AS new ON DUPLICATE KEY UPDATE revoked_at = new.revoked_at",
                (KEY, now - 40 * 24 * 3600 * 1000, now - 40 * 24 * 3600 * 1000),
            )
            cursor.execute(
                "INSERT INTO inbox_items (key_hash, id, payload, created_at) VALUES (%s, %s, %s, %s)",
                (OTHER, "stale", "OLD", now - 31 * 24 * 3600 * 1000),
            )

        assert post(client, OTHER, {"id": "fresh", "payload": "NEW"}).status_code == 200

        with db.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM inbox_items WHERE id = 'stale'")
            assert cursor.fetchone()[0] == 0  # inbox_items 过期行照常被清扫
            cursor.execute("SELECT COUNT(*) FROM pairing_keys WHERE key_hash = %s", (KEY,))
            assert cursor.fetchone()[0] == 1  # 注销记录不随清扫删除
        assert post(client, KEY, {"id": "x", "payload": "AAA"}).status_code == 410

    def test_cors_allows_delete(self, client):
        response = client.delete(f"/inbox/{KEY}", headers={"Origin": ORIGIN})

        assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, DELETE, OPTIONS"


class TestRegistration:
    def test_unregistered_key_post_404_get_permissive(self, client):
        fresh = "c" * 64
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 404
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).get_json() == {"error": "unknown_code"}
        # GET 宽松：未知码返回空列表不报错（升级窗口容错）。
        assert get(client, fresh).get_json()["items"] == []

    def test_register_idempotent_and_enables_posts(self, client):
        fresh = "d" * 64
        assert register(client, fresh).status_code == 200
        assert register(client, fresh).get_json() == {"ok": True}
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 200

    def test_register_does_not_revive_revoked(self, client):
        fresh = "e" * 64
        register(client, fresh)
        assert client.delete(f"/inbox/{fresh}").status_code == 200
        assert register(client, fresh).get_json() == {"ok": True}
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 410

    def test_status_three_states(self, client):
        fresh = "f" * 64
        assert client.get(f"/inbox/{fresh}/status").get_json() == {"status": "unknown"}
        register(client, fresh)
        assert client.get(f"/inbox/{fresh}/status").get_json() == {"status": "active"}
        client.delete(f"/inbox/{fresh}")
        assert client.get(f"/inbox/{fresh}/status").get_json() == {"status": "revoked"}

    def test_delete_unregistered_marks_revoked(self, client):
        fresh = "1" * 64
        assert client.delete(f"/inbox/{fresh}").get_json() == {"ok": True}
        assert post(client, fresh, {"id": "i1", "payload": "AAA"}).status_code == 410

    def test_register_and_status_invalid_hash_404(self, client):
        assert client.post("/inbox/XYZ/register").status_code == 404
        assert client.get("/inbox/XYZ/status").status_code == 404


class TestRegisterCors:
    def test_register_preflight_allows_post(self, client):
        preflight = client.open(
            f"/inbox/{KEY}/register", method="OPTIONS", headers={"Origin": ORIGIN}
        )
        assert preflight.status_code == 204
        assert preflight.headers["Access-Control-Allow-Origin"] == ORIGIN
