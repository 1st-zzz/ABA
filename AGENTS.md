# Effiseller Keyword Vercel - Agent Instructions

## Project Context
- Project name: Effiseller Keyword Vercel
- Purpose: Public Chinese web interface for querying Effiseller ABA keyword data through a server-side MCP proxy.
- Runtime: Standard Next.js app for Vercel deployment.

## Operating Rules
- Default response language: Chinese.
- Keep code, commands, variable names, and file names in English.
- Never expose MCP tokens or credentials in client code, committed files, logs, or public output.
- Public pages must call server-side API routes for MCP access.

## Commands
- Install dependencies: `npm.cmd install --ignore-scripts --no-audit --no-fund`
- Run local dev server: `npm.cmd run dev`
- Build for deployment: `npm.cmd run build`
- Run tests: `npm.cmd test`

## High-Risk Areas
- `.env.local` and Vercel environment variables may contain secrets. Do not commit them.
- `EFFISELLER_DATAHUB_TOKEN` must only exist in server runtime environment variables.
- Public deployment can expose query functionality to anyone with the URL.
