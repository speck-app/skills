import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const script = new URL("../skills/speck-publish/scripts/publish.mjs", import.meta.url).pathname;
// A real OS temp dir, not test/tmp/: layout.test.mjs walks the whole repo tree concurrently, and
// shoot.test.mjs's own test.before() does rmSync(recursive) on test/tmp/ itself (its tmp *is*
// that directory, one level up from ours) -- either one can delete a path out from under the
// other's walk mid-run (ENOENT). mkdtempSync gives every run a directory nothing else on the
// filesystem has a claim on, and nothing here ever deletes a path once created, only adds to it.
const tmp = mkdtempSync(join(tmpdir(), "speck-publish-test-")) + "/";

// A Speck that answers the way the API does, and remembers every request. /lookups takes no
// token; app.files reflects only what's actually been PUT so far, not a fixed fixture.
function stub(behaviour = {}) {
  const seen = [];
  const uploaded = new Set();
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers["content-type"], body });
    const send = (status, json, extra = {}) => { res.writeHead(status, { "content-type": "application/json", ...extra }); res.end(JSON.stringify(json)); };
    const files = () => ({ prototype: uploaded.has("prototype"), prompt: uploaded.has("prompt"), screenshot: uploaded.has("screenshot") });
    const app = () => ({ publicId: "abcd2345", status: behaviour.published ? "published" : "draft", url: "https://speck.test/a/abcd2345", editUrl: "https://speck.test/apps/x/edit", files: files() });
    if (req.url === "/api/v1/lookups") return send(200, { ok: true, categories: [{ slug: "games", label: "Games" }], platforms: [{ slug: "web", label: "Web" }, { slug: "mobile", label: "Mobile" }] });
    if (req.headers.authorization !== "Bearer spk_good") return send(401, { ok: false, error: "Send a token as Authorization: Bearer spk_... (mint one at /settings)." });
    if (req.url === "/api/v1/me") {
      if (behaviour.rateLimited) return send(429, { ok: false, error: "Slow down." }, { "retry-after": "17" });
      return send(200, { ok: true, username: "maria", displayName: "Maria", url: "https://speck.test/@maria" });
    }
    if (req.method === "POST" && req.url === "/api/v1/apps") {
      const b = JSON.parse(body.toString());
      if (b.remixOf && !behaviour.built) return send(409, { ok: false, error: "Build it first.", code: "build-first" });
      if (b.name === "") return send(422, { ok: false, error: "Give it a name.", field: "name" });
      return send(201, { ok: true, app: { ...app(), remixOf: b.remixOf ?? null } });
    }
    if (req.method === "POST" && req.url === "/api/v1/apps/src12345/builds") { behaviour.built = true; return send(201, { ok: true, build: { appUrl: "https://speck.test/a/src12345", postedAt: "now", first: true } }); }
    if (req.method === "PATCH" && req.url === "/api/v1/apps/abcd2345") return send(behaviour.gone ? 404 : 200, behaviour.gone ? { ok: false, error: "No app with that id." } : { ok: true, app: app() });
    if (req.method === "PUT" && req.url.startsWith("/api/v1/apps/abcd2345/files/")) {
      uploaded.add(req.url.split("/").pop());
      return send(200, { ok: true, app: app() });
    }
    send(404, { ok: false, error: "No app with that id." });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

function dotSpeck(dir, entry = {}) {
  mkdirSync(join(dir, ".speck"), { recursive: true });
  writeFileSync(join(dir, ".speck/entry.json"), JSON.stringify({ name: "Tally", blurb: "b", description: "d", categorySlug: "games", platformSlug: "web", tags: ["x"], testedWith: null, ...entry }));
  writeFileSync(join(dir, ".speck/prompt.md"), "Build me a thing.\n");
  writeFileSync(join(dir, ".speck/prototype.html"), "<!doctype html><title>t</title>");
  writeFileSync(join(dir, ".speck/screenshot.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  return dir;
}

// spawnSync runs the child against its own private libuv loop, which never services the stub
// HTTP server sitting on this process's main loop -- the two deadlock. spawn (async) shares the
// main loop, so the server can answer while we await the child.
function run(dir, url, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: dir, env: { ...process.env, SPECK_URL: url, SPECK_TOKEN: "spk_good", HOME: dir, ...env } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

// tmp is already a fresh, empty directory from mkdtempSync above; nothing to clean first.

test("whoami prints the username, and without a token prints the settings URL and exits 2", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "whoami"); mkdirSync(dir, { recursive: true });
  const ok = await run(dir, url, ["whoami"]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /maria/);
  const none = await run(dir, url, ["whoami"], { SPECK_TOKEN: "" });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /settings#tokens/);
  assert.doesNotMatch(none.stderr + none.stdout, /spk_good/);
});

test("reads the token from ~/.config/speck/token when the variable is unset", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "file"); mkdirSync(join(dir, ".config/speck"), { recursive: true });
  writeFileSync(join(dir, ".config/speck/token"), "spk_good\n");
  assert.equal((await run(dir, url, ["whoami"], { SPECK_TOKEN: "" })).status, 0);
});

test("publish creates the app, uploads the three files with the right types, writes app.json, prints the draft URL", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "create"));
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /https:\/\/speck\.test\/a\/abcd2345/);
  const calls = seen.map((s) => `${s.method} ${s.url}`);
  assert.deepEqual(calls, ["GET /api/v1/lookups", "GET /api/v1/me", "POST /api/v1/apps", "PUT /api/v1/apps/abcd2345/files/prototype", "PUT /api/v1/apps/abcd2345/files/prompt", "PUT /api/v1/apps/abcd2345/files/screenshot"]);
  assert.equal(seen[3].type, "text/html; charset=utf-8");
  assert.equal(seen[4].type, "text/markdown; charset=utf-8");
  assert.equal(seen[5].type, "image/png");
  assert.equal(JSON.parse(readFileSync(join(dir, ".speck/app.json"), "utf8")).publicId, "abcd2345");
  assert.deepEqual(Object.keys(JSON.parse(seen[2].body.toString())).sort(), ["blurb", "categorySlug", "description", "name", "platformSlug", "tags", "testedWith"]);
});

test("a second run patches instead of creating", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "again"));
  writeFileSync(join(dir, ".speck/app.json"), JSON.stringify({ publicId: "abcd2345", url: "https://speck.test/a/abcd2345" }));
  assert.equal((await run(dir, url, ["publish"])).status, 0);
  assert.equal(seen[2].method, "PATCH");
  assert.equal(seen[2].url, "/api/v1/apps/abcd2345");
});

test("a stale app.json is reported, not looped, and --new starts over", async (t) => {
  const b = { gone: true };
  const { server, seen, url } = await stub(b); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "stale"));
  writeFileSync(join(dir, ".speck/app.json"), JSON.stringify({ publicId: "abcd2345", url: "x" }));
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no longer on Speck.*--new/s);
  assert.equal(seen.filter((s) => s.method === "PUT").length, 0);
  assert.equal((await run(dir, url, ["publish", "--new"])).status, 0);
  assert.ok(seen.some((s) => s.method === "POST" && s.url === "/api/v1/apps"));
});

test("a bad slug is refused against lookups before anything is sent, naming the valid ones", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "slug"), { categorySlug: "money" });
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /categorySlug.*games/s);
  assert.equal(seen.filter((s) => s.method !== "GET").length, 0);
});

test("a 422 names the field and uploads nothing", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "422"), { name: "" });
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /name: Give it a name\./);
  assert.equal(seen.filter((s) => s.method === "PUT").length, 0);
  assert.ok(!existsSync(join(dir, ".speck/app.json")));
});

test("--remix-of posts the build on build-first and retries once", async (t) => {
  const { server, seen, url } = await stub({}); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "remix"));
  const r = await run(dir, url, ["publish", "--remix-of", "src12345", "--tool", "Codex", "--note", "worked"]);
  assert.equal(r.status, 0, r.stderr);
  const calls = seen.map((s) => `${s.method} ${s.url}`);
  assert.deepEqual(calls.slice(2, 5), ["POST /api/v1/apps", "POST /api/v1/apps/src12345/builds", "POST /api/v1/apps"]);
  assert.deepEqual(JSON.parse(seen[3].body.toString()), { tool: "Codex", note: "worked" });
  assert.equal(JSON.parse(seen[4].body.toString()).remixOf, "src12345");
});

test("--remix-of without --tool is a usage error before any request", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "remix-notool"));
  assert.equal((await run(dir, url, ["publish", "--remix-of", "src12345"])).status, 2);
  assert.equal(seen.length, 0);
});

test("build posts on its own", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "build"); mkdirSync(dir, { recursive: true });
  const r = await run(dir, url, ["build", "src12345", "--tool", "Cursor"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(seen[0].url, "/api/v1/apps/src12345/builds");
  assert.match(r.stdout, /src12345/);
});

test("never prints the token, even on a 401", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "401"); mkdirSync(dir, { recursive: true });
  const r = await run(dir, url, ["whoami"], { SPECK_TOKEN: "spk_wrongwrongwrong" });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /spk_wrong/);
});

test("a token Speck turns down is a setup error naming where it came from and the settings URL", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "401-source"); mkdirSync(join(dir, ".config/speck"), { recursive: true });
  const env = await run(dir, url, ["whoami"], { SPECK_TOKEN: "spk_revoked" });
  assert.equal(env.status, 2);
  assert.match(env.stderr, /did not accept the token in SPECK_TOKEN/);
  assert.match(env.stderr, new RegExp(`${url}/settings#tokens`.replace(/[.]/g, "\\.")));
  writeFileSync(join(dir, ".config/speck/token"), "spk_revoked\n");
  const file = await run(dir, url, ["whoami"], { SPECK_TOKEN: "" });
  assert.equal(file.status, 2);
  assert.match(file.stderr, /did not accept the token in .*\.config\/speck\/token/);
  assert.doesNotMatch(env.stderr + file.stderr, /spk_revoked/);
});

test("a token holding a line break is refused, not sent, and never printed", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "token-newline"); mkdirSync(dir, { recursive: true });
  const r = await run(dir, url, ["whoami"], { SPECK_TOKEN: "spk_aaaaaaaa\nspk_bbbbbbbb" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /SPECK_TOKEN/);
  assert.doesNotMatch(r.stdout + r.stderr, /spk_aaaaaaaa/);
  assert.doesNotMatch(r.stdout + r.stderr, /spk_bbbbbbbb/);
});

test("a network failure names the OS reason, not a wrapped message, and never the token", async (t) => {
  // Grab a free port, then close it before the run so nothing is listening there.
  const probe = createServer();
  const closedUrl = await new Promise((resolve) => probe.listen(0, "127.0.0.1", () => {
    const p = probe.address().port;
    probe.close(() => resolve(`http://127.0.0.1:${p}`));
  }));
  const dir = join(tmp, "econnrefused"); mkdirSync(dir, { recursive: true });
  const r = await run(dir, closedUrl, ["whoami"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ECONNREFUSED/);
  assert.doesNotMatch(r.stdout + r.stderr, /spk_good/);
});

test("a 429 carries the retry-after suffix", async (t) => {
  const { server, url } = await stub({ rateLimited: true }); t.after(() => server.close());
  const dir = join(tmp, "429"); mkdirSync(dir, { recursive: true });
  const r = await run(dir, url, ["whoami"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Retry after 17 seconds\./);
});

test("lookups needs no token at all", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "lookups-no-token"); mkdirSync(dir, { recursive: true });
  const r = await run(dir, url, ["lookups"], { SPECK_TOKEN: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /games/);
});

test("--remix-of with no value falls into the usage path instead of swallowing --tool", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "remix-swallow"));
  const r = await run(dir, url, ["publish", "--remix-of", "--tool", "Codex"]);
  assert.equal(r.status, 2);
  assert.equal(seen.length, 0);
});

test("--remix-of on a re-run is reported and ignored, and the update still goes through", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "remix-on-update"));
  writeFileSync(join(dir, ".speck/app.json"), JSON.stringify({ publicId: "abcd2345", url: "https://speck.test/a/abcd2345" }));
  const r = await run(dir, url, ["publish", "--remix-of", "src12345", "--tool", "Codex"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /already names an app.*--remix-of/s);
  assert.equal(seen[2].method, "PATCH");
});

test("a published app gets the live-app message, not the press-Publish one", async (t) => {
  const { server, url } = await stub({ published: true }); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "published"));
  writeFileSync(join(dir, ".speck/app.json"), JSON.stringify({ publicId: "abcd2345", url: "https://speck.test/a/abcd2345" }));
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Live app updated\. Open it to check:/);
  assert.doesNotMatch(r.stdout, /Draft/);
  assert.doesNotMatch(r.stdout, /press Publish/);
});

test("an entry.json holding publicId is refused, naming app.json", async (t) => {
  const { server, url } = await stub(); t.after(() => server.close());
  const dir = dotSpeck(join(tmp, "extra-publicid"), { publicId: "abcd2345" });
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /app\.json/);
});

test("only prompt.md present sends one PUT and names the two files still missing", async (t) => {
  const { server, seen, url } = await stub(); t.after(() => server.close());
  const dir = join(tmp, "partial"); mkdirSync(join(dir, ".speck"), { recursive: true });
  writeFileSync(join(dir, ".speck/entry.json"), JSON.stringify({ name: "Tally", blurb: "b", description: "d", categorySlug: "games", platformSlug: "web", tags: ["x"], testedWith: null }));
  writeFileSync(join(dir, ".speck/prompt.md"), "Build me a thing.\n");
  const r = await run(dir, url, ["publish"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(seen.filter((s) => s.method === "PUT").length, 1);
  assert.equal(seen.filter((s) => s.method === "PUT")[0].url, "/api/v1/apps/abcd2345/files/prompt");
  assert.match(r.stdout, /still missing on Speck: prototype\.html, screenshot\.png/);
});
