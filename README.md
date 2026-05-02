# TIU World Game

Text-based AI world exploration game for the Turtle Isle Universe.

## Local Development

```bash
npm install
npm run dev -- -p 3001
```

Open `http://localhost:3001`.

## Environment Variables

Create `.env.local` for local play. Do not commit `.env.local`.

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
OPENAI_FAST_MODEL=
OPENAI_DEEP_MODEL=
TIU_ACCESS_PASSWORD=
TIU_ACCESS_SECRET=
```

For Vercel, add the same values in Project Settings -> Environment Variables.

`TIU_ACCESS_PASSWORD` is the simple tester password. `TIU_ACCESS_SECRET` is a private cookie-signing secret.

## Deploy

Import this repository into Vercel as a Next.js project.

Build command:

```bash
npm run build
```

The app uses local browser storage for player-side state. Server-side session files under `world/session` are ignored because Vercel does not provide durable filesystem storage for runtime data.
