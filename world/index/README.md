# TIU World Index

`world-index.local.json` is generated from the local Obsidian Vault and is ignored by Git.

Run:

```bash
npm run world:index
```

Optional:

```bash
npm run world:index -- --vault "K:\업무\4. 개인업무\만든거 html 등\TIU\1. 세계관"
```

The AI-GM does not load the whole Vault during chat. It scores the current route, latest player choice, memo, and summary memory against this compact index, then injects only a few relevant snippets into the prompt.

Private files are excluded by default. Use `-- --include-private` only for local testing when you understand that the generated local index may contain sensitive canon. Disclosure rules still prevent automatic reveal during play.
