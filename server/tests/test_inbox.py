"""中继契约测试：语义对照 worker/__tests__/inbox-worker.test.ts（去掉其 429/409 限流用例）。"""

import time

ORIGIN = "https://todolist.pages.dev"
KEY = "a" * 64
OTHER = "b" * 64


def post(client, key_hash, body, origin=ORIGIN):
    return client.post(f"/inbox/{key_hash}", json=body, headers={"Origin": origin})


def get(client, key_hash, origin=ORIGIN):
    return client.get(f"/inbox/{key_hash}", headers={"Origin": origin})


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
        assert response.headers["Allow"] == "GET, POST, OPTIONS"
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
