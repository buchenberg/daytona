# WorkOS AuthKit PoC — Local Dev Setup Guide

> **Branch:** `poc/workos` | **Wave:** 4.2 | **Scope:** local development only

This guide gets you from zero to a working WorkOS AuthKit login flow on your laptop. It covers the one-time WorkOS dashboard configuration, local env vars, database seeding, and how to flip back to Auth0 when you're done.

For the full migration plan (org mirror, user import, Admin Portal, production cutover), see the north-star document at [`.omo/plans/workos-migration.md`](.omo/plans/workos-migration.md).

---

## 1. Overview

### What the PoC proves

- WorkOS AuthKit Standalone Connect can replace Auth0 as the OIDC provider via a single feature flag (`AUTH_PROVIDER=workos`).
- Existing Daytona users are preserved: the WorkOS JWT template injects `daytona_user_id` into access tokens, so `jwt.strategy.ts` maps WorkOS-issued tokens to existing rows in the `"user"` table without touching the database schema.
- The Auth0 path remains fully intact and is restored by flipping the flag back.

### What the PoC does NOT do

- No user import from Auth0.
- No org mirror (WorkOS orgs are ignored; Daytona's org tables stay canonical).
- No Admin Portal integration (customers can't self-serve SSO connections yet).
- No production deployment (Helm charts are unchanged on this branch).
- No Auth0 sunset steps.

See the master plan Phases 3-6 for how to extend beyond this PoC.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| WorkOS account | Must have **Standalone AuthKit Connect** enabled on the plan. Verify with WorkOS sales before starting if unsure (see master plan assumption A2). |
| Node.js 22 + Yarn 4 | Provided via `nix develop .#node`. See [`AGENTS.md`](../AGENTS.md) for Nix setup. Alternatively, use a local `yarn`/`npx` toolchain if Nix is unavailable. |
| Nix (optional) | Recommended for reproducible builds. Install guide: https://nixos.org/download/ — enable flakes with `experimental-features = nix-command flakes`. |
| PostgreSQL + Redis | Start via Docker Compose: `docker compose -f .devcontainer/docker-compose.yaml up -d postgres redis` |
| A seeded Daytona user | At least one row in the local `"user"` table whose `id` matches the `external_id` you'll set on the WorkOS test user. See [Section 5](#5-seeding-a-daytona-user-that-matches-the-workos-test-user). |

---

## 3. WorkOS Dashboard Configuration (one-time setup)

### Step 1 — Enable Standalone Connect

In the WorkOS Dashboard, navigate to **Authentication** and confirm that **Standalone AuthKit Connect** is active on your account. If the option isn't visible, contact WorkOS support before proceeding.

### Step 2 — Configure the AuthKit domain

Set the AuthKit custom domain to:

```
auth.localtest.me
```

`localtest.me` is a public DNS service that resolves all subdomains to `127.0.0.1`. No `/etc/hosts` edits, no DNS provisioning, no CNAME records needed for local dev. Your browser and the API both reach `auth.localtest.me` on loopback automatically.

> **Note:** Some corporate VPNs intercept or block `localtest.me` resolution. If `curl http://auth.localtest.me` returns nothing, see [Section 11 — Troubleshooting](#11-troubleshooting).

### Step 3 — Create an OAuth application

In **Applications**, create a new application. Copy the `client_id` — you'll need it in the next section.

### Step 4 — Configure the JWT template

Navigate to **Authentication → Features → JWT Template** and set the template body to:

```json
{
  "daytona_user_id": "{{ user.external_id }}"
}
```

This is the critical piece. Every WorkOS-issued access token will carry the Daytona user ID as a custom claim. `jwt.strategy.ts` reads this claim to look up the existing user row, so no schema changes are needed.

### Step 5 — Create a test user

In **Users**, create a new user with:

| Field | Value |
|---|---|
| `email` | `test-poc-user@example.com` (or any dev email you control) |
| `external_id` | `auth0|test-poc-user` (must match an existing `id` in Daytona's `"user"` table) |
| Password | Set an initial password so you can log in via the AuthKit hosted UI |

The `external_id` is what flows into the JWT as `daytona_user_id`. It must match exactly.

---

## 4. Local Environment Configuration

Copy `apps/api/.env.example` to `apps/api/.env` (or update your existing `.env`) and set the following variables:

```bash
# Flip the provider
AUTH_PROVIDER=workos

# WorkOS AuthKit OIDC — get these from WorkOS Dashboard -> Applications -> your app
WORKOS_OIDC_ISSUER=https://auth.localtest.me
WORKOS_OIDC_CLIENT_ID=client_REPLACE_ME
# AUDIENCE typically equals CLIENT_ID for AuthKit
WORKOS_OIDC_AUDIENCE=client_REPLACE_ME
```

Leave all other variables as-is. The `OIDC_*` variables (Auth0 path) are ignored when `AUTH_PROVIDER=workos`.

### Backoffice API (optional)

If you're also testing the backoffice OIDC flow, update `apps/backoffice-api/.env` with:

```bash
AUTH_PROVIDER=workos

WORKOS_OIDC_ISSUER=https://auth.localtest.me
WORKOS_OIDC_CLIENT_ID=client_REPLACE_ME
WORKOS_OIDC_AUDIENCE=client_REPLACE_ME
WORKOS_OIDC_CLIENT_SECRET=REPLACE_ME
WORKOS_OIDC_REDIRECT_URI=http://localhost:8080/api/v1/auth/callback
WORKOS_OIDC_CALLBACK_URL=http://localhost:8080/api/v1/auth/callback
```

No secrets belong in this document. Use placeholders and fill in real values from the WorkOS dashboard locally.

---

## 5. Seeding a Daytona User That Matches the WorkOS Test User

The WorkOS test user's `external_id` must match an existing `id` in Daytona's `"user"` table. If you're starting from a fresh local database, seed the row manually.

Connect to your local Postgres:

```bash
docker exec -it daytona-postgres psql -U user -d application_ctx
```

Check your schema first:

```sql
\d "user"
```

Verify whether the matching row already exists:

```sql
SELECT id, name, email FROM "user" WHERE id = 'auth0|test-poc-user';
```

If no rows come back, insert one:

```sql
INSERT INTO "user" (id, name, email)
VALUES ('auth0|test-poc-user', 'PoC Test User', 'test-poc-user@example.com');
```

Adjust the column list to match your actual schema — `\d "user"` shows the real columns. The `id` value must match the `external_id` you set on the WorkOS user in Step 5 of Section 3.

---

## 6. Running the PoC Locally

Open three terminals (or two if you're skipping the backoffice).

**Terminal 1 — API:**

```bash
nix develop .#node --command bash -c "npx nx serve api"
```

Fallback if Nix is unavailable:

```bash
npx nx serve api
```

**Terminal 2 — Dashboard:**

```bash
nix develop .#node --command bash -c "npx nx serve dashboard"
```

**Terminal 3 — Backoffice API (optional):**

```bash
nix develop .#node --command bash -c "npx nx serve backoffice-api"
```

Once the API is up, verify the provider is active:

```bash
curl -s http://localhost:3000/api/config | jq '{authProvider, workosOidc, oidc}'
```

Expected output:

```json
{
  "authProvider": "workos",
  "workosOidc": {
    "clientId": "client_...",
    "issuer": "https://auth.localtest.me"
  },
  "oidc": { ... }
}
```

If `authProvider` is still `"auth0"`, the API didn't pick up the env change. Restart it.

---

## 7. Log In via the Dashboard

1. Open `http://localhost:3000/dashboard` (or whichever port the dashboard binds to — check the `serve` output).
2. Click **Login**. You should be redirected to `https://auth.localtest.me` — the WorkOS AuthKit hosted UI.
3. Enter the test user credentials you set in Section 3, Step 5.
4. After successful authentication, WorkOS redirects back to the dashboard. You should be logged in as `auth0|test-poc-user`.

If the redirect lands on an error page, check the JWT claim first (see Section 11).

---

## 8. Rollback / Provider Switching

Switching back to Auth0 takes two steps:

1. In `apps/api/.env`, set:

   ```bash
   AUTH_PROVIDER=auth0
   ```

2. Restart the API process.

The Auth0 flow is active again immediately. No database changes, no WorkOS dashboard changes needed. The `WORKOS_OIDC_*` vars can stay in the file — they're ignored when `AUTH_PROVIDER=auth0`.

---

## 9. Verification

The manual QA checklist for this PoC lives in `docs/poc-workos-manual-qa.md` (written in Wave 4.3). It defines three pass/fail scenarios:

- **S1** — Happy path: WorkOS login succeeds, user is recognized, dashboard loads.
- **S2** — Unknown user: WorkOS login succeeds but `daytona_user_id` doesn't match any row; API returns 401.
- **S3** — Provider rollback: `AUTH_PROVIDER=auth0` restores the Auth0 flow with no regressions.

Run all three before marking the PoC complete.

---

## 10. Known Limitations (PoC Scope)

| Limitation | Reason |
|---|---|
| No user import from Auth0 | Out of scope for PoC. You must manually create test users in WorkOS with matching `external_id`. |
| No org mirror | WorkOS orgs are ignored. Daytona's org tables remain the source of truth. |
| No Admin Portal integration | SSO connections can't be self-served by customers on this branch. |
| No production deploy target | Helm charts are unchanged. This branch is local-only. |
| No Auth0 sunset steps | Decommissioning Auth0 is a Phase 6 activity in the master plan. |

For the path beyond these limitations, see the master plan at `.omo/plans/workos-migration.md`, Phases 3-6.

---

## 11. Troubleshooting

**`curl http://auth.localtest.me` returns nothing or connection refused**

`localtest.me` subdomains should resolve to `127.0.0.1` automatically via public DNS. If they don't, your network (often a corporate VPN) is intercepting the lookup. Workaround: add `127.0.0.1 auth.localtest.me` to `/etc/hosts` for the duration of local testing.

**JWT validation fails / 401 on every request**

Decode the WorkOS access token at [jwt.io](https://jwt.io) and check for the `daytona_user_id` claim. If it's missing, the JWT template in the WorkOS dashboard (Section 3, Step 4) wasn't saved correctly. Re-apply it and log in again to get a fresh token.

**"User not found" error after successful login**

The `daytona_user_id` claim value doesn't match any `id` in the `"user"` table. Run the seed query from Section 5, using the exact claim value from the decoded token as the `id`.

**API still shows `authProvider: "auth0"` after env change**

The API process cached the old config. Kill it and restart with `npx nx serve api`. If using `nix develop`, make sure you're in the same shell where the env was set.

**`npx nx serve api` fails with missing dependencies**

Run `yarn install` first inside the Nix node shell:

```bash
nix develop .#node --command bash -c "yarn install && npx nx serve api"
```
