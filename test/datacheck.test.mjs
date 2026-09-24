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
  mkdirSync(`${fx}money`, { recursive: true });
  writeFileSync(`${fx}money/p.txt`, "Price: 12,00 €\nAlready listed at £1,200.00 too.\n");
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

test("a nonexistent artifact dir exits 2 with a plain message, not a stack trace", () => {
  const r = run(`${fx}no-such-artifact-dir`, `${fx}repo`);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such directory/i);
  assert.doesNotMatch(r.stderr, /\bat /);
});

test("a nonexistent repo root still runs and exits 0 on clean artifacts", () => {
  const r = run(`${fx}only-clean`, `${fx}no-such-repo-root`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /repo root does not exist/i);
});

test("comma-decimal money (amount before the symbol) is caught too, alongside a symbol-first amount", () => {
  const r = run(`${fx}money`, `${fx}repo`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ask the author/i);
  assert.match(r.stdout, /12,00 €/);
  assert.match(r.stdout, /£1,200\.00/);
});
