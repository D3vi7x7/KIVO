import asyncio
import json

import httpx

import app.auth as auth_module
from app.auth import google_callback

FAKE_PROFILE = {
    "sub": "123456789",
    "email": "google.user@example.com",
    "name": "Google User",
    "picture": "https://example.com/pic.png",
}

TOKEN_RESPONSE = {"access_token": "fake-google-access-token", "token_type": "Bearer"}
USERINFO_RESPONSE = FAKE_PROFILE


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        assert "oauth2.googleapis.com" in url, url
        return FakeResponse(TOKEN_RESPONSE)

    async def get(self, url, **kwargs):
        assert "userinfo" in url, url
        return FakeResponse(USERINFO_RESPONSE)


async def main():
    httpx.AsyncClient = FakeClient

    class FakeCollection:
        async def update_one(self, *args, **kwargs):
            return None

    class FakeDB:
        def __getitem__(self, name):
            return FakeCollection()

    auth_module.get_db = lambda: FakeDB()

    response = await google_callback(code="fake-code", response=None)
    response.body = response.body

    print("status_code :", response.status_code)
    print("location    :", response.headers.get("location"))
    print("set-cookie  :", [c for c in response.headers.getlist("set-cookie")])

    assert response.status_code == 302, "expected a redirect"
    assert response.headers.get("location") == "http://localhost:3000/auth/callback"
    cookies = response.headers.getlist("set-cookie")
    assert any("access_token" in c and "HttpOnly" in c for c in cookies), cookies
    assert any("refresh_token" in c and "HttpOnly" in c for c in cookies), cookies
    print("\nOK: callback redirects to the frontend with httpOnly cookies")


asyncio.run(main())
