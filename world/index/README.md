# TIU World Index

`world-index.local.json` is generated from the local Obsidian Vault and is ignored by Git.

Run:

```bash
npm run world:index
```

Check the active index:

```bash
npm run world:status
```

Optional:

```bash
npm run world:index -- --vault "K:\업무\4. 개인업무\만든거 html 등\TIU\1. 세계관"
```

The AI-GM does not load the whole Vault during chat. It scores the current route, latest player choice, memo, and summary memory against this compact index, then injects only a few relevant snippets into the prompt.

Private files are excluded by default. Use `-- --include-private` only for local testing when you understand that the generated local index may contain sensitive canon. Disclosure rules still prevent automatic reveal during play.

The admin `Ops Check` panel also shows the index source, generation time, source Markdown count, snippet count, and tier breakdown. This is the quickest way to confirm that newly updated local world files have been converted into gameplay reference data.

## Do not commit a deploy index (decision, 2026-08-08)

`src/lib/worldIndex.ts` will also load `world/index/world-index.json`, which is **not**
gitignored. Do not generate that file and commit it.

This repository is public, and `detectTier()` in `scripts/build-world-index.mjs` is a
path/title keyword heuristic — it does not read `16. CANON-LAYERS/PUBLIC-INDEX.md`. It
marks a file `restricted` only when the path or title contains words like 기록 / 로그 /
보안 / internal, so everything else falls through to `public`. An audit of the current
index found 576 of the 1578 `public` snippets mentioning ORACLE, 관측자, 우주거북, EV-Σ,
마리아나, TS-Ω, 카룬탈 or 소바리, including internal design documents such as
`ACT-STRUCTURE-DESIGN.md` and `ACT3-MISSIONS-DESIGN.md`.

Committing that file would publish internal worldbuilding, and reverting would not remove
it from the history.

The deployed build therefore runs without a world index; only local play gets one. If a
deploy index is ever needed, resolve it first — a PUBLIC-INDEX-driven whitelist, a private
repository, or runtime loading through `TIU_CLOUD_STORAGE_*` — rather than committing the
heuristic output.
