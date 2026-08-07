import fs from "node:fs";

const BASE_URL = process.env.TIU_QA_BASE_URL || "http://localhost:3001";
const FIXTURE_FILE = new URL("./qa-regression-fixtures.json", import.meta.url);

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
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
}

class CookieJar {
  #cookies = new Map();

  async request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) headers.set("cookie", cookieHeader);

    const response = await fetch(new URL(path, BASE_URL), {
      ...options,
      headers,
    });
    this.storeSetCookie(response.headers.get("set-cookie"));
    return response;
  }

  async json(path, options = {}) {
    const response = await this.request(path, options);
    const data = await response.json().catch(() => null);
    return { response, data };
  }

  cookieHeader() {
    return Array.from(this.#cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  storeSetCookie(header) {
    if (!header) return;
    const first = header.split(",").find((part) => part.includes("=")) ?? header;
    const [pair] = first.split(";");
    const index = pair.indexOf("=");
    if (index <= 0) return;
    this.#cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function jsonPost(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function responseText(data) {
  return [
    data?.narrative,
    data?.raw,
    ...(Array.isArray(data?.choices) ? data.choices.map((choice) => choice?.text) : []),
    data?.briefing?.time,
    data?.briefing?.status,
    data?.briefing?.emotion,
    ...(Array.isArray(data?.briefing?.goals) ? data.briefing.goals : []),
    ...(Array.isArray(data?.briefing?.groups) ? data.briefing.groups : []),
    ...(Array.isArray(data?.briefing?.inventory) ? data.briefing.inventory : []),
    ...(Array.isArray(data?.briefing?.logs) ? data.briefing.logs : []),
    ...(Array.isArray(data?.briefing?.people) ? data.briefing.people.flatMap((person) => [person?.name, person?.detail, person?.known]) : []),
    ...(Array.isArray(data?.briefing?.clues) ? data.briefing.clues.flatMap((clue) => [clue?.title, clue?.detail, clue?.source]) : []),
  ]
    .filter((item) => typeof item === "string" && item.length > 0)
    .join("\n");
}

async function authenticate(jar) {
  const env = { ...readEnvFile(".env.local"), ...process.env };
  const access = await jar.json("/api/access");
  assert(access.response.ok, `Access check failed: HTTP ${access.response.status}`);
  if (access.data?.enabled && !access.data?.authenticated) {
    assert(env.TIU_ACCESS_PASSWORD, "TIU_ACCESS_PASSWORD is required because the password gate is enabled.");
    const login = await jar.json("/api/access", jsonPost({ password: env.TIU_ACCESS_PASSWORD }));
    assert(login.response.ok, `Access login failed: HTTP ${login.response.status}`);
  }

  assert(env.TIU_ADMIN_PASSWORD, "TIU_ADMIN_PASSWORD is required. Admin login has no built-in default password.");
  const auth = await jar.json("/api/auth", jsonPost({
    id: env.TIU_ADMIN_ID || "admin",
    password: env.TIU_ADMIN_PASSWORD,
  }));
  assert(auth.response.ok, `Admin login failed: HTTP ${auth.response.status}`);
}

async function runFixture(jar, fixture) {
  const accountName = fixture.accountName || "QA";
  const result = await jar.json("/api/chat", jsonPost({
    messages: [{ role: "user", content: fixture.message }],
    memo: "",
    memory: "",
    difficulty: "traveler",
    modelProfile: "default",
    playerAccount: { displayName: accountName, role: "admin" },
    language: "ko",
    maxOutputTokens: 800,
  }));

  assert(result.response.ok, `[${fixture.id}] HTTP ${result.response.status}: ${JSON.stringify(result.data)}`);
  const data = result.data;
  const text = responseText(data);

  assert(typeof data?.narrative === "string" && data.narrative.trim().length > 80, `[${fixture.id}] narrative is empty or too short.`);
  assert(data.narrative.length <= fixture.maxNarrativeChars, `[${fixture.id}] narrative is too long: ${data.narrative.length}`);
  assert(Array.isArray(data?.choices) && data.choices.length >= fixture.minChoices, `[${fixture.id}] too few choices.`);
  assert(data?.briefing?.time && data?.briefing?.status && data?.briefing?.emotion, `[${fixture.id}] briefing is incomplete.`);
  assert(data?.engine?.caseState?.phase, `[${fixture.id}] game engine case state is missing.`);
  assert(Array.isArray(data?.engine?.clues) && data.engine.clues.length >= 1, `[${fixture.id}] clue registry is missing.`);
  assert(Array.isArray(data?.engine?.npcs) && data.engine.npcs.length >= 1, `[${fixture.id}] NPC state is missing.`);
  assert(Array.isArray(data?.engine?.disclosureGates) && data.engine.disclosureGates.length >= 1, `[${fixture.id}] disclosure gates are missing.`);
  assert(!data?.usage, `[${fixture.id}] local fixture unexpectedly made a paid model call.`);
  assert(data?.allow_freeform === Boolean(fixture.allowFreeform), `[${fixture.id}] freeform input mode drifted.`);

  for (const expected of fixture.includes ?? []) {
    assert(text.includes(expected), `[${fixture.id}] expected text not found: ${expected}`);
  }
  for (const forbidden of fixture.excludes ?? []) {
    assert(!text.includes(forbidden), `[${fixture.id}] forbidden text found: ${forbidden}`);
  }

  return {
    id: fixture.id,
    choices: data.choices.length,
    narrativeChars: data.narrative.length,
    briefingTime: data.briefing.time,
    enginePhase: data.engine.caseState.phase,
  };
}

async function main() {
  const fixtures = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8"));
  const jar = new CookieJar();
  await authenticate(jar);

  const results = [];
  for (const fixture of fixtures) {
    results.push(await runFixture(jar, fixture));
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    fixtures: results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
