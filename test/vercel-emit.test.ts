// Vercel compiles api/*.ts with tsc into Node ESM and renames the output to
// .js without rewriting import specifiers, then dispatches named method
// exports (GET/POST/...) as web handlers. This test emulates that emit and
// loads the result under plain Node, which is the only way to catch
// `.ts`-suffixed or extensionless relative imports before a real deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("api/process.ts loads under a Vercel-style Node ESM emit and exports POST", () => {
  const out = mkdtempSync(path.join(tmpdir(), "metaforge-emit-"));
  try {
    execFileSync(
      "npx",
      [
        "tsc", "--ignoreConfig", "--noCheck", "--module", "nodenext", "--moduleResolution", "nodenext",
        "--target", "es2022", "--rootDir", ".", "--outDir", out,
        "api/process.ts",
      ],
      { cwd: root, stdio: "pipe" },
    );
    cpSync(path.join(root, "package.json"), path.join(out, "package.json"));
    symlinkSync(path.join(root, "node_modules"), path.join(out, "node_modules"), "dir");

    const result = execFileSync(
      process.execPath,
      ["--input-type=module", "-e",
        `const m = await import(${JSON.stringify(path.join(out, "api/process.js"))});
         console.log(Object.keys(m).sort().join(","));`],
      { cwd: out, encoding: "utf8", stdio: "pipe" },
    ).trim();

    const names = result.split(",");
    assert.ok(names.includes("POST"), `exports: ${result}`);
    assert.ok(!names.includes("default"), "a default export would be dispatched as a Node (req,res) listener");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
