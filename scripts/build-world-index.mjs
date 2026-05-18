import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT = path.join("world", "index", "world-index.local.json");
const DEFAULT_VAULT_CANDIDATES = [
  "K:\\업무\\4. 개인업무\\만든거 html 등\\TIU\\1. 세계관",
];

const EXCLUDED_DIRS = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".vscode",
  "node_modules",
  "world/session",
]);

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "about",
  "또는",
  "그리고",
  "하지만",
  "대한",
  "관련",
  "정리",
  "설정",
  "문서",
  "세계관",
  "플레이",
]);

function readEnvFile(file) {
  return fs.readFile(file, "utf8")
    .then((raw) => {
      const env = {};
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index < 0) continue;
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[trimmed.slice(0, index).trim()] = value;
      }
      return env;
    })
    .catch(() => ({}));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--vault") args.vault = argv[++i];
    else if (value === "--output") args.output = argv[++i];
    else if (value === "--include-private") args.includePrivate = true;
  }
  return args;
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveVault(args) {
  const env = { ...(await readEnvFile(".env.local")), ...process.env };
  const candidates = [
    args.vault,
    env.TIU_OBSIDIAN_VAULT_DIR,
    ...DEFAULT_VAULT_CANDIDATES,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (await exists(resolved)) return resolved;
  }

  throw new Error("Obsidian Vault folder not found. Set TIU_OBSIDIAN_VAULT_DIR or pass --vault <path>.");
}

function isExcludedPath(fullPath) {
  const normalized = fullPath.replace(/\\/g, "/").toLowerCase();
  return Array.from(EXCLUDED_DIRS).some((part) => normalized.includes(`/${part.toLowerCase()}/`));
}

async function listMarkdownFiles(root) {
  const files = [];

  async function walk(dir) {
    if (isExcludedPath(dir)) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== ".md") continue;
      if (isExcludedPath(fullPath)) continue;
      files.push(fullPath);
    }
  }

  await walk(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function extractFrontmatter(raw) {
  const text = stripBom(raw);
  if (!text.startsWith("---")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: text };

  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4).trimStart();
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    data[key] = value;
  }
  return { data, body };
}

function cleanMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\[\[([^|\]]+)\|([^\]]+)]]/g, "$2")
    .replace(/\[\[([^\]]+)]]/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectListValue(value) {
  if (!value) return [];
  return value
    .replace(/^\[/, "")
    .replace(/]$/, "")
    .split(/[,;]/)
    .map((item) => item.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

function extractTags(data, body) {
  const tags = [
    ...collectListValue(data.tags),
    ...collectListValue(data.tag),
    ...collectListValue(data.aliases),
    ...collectListValue(data.alias),
  ];
  for (const match of body.matchAll(/(^|\s)#([A-Za-z0-9가-힣_-]+)/g)) {
    tags.push(match[2]);
  }
  return Array.from(new Set(tags)).slice(0, 24);
}

function extractHeadings(body) {
  return Array.from(body.matchAll(/^#{1,4}\s+(.+)$/gm))
    .map((match) => cleanMarkdown(match[1]))
    .filter(Boolean)
    .slice(0, 24);
}

function detectTier(relativePath, title, tags) {
  const source = `${relativePath}\n${title}\n${tags.join(" ")}`.toLowerCase();
  if (/private|비공개|기밀|secret|classified|internal only|eyes only/.test(source)) return "private";
  if (/restricted|제한|내부|보안|confidential|archive|records|log|기록|로그/.test(source)) return "restricted";
  return "public";
}

function tokenize(text) {
  return Array.from(text.toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{1,}|[가-힣A-Za-z0-9Ω廓誇]{2,}/g))
    .map((match) => match[0])
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => token.length <= 32);
}

function deriveKeywords(parts) {
  const counts = new Map();
  for (const token of tokenize(parts.join(" "))) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token)
    .slice(0, 32);
}

function splitSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let currentHeading = "";
  let currentLines = [];

  function flush() {
    const text = currentLines.join("\n").trim();
    if (text) sections.push({ heading: currentHeading, text });
    currentLines = [];
  }

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      currentHeading = cleanMarkdown(heading[1]);
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return sections.length > 0 ? sections : [{ heading: "", text: body }];
}

function excerptSection(text, maxLength = 520) {
  const cleaned = cleanMarkdown(text);
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength);
  const sentenceEnd = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf("다."), clipped.lastIndexOf("요."));
  return `${clipped.slice(0, sentenceEnd > 180 ? sentenceEnd + 1 : maxLength).trim()}...`;
}

async function buildEntryChunks(root, file, includePrivate) {
  const raw = await fs.readFile(file, "utf8");
  const { data, body } = extractFrontmatter(raw.slice(0, 180000));
  const relativePath = path.relative(root, file).replace(/\\/g, "/");
  const headings = extractHeadings(body);
  const fileTitle = cleanMarkdown(data.title || headings[0] || path.basename(file, ".md"));
  const tags = extractTags(data, body);
  const tier = detectTier(relativePath, fileTitle, tags);
  if (tier === "private" && !includePrivate) return [];

  const sections = splitSections(body)
    .map((section) => ({
      heading: section.heading,
      excerpt: excerptSection(section.text),
    }))
    .filter((section) => section.excerpt.length >= 80)
    .slice(0, 6);

  const selected = sections.length > 0
    ? sections
    : [{ heading: headings[0] || "", excerpt: excerptSection(body) }];

  return selected.map((section, index) => {
    const title = section.heading && section.heading !== fileTitle ? `${fileTitle} / ${section.heading}` : fileTitle;
    const keywordParts = [relativePath, title, tags.join(" "), headings.join(" "), section.excerpt];
    return {
      id: `${relativePath}#${index + 1}`,
      source: relativePath,
      title,
      heading: section.heading,
      tier,
      tags,
      keywords: deriveKeywords(keywordParts),
      excerpt: section.excerpt,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vaultDir = await resolveVault(args);
  const output = path.resolve(args.output || DEFAULT_OUTPUT);
  const files = await listMarkdownFiles(vaultDir);

  const entries = [];
  for (const file of files) {
    entries.push(...await buildEntryChunks(vaultDir, file, Boolean(args.includePrivate)));
  }

  await fs.mkdir(path.dirname(output), { recursive: true });
  const payload = {
    format: "tiu-world-index-v1",
    generatedAt: new Date().toISOString(),
    sourceRootName: path.basename(vaultDir),
    sourceFileCount: files.length,
    entryCount: entries.length,
    includePrivate: Boolean(args.includePrivate),
    entries,
  };
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    vaultDir,
    output,
    sourceFileCount: files.length,
    entryCount: entries.length,
    includePrivate: Boolean(args.includePrivate),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
