# AGENTS

## Project
- Agent Setup Simulator
- Mission: simulate multi-agent architecture cost/performance/failure modes before build
- Stack: TypeScript, Bun runtime, Next.js web app, CLI

## Run
- Install: `bun install`
- Dev web: `bun run dev`
- Build: `bun run build`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Test: `bun run test`
- CLI: `bun run cli -- estimate --prompt "3 coding agents"`

## Structure
- `src/lib/` core schema, parser, simulation engines, services
- `src/app/` Next.js UI + API routes
- `src/cli/` `simsetup` CLI
- `spec/` product spec + progress tracking

## Core Commands
- `simsetup estimate --prompt "..."`
- `simsetup simulate --prompt "..." --mode deep`
- `simsetup compare --baseline base.json --variant opt.json`

## Quality Gate
- Always run: lint + typecheck + tests before handoff
