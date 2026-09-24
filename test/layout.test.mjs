import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the skill is where every client looks for it", () => {
  assert.ok(existsSync(join(root, "skills/speck-publish/SKILL.md")));
  const head = readFileSync(join(root, "skills/speck-publish/SKILL.md"), "utf8").split("---")[1];
  assert.match(head, /^name: speck-publish$/m);
  assert.match(head, /^description: /m);
  assert.doesNotMatch(head, /^(allowed-tools|model|user-invocable):/m);
});

test("the plugin manifests point at the same skill", () => {
  const m = JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"));
  assert.equal(m.name, "speck");
  assert.deepEqual(m.plugins.map((p) => p.name), ["speck-publish"]);
  assert.equal(m.plugins[0].source, "./");
  const p = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(p.name, "speck-publish");
});

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === ".git" || n === "node_modules") continue;
    const f = join(dir, n);
    statSync(f).isDirectory() ? walk(f, out) : out.push(f);
  }
  return out;
}

test("nothing in the skill is Claude-only", () => {
  for (const f of walk(root)) {
    if (!relative(root, f).startsWith("skills/")) continue;
    const text = readFileSync(f, "latin1").toLowerCase();
    assert.doesNotMatch(text, /browser pane|claude code only|\bclaude\.md\b/, f);
  }
});
