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
  writeFileSync(`${fx}only-contact/p.md`, "Call 555-123-4567 or write to sam@mailbox.org at 12 Baker Street.");
  mkdirSync(`${fx}repo`, { recursive: true });
  writeFileSync(`${fx}repo/users-export.csv`, "id,name\n");
  writeFileSync(`${fx}repo/app.sqlite`, "");
  mkdirSync(`${fx}wrapped`, { recursive: true });
  writeFileSync(`${fx}wrapped/prompt.md`, [
    "Build me a habit tracker as a native mobile app, and make the whole of it one",
    "screen of round buttons. One button per habit, an emoji I chose inside the circle",
    "and the habit's name under it.",
    "",
    "## Rules that matter",
    "",
    "- Storage is one local file in the app's own data directory. SQLite is the",
    "  obvious choice; use the platform's standard local store if it has one.",
    "- A habit with no name is the one thing Save refuses.",
    "",
    "```",
    "a fenced block whose lines are as long as they like and are never a paragraph",
    "continued on the next line",
    "```",
    "",
  ].join("\n"));
  mkdirSync(`${fx}unwrapped`, { recursive: true });
  writeFileSync(`${fx}unwrapped/prompt.md`, [
    "Build me a habit tracker as a native mobile app, and make the whole of it one screen of round buttons. One button per habit, an emoji I chose inside the circle and the habit's name under it.",
    "",
    "## Rules that matter",
    "",
    "- Storage is one local file in the app's own data directory. SQLite is the obvious choice; use the platform's standard local store if it has one.",
    "- A habit with no name is the one thing Save refuses.",
    "",
    "| column | what |",
    "| --- | --- |",
    "| a long enough table row to pass sixty characters if it were prose, which it is not | x |",
    "| second row | y |",
    "",
  ].join("\n"));
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
  assert.match(r.stdout, /sam@mailbox\.org/);
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

const askLines = (out) => out.split("\n").filter((l) => /^ {4}\S.* in /.test(l)).map((l) => l.trim().split(/\s+in\s+/)[0].trim());

test("seed names in JS keys are questions; tab labels, the app's name and reserved contact shapes are not", () => {
  const r = run(`${fx}seed`, `${fx}repo`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const asked = askLines(r.stdout);
  for (const n of ["Amara", "Tobi Olonoh", "Zainab"]) assert.ok(asked.includes(n), `${n} missing from ${JSON.stringify(asked)}`);
  for (const n of ["Inbox", "Weekly", "Assign", "Marlow", "Rota", "Everyone", "May", "Bins"]) assert.ok(!asked.includes(n), `${n} should not be asked about`);
  assert.doesNotMatch(r.stdout, /must fix/i);
  assert.doesNotMatch(r.stdout, /logo@2x|sam@example\.com|555-0142|555 0142/);
});

test("an international number outside the reserved block is a failure", () => {
  const r = run(`${fx}intl`, `${fx}repo`);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /must fix/i);
  assert.match(r.stdout, /\+44 20 7946 0958/);
});

test("production files are matched by data-file shape, not by a source file named for the feature", () => {
  const r = run(`${fx}only-clean`, `${fx}prodrepo`);
  for (const p of ["dump.sql", "backup/notes.txt", "prod-users.json", "data.db"]) assert.match(r.stdout, new RegExp(`^ {4}${p.replace(/[.]/g, "\\.")}$`, "m"), p);
  for (const p of ["src/export.ts", "components/Export.tsx", "lib/snapshot.js"]) assert.doesNotMatch(r.stdout, new RegExp(p.replace(/[.]/g, "\\.")), p);
});

test("-h prints usage and exits 0, before the directory check", () => {
  const r = run("-h");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: node datacheck\.mjs/);
});

// #125 on the Speck tracker: the site shows the prompt narrower than eighty characters.
test("a hard-wrapped prompt.md fails, naming the lines; a fenced block does not count", () => {
  const r = run(`${fx}wrapped`, `${fx}repo`);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /MUST FIX\. prompt\.md has hard-wrapped paragraphs, broken after lines 1, 2, 7\./);
  assert.match(r.stdout, /One paragraph per line/);
});

test("one paragraph per line passes, and table rows and bullets are not paragraphs", () => {
  const r = run(`${fx}unwrapped`, `${fx}repo`);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /hard-wrapped/);
});
