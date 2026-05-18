import fs from "node:fs";

const BASE_URL = process.env.TIU_QA_BASE_URL || "http://localhost:3001";

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
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

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.storeSetCookie(setCookie);
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
    const cookie = header.split(",").find((part) => part.includes("=")) ?? header;
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    if (index <= 0) return;
    this.#cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asJsonPost(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function main() {
  const env = { ...readEnvFile(".env.local"), ...process.env };
  const jar = new CookieJar();

  const home = await jar.request("/");
  assert(home.ok, `Home page failed: HTTP ${home.status}`);

  const legal = await jar.request("/legal");
  assert(legal.ok, `Legal page failed: HTTP ${legal.status}`);

  const access = await jar.json("/api/access");
  assert(access.response.ok, `Access check failed: HTTP ${access.response.status}`);
  if (access.data?.enabled && !access.data?.authenticated) {
    assert(env.TIU_ACCESS_PASSWORD, "TIU_ACCESS_PASSWORD is required because the password gate is enabled.");
    const login = await jar.json("/api/access", asJsonPost({ password: env.TIU_ACCESS_PASSWORD }));
    assert(login.response.ok, `Access login failed: HTTP ${login.response.status}`);
  }

  const auth = await jar.json("/api/auth", asJsonPost({ id: env.TIU_ADMIN_ID || "admin", password: env.TIU_ADMIN_PASSWORD || "0000" }));
  assert(auth.response.ok, `Admin login failed: HTTP ${auth.response.status}`);

  const assets = await jar.json("/api/assets/scene-images");
  assert(assets.response.ok, `Scene image API failed: HTTP ${assets.response.status}`);
  assert(typeof assets.data?.count === "number", "Scene image API returned no count.");

  const diagnostics = await jar.json("/api/admin/diagnostics");
  assert(diagnostics.response.ok, `Admin diagnostics failed: HTTP ${diagnostics.response.status}`);
  assert(diagnostics.data?.cloudStorage?.mode, "Admin diagnostics did not include cloudStorage status.");
  assert(!JSON.stringify(diagnostics.data).includes(env.OPENAI_API_KEY || "__no_key__"), "Diagnostics leaked OPENAI_API_KEY.");

  const routeStart = await jar.json("/api/chat", asJsonPost({
    messages: [{ role: "user", content: "1" }],
    language: "ko",
    difficulty: "traveler",
    modelProfile: "default",
    maxOutputTokens: 800,
    playerAccount: { displayName: "QA", role: "admin" },
  }));
  assert(routeStart.response.ok, `Starter route failed: HTTP ${routeStart.response.status}`);
  assert(typeof routeStart.data?.narrative === "string" && routeStart.data.narrative.length > 80, "Starter route returned a short/empty narrative.");
  assert(Array.isArray(routeStart.data?.choices) && routeStart.data.choices.length >= 2, "Starter route returned too few choices.");
  assert(routeStart.data?.briefing?.time && routeStart.data?.briefing?.status, "Starter route did not include briefing status.");
  assert(routeStart.data?.allow_freeform === false, "Starter route should be choice-first and not open freeform input.");

  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    sceneImages: assets.data.count,
    cloudStorage: diagnostics.data.cloudStorage.mode,
    starterChoices: routeStart.data.choices.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
