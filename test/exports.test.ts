import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFormat, mimeFor, extensionFor } from "../src/lib/exif/index.ts";

test("library re-exports format helpers", () => {
  assert.equal(mimeFor("png"), "image/png");
  assert.equal(extensionFor("jpeg"), "jpg");
});

for (const [file, fmt] of [
  ["tiny.png", "png"],
  ["tiny.jpg", "jpeg"],
  ["tiny.webp", "webp"],
] as const) {
  test(`fixture ${file} is detected as ${fmt}`, () => {
    const bytes = new Uint8Array(readFileSync(new URL(`./fixtures/${file}`, import.meta.url)));
    assert.equal(detectFormat(bytes), fmt);
  });
}
