"""Regression checks for the API surface the frontend depends on."""

from app.main import app

EXPECTED_ROUTES = {
    ("post", "/auth/signup/request-otp"),
    ("post", "/auth/login/request-otp"),
    ("post", "/auth/verify-otp"),
    ("post", "/auth/login/verify-otp"),
    ("post", "/auth/signup/verify-otp"),
    ("post", "/auth/refresh"),
    ("post", "/auth/logout"),
    ("get", "/auth/me"),
    ("get", "/auth/google"),
    ("get", "/auth/google/callback"),
    ("get", "/spaces"),
    ("post", "/spaces"),
    ("get", "/spaces/{space_id}"),
    ("delete", "/spaces/{space_id}"),
    ("get", "/spaces/{space_id}/notes"),
    ("post", "/spaces/{space_id}/notes"),
    ("patch", "/notes/{note_id}"),
    ("delete", "/notes/{note_id}"),
    ("get", "/projects"),
    ("get", "/spaces/{space_id}/projects"),
    ("post", "/spaces/{space_id}/projects"),
    ("get", "/projects/{project_id}"),
    ("patch", "/projects/{project_id}"),
    ("delete", "/projects/{project_id}"),
    ("get", "/projects/{project_id}/tasks"),
    ("post", "/projects/{project_id}/tasks"),
    ("patch", "/tasks/{task_id}"),
    ("delete", "/tasks/{task_id}"),
    ("get", "/projects/{project_id}/resources"),
    ("post", "/projects/{project_id}/resources"),
    ("delete", "/resources/{resource_id}"),
    ("get", "/task-options"),
    ("post", "/task-options"),
    ("delete", "/task-options/{option_id}"),
    ("get", "/health"),
}


def registered_routes() -> set[tuple[str, str]]:
    paths = app.openapi().get("paths", {})

    routes = set()
    for path, operations in paths.items():
        for method in operations:
            routes.add((method.lower(), path))
    return routes


def test_expected_routes_exist():
    missing = EXPECTED_ROUTES - registered_routes()
    assert not missing, f"missing routes: {sorted(missing)}"


if __name__ == "__main__":
    missing = EXPECTED_ROUTES - registered_routes()
    if missing:
        raise SystemExit(f"missing routes: {sorted(missing)}")
    print(f"OK: all {len(EXPECTED_ROUTES)} expected routes are registered")
