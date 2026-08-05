import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("contains the Chinese dashboard source and Next build output", async () => {
  const [page, layout, packageJson, sitesRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sites/route.ts", import.meta.url), "utf8"),
    access(new URL("../.next/BUILD_ID", import.meta.url)),
  ]);

  assert.match(page, /ABA 词库看板/);
  assert.match(page, /月度排名趋势/);
  for (const site of ["美国站", "英国站", "德国站"]) {
    assert.match(sitesRoute, new RegExp(site));
  }
  for (const site of ["加拿大站", "墨西哥站", "意大利站", "西班牙站", "土耳其站", "瑞典站"]) {
    assert.doesNotMatch(sitesRoute, new RegExp(site));
  }
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare:workers|react-loading-skeleton/);
});
