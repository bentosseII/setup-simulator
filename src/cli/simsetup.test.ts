import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { runCli } from '@/cli/simsetup'
import { makeSetup } from '@/lib/test-fixtures'

const outputs: string[] = []
const errors: string[] = []

const io = {
	stdout: (text: string) => outputs.push(text),
	stderr: (text: string) => errors.push(text),
}

const tempDirs: string[] = []

afterAll(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('simsetup cli', () => {
	it('runs estimate command with prompt input', async () => {
		outputs.length = 0
		errors.length = 0
		await runCli(
			['bun', 'simsetup', 'estimate', '--prompt', '3 coding agents, shared memory, budget cap $100/day.'],
			io,
		)
		expect(errors.length).toBe(0)
		expect(outputs.at(-1)).toContain('"mode": "quick"')
	})

	it('runs compare command with file inputs', async () => {
		outputs.length = 0
		errors.length = 0
		const dir = await mkdtemp(path.join(os.tmpdir(), 'simsetup-'))
		tempDirs.push(dir)

		const baselinePath = path.join(dir, 'baseline.json')
		const variantPath = path.join(dir, 'variant.json')

		await writeFile(baselinePath, JSON.stringify(makeSetup()), 'utf8')
		await writeFile(
			variantPath,
			JSON.stringify(
				makeSetup({
					agents: makeSetup().agents.map((agent) =>
						agent.id === 'coding' ? { ...agent, count: 3 } : agent,
					),
				}),
			),
			'utf8',
		)

		await runCli(
			[
				'bun',
				'simsetup',
				'compare',
				'--baseline',
				baselinePath,
				'--variant',
				variantPath,
				'--mode',
				'quick',
			],
			io,
		)

		expect(errors.length).toBe(0)
		expect(outputs.at(-1)).toContain('"winner"')
	})

	it('runs simulate command with calibration flags', async () => {
		outputs.length = 0
		errors.length = 0
		await runCli(
			[
				'bun',
				'simsetup',
				'simulate',
				'--prompt',
				'2 coding agents, shared memory, next.js project',
				'--mode',
				'deep',
				'--iterations',
				'20',
				'--calibration-runs',
				'4',
				'--no-calibration',
			],
			io,
		)

		expect(errors.length).toBe(0)
		expect(outputs.at(-1)).toContain('"mode": "deep"')
		expect(outputs.at(-1)).toContain('"enabled": false')
	})

	it('shows global help without failing', async () => {
		outputs.length = 0
		errors.length = 0

		await runCli(['bun', 'simsetup', '--help'], io)

		expect(errors.length).toBe(0)
		expect(outputs.at(-1)).toContain('Usage: simsetup')
	})

	it('shows subcommand help without failing', async () => {
		outputs.length = 0
		errors.length = 0

		await runCli(['bun', 'simsetup', 'estimate', '--help'], io)
		await runCli(['bun', 'simsetup', 'simulate', '--help'], io)
		await runCli(['bun', 'simsetup', 'compare', '--help'], io)

		expect(errors.length).toBe(0)
		expect(outputs.join('\n')).toContain('Usage: simsetup estimate')
		expect(outputs.join('\n')).toContain('Usage: simsetup simulate')
		expect(outputs.join('\n')).toContain('Usage: simsetup compare')
	})
})
