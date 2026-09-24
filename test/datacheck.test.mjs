import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const script = new URL("../skills/speck-publish/scripts/datacheck.mjs", import.meta.url).pathname;
const fx = new URL("./fixtures/data/", import.meta.url).pathname;
const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });

test.before(() => {
  mkdirSync(`${fx}only-clean`, { recursive: true });
  writeFileSync(`${fx}only-clean/p.html`, "<p>by Sam</p><p>Total $12.00</p><p>Delivery today</p>");
  mkdirSync(`${fx}only-contact`, { recursive: true });
  writeFileSync(`${fx}only-contact/p.md`, "Call 555-123-4567 or write to sam@example.com at 12 Baker Street.");
  mkdirSync(`${fx}repo`, { recursive: true });
  writeFileSync(`${fx}repo/users-export.csv`, "id,name\n");
  writeFileSync(`${fx}repo/app.sqlite`, "");
});

test("names and money are questions, not failures", () => {
  const r = run(`${fx}only-clean`, `${fx}repo`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ask the author/i);
  assert.match(r.stdout, /Sam/);
  assert.match(r.stdout, /\$12\.00/);
  // "Delivery" is on the stop list and must not show up as an ask-the-author
  // candidate line (four-space indent, token, then " in <file>").
  assert.doesNotMatch(r.stdout, /^ {4}Delivery\s+in /m);
});

test("contact details fail", () => {
  const r = run(`${fx}only-contact`, `${fx}repo`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /must fix/i);
  assert.match(r.stdout, /sam@example\.com/);
  assert.match(r.stdout, /555-123-4567/);
  assert.match(r.stdout, /Baker Street/);
});

test("production-looking files in the repo are named as sources not to read", () => {
  const r = run(`${fx}only-clean`, `${fx}repo`);
  assert.match(r.stdout, /users-export\.csv/);
  assert.match(r.stdout, /app\.sqlite/);
});

test("usage without a directory", () => {
  assert.equal(run().status, 2);
});
