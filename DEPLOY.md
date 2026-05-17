# Deploy + operations

Audience: the organizer running the event remotely. Set up once, monitor + react during the event, and run the sunset checklist after.

## Mode

The deployment supports two modes selected by env presence:

- **Simple mode (default)**: no Cloudflare Turnstile, no Upstash Redis. Bot protection relies on OAuth real-account requirement + event passcode. Rate limit defers to Vercel platform DDoS + manual kill-switch.
- **Full mode**: provision Cloudflare Turnstile (sections 1.1) and Upstash Redis (section 1.5). Verification and per-token rate limit activate automatically when their env vars are present.

Sections marked **[Optional]** are only needed for Full mode.

## 1. One-time setup

### 1.1 Cloudflare Turnstile [Optional]

1. <https://dash.cloudflare.com/?to=/:account/turnstile> → **Add site**.
2. Site name: `kyro-hackathon-mcp`. Domains: leave broad (`*.vercel.app`) during initial deploy, then tighten to the actual Vercel domain.
3. Widget mode: **Managed**.
4. Copy `Site Key` and `Secret Key`. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Doppler. Leave both unset to disable Turnstile entirely.

### 1.2 Doppler

```bash
doppler projects create kyro-hackathon-mcp
doppler setup --project kyro-hackathon-mcp --config prd
```

Set the secrets (from `kyro-frontend/prd` for the Supabase keys, freshly generated for the rest):

Required env (Simple mode):

```bash
doppler secrets set --project kyro-hackathon-mcp --config prd \
  SUPABASE_URL='<from kyro-frontend/prd>' \
  SUPABASE_SERVICE_ROLE_KEY='<from kyro-frontend/prd>' \
  NEXT_PUBLIC_SUPABASE_URL='<from kyro-frontend/prd>' \
  NEXT_PUBLIC_SUPABASE_ANON_KEY='<from kyro-frontend/prd>' \
  PAT_HASH_PEPPER='<openssl rand -base64 32>' \
  HACKATHON_PAT_EXPIRES_AT='2026-05-19T23:59:00+08:00' \
  EVENT_PASSCODE='<6 chars from organizer>' \
  REGISTRATION_OPEN='true' \
  OAUTH_PROVIDERS='apple,google,kakao,email' \
  CRON_SECRET='<openssl rand -base64 32>' \
  NEXT_PUBLIC_BASE_URL='https://kyro-hackathon-mcp.vercel.app'
```

Optional env for Full mode:

```bash
# Turnstile — leave unset to skip the bot-check gate
NEXT_PUBLIC_TURNSTILE_SITE_KEY='<from Cloudflare>'
TURNSTILE_SECRET_KEY='<from Cloudflare>'

# Upstash — added automatically when you provision via Vercel Marketplace.
# When absent, rate limit is fail-open (no app-level limit enforced).
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
```

### 1.3 GitHub

Unarchive the repo if archived: <https://github.com/Project-KYRO/kyro-hackathon-mcp/settings>.

### 1.4 Vercel

1. **Import repo** → `Project-KYRO/kyro-hackathon-mcp`.
2. **Settings → Functions** → Region: `Singapore (sin1)`.
3. **Doppler-Vercel integration**: Doppler dashboard → Integrations → Vercel → link `kyro-hackathon-mcp/prd` to the Vercel project. Vercel will sync the env vars on every Doppler change.
4. **Settings → Environment Variables**: verify the values from Doppler appear. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` here once Upstash is provisioned (step 1.5).
5. **Deploy**. Confirm the cron in **Settings → Cron Jobs** shows `/api/cron/auto-revoke` running hourly.

### 1.5 Upstash Redis [Optional]

Skip in Simple mode. To enable per-token rate limit (60/min + 5,000/day):

1. Vercel project → **Integrations** → search "Upstash" → **Add Database**.
2. Region: **Singapore**. Plan: Free is fine for a single event.
3. The integration auto-injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` into the Vercel project's env.
4. Redeploy so the new env vars take effect.

### 1.6 Supabase

The DB schema (`mcp_personal_access_tokens` + the `mcp_*` RPCs) lives in the main `kyro_frontend` Supabase project. The hackathon API just reads it. The objects already exist from the previous event — nothing to migrate.

Auth configuration in <https://supabase.com/dashboard/project/zkjpqbhmsvbibygemqfb>:

1. **Authentication → URL Configuration → Redirect URLs**: add `https://kyro-hackathon-mcp.vercel.app/register` (and the preview URL if you're testing on a preview deployment).
2. **Authentication → Providers → Apple**: confirm `Services ID` is filled. If it's empty, web Apple Sign-In won't work. Either set up an Apple Service ID in Apple Developer Portal, or drop Apple from `OAUTH_PROVIDERS`.
3. **Authentication → Providers → Google**: confirm the **Web** client ID is set (not just the iOS/Android ones).
4. **Authentication → Providers → Kakao**: confirm Web platform is enabled in the Kakao Developer console for this site origin.

### 1.7 Generate fresh secrets

```bash
openssl rand -base64 32   # PAT_HASH_PEPPER
openssl rand -base64 32   # CRON_SECRET
LC_ALL=C tr -dc 'A-HJ-NP-Z2-9' < /dev/urandom | head -c 6 ; echo
                          # EVENT_PASSCODE — A-Z minus I/O, 2-9 minus 0/1 to avoid ambiguity
```

## 2. End-to-end smoke test

```bash
doppler run --project kyro-hackathon-mcp --config prd -- pnpm dev
# In another shell, with the same Doppler env:
doppler run --project kyro-hackathon-mcp --config prd -- ./examples/curl-smoke.sh
```

For the live deploy, open `/register` in a browser, complete sign-in with your KYRO account, and confirm a token is issued. Then:

```bash
TOKEN=kyro_pat_xxxxxxxxxxxxxxxx
curl -H "Authorization: Bearer $TOKEN" https://kyro-hackathon-mcp.vercel.app/api/v1/runs?limit=1
```

## 3. Remote operations (during the event)

### 3.1 Monitor

- **Vercel logs**: <https://vercel.com/<team>/kyro-hackathon-mcp/logs>. Search for `[issue-pat]`, `[ratelimit]`, `[cron/auto-revoke]`.
- **Token activity**: query the PROD Supabase from anywhere:

  ```bash
  doppler run --project kyro-frontend --config prd -- bash -c '
    ref=$(echo "$SUPABASE_URL" | sed -E "s|https?://([^.]+)\..*|\1|")
    PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
      -h "aws-1-ap-northeast-2.pooler.supabase.com" -p 5432 \
      -U "postgres.${ref}" -d postgres -c \
      "SELECT count(*) total,
              count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now()) active,
              max(last_used_at) most_recent_use
         FROM public.mcp_personal_access_tokens;"
  '
  ```

### 3.2 Emergency kill switch

```bash
doppler run --project kyro-hackathon-mcp --config prd -- pnpm kill-switch
```

- Revokes every live token immediately (single UPDATE).
- If you also set `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (and optionally `VERCEL_TEAM_ID`), it also flips `REGISTRATION_OPEN=false` so new registrations stop. Vercel reads the new value on the next deployment.

### 3.3 Emergency manual token issue

If a participant can't self-serve (e.g., web Apple OAuth issues), issue from anywhere by user ID or email:

```bash
# Find the user ID by nickname (be specific — many KYRO nicknames collide)
doppler run --project kyro-frontend --config prd -- bash -c '
  ref=$(echo "$SUPABASE_URL" | sed -E "s|https?://([^.]+)\..*|\1|")
  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    -h "aws-1-ap-northeast-2.pooler.supabase.com" -p 5432 \
    -U "postgres.${ref}" -d postgres -c \
    "SELECT u.id, un.nickname FROM public.users u
       JOIN public.user_nickname un ON un.user_id = u.id
      WHERE un.nickname ILIKE '\''%SomeNickname%'\'';"
'

# Issue one token for that user
echo "01KCY451HDY6Q9NQNZSNEQ055H" > /tmp/who.csv
doppler run --project kyro-hackathon-mcp --config prd -- pnpm issue-pat /tmp/who.csv
```

Output goes to `who_tokens.csv`. Send the token over a private channel.

### 3.4 Extend the event window

If you decide to extend tokens past the configured expiry:

```bash
doppler secrets set --project kyro-hackathon-mcp --config prd \
  HACKATHON_PAT_EXPIRES_AT='2026-05-20T23:59:00+08:00'

# Push the new expiry to live tokens
doppler run --project kyro-frontend --config prd -- bash -c '
  ref=$(echo "$SUPABASE_URL" | sed -E "s|https?://([^.]+)\..*|\1|")
  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    -h "aws-1-ap-northeast-2.pooler.supabase.com" -p 5432 \
    -U "postgres.${ref}" -d postgres -c \
    "UPDATE public.mcp_personal_access_tokens
        SET expires_at = '\''2026-05-20T23:59:00+08:00'\''
      WHERE revoked_at IS NULL"
'
```

Redeploy Vercel so the cron picks up the new expiry (otherwise the cron uses the old value cached at build).

## 4. Sunset checklist

1. Confirm the auto-revoke cron has revoked everything: query token table (`active` should be 0).
2. Run `pnpm kill-switch` once for safety.
3. **Vercel**: delete the project (Settings → Delete Project). Or pause it if you plan to reuse soon.
4. **Doppler**: optionally `doppler projects delete kyro-hackathon-mcp`. Keep around if you plan to reuse.
5. **Upstash**: free tier auto-pauses on inactivity; delete from Vercel Integration if you want it gone now.
6. **GitHub**: archive the repo (Settings → Archive this repository) so it's read-only but the source stays accessible.
7. **Cloudflare Turnstile**: delete the site or leave (free tier, no cost).
8. **DB**: the `mcp_personal_access_tokens` table + `mcp_*` RPCs live in `kyro_frontend` migrations. Leave them — they cost nothing and are reused on the next event.

## 5. Security notes

- **PROD DB password rotation**: any time you run `doppler secrets get SUPABASE_DB_PASSWORD --plain` (e.g. piping into psql), the password lands in shell history and any AI tool context attached to that shell. Rotate the password after the event in Supabase Dashboard → Database → Reset password, then update `SUPABASE_DB_PASSWORD` in `kyro-frontend/prd`. Service-role key rotation is a separate (more painful) operation; do it only if you suspect leak.
- **PAT_HASH_PEPPER** ties the hash format. Don't change it during an active event or every live token instantly becomes invalid.
- **`OAUTH_PROVIDERS`** env is comma-separated CSV. The register page only renders buttons for providers listed here, but the server still trusts whichever Supabase session the JWT carries — so this is UI-only, not a security boundary. Don't rely on it to "lock out" a provider; remove it from the Supabase Auth config instead.
