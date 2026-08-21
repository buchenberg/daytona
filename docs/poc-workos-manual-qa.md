# WorkOS AuthKit PoC — Manual QA Checklist

> **Branch:** `poc/workos` | **Wave:** 4.3 | **Scope:** local development only

Three scenarios. Each has a binary pass/fail signal. Run them in this order: S2 first (regression baseline), then S1 (happy path), then S3 (fallback edge case). All three must pass before the PoC is considered complete.

---

## Prerequisites

Complete `docs/poc-workos-setup.md` before running any scenario. Specifically:

- WorkOS Dashboard configured (Standalone Connect enabled, AuthKit domain set to `auth.localtest.me`, JWT template set, test user created with `external_id = "auth0|test-poc-user"`)
- Local API, dashboard, Postgres, and Redis running
- Daytona `"user"` row seeded with `id = 'auth0|test-poc-user'` (setup doc Section 5)
- `curl`, `jq`, and `psql` (or `docker exec` access to the Postgres container) available

Verify the seeded row exists before starting:

```bash
docker exec -it daytona-postgres psql -U user -d application_ctx \
  -c 'SELECT id FROM "user" WHERE id = '"'"'auth0|test-poc-user'"'"';'
# PASS: returns 1 row
```

---

## Scenario S2 — Auth0 Regression (run FIRST as baseline)

**What we're proving:** The existing Auth0 login path is unchanged by the PoC. Users who log in with their normal Auth0 credentials succeed exactly as before.

### Steps

```bash
# Set env to auth0 (or unset — auth0 is the default)
export AUTH_PROVIDER=auth0

# Terminal 1: start the API
npx nx serve api

# Verify the config endpoint reports auth0
curl -s http://localhost:3000/api/config | jq -r '.authProvider'
# PASS: prints "auth0"

# Verify workosOidc is absent
curl -s http://localhost:3000/api/config | jq '.workosOidc'
# PASS: prints "null"
```

Open the dashboard in a browser:

```
http://localhost:3000/dashboard
```

Click **Login** and complete the Auth0 login flow. After landing back on the dashboard, grab your Auth0 access token from browser dev tools:

- Open DevTools → Application → Local Storage
- Find the key matching `oidc.user:*` and copy the `access_token` value

```bash
export AUTH0_TOKEN="paste_your_auth0_access_token_here"

# Verify /api/users/me returns 200
curl -s -w "%{http_code}\n" -o /tmp/me.json \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  http://localhost:3000/api/users/me
# PASS: last line prints "200"

cat /tmp/me.json | jq '{id, email}'
# PASS: id/email match your Auth0 user, no error field
```

### Pass Criteria (ALL must be true)

- [ ] `/api/config` `authProvider` field is `"auth0"`
- [ ] `/api/config` `workosOidc` field is `null`
- [ ] Dashboard login succeeds via Auth0 (no redirect to `auth.localtest.me`)
- [ ] `GET /api/users/me` returns HTTP 200 with your Auth0 user data
- [ ] No error logs in the API terminal during login or the `/me` call

---

## Scenario S1 — WorkOS Happy Path (identity preservation)

**What we're proving:** A WorkOS-issued JWT carrying the `daytona_user_id` custom claim maps to an existing Daytona user row. The user logs in as themselves. No duplicate row is created.

This scenario directly exercises the `if (payload.daytona_user_id)` branch in `apps/api/src/auth/jwt.strategy.ts` (line 71).

### Precondition check

```bash
docker exec -it daytona-postgres psql -U user -d application_ctx \
  -c 'SELECT id FROM "user" WHERE id = '"'"'auth0|test-poc-user'"'"';'
# PASS: returns exactly 1 row — if 0 rows, run the seed from setup doc Section 5 first
```

### Steps

```bash
# Capture the current row count BEFORE login (anti-duplication baseline)
PRE_COUNT=$(docker exec daytona-postgres psql -U user -d application_ctx -t -A -c \
  'SELECT COUNT(*) FROM "user" WHERE id = '"'"'auth0|test-poc-user'"'"';')
echo "Pre-login count: $PRE_COUNT"
# PASS: prints "1"

# Set env to WorkOS
export AUTH_PROVIDER=workos
export WORKOS_OIDC_ISSUER=https://auth.localtest.me
export WORKOS_OIDC_CLIENT_ID=client_YOUR_WORKOS_CLIENT_ID
export WORKOS_OIDC_AUDIENCE=$WORKOS_OIDC_CLIENT_ID

# Restart the API to pick up the new env
npx nx serve api

# Verify the config endpoint reports workos
curl -s http://localhost:3000/api/config | jq -r '.authProvider'
# PASS: prints "workos"

# Verify workosOidc is now populated
curl -s http://localhost:3000/api/config | jq '.workosOidc'
# PASS: prints an object containing issuer and clientId
# Example:
# {
#   "issuer": "https://auth.localtest.me",
#   "clientId": "client_..."
# }
```

Open the dashboard in a browser:

```
http://localhost:3000/dashboard
```

Click **Login**. You should be redirected to `https://auth.localtest.me` (WorkOS AuthKit hosted UI). Enter the test user credentials you set in the WorkOS Dashboard. After successful authentication, WorkOS redirects back to the dashboard.

Grab the WorkOS access token from browser dev tools (same location as S2 — Application → Local Storage → `oidc.user:*` → `access_token`).

Decode the token at [jwt.io](https://jwt.io) before continuing:

```
# PASS: decoded payload contains:
#   "daytona_user_id": "auth0|test-poc-user"
# FAIL: if daytona_user_id is absent — the JWT template in WorkOS Dashboard
#        (Authentication → Features → JWT Template) wasn't saved. Re-apply it
#        and log in again to get a fresh token.
```

```bash
export WORKOS_TOKEN="paste_your_workos_access_token_here"

# Hit /api/users/me
curl -s -w "\n%{http_code}\n" \
  -H "Authorization: Bearer $WORKOS_TOKEN" \
  http://localhost:3000/api/users/me
# PASS: second-to-last line is the JSON body with "id": "auth0|test-poc-user"
# PASS: last line prints "200"

# CRITICAL: verify no duplicate row was created
POST_COUNT=$(docker exec daytona-postgres psql -U user -d application_ctx -t -A -c \
  'SELECT COUNT(*) FROM "user" WHERE id = '"'"'auth0|test-poc-user'"'"';')
echo "Post-login count: $POST_COUNT"
# PASS: prints "1" (same as PRE_COUNT — no duplicate)

# Verify no WorkOS-native user row was inadvertently created
docker exec daytona-postgres psql -U user -d application_ctx \
  -c 'SELECT id FROM "user" WHERE id LIKE '"'"'user_01%'"'"';'
# PASS: 0 rows returned
```

### Pass Criteria (ALL must be true)

- [ ] `/api/config` `authProvider` field is `"workos"`
- [ ] `/api/config` `workosOidc` field is a populated object with `issuer: "https://auth.localtest.me"`
- [ ] Dashboard login redirects to `auth.localtest.me` (WorkOS AuthKit UI, not Auth0)
- [ ] Decoded access token contains `daytona_user_id: "auth0|test-poc-user"`
- [ ] `GET /api/users/me` returns HTTP 200 with `id: "auth0|test-poc-user"`
- [ ] Post-login count of `"user"` rows matching `id='auth0|test-poc-user'` is still `1` (no duplicate)
- [ ] Zero rows with `id LIKE 'user_01%'` (no WorkOS-native sub ID was inserted)

---

## Scenario S3 — Missing `daytona_user_id` Fallback (edge case)

**What we're proving:** When the WorkOS JWT template is misconfigured and the `daytona_user_id` claim is absent, `jwt.strategy.ts` falls back to `payload.sub` (WorkOS's own `user_01H...` format ID) and creates a new user row for it. This documents the failure mode explicitly so it's recognizable in production if the template is ever accidentally cleared.

This scenario exercises the fallback path in `jwt.strategy.ts` — the `userId = payload.sub` assignment at line 53, reached when `payload.daytona_user_id` is falsy.

### Steps

In the WorkOS Dashboard, navigate to **Authentication → Features → JWT Template** and temporarily remove the `daytona_user_id` line. The template body should be empty or `{}`. Save.

Log out of the dashboard in the browser, then log in again via WorkOS with the same test user credentials.

Decode the new access token at [jwt.io](https://jwt.io):

```
# PASS: decoded payload does NOT contain daytona_user_id
# PASS: sub claim is present and starts with "user_01"
```

```bash
export WORKOS_TOKEN_NO_CLAIM="paste_new_token_here"

# Hit /api/users/me
curl -s -w "\n%{http_code}\n" \
  -H "Authorization: Bearer $WORKOS_TOKEN_NO_CLAIM" \
  http://localhost:3000/api/users/me
# PASS: last line prints "200"
# PASS: response body "id" starts with "user_01" (WorkOS's own sub)

# Verify a new user row was created with the WorkOS sub as ID
docker exec daytona-postgres psql -U user -d application_ctx \
  -c 'SELECT id, email FROM "user" WHERE id LIKE '"'"'user_01%'"'"';'
# PASS: at least 1 row returned with id starting with "user_01"
```

### Cleanup after S3

Restore the JWT template in the WorkOS Dashboard — re-add the `daytona_user_id` line:

```json
{
  "daytona_user_id": "{{ user.external_id }}"
}
```

Save. Optionally delete the accidentally-created WorkOS-sub-shaped user row:

```bash
# Optional cleanup
docker exec daytona-postgres psql -U user -d application_ctx \
  -c 'DELETE FROM "user" WHERE id LIKE '"'"'user_01%'"'"';'
```

### Pass Criteria

- [ ] New WorkOS token has NO `daytona_user_id` claim
- [ ] `GET /api/users/me` returns HTTP 200
- [ ] Response `id` starts with `user_01` (WorkOS's own sub, not the Daytona user ID)
- [ ] A new row with that `user_01...` ID exists in the `"user"` table
- [ ] JWT template restored to include `daytona_user_id: "{{ user.external_id }}"` before leaving

---

## Overall PoC Pass Criteria

The PoC is complete when ALL of the following are true:

- [ ] S2 passed — Auth0 regression baseline is clean
- [ ] S1 passed — WorkOS happy path with identity preservation confirmed
- [ ] S3 passed — fallback behavior documented and understood
- [ ] No error logs in the API terminal during any scenario
- [ ] JWT template is restored to its correct state after S3
- [ ] `git status` on `poc/workos` shows only the intended PoC changes (no accidental modifications to unrelated files)

---

## Cleanup After QA

Kill the running processes:

```bash
# Ctrl+C in the terminal running npx nx serve api
# Ctrl+C in the terminal running npx nx serve dashboard
```

The seeded test user row can stay in place for future PoC runs. To remove it:

```sql
-- Connect first:
-- docker exec -it daytona-postgres psql -U user -d application_ctx

DELETE FROM "user" WHERE id = 'auth0|test-poc-user';
DELETE FROM "user" WHERE id LIKE 'user_01%';
```

To restore the Auth0 provider for normal development:

```bash
# In apps/api/.env:
AUTH_PROVIDER=auth0

# Then restart the API
npx nx serve api
```

The `WORKOS_OIDC_*` vars can stay in the `.env` file — they're ignored when `AUTH_PROVIDER=auth0`.
