# TIU World Game

Text-based AI world exploration game for the Turtle Isle Universe.

## Local Development

```bash
npm install
npm run dev -- -p 3001
```

Open `http://localhost:3001`.

Quick local QA after the dev server is running:

```bash
npm run qa:smoke
```

This checks the private gate/auth flow, admin diagnostics, scene-image API, cloud-storage readiness status, and one local starter-route response without making a paid OpenAI/Claude call.

Story continuity regression fixtures:

```bash
npm run qa:regression
```

This checks local route/custom openings for drift, sensitive lore overexposure, overly long entry text, missing briefing data, and accidental paid model calls.

Full local verification on Windows:

```bash
npm run qa:local
```

This runs lint/build, restarts the local dev server, then runs the smoke and story-regression tests. Use this instead of running `next build` against an already-running `next dev` server, because the dev server can hold stale `.next` chunks after a build.

## Environment Variables

Create `.env.local` for local play. Do not commit `.env.local`.

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
OPENAI_FAST_MODEL=
OPENAI_DEEP_MODEL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
TIU_OBSIDIAN_VAULT_DIR=
TIU_ACCESS_PASSWORD=
TIU_ACCESS_SECRET=
TIU_ADMIN_ID=admin
TIU_ADMIN_PASSWORD=KSH2202@TIU#
TIU_ADMIN_DISPLAY_NAME=관리자
TIU_ACCOUNT_SECRET=
TIU_CLOUD_STORAGE_PROVIDER=disabled
TIU_CLOUD_STORAGE_URL=
TIU_CLOUD_STORAGE_TOKEN=
TIU_CLOUD_SYNC_TIMEOUT_MS=2500
```

For Vercel, add the same values in Project Settings -> Environment Variables.

`TIU_ACCESS_PASSWORD` is the simple tester password. `TIU_ACCESS_SECRET` is a private cookie-signing secret.

The tester password gate remains the private entry point. After that gate, the app uses a temporary admin login for testing. The default is `admin / KSH2202@TIU#`; override it with `TIU_ADMIN_ID` and `TIU_ADMIN_PASSWORD` before sharing broadly. `TIU_ADMIN_DISPLAY_NAME` is used as the account display name and fills the internal `{user}` placeholder when a player does not set a character name.

`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are optional. Leave them blank while Claude billing/API access is unresolved. When both values are set, the in-game model menu can route a session through Claude without changing code.

`TIU_OBSIDIAN_VAULT_DIR` is optional for local world-index generation. It should point to the Obsidian Vault folder that contains the TIU Markdown files.

Admin users can open `Menu -> Ops Check` / `운영 체크` to verify deployment readiness without exposing secrets. It shows OpenAI/Claude configuration status, usage guard limits, local/server save mirrors, loaded scene-image counts, and tester feedback counts.

Cloud storage is prepared but disabled by default. When a cloud target is available, create a small HTTPS bridge that accepts:

```json
{
  "source": "tiu-worldgame",
  "schemaVersion": 1,
  "records": [
    { "key": "session/state", "value": {}, "updatedAt": "ISO_DATE" }
  ]
}
```

Then set `TIU_CLOUD_STORAGE_PROVIDER=http`, `TIU_CLOUD_STORAGE_URL`, and optionally `TIU_CLOUD_STORAGE_TOKEN`. Until then, keep the provider disabled; browser saves and local mirrors continue to work normally.

Optional usage guard values can be added when testing with several people:

```env
TIU_DAILY_CALL_LIMIT=120
TIU_DAILY_TOKEN_LIMIT=900000
TIU_MAX_OUTPUT_TOKENS=4000
TIU_MIN_SECONDS_BETWEEN_CALLS=0
TIU_MAX_CONTEXT_MESSAGES=18
```

## Obsidian World Index

For faster and more accurate world recognition, build a compact local index from the Obsidian Vault:

```bash
npm run world:index
```

Check what the game is currently using:

```bash
npm run world:status
```

The script reads `TIU_OBSIDIAN_VAULT_DIR` from `.env.local`. You can also pass the path directly:

```bash
npm run world:index -- --vault "K:\업무\4. 개인업무\만든거 html 등\TIU\1. 세계관"
```

This creates `world/index/world-index.local.json`. The file is ignored by Git because it may contain private worldbuilding material. During chat, the AI-GM loads only a few relevant snippets from this compact index, not the whole Vault, so response speed stays stable.

Private files are excluded by default. For local-only testing, `npm run world:index -- --include-private` can include them, but disclosure rules still control whether those facts can appear in player-facing output.

Admin users can also check `Menu -> Ops Check -> World Index` in the app. It shows whether a local or deployed index is loaded, when it was generated, how many Markdown files were indexed, and how many public/restricted/private snippets are available.

## Scene Images

User-supplied play-scene images live here:

```text
public/assets/user-scenes
```

The app scans this folder through `/api/assets/scene-images`. File names are used as fallback keywords, and `public/assets/user-scenes/manifest.json` can define stronger Korean/English matching keywords, titles, details, and priorities.

The in-game top menu has a `Scene Images` / `장면 이미지` panel that shows how many user-scene images were loaded.

## Tester Feedback

Players can use `Menu -> Feedback` / `피드백` to report bugs, story continuity issues, UI notes, and speed problems. The report includes a short session snapshot so the issue can be reproduced without requiring the player to explain the whole context.

Feedback is stored in browser localStorage and mirrored locally to:

```text
world/session/tester-feedback/feedback.json
```

Admin users can open the same panel to review recent feedback and mark items as open, reviewed, or resolved. On Vercel, treat this file mirror as best-effort until durable cloud storage is connected.

## Deploy

Import this repository into Vercel as a Next.js project.

Build command:

```bash
npm run build
```

The app uses local browser storage for player-side state. Server-side session files under `world/session` are ignored because Vercel does not provide durable filesystem storage for runtime data.

## Tester Checklist

1. Add `OPENAI_API_KEY`, `OPENAI_MODEL`, `TIU_ACCESS_PASSWORD`, `TIU_ACCESS_SECRET`, `TIU_ADMIN_ID`, `TIU_ADMIN_PASSWORD`, and `TIU_ACCOUNT_SECRET` in Vercel. Add `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` later only after Claude access is fixed.
2. Keep the deployed URL private and share the password only with selected testers.
3. Ask testers to use `Save / Load` export before switching devices or clearing browser data.
4. Check the top menu `Ops Check` and `Usage Guard` panels during tests so deployment status, API calls, and estimated token use stay visible.
5. Put new scene images in `public/assets/user-scenes`, update `manifest.json` when exact story matching matters, then redeploy.
6. Ask testers to leave short notes through `Feedback` when a scene feels disconnected, too slow, or visually broken. Admin can triage those notes from the same menu.
