import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import webhook_server
from webhook_server import WebhookServer

TAGGER = Path(__file__).resolve().parent.parent / "arr-language-tagger.py"


def load_tagger():
    spec = importlib.util.spec_from_file_location("arr_language_tagger", TAGGER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def iso(delta_days):
    return (datetime.now(timezone.utc) + timedelta(days=delta_days)).isoformat().replace("+00:00", "Z")


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(webhook_server.time, "sleep", lambda _s: None)


def make_server(overseerr=None, arrs=()):
    server = WebhookServer(port=0, auth_token="secret",
                           overseerr_instances=[overseerr] if overseerr else [], arr_instances=list(arrs))
    server.process_async = False
    return server


def payload(notification_type, media_type="tv", request_id="7"):
    return {"notification_type": notification_type,
            "media": {"tmdbId": "90790", "media_type": media_type},
            "request": {"request_id": request_id}}


# webhook types

@pytest.mark.parametrize("kind", ["MEDIA_PENDING", "MEDIA_AUTO_APPROVED", "MEDIA_APPROVED"])
def test_media_request_types_are_valid(kind):
    assert make_server().validate_webhook_payload(payload(kind)) == (True, None)


def test_media_approved_is_processed(monkeypatch):
    server = make_server()
    seen = []
    monkeypatch.setattr(server, "process_media_request", lambda p: seen.append(p["notification_type"]))
    client = server.app.test_client()
    response = client.post("/webhook", json=payload("MEDIA_APPROVED"), headers={"X-Auth-Token": "secret"})
    assert response.status_code == 200
    assert seen == ["MEDIA_APPROVED"]


def test_other_types_are_ignored(monkeypatch):
    server = make_server()
    seen = []
    monkeypatch.setattr(server, "process_media_request", lambda p: seen.append(p))
    client = server.app.test_client()
    response = client.post("/webhook", json={"notification_type": "TEST_NOTIFICATION"}, headers={"X-Auth-Token": "secret"})
    assert response.status_code == 200
    assert seen == []


# helpers

def test_requested_seasons():
    assert WebhookServer.requested_seasons({"seasons": [{"seasonNumber": 2}, {"seasonNumber": 1}, {"seasonNumber": 2}]}) == [1, 2]
    assert WebhookServer.requested_seasons({"seasons": [3]}) == [3]
    assert WebhookServer.requested_seasons({"seasons": []}) is None
    assert WebhookServer.requested_seasons(None) is None


class LateArr:
    def __init__(self, found_on):
        self.calls = 0
        self.found_on = found_on

    def find_item_by_tmdb_id(self, tmdb_id):
        self.calls += 1
        return {"id": 3, "title": "x"} if self.calls >= self.found_on else None


def test_lookup_retries_until_the_item_is_there():
    arr = LateArr(found_on=3)
    assert WebhookServer.find_item_with_retry(arr, 90790, attempts=6) == {"id": 3, "title": "x"}
    assert arr.calls == 3


def test_pending_lookup_tries_once():
    arr = LateArr(found_on=2)
    assert WebhookServer.find_item_with_retry(arr, 90790, attempts=1) is None
    assert arr.calls == 1


# season-scoped search command

def make_arr(series, episodes):
    module = load_tagger()
    arr = object.__new__(module.ArrInstance)
    arr.name = "4k"

    def fake_get(endpoint, params=None, **_kwargs):
        if endpoint.startswith("series/"):
            return series
        if endpoint == "episode":
            return episodes
        raise AssertionError(endpoint)

    arr._get = fake_get
    return arr


SERIES_S1_S2 = {"seasons": [{"seasonNumber": 0, "monitored": True}, {"seasonNumber": 1, "monitored": True},
                            {"seasonNumber": 2, "monitored": True}]}
SERIES_S2_ONLY = {"seasons": [{"seasonNumber": 1, "monitored": False}, {"seasonNumber": 2, "monitored": True}]}
EPISODES = [
    {"id": 11, "seasonNumber": 1, "hasFile": True, "airDateUtc": iso(-400)},
    {"id": 21, "seasonNumber": 2, "hasFile": False, "airDateUtc": iso(-30)},
    {"id": 22, "seasonNumber": 2, "hasFile": True, "airDateUtc": iso(-23)},
    {"id": 23, "seasonNumber": 2, "hasFile": False, "airDateUtc": iso(5)},
    {"id": 24, "seasonNumber": 2, "hasFile": False, "airDateUtc": None},
]


def test_no_seasons_gives_series_search():
    arr = make_arr(SERIES_S1_S2, EPISODES)
    assert arr._series_search_command(9, None) == {"name": "SeriesSearch", "seriesId": 9}


def test_first_request_gives_series_search():
    arr = make_arr(SERIES_S2_ONLY, EPISODES)
    assert arr._series_search_command(9, [2]) == {"name": "SeriesSearch", "seriesId": 9}


def test_later_request_searches_only_the_requested_season():
    arr = make_arr(SERIES_S1_S2, EPISODES)
    assert arr._series_search_command(9, [2]) == {"name": "EpisodeSearch", "episodeIds": [21]}


def test_nothing_to_search_gives_none():
    arr = make_arr(SERIES_S1_S2, [e for e in EPISODES if e["id"] != 21])
    assert arr._series_search_command(9, [2]) is None


def test_read_error_falls_back_to_series_search():
    arr = make_arr(SERIES_S1_S2, EPISODES)

    def broken(*_args, **_kwargs):
        raise RuntimeError("timeout")

    arr._get = broken
    assert arr._series_search_command(9, [2]) == {"name": "SeriesSearch", "seriesId": 9}


# end to end through process_media_request

class FakeOverseerr:
    sonarr_mapping = {1: "4k"}
    radarr_mapping = {}

    def __init__(self, arr, seasons):
        self.arr = arr
        self.seasons = seasons
        self.request_reads = 0

    def get_media_language(self, media_type, tmdb_id):
        return "en"

    def get_request(self, request_id):
        self.request_reads += 1
        return {"is4k": True, "serverId": 1, "seasons": [{"seasonNumber": n} for n in self.seasons]}

    def resolve_arr_instance(self, service_type, server_id, is4k):
        return server_id, self.arr


class FakeSonarr:
    service_type = "sonarr"
    name = "4k"
    dub_profile_name = "Dub Preferred 4K"
    original_profile_name = "Original Preferred 4K"
    original_languages = ["en", "de"]
    language_id_map = {}

    def __init__(self):
        self.searches = []

    def should_prefer_dub(self, item):
        return False

    def find_item_by_tmdb_id(self, tmdb_id):
        return {"id": 3, "title": "Seven Worlds, One Planet"}

    def update_item(self, item, add_tag=False):
        return False

    def trigger_search_for_item(self, item_id, endpoint, force=False, seasons=None):
        self.searches.append((item_id, endpoint, force, seasons))
        return True


@pytest.mark.parametrize("kind", ["MEDIA_AUTO_APPROVED", "MEDIA_APPROVED"])
def test_approved_tv_request_searches_the_requested_seasons(kind):
    sonarr = FakeSonarr()
    overseerr = FakeOverseerr(sonarr, seasons=[2, 3])
    make_server(overseerr, [sonarr]).process_media_request(payload(kind))
    assert sonarr.searches == [(3, "series", True, [2, 3])]
    assert overseerr.request_reads == 1


def test_movie_request_has_no_seasons():
    radarr = FakeSonarr()
    radarr.service_type = "radarr"
    overseerr = FakeOverseerr(radarr, seasons=[])
    overseerr.radarr_mapping = {1: "4k"}
    make_server(overseerr, [radarr]).process_media_request(payload("MEDIA_AUTO_APPROVED", media_type="movie"))
    assert radarr.searches == [(3, "movie", True, None)]
