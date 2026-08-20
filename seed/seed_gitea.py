"""One-shot seeding of the Gitea repository: labels, sample issues, and an API token for the app.

Idempotent: safe to re-run (e.g. after `docker-compose up` again) without duplicating
repos/labels/issues, and re-running always leaves a fresh, known app token in place.
"""

import os
import time

import requests

GITEA_URL = os.environ["GITEA_URL"].rstrip("/")
ADMIN_USER = os.environ["GITEA_ADMIN_USER"]
ADMIN_PASSWORD = os.environ["GITEA_ADMIN_PASSWORD"]
REPO_NAME = os.environ.get("GITEA_REPO_NAME", "bug-triage-service")
TOKEN_NAME = "triage-service"
SHARED_TOKEN_PATH = "/shared/gitea_token"

AUTH = (ADMIN_USER, ADMIN_PASSWORD)

# Exclusive scope ("severity/") lets Gitea enforce a single severity per issue.
SEVERITY_LABELS = [
    ("severity/critical", "b60205"),
    ("severity/high", "d93f0b"),
    ("severity/medium", "fbca04"),
    ("severity/low", "0e8a16"),
]

# Plain (non-exclusive) labels since an issue can span multiple components.
COMPONENT_LABELS = [
    ("frontend", "1d76db"),
    ("backend", "5319e7"),
    ("api", "0052cc"),
    ("auth", "d4c5f9"),
    ("database", "c2e0c6"),
    ("infra", "bfdadc"),
    ("docs", "cccccc"),
    ("unknown", "ededed"),
]

# Sample issues are preloaded so duplicate checks have something to compare against.
SEED_ISSUES = [
    {
        "title": "Login button unresponsive on mobile Safari",
        "body": (
            'Multiple users report that on iOS Safari the "Log in" button does nothing '
            "when tapped. Works fine on desktop Chrome. Started after the 3.4 release."
        ),
        "labels": ["severity/high", "frontend", "auth"],
    },
    {
        "title": "CSV export times out for large datasets",
        "body": (
            "Exporting a report with more than ~50k rows spins for a while and then "
            "returns a 504. Smaller exports are fine."
        ),
        "labels": ["severity/medium", "backend"],
    },
    {
        "title": "Password reset email never arrives",
        "body": (
            "Requesting a password reset shows a success message but no email is ever "
            "delivered. Checked spam. Happens for at least three different users."
        ),
        "labels": ["severity/high", "backend", "auth"],
    },
    {
        "title": "Dashboard charts render blank on first load",
        "body": (
            "On first page load the dashboard charts are empty. A manual refresh fixes "
            "it. Seems like a race with the data fetch."
        ),
        "labels": ["severity/medium", "frontend"],
    },
]


def wait_for_gitea(timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.get(f"{GITEA_URL}/api/healthz", timeout=5).ok:
                return
        except requests.RequestException:
            pass
        time.sleep(2)
    raise RuntimeError("Gitea did not become ready in time")


def ensure_repo():
    if requests.get(f"{GITEA_URL}/api/v1/repos/{ADMIN_USER}/{REPO_NAME}", auth=AUTH).status_code == 200:
        print(f"repo {REPO_NAME} already exists, skipping create")
        return
    resp = requests.post(
        f"{GITEA_URL}/api/v1/user/repos",
        auth=AUTH,
        json={
            "name": REPO_NAME,
            "private": False,
            # Left empty: your own repo's git history becomes the initial commit, no
            # unrelated-histories conflict when pushing your local main branch.
            "auto_init": False,
            "description": "A local-first service for triaging bug reports with an LLM",
        },
    )
    if not resp.ok:
        raise RuntimeError(f"failed to create repo: {resp.status_code} {resp.text}")
    print(f"created repo {REPO_NAME}")


def ensure_labels():
    resp = requests.get(f"{GITEA_URL}/api/v1/repos/{ADMIN_USER}/{REPO_NAME}/labels", auth=AUTH)
    resp.raise_for_status()
    existing = {label["name"]: label["id"] for label in resp.json()}

    for name, color in SEVERITY_LABELS + COMPONENT_LABELS:
        if name in existing:
            continue
        resp = requests.post(
            f"{GITEA_URL}/api/v1/repos/{ADMIN_USER}/{REPO_NAME}/labels",
            auth=AUTH,
            json={"name": name, "color": f"#{color}"},
        )
        if not resp.ok:
            raise RuntimeError(f"failed to create label {name}: {resp.status_code} {resp.text}")
        existing[name] = resp.json()["id"]
        print(f"created label {name}")
    return existing


def ensure_issues(label_ids):
    resp = requests.get(
        f"{GITEA_URL}/api/v1/repos/{ADMIN_USER}/{REPO_NAME}/issues",
        auth=AUTH,
        params={"state": "all", "limit": 50},
    )
    resp.raise_for_status()
    existing_titles = {issue["title"] for issue in resp.json()}

    for issue in SEED_ISSUES:
        if issue["title"] in existing_titles:
            print(f"issue '{issue['title']}' already exists, skipping")
            continue
        resp = requests.post(
            f"{GITEA_URL}/api/v1/repos/{ADMIN_USER}/{REPO_NAME}/issues",
            auth=AUTH,
            json={
                "title": issue["title"],
                "body": issue["body"],
                "labels": [label_ids[name] for name in issue["labels"]],
            },
        )
        if not resp.ok:
            raise RuntimeError(f"failed to create issue {issue['title']}: {resp.status_code} {resp.text}")
        print(f"created issue '{issue['title']}'")


def ensure_app_token():
    # Gitea only reveals a token's value at creation time, so replace any stale one.
    resp = requests.get(f"{GITEA_URL}/api/v1/users/{ADMIN_USER}/tokens", auth=AUTH)
    resp.raise_for_status()
    for token in resp.json():
        if token["name"] == TOKEN_NAME:
            requests.delete(f"{GITEA_URL}/api/v1/users/{ADMIN_USER}/tokens/{token['id']}", auth=AUTH)
            print(f"removed stale token '{TOKEN_NAME}'")

    resp = requests.post(
        f"{GITEA_URL}/api/v1/users/{ADMIN_USER}/tokens",
        auth=AUTH,
        json={"name": TOKEN_NAME, "scopes": ["write:issue", "write:repository", "read:user"]},
    )
    if not resp.ok:
        raise RuntimeError(f"failed to create app token: {resp.status_code} {resp.text}")

    os.makedirs(os.path.dirname(SHARED_TOKEN_PATH), exist_ok=True)
    with open(SHARED_TOKEN_PATH, "w") as f:
        f.write(resp.json()["sha1"])
    print(f"wrote app token to {SHARED_TOKEN_PATH}")


def main():
    wait_for_gitea()
    ensure_repo()
    label_ids = ensure_labels()
    ensure_issues(label_ids)
    ensure_app_token()
    print("seeding complete")


if __name__ == "__main__":
    main()
