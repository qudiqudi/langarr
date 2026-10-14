import importlib.util
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

import webhook_server
from webhook_server import WebhookServer

TAGGER = Path(__file__).resolve().parent.parent / "arr-language-tagger.py"
REAL_SLEEP = time.sleep  # the autouse fixture replaces time.sleep in all modules


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
    server.retries = []
    server.retry_timer = lambda delay, function, retry: server.retries.append((delay, retry))
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

TAGGER_MODULE = load_tagger()


def make_arr(series, episodes):
    arr = object.__new__(TAGGER_MODULE.ArrInstance)
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


def test_read_error_raises_and_never_gives_series_search(monkeypatch):
    arr = make_arr(SERIES_S1_S2, EPISODES)
    calls = []

    def broken(*_args, **_kwargs):
        calls.append(1)
        raise RuntimeError("timeout")

    arr._get = broken
    monkeypatch.setattr(TAGGER_MODULE.time, "sleep", lambda _s: None)
    with pytest.raises(TAGGER_MODULE.SearchScopeError):
        arr._series_search_command(9, [2])
    assert len(calls) == 3  # retried, then given up without widening the scope


def test_no_monitored_season_gives_episode_search():
    series = {"seasons": [{"seasonNumber": 1, "monitored": False}, {"seasonNumber": 2, "monitored": False}]}
    arr = make_arr(series, EPISODES)
    assert arr._series_search_command(9, [2]) == {"name": "EpisodeSearch", "episodeIds": [21]}


def test_partly_monitored_request_gives_episode_search():
    series = {"seasons": [{"seasonNumber": 1, "monitored": True}, {"seasonNumber": 2, "monitored": False}]}
    arr = make_arr(series, EPISODES)
    assert arr._series_search_command(9, [1, 2]) == {"name": "EpisodeSearch", "episodeIds": [21]}


def test_monitored_specials_prevent_series_search():
    series = {"seasons": [{"seasonNumber": 0, "monitored": True}, {"seasonNumber": 2, "monitored": True}]}
    arr = make_arr(series, EPISODES)
    assert arr._series_search_command(9, [2]) == {"name": "EpisodeSearch", "episodeIds": [21]}


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
        self.updates = []

    def should_prefer_dub(self, item):
        return False

    def find_item_by_tmdb_id(self, tmdb_id):
        return {"id": 3, "title": "Seven Worlds, One Planet"}

    def update_item(self, item, add_tag=False, search=True):
        self.updates.append(search)
        return True

    result = "sent"

    def dispatch_search(self, item_id, endpoint, force=False, seasons=None):
        self.searches.append((item_id, endpoint, force, seasons))
        return self.result


@pytest.mark.parametrize("kind", ["MEDIA_AUTO_APPROVED", "MEDIA_APPROVED"])
def test_approved_tv_request_searches_the_requested_seasons(kind):
    sonarr = FakeSonarr()
    overseerr = FakeOverseerr(sonarr, seasons=[2, 3])
    make_server(overseerr, [sonarr]).process_media_request(payload(kind))
    assert sonarr.updates == [False]  # profile update without its own search
    assert sonarr.searches == [(3, "series", True, [2, 3])]
    assert overseerr.request_reads == 1


def test_pending_request_prepares_the_profile_but_does_not_search():
    sonarr = FakeSonarr()
    overseerr = FakeOverseerr(sonarr, seasons=[2])
    server = make_server(overseerr, [sonarr])
    server.process_media_request(payload("MEDIA_PENDING"))
    assert sonarr.updates == [False]
    assert sonarr.searches == []
    server.process_media_request(payload("MEDIA_APPROVED"))
    assert sonarr.searches == [(3, "series", True, [2])]


def test_movie_request_has_no_seasons():
    radarr = FakeSonarr()
    radarr.service_type = "radarr"
    overseerr = FakeOverseerr(radarr, seasons=[])
    overseerr.radarr_mapping = {1: "4k"}
    make_server(overseerr, [radarr]).process_media_request(payload("MEDIA_AUTO_APPROVED", media_type="movie"))
    assert radarr.searches == [(3, "movie", True, None)]


def test_unmapped_movie_request_does_not_read_the_request():
    radarr = FakeSonarr()
    radarr.service_type = "radarr"
    overseerr = FakeOverseerr(radarr, seasons=[])
    overseerr.radarr_mapping = {}
    make_server(overseerr, [radarr]).process_media_request(payload("MEDIA_AUTO_APPROVED", media_type="movie"))
    assert overseerr.request_reads == 0
    assert radarr.searches == [(3, "movie", True, None)]


# search dispatch: cooldown per scope, one search at a time

def make_dispatch_arr(series, episodes):
    arr = make_arr(series, episodes)
    arr.trigger_search_on_update = True
    arr.search_cooldown_seconds = 60
    arr.min_search_interval_seconds = 0
    arr.last_any_search = 0
    arr.last_triggered_searches = {}
    arr.dry_run = False
    arr.posted = []
    arr._post = lambda endpoint, data=None, **_kw: arr.posted.append(data)
    return arr


def test_cooldown_is_per_season_scope():
    arr = make_dispatch_arr(SERIES_S1_S2, EPISODES + [{"id": 31, "seasonNumber": 3, "hasFile": False, "airDateUtc": iso(-2)}])
    assert arr.trigger_search_for_item(9, "series", force=True, seasons=[2]) is True
    assert arr.trigger_search_for_item(9, "series", force=True, seasons=[3]) is True
    assert arr.trigger_search_for_item(9, "series", force=True, seasons=[2]) is False
    assert [p["episodeIds"] for p in arr.posted] == [[21], [31]]


def test_scoped_series_search_does_not_block_a_later_season():
    series = {"seasons": [{"seasonNumber": 2, "monitored": True}, {"seasonNumber": 3, "monitored": False}]}
    episodes = EPISODES + [{"id": 31, "seasonNumber": 3, "hasFile": False, "airDateUtc": iso(-2)}]
    arr = make_dispatch_arr(series, episodes)
    assert arr.trigger_search_for_item(9, "series", force=True, seasons=[2]) is True  # SeriesSearch (S2 only)
    series["seasons"][1]["monitored"] = True  # Seerr monitors S3 for the second request
    series["seasons"][0]["monitored"] = True
    assert arr.trigger_search_for_item(9, "series", force=True, seasons=[3]) is True
    assert arr.posted == [{"name": "SeriesSearch", "seriesId": 9}, {"name": "EpisodeSearch", "episodeIds": [31]}]


def test_same_scope_is_in_cooldown():
    arr = make_dispatch_arr(SERIES_S2_ONLY, EPISODES)
    assert arr.dispatch_search(9, "series", force=True, seasons=[2]) == "sent"
    assert arr.dispatch_search(9, "series", force=True, seasons=[2]) == "skipped"
    assert arr.dispatch_search(9, "series", force=True) == "sent"  # unscoped is a different scope
    assert arr.dispatch_search(9, "series", force=True) == "skipped"


def test_dispatch_reports_failures(monkeypatch):
    monkeypatch.setattr(TAGGER_MODULE.time, "sleep", lambda _s: None)
    arr = make_dispatch_arr(SERIES_S1_S2, EPISODES)

    def broken(*_args, **_kwargs):
        raise RuntimeError("timeout")

    arr._get = broken
    assert arr.dispatch_search(9, "series", force=True, seasons=[2]) == "failed"
    arr2 = make_dispatch_arr(SERIES_S2_ONLY, EPISODES)
    arr2._post = broken
    assert arr2.dispatch_search(9, "series", force=True, seasons=[2]) == "failed"
    assert arr2.dispatch_search(9, "series", force=True, seasons=[2]) == "failed"  # no cooldown after a failure


def test_parallel_searches_for_one_item_send_one_command():
    import threading
    arr = make_dispatch_arr(SERIES_S2_ONLY, EPISODES)
    slow_post = arr._post

    def post(endpoint, data=None, **kw):
        REAL_SLEEP(0.05)  # widen the window for a race
        slow_post(endpoint, data, **kw)

    arr._post = post
    barrier = threading.Barrier(4)

    def worker():
        barrier.wait()
        arr.trigger_search_for_item(9, "series", force=True, seasons=[2])

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert len(arr.posted) == 1


# update_item search flag

def make_update_arr():
    arr = object.__new__(TAGGER_MODULE.ArrInstance)
    arr.name = "4k"
    arr.tag_id = 1
    arr.tag_name = "prefer-dub"
    arr.profile_ids = {"original": 7, "dub": 8}
    arr.original_profile_name = "Original Preferred 4K"
    arr.dub_profile_name = "Dub Preferred 4K"
    arr.dry_run = False
    arr.update_delay = 0
    arr.service_type = "sonarr"
    arr.edits = []
    arr.edit_item = lambda item_id, **kw: arr.edits.append((item_id, kw))
    arr.searched = []
    arr.trigger_search_for_item = lambda item_id, endpoint, **kw: arr.searched.append(item_id) or True
    return arr


@pytest.mark.parametrize("search, expected", [(True, [3]), (False, [])])
def test_update_item_search_flag(monkeypatch, search, expected):
    monkeypatch.setattr(TAGGER_MODULE.time, "sleep", lambda _s: None)
    arr = make_update_arr()
    item = {"id": 3, "title": "x", "tags": [], "qualityProfileId": 8, "originalLanguage": {"name": "English"}}
    assert arr.update_item(item, add_tag=False, search=search) is True
    assert arr.edits == [(3, {"add_tags": [], "remove_tags": [], "profile_id": 7})]
    assert arr.searched == expected


# polling

def test_each_overseerr_instance_polls_at_its_own_interval():
    import schedule

    class FakeOverseerrPoll:
        def __init__(self, name, minutes, enabled=True):
            self.name, self.poll_interval_minutes, self.enabled = name, minutes, enabled

    tagger = object.__new__(TAGGER_MODULE.ArrLanguageTagger)
    tagger.overseerr_instances = [FakeOverseerrPoll("a", 2), FakeOverseerrPoll("b", 30), FakeOverseerrPoll("c", 5, enabled=False)]
    schedule.clear()
    try:
        tagger.schedule_overseerr_polls()
        assert sorted(job.interval for job in schedule.jobs) == [2, 30]
    finally:
        schedule.clear()


# webhook retries

def test_tv_request_without_seasons_is_retried_not_widened():
    sonarr = FakeSonarr()
    overseerr = FakeOverseerr(sonarr, seasons=[2])
    overseerr.get_request = lambda request_id: None  # Seerr not readable
    server = make_server(overseerr, [sonarr])
    server.process_media_request(payload("MEDIA_APPROVED"))
    assert sonarr.searches == []
    assert [d for d, _ in server.retries] == [60]


def test_unmapped_tv_request_without_seasons_is_retried_not_widened():
    sonarr = FakeSonarr()
    overseerr = FakeOverseerr(sonarr, seasons=[2])
    overseerr.sonarr_mapping = {}
    overseerr.get_request = lambda request_id: None
    server = make_server(overseerr, [sonarr])
    server.process_media_request(payload("MEDIA_AUTO_APPROVED"))
    assert sonarr.searches == []
    assert len(server.retries) == 1


def test_failed_search_is_retried_for_that_instance_until_it_works():
    sonarr = FakeSonarr()
    sonarr.result = "failed"
    overseerr = FakeOverseerr(sonarr, seasons=[2])
    server = make_server(overseerr, [sonarr])
    server.process_media_request(payload("MEDIA_APPROVED"))
    (delay, retry), = server.retries
    assert delay == 60 and retry["_langarr_only"] == ["4k"] and retry["_langarr_attempt"] == 1
    sonarr.result = "sent"  # Sonarr is back
    server.process_media_request(retry)
    assert sonarr.searches == [(3, "series", True, [2])] * 2
    assert len(server.retries) == 1  # no more retries


def test_retries_stop_after_the_last_delay():
    sonarr = FakeSonarr()
    sonarr.result = "failed"
    server = make_server(FakeOverseerr(sonarr, seasons=[2]), [sonarr])
    server.process_media_request(payload("MEDIA_APPROVED"))
    while server.retries and len(server.retries) < 10:
        _, retry = server.retries[-1]
        before = len(server.retries)
        server.process_media_request(retry)
        if len(server.retries) == before:
            break
    assert [d for d, _ in server.retries] == [60, 300, 900]


def test_pending_request_is_not_retried():
    sonarr = FakeSonarr()
    sonarr.find_item_by_tmdb_id = lambda tmdb_id: None
    server = make_server(FakeOverseerr(sonarr, seasons=[2]), [sonarr])
    server.process_media_request(payload("MEDIA_PENDING"))
    assert server.retries == []


def test_senders_cannot_set_internal_retry_keys(monkeypatch):
    server = make_server()
    seen = []
    monkeypatch.setattr(server, "process_media_request", lambda p: seen.append(p))
    body = payload("MEDIA_APPROVED")
    body["_langarr_only"] = ["main"]
    server.app.test_client().post("/webhook", json=body, headers={"X-Auth-Token": "secret"})
    assert "_langarr_only" not in seen[0]
