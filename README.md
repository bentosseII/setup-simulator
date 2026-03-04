# Setup Simulator

Flight simulator for agent architectures.

Simulate multi-agent architecture cost, performance, and failure modes before you build.

## Quick Start

```bash
bun install
bun run dev
```

Dashboard: `http://localhost:3000`

First estimate:

```bash
bun run cli estimate --prompt '3 coding agents + 1 research agent, shared memory, budget cap $100/day'
```

Example output:

```json
{
  "mode": "quick",
  "summary": "Estimated $1.25/day with 70.8% completion and 17.2s p90 latency.",
  "recommendations": [
    { "id": "reviewer-role", "title": "Add explicit reviewer role" },
    { "id": "memory-hybrid", "title": "Move to hybrid memory policy" }
  ]
}
```

Dashboard screenshot placeholder:

![Setup Simulator dashboard placeholder](https://placehold.co/1280x720?text=Setup+Simulator+Dashboard)

## CLI Reference

`estimate` quick estimate from prompt/file.

```bash
simsetup estimate --prompt '3 coding agents + 1 research agent'
```

`simulate` deeper run with mode/options.

```bash
simsetup simulate --prompt '3 coding agents + 1 research agent' --mode deep --iterations 50
```

`compare` baseline vs variant config.

```bash
simsetup compare --baseline ./baseline.json --variant ./variant.json --mode quick
```

Help:

```bash
simsetup --help
simsetup estimate --help
simsetup simulate --help
simsetup compare --help
```
