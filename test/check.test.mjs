import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findChrome } from "../skills/speck-publish/scripts/browser.mjs";

const script = new URL("../skills/speck-publish/scripts/check.mjs", import.meta.url).pathname;
const fixturesDir = new URL("./fixtures/", import.meta.url).pathname;
const fixture = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const runWith = (env, ...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const chrome = findChrome();
// Temp copies used to sit beside the prototype; now they live in a speck-check-* directory under
// the system temp directory. Neither place may keep one after a run.
const tempFiles = () => readdirSync(fixturesDir).filter((n) => n.startsWith(".check-"));
const tempDirs = () => new Set(readdirSync(tmpdir()).filter((n) => n.startsWith("speck-check-")));
const newTempDirs = (before) => [...tempDirs()].filter((n) => !before.has(n));

test("usage and exit 2 without a file", () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: node check\.mjs/);
});

test("passes a clean prototype", { skip: !chrome && "no Chrome on this machine" }, () => {
  const r = run(fixture("clean.html"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok/);
});

test("fails on a thrown error and a console.error, naming both", { skip: !chrome && "no Chrome on this machine" }, () => {
  const r = run(fixture("throws.html"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /boom/);
  assert.match(r.stderr, /bad/);
});

test("fails on horizontal overflow at 320 px", { skip: !chrome && "no Chrome on this machine" }, () => {
  const r = run(fixture("wide.html"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /overflow.*320/);
});

test("fails on an error thrown just before the dump budget", { skip: !chrome && "no Chrome on this machine" }, () => {
  const r = run(fixture("late.html"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /late/);
});

test("leaves no temp file behind after a failing check, beside the prototype or in the temp directory", { skip: !chrome && "no Chrome on this machine" }, () => {
  const before = tempDirs();
  const r = run(fixture("wide.html"));
  assert.equal(r.status, 1);
  assert.deepEqual(tempFiles(), []);
  assert.deepEqual(newTempDirs(before), []);
});

test("a missing prototype is a plain message, not a stack trace", () => {
  const r = run(fixture("does-not-exist.html"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such file/);
  assert.doesNotMatch(r.stderr, /\n\s+at |ENOENT/);
});

test("rejects a --width outside 320 to 1600", () => {
  const r = run(fixture("clean.html"), "--width", "9999");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /320/);
});

test("rejects a non-numeric --width with a plain message", () => {
  const r = run(fixture("clean.html"), "--width", "abc");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /width must be a number/);
});

test("-h prints usage and exits 0", () => {
  const r = run("-h");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: node check\.mjs/);
});

test("a flag before the file does not take the flag's value for the file", () => {
  const r = run("--width", "640", fixture("does-not-exist.html"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such file: .*does-not-exist\.html/);
});

test("--width 640 before the prototype checks at 640", { skip: !chrome && "no Chrome on this machine" }, () => {
  const r = run("--width", "640", fixture("clean.html"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /at 640 px/);
});

test("a Chrome that crashes is one sentence quoting its first stderr line, and the temp directory goes", { skip: process.platform === "win32" && "needs a shell script as the fake Chrome" }, (t) => {
  const bin = mkdtempSync(join(tmpdir(), "fake-chrome-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const fake = join(bin, "chrome");
  writeFileSync(fake, "#!/bin/sh\necho 'sandbox exploded' >&2\necho 'more detail' >&2\nexit 3\n");
  chmodSync(fake, 0o755);
  const before = tempDirs();
  const r = runWith({ SPECK_CHROME: fake }, fixture("clean.html"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^Chrome failed: "sandbox exploded"/);
  assert.doesNotMatch(r.stderr, /more detail|\n\s+at /);
  assert.deepEqual(newTempDirs(before), []);
});
