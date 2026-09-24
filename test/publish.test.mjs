import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const script = new URL("../skills/speck-publish/scripts/publish.mjs", import.meta.url).pathname;
const tmp = new URL("./tmp/publish/", import.meta.url).pathname;

// A Speck that answers the way the API does, and remembers every request.
function stub(behaviour = {}) {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers["content-type"], body });
    const send = (status, json) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
    const app = { publicId: "abcd2345", status: "draft", url: "https://speck.test/a/abcd2345", editUrl: "https://speck.test/apps/x/edit", files: { prototype: true, prompt: true, screenshot: true } };
    if (req.headers.authorization !== "Bearer spk_good") return send(401, { ok: false, error: "Send a token as Authorization: Bearer spk_... (mint one at /settings)." });
    if (req.url === "/api/v1/lookups") return send(200, { ok: true, categories: [{ slug: "games", label: "Games" }], platforms: [{ slug: "web", label: "Web" }, { slug: "mobile", label: "Mobile" }] });
    if (req.url === "/api/v1/me") return send(200, { ok: true, username: "maria", displayName: "Maria", url: "https://speck.test/@maria" });
    if (req.method === "POST" && req.url === "/api/v1/apps") {
      const b = JSON.parse(body.toString());
      if (b.remixOf && !behaviour.built) return send(409, { ok: false, error: "Build it first.", code: "build-first" });
      if (b.name === "") return send(422, { ok: false, error: "Give it a name.", field: "name" });
      return send(201, { ok: true, app: { ...app, remixOf: b.remixOf ?? null } });
    }
    if (req.method === "POST" && req.url === "/api/v1/apps/src12345/builds") { behaviour.built = true; return send(201, { ok: true, build: { appUrl: "https://speck.test/a/src12345", postedAt: "now", first: true } }); }
    if (req.method === "PATCH" && req.url === "/api/v1/apps/abcd2345") return send(behaviour.gone ? 404 : 200, behaviour.gone ? { ok: false, error: "No app with that id." } : { ok: true, app });
    if (req.method === "PUT" && req.url.startsWith("/api/v1/apps/abcd2345/files/")) return send(200, { ok: true, app });
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

test.before(() => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true }); });

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
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, /spk_wrong/);
});
