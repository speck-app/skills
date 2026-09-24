import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { findChrome } from "../skills/speck-publish/scripts/browser.mjs";

const script = new URL("../skills/speck-publish/scripts/shoot.mjs", import.meta.url).pathname;
const fixture = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const tmp = new URL("./tmp/", import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const chrome = findChrome();

// PNG width and height live in the IHDR chunk at bytes 16 to 23.
const size = (file) => { const b = readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test.before(() => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true }); });

test("usage and exit 2 without both paths", () => {
  assert.equal(run(fixture("clean.html")).status, 2);
});

test("shoots a 16:10 app at 1600x1000", { skip: !chrome && "no Chrome on this machine" }, () => {
  const out = `${tmp}clean.png`;
  const r = run(fixture("clean.html"), out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(size(out), [1600, 1000]);
});

test("frames a mobile app as a device, reading the platform from entry.json, and hides the persona bar", { skip: !chrome && "no Chrome on this machine" }, () => {
  const out = `${tmp}phone.png`;
  const r = run(fixture("phone/prototype.html"), out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(size(out), [1600, 1000]);
  assert.match(r.stdout, /390x844 device/);
});

test("honours speck:shot-width for a narrower window", { skip: !chrome && "no Chrome on this machine" }, () => {
  const out = `${tmp}narrow.png`;
  const r = run(fixture("clean.html"), out, "--w", "640");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(size(out), [1600, 1000]);
  assert.match(r.stdout, /640x400 window/);
});

test("refuses a width that is not a multiple of 16", () => {
  assert.equal(run(fixture("clean.html"), `${tmp}x.png`, "--w", "500").status, 2);
});

test("rejects a non-numeric --w with a plain message, not NaN", () => {
  const r = run(fixture("clean.html"), `${tmp}nan.png`, "--w", "abc");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /shot width must be a number/);
  assert.doesNotMatch(r.stderr, /NaN/);
});

test("errors on a bad entry.json instead of throwing", () => {
  const out = `${tmp}badentry.png`;
  const r = run(fixture("badentry/prototype.html"), out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /entry\.json is not JSON/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});
