# 智易飞 ABA 词库看板 - Vercel 版

这是可公开部署到 Vercel 的中文 ABA 关键词看板。前端只负责展示，MCP token 只在服务端 API Route 中读取。

## 本地运行

```powershell
npm.cmd install --ignore-scripts --no-audit --no-fund
$env:EFFISELLER_DATAHUB_TOKEN = "your-token"
npm.cmd run dev
```

打开 `http://localhost:3000`。

## Vercel 环境变量

在 Vercel Project Settings -> Environment Variables 中配置：

- `EFFISELLER_DATAHUB_TOKEN`: Effiseller MCP token，必须设为服务端环境变量
- `MCP_ENDPOINT`: `https://ai.effiseller.com/api/mcp`

## 部署

```powershell
npm.cmd run build
npx vercel --prod
```

如果使用 GitHub 连接 Vercel，推送到 GitHub 后在 Vercel 导入仓库即可。

## 功能范围

- exact 关键词当前 ABA 快照
- 词根拓展词列表
- 多关键词历史拉取
- 月度排名环比
- 起始月份后的缺失月份检查
- JSON / CSV 导出

公开版不把查询记录写入服务端数据库；最近查询只保存在访问者自己的浏览器中。
