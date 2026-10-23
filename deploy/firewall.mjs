#!/usr/bin/env node
// The Vercel firewall's custom rules (rate limits) and managed bot rules, kept in
// deploy/vercel-firewall.json so they are in the repo, not only in the dashboard.
//
//   node deploy/firewall.mjs           what differs between the file and the live firewall
//   node deploy/firewall.mjs save      the live firewall into the file (after changing it in the dashboard)
//   node deploy/firewall.mjs apply     the file into the live firewall: rules added or replaced by name, then published
//
// A live rule the file doesn't have is only reported, never removed; managed rules are only compared.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "deploy/vercel-firewall.json");
const vercel = (...args) => execFileSync("npx", ["--yes", "vercel@64.2.0", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

/** A rule as the file keeps it: no ids or status, no empty fields, keys in order (so equal rules write the same). */
function tidy(value) {
  if (Array.isArray(value)) return value.map(tidy);
  if (value && typeof value === "object") {
    const kept = Object.entries(value).filter(([k, v]) => v !== null && !["id", "valid", "validationErrors", "_status"].includes(k));
    return Object.fromEntries(kept.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, tidy(v)]));
  }
  return value;
}

function live() {
  const found = JSON.parse(vercel("firewall", "rules", "list", "--json"));
  return {
    managed: Object.fromEntries(found.managed.map((m) => [m.name, m.action])),
    rules: found.rules.map(tidy),
  };
}

const command = process.argv[2];
const now = live();
if (command === "save") {
  const notes = (() => {
    try {
      return JSON.parse(readFileSync(FILE, "utf8")).notes ?? {};
    } catch {
      return {};
    }
  })();
  writeFileSync(FILE, `${JSON.stringify({ notes, ...now }, null, 2)}\n`);
  console.log(`saved ${now.rules.length} rules to deploy/vercel-firewall.json`);
  process.exit(0);
}

const wanted = JSON.parse(readFileSync(FILE, "utf8"));
const byName = new Map(now.rules.map((r) => [r.name, r]));
const changed = wanted.rules.map(tidy).filter((r) => JSON.stringify(byName.get(r.name)) !== JSON.stringify(r));
for (const [name, action] of Object.entries(wanted.managed)) {
  if (now.managed[name] !== action) console.log(`managed rule "${name}": live ${now.managed[name] ?? "missing"}, the file says ${action} (set it in the dashboard)`);
}
for (const rule of now.rules) {
  if (!wanted.rules.some((r) => r.name === rule.name)) console.log(`live only: "${rule.name}" (remove it in the dashboard, or save to keep it)`);
}
if (!changed.length) {
  console.log("the live rules are the file's");
  process.exit(0);
}
for (const rule of changed) console.log(`${byName.has(rule.name) ? "differs" : "missing"}: "${rule.name}"`);
if (command !== "apply") process.exit(0);

for (const rule of changed) {
  const data = JSON.stringify(rule);
  if (byName.has(rule.name)) vercel("firewall", "rules", "edit", rule.name, "--data", data, "--yes");
  else vercel("firewall", "rules", "add", "--data", data, "--yes");
}
console.log(vercel("firewall", "diff"));
console.log(vercel("firewall", "publish", "--yes"));
