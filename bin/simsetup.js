#!/usr/bin/env bun
import { runCli } from '../src/cli/simsetup.ts'

runCli().catch((error) => {
	const message = error instanceof Error ? error.message : 'CLI failure'
	console.error(message)
	process.exitCode = 1
})
