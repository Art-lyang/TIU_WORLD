import fs from "node:fs/promises";
import path from "node:path";

const INDEX_CANDIDATES = [
  path.join("world", "index", "world-index.local.json"),
  path.join("world", "index", "world-index.json"),
];

function stripJsonBom(raw) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function countTiers(entries) {
  return entries.reduce(
    (acc, entry) => {
      if (entry?.tier === "restricted") acc.restricted += 1;
      else if (entry?.tier === "private") acc.private += 1;
      else acc.public += 1;
      return acc;
    },
    { public: 0, restricted: 0, private: 0 },
  );
}

async function readStatus() {
  for (const candidate of INDEX_CANDIDATES) {
    const filePath = path.resolve(candidate);
    try {
      const [stat, raw] = await Promise.all([
        fs.stat(filePath),
        fs.readFile(filePath, "utf8"),
      ]);
      const parsed = JSON.parse(stripJsonBom(raw));
      if (parsed?.format !== "tiu-world-index-v1" || !Array.isArray(parsed.entries)) continue;

      return {
        loaded: true,
        source: candidate.endsWith(".local.json") ? "local" : "public",
        filePath,
        generatedAt: parsed.generatedAt ?? null,
        sourceRootName: parsed.sourceRootName ?? null,
        sourceFileCount: parsed.sourceFileCount ?? 0,
        entryCount: parsed.entryCount ?? parsed.entries.length,
        includePrivate: Boolean(parsed.includePrivate),
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        tiers: countTiers(parsed.entries),
      };
    } catch {
      continue;
    }
  }

  return {
    loaded: false,
    source: null,
    filePath: null,
    generatedAt: null,
    sourceRootName: null,
    sourceFileCount: 0,
    entryCount: 0,
    includePrivate: false,
    sizeBytes: 0,
    mtime: null,
    tiers: { public: 0, restricted: 0, private: 0 },
  };
}

function printHuman(status) {
  if (!status.loaded) {
    console.log("World index: missing");
    console.log("Run `npm run world:index` after updating local TIU Markdown files.");
    return;
  }

  console.log("World index: ready");
  console.log(`- source: ${status.source}`);
  console.log(`- file: ${status.filePath}`);
  console.log(`- generated: ${status.generatedAt ?? "unknown"}`);
  console.log(`- updated on disk: ${status.mtime ?? "unknown"}`);
  console.log(`- source root: ${status.sourceRootName ?? "unknown"}`);
  console.log(`- source MD files: ${status.sourceFileCount}`);
  console.log(`- snippets: ${status.entryCount}`);
  console.log(`- tiers: public ${status.tiers.public} / restricted ${status.tiers.restricted} / private ${status.tiers.private}`);
  console.log(`- private included: ${status.includePrivate ? "yes" : "no"}`);
}

const status = await readStatus();
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(status, null, 2));
} else {
  printHuman(status);
}
