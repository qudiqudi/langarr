from webhook_server import WebhookServer


def make_client():
    server = WebhookServer(port=0, auth_token="secret", overseerr_instances=[], arr_instances=[])
    return server.app.test_client()


def test_webhook_allows_20_requests_per_minute():
    client = make_client()
    codes = [client.post("/webhook", json={}).status_code for _ in range(21)]
    assert 429 not in codes[:20]
    assert codes[20] == 429


def test_health_uses_the_default_limit():
    client = make_client()
    codes = [client.get("/health").status_code for _ in range(51)]
    assert codes[:50] == [200] * 50
    assert codes[50] == 429
