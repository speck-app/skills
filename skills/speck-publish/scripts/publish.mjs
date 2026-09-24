#!/usr/bin/env node
// publish.mjs: the client for Speck's publish API.
//
//   node publish.mjs lookups
//   node publish.mjs whoami
//   node publish.mjs build <publicId> --tool "<text>" [--note "<text>"]
//   node publish.mjs publish [--dir .speck] [--remix-of <publicId> --tool "<text>" [--note "<text>"]] [--new]
//
// Reads SPECK_TOKEN, then ~/.config/speck/token. SPECK_URL points it at another Speck (a local one).
// It creates the app or, when .speck/app.json exists, updates it; uploads the three files one call
// each; writes app.json; prints the draft URL. It never publishes, and it never prints the token.
//
// Exit 0 done, 1 the API or the files refused, 2 the setup is wrong (no token, no .speck, a usage
// error). Every refusal is a sentence on stderr the agent can act on.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const BASE = (process.env.SPECK_URL || "https://speck.app").replace(/\/$/, "");
const SETTINGS = `${BASE}/settings#tokens`;
const TOKEN_FILE = join(homedir(), ".config", "speck", "token");
const FILES = [
  { kind: "prototype", name: "prototype.html", type: "text/html; charset=utf-8" },
  { kind: "prompt", name: "prompt.md", type: "text/markdown; charset=utf-8" },
  { kind: "screenshot", name: "screenshot.png", type: "image/png" },
];
const ENTRY_KEYS = ["name", "blurb", "description", "categorySlug", "platformSlug", "tags", "testedWith"];

const args = process.argv.slice(2);
const cmd = args[0];
// A flag's value is the next argument, unless that argument is itself another flag -- then the
// first flag was given no value, and callers must treat it as missing rather than swallow "--tool".
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return v !== undefined && !v.startsWith("--") ? v : undefined;
};
const has = (name) => args.includes(name);

function usage(code = 2) {
  console.error("usage: node publish.mjs lookups | whoami | build <publicId> --tool T [--note N] | publish [--dir .speck] [--remix-of ID --tool T [--note N]] [--new]");
  process.exit(code);
}
function die(msg, code = 1) { console.error(msg); process.exit(code); }

// spk_... tokens are a single run of printable ASCII; a rotation can leave a file with two lines
// (old token, new token) and we must refuse that rather than send a header undici will reject and
// then quote back in the error.
const TOKEN_SHAPE = /^[\x21-\x7e]+$/;

function token() {
  const env = (process.env.SPECK_TOKEN || "").trim();
  if (env) {
    if (!TOKEN_SHAPE.test(env)) die(`SPECK_TOKEN isn't a single token (no spaces or line breaks). Copy just the token from ${SETTINGS}.`, 2);
    return env;
  }
  if (existsSync(TOKEN_FILE)) {
    const t = readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) {
      if (!TOKEN_SHAPE.test(t)) die(`${TOKEN_FILE} isn't a single token (no spaces or line breaks). Copy just the token from ${SETTINGS}.`, 2);
      return t;
    }
  }
  die(`No token. Mint one at ${SETTINGS} and put it in SPECK_TOKEN or in ${TOKEN_FILE} (mode 0600).`, 2);
}

// One call. Answers { status, body } and never throws on a 4xx; a network failure is the one
// thing that exits here, since nothing after it can proceed. auth: false skips the header, for
// the one endpoint (/lookups) that doesn't need a token.
async function call(method, path, { json, raw, type, auth = true } = {}) {
  const headers = {};
  if (auth) headers.authorization = `Bearer ${token()}`;
  let body;
  if (json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
  if (raw !== undefined) { headers["content-type"] = type; body = raw; }
  let res;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body });
  } catch (e) {
    die(`Couldn't reach ${BASE}: ${e.cause?.code ?? e.message}.`, 1);
  }
  let parsed = null;
  try { parsed = await res.json(); } catch { parsed = { ok: false, error: `${res.status} from ${path} with no JSON body.` }; }
  return { status: res.status, body: parsed, retryAfter: res.headers.get("retry-after") };
}

function refused(r, what) {
  const b = r.body || {};
  const field = b.field ? `${b.field}: ` : "";
  const retry = r.retryAfter ? ` Retry after ${r.retryAfter} seconds.` : "";
  die(`${what}: ${field}${b.error || `HTTP ${r.status}`}${retry}`, 1);
}

async function lookups() {
  const r = await call("GET", "/lookups", { auth: false });
  if (!r.body?.ok) refused(r, "lookups");
  return r.body;
}

async function cmdLookups() {
  const l = await lookups();
  console.log("categories:"); for (const c of l.categories) console.log(`  ${c.slug.padEnd(22)} ${c.label}`);
  console.log("platforms:"); for (const p of l.platforms) console.log(`  ${p.slug.padEnd(22)} ${p.label}`);
}

async function cmdWhoami() {
  const r = await call("GET", "/me");
  if (!r.body?.ok) refused(r, "whoami");
  console.log(`@${r.body.username} (${r.body.displayName}) ${r.body.url}`);
}

async function postBuild(publicId, tool, note) {
  const r = await call("POST", `/apps/${publicId}/builds`, { json: { tool, note: note ?? null } });
  if (!r.body?.ok) refused(r, "build");
  return r.body.build;
}

async function cmdBuild() {
  const publicId = args[1];
  const tool = flag("--tool");
  if (!publicId || !tool) usage();
  const b = await postBuild(publicId, tool, flag("--note"));
  console.log(`${b.first ? "Posted" : "Updated"} your build of ${b.appUrl}`);
}

async function cmdPublish() {
  const dir = resolve(flag("--dir") || ".speck");
  const entryPath = join(dir, "entry.json");
  if (!existsSync(entryPath)) die(`No ${entryPath}. Write the listing first (references/entry.md).`, 2);
  const remixOf = flag("--remix-of");
  if (has("--remix-of") && !remixOf) usage();
  const tool = flag("--tool");
  if (remixOf && !tool) die("--remix-of needs --tool: what the person built it with.", 2);

  let entry;
  try { entry = JSON.parse(readFileSync(entryPath, "utf8")); } catch (e) { die(`${entryPath} is not JSON: ${e.message}`, 2); }
  const missing = ENTRY_KEYS.filter((k) => !(k in entry));
  if (missing.length) die(`${entryPath} is missing ${missing.join(", ")}.`, 2);
  const extra = Object.keys(entry).filter((k) => !ENTRY_KEYS.includes(k));
  if (extra.length) die(`${entryPath} has keys the listing does not take: ${extra.join(", ")}. (The public id lives in app.json, which the script writes.)`, 2);
  const present = FILES.filter((f) => existsSync(join(dir, f.name)));
  if (!present.length) die(`Nothing to upload: none of ${FILES.map((f) => f.name).join(", ")} is in ${dir}.`, 2);

  // Validate against the live lists before sending anything; they change.
  const l = await lookups();
  for (const [key, list] of [["categorySlug", l.categories], ["platformSlug", l.platforms]]) {
    if (!list.some((x) => x.slug === entry[key])) die(`${key} "${entry[key]}" is not one of: ${list.map((x) => x.slug).join(", ")}.`, 1);
  }
  const me = await call("GET", "/me");
  if (!me.body?.ok) refused(me, "whoami");

  const appPath = join(dir, "app.json");
  const existing = !has("--new") && existsSync(appPath) ? JSON.parse(readFileSync(appPath, "utf8")) : null;
  const fields = Object.fromEntries(ENTRY_KEYS.map((k) => [k, entry[k]]));
  let app;
  if (existing?.publicId) {
    if (remixOf) console.error(`${appPath} already names an app; --remix-of and --tool do nothing on an update.`);
    const r = await call("PATCH", `/apps/${existing.publicId}`, { json: fields });
    if (r.status === 404) die(`${appPath} names ${existing.publicId}, which is no longer on Speck. Run again with --new to create it afresh, or fix app.json.`, 1);
    if (!r.body?.ok) refused(r, "update");
    app = r.body.app;
  } else {
    let r = await call("POST", "/apps", { json: remixOf ? { ...fields, remixOf } : fields });
    if (r.status === 409 && r.body?.code === "build-first") {
      await postBuild(remixOf, tool, flag("--note"));
      r = await call("POST", "/apps", { json: { ...fields, remixOf } });
    }
    if (!r.body?.ok) refused(r, "create");
    app = r.body.app;
    writeFileSync(appPath, JSON.stringify({ publicId: app.publicId, url: app.url }, null, 2) + "\n");
  }

  for (const f of present) {
    const r = await call("PUT", `/apps/${app.publicId}/files/${f.kind}`, { raw: readFileSync(join(dir, f.name)), type: f.type });
    if (!r.body?.ok) refused(r, `upload ${f.name}`);
    app = r.body.app;
    console.log(`uploaded ${f.name}`);
  }
  const absent = FILES.filter((f) => !app.files[f.kind]).map((f) => f.name);
  if (absent.length) console.log(`still missing on Speck: ${absent.join(", ")}`);
  if (app.status === "published") {
    console.log(`\nLive app updated. Open it to check:\n${app.url}`);
  } else {
    console.log(`\nDraft ${existing ? "updated" : "created"} as @${me.body.username}. Open it, check the prototype, and press Publish:\n${app.url}`);
  }
}

if (has("-h") || has("--help")) usage(0);
const commands = { lookups: cmdLookups, whoami: cmdWhoami, build: cmdBuild, publish: cmdPublish };
if (!commands[cmd]) usage();
commands[cmd]().catch((e) => die(e.message || String(e), 1));
