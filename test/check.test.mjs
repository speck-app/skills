import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { findChrome } from "../skills/speck-publish/scripts/browser.mjs";

const script = new URL("../skills/speck-publish/scripts/check.mjs", import.meta.url).pathname;
const fixturesDir = new URL("./fixtures/", import.meta.url).pathname;
const fixture = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const chrome = findChrome();
const tempFiles = () => readdirSync(fixturesDir).filter((n) => n.startsWith(".check-"));

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

test("leaves no temp file behind after a failing check", { skip: !chrome && "no Chrome on this machine" }, () => {
  const r = run(fixture("wide.html"));
  assert.equal(r.status, 1);
  assert.deepEqual(tempFiles(), []);
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
