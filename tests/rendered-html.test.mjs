import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("contains the Chinese dashboard source and Next build output", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../.next/BUILD_ID", import.meta.url)),
  ]);

  assert.match(page, /智易飞 ABA 词库看板/);
  assert.match(page, /月度排名趋势/);
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare:workers|react-loading-skeleton/);
});
