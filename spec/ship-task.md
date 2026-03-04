# Task: Ship Setup Simulator

## Context
Setup Simulator at ~/workspace/setup-simulator is a Next.js + CLI app for simulating multi-agent architecture cost/performance. Tests pass at 85% coverage. Needs packaging and shipping.

## What to do

### 1. Package.json cleanup
- Name: `setup-simulator` (or `simsetup`)
- Version: 0.1.0
- Description: "Simulate multi-agent architecture cost, performance, and failure modes before you build."
- Keywords: agent, simulator, cost, performance, architecture, planning
- License: MIT, author: Ben Tossell
- bin: `{ "simsetup": "./bin/simsetup.js" }` (check existing entry points)

### 2. README.md
- Clear, punchy. "Flight simulator for agent architectures."
- Quick start: install, run first estimate, see dashboard
- Show example CLI output
- Screenshot placeholder for the dashboard
- CLI command reference (estimate, simulate, compare)
- Not a wall of text

### 3. Polish
- `simsetup --help` works
- All subcommands have --help
- Clean up TODO/FIXME

### 4. .gitignore, LICENSE (MIT), .npmignore
- Exclude: .next, node_modules, coverage, out

### 5. Git + GitHub
- git init if needed
- Clean .gitignore
- Initial commit
- Create repo: `gh repo create bentossell/setup-simulator --public --description "Simulate multi-agent architecture cost, performance, and failure modes before you build." --source . --push`

### 6. Verify
- `bun run lint && bun run typecheck && bun run test` passes
- README looks good

When completely finished, run: openclaw system event --text "Done: Setup Simulator shipped to GitHub" --mode now
