import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from jose import JWTError, jwt
from passlib.context import CryptContext
import httpx

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://admin:password@localhost:27017/kivodb?authSource=admin")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
POSTMARK_API_KEY = os.getenv("POSTMARK_API_KEY", "")
POSTMARK_SENDER = os.getenv("POSTMARK_SENDER", "support@kivo.work.gd")
# When true, the OTP is echoed back in the API response (development only).
DEV_OTP_IN_RESPONSE = os.getenv("DEV_OTP_IN_RESPONSE", "false").lower() == "true"

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() == "true"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/auth")

mongo_client: AsyncIOMotorClient | None = None
redis_client: redis.Redis | None = None


async def init_clients() -> None:
    global mongo_client, redis_client
    mongo_client = AsyncIOMotorClient(MONGODB_URI)
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    await mongo_client.admin.command("ping")
    await redis_client.ping()


async def close_clients() -> None:
    global mongo_client, redis_client
    if mongo_client:
        mongo_client.close()
    if redis_client:
        await redis_client.close()
        redis_client = None


def get_db():
    if mongo_client is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return mongo_client["kivodb"]


def get_redis() -> redis.Redis:
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Cache not ready")
    return redis_client


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "iat": now, "exp": expire, "type": "access"}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": subject, "iat": now, "exp": expire, "type": "refresh"}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")


class EmailRequest(BaseModel):
    email: str


class OtpVerifyRequest(BaseModel):
    email: str
    otp: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str


async def get_current_user(request: Request) -> str:
    """FastAPI dependency that resolves the signed-in user from the access cookie."""
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")

    return payload["sub"]


@router.post("/signup/request-otp")
async def signup_request_otp(req: EmailRequest):
    return await _send_otp(req.email, "signup")


@router.post("/login/request-otp")
async def login_request_otp(req: EmailRequest):
    return await _send_otp(req.email, "login")


async def _send_otp(email: str, flow: str):
    db = get_db()
    email = email.strip().lower()

    existing = await db["users"].find_one({"email": email})
    if flow == "signup" and existing:
        raise HTTPException(status_code=400, detail="Account already exists. Log in instead.")
    if flow == "login" and not existing:
        raise HTTPException(status_code=400, detail="No account found. Create one instead.")

    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    # Store OTP in Redis with 10 min TTL
    r = get_redis()
    await r.setex(f"otp:{flow}:{email}", 600, otp)

    if not POSTMARK_API_KEY:
        print(f"[DEV OTP] {email} ({flow}): {otp}")
        return {
            "detail": f"OTP sent to {email}",
            "dev_otp": otp if DEV_OTP_IN_RESPONSE else None,
        }

    try:
        async with httpx.AsyncClient() as client:
            send_res = await client.post(
                "https://api.postmarkapp.com/email",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Postmark-Server-Token": POSTMARK_API_KEY,
                },
                json={
                    "From": POSTMARK_SENDER,
                    "To": email,
                    "Subject": f"Your KIVO {flow.upper()} OTP",
                    "HtmlBody": f"<p>Your OTP code is <strong>{otp}</strong>. It expires in 10 minutes.</p>",
                    "TextBody": f"Your OTP code is {otp}. It expires in 10 minutes.",
                },
                timeout=10,
            )
    except Exception as exc:  # pragma: no cover - network failure
        print(f"Postmark send failed: {exc}")
        if DEV_OTP_IN_RESPONSE:
            return {"detail": f"OTP sent to {email}", "dev_otp": otp}
        raise HTTPException(status_code=502, detail=f"Could not reach the email provider: {exc}")

    # Postmark answers 4xx/5xx with a JSON body instead of raising.
    if send_res.status_code >= 400:
        body = send_res.text
        try:
            body = send_res.json().get("Message") or body
        except Exception:
            pass

        print(f"Postmark rejected the message ({send_res.status_code}): {body}")
        if DEV_OTP_IN_RESPONSE:
            return {"detail": f"OTP sent to {email}", "dev_otp": otp}
        raise HTTPException(
            status_code=502,
            detail=f"Email provider rejected the message: {body}",
        )

    print(f"OTP email accepted by Postmark for {email} ({flow})")
    return {
        "detail": f"OTP sent to {email}",
        "dev_otp": otp if DEV_OTP_IN_RESPONSE else None,
    }


@router.post("/verify-otp", response_model=TokenResponse)
@router.post("/login/verify-otp", response_model=TokenResponse)
async def verify_otp(req: OtpVerifyRequest, response: Response):
    db = get_db()
    email = req.email.strip().lower()
    stored = await get_redis().get(f"otp:login:{email}")
    if not stored or stored != req.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user = await db["users"].find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Sign up first.")

    await get_redis().delete(f"otp:login:{email}")

    access_token = create_access_token(email)
    refresh_token = create_refresh_token(email)
    set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/signup/verify-otp", response_model=TokenResponse)
async def signup_verify_otp(req: OtpVerifyRequest, response: Response):
    db = get_db()
    email = req.email.strip().lower()
    stored = await get_redis().get(f"otp:signup:{email}")
    if not stored or stored != req.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    existing = await db["users"].find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    await db["users"].insert_one(
        {
            "email": email,
            "created_at": datetime.now(timezone.utc),
            "verified": True,
        }
    )
    await get_redis().delete(f"otp:signup:{email}")

    access_token = create_access_token(email)
    refresh_token = create_refresh_token(email)
    set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    payload = verify_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    email = payload["sub"]
    access_token = create_access_token(email)
    new_refresh = create_refresh_token(email)
    set_auth_cookies(response, access_token, new_refresh)
    return TokenResponse(access_token=access_token, refresh_token=new_refresh)


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"detail": "Logged out"}


@router.get("/me")
async def me(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"email": payload["sub"]}


# ---------------------------------------------------------------------------
# Google OAuth2
# ---------------------------------------------------------------------------

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:5000/auth/google/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


@router.get("/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth is not configured")
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return JSONResponse({"url": f"{GOOGLE_AUTH_URL}?{query}"})


@router.get("/google/callback")
async def google_callback(code: str, response: Response):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth is not configured")

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange Google code")

        tokens = token_res.json()
        user_res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
            timeout=10,
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Google profile")

        profile = user_res.json()

    email = profile.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    db = get_db()
    await db["users"].update_one(
        {"email": email},
        {
            "$set": {
                "google_id": profile.get("sub"),
                "name": profile.get("name"),
                "picture": profile.get("picture"),
            },
            "$setOnInsert": {
                "email": email,
                "created_at": datetime.now(timezone.utc),
                "verified": True,
            },
        },
        upsert=True,
    )

    access_token = create_access_token(email)
    refresh_token = create_refresh_token(email)

    res = RedirectResponse(url=f"{FRONTEND_URL}/auth/callback", status_code=302)
    set_auth_cookies(res, access_token, refresh_token)
    return res


# ---------------------------------------------------------------------------
# Integration (API-key) auth for external agents (e.g. ChatGPT)
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer(auto_error=False)


def hash_integration_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def get_integration_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """Resolve the owner email from a Bearer integration API key.

    Returns the owner email (same `sub` used by cookie auth) so integration
    endpoints can reuse the existing owner-scoped data model.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    db = get_db()
    key_hash = hash_integration_key(credentials.credentials)
    integration = await db["integrations"].find_one(
        {"key_hash": key_hash, "revoked": False}
    )
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked integration key",
        )

    await db["integrations"].update_one(
        {"_id": integration["_id"]},
        {"$set": {"last_used": datetime.now(timezone.utc)}},
    )

    return integration["owner"]
