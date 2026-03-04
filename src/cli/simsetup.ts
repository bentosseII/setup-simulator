#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Command, CommanderError } from 'commander'

import { runComparison, runSimulation } from '@/lib/service/simulator'
import type { ComparisonResult, SimulationMode, SimulationResult } from '@/lib/types'

export interface CliIO {
	stdout: (text: string) => void
	stderr: (text: string) => void
}

const defaultIO: CliIO = {
	stdout: (text) => console.log(text),
	stderr: (text) => console.error(text),
}

const loadInput = async (options: { file?: string; prompt?: string }): Promise<unknown> => {
	if (options.file) {
		const resolved = path.resolve(process.cwd(), options.file)
		return readFile(resolved, 'utf8')
	}
	if (options.prompt) {
		return options.prompt
	}
	throw new Error('Provide --file <path> or --prompt <text>')
}

const toMode = (value: string, allowed: SimulationMode[]): SimulationMode => {
	if (!allowed.includes(value as SimulationMode)) {
		throw new Error(`Mode must be one of: ${allowed.join(', ')}`)
	}
	return value as SimulationMode
}

const formatResult = (result: SimulationResult): string => {
	return JSON.stringify(result, null, 2)
}

const formatComparison = (result: ComparisonResult): string => {
	return JSON.stringify(result, null, 2)
}

export const runCli = async (argv = process.argv, io: CliIO = defaultIO): Promise<void> => {
	const program = new Command()

	program
		.name('simsetup')
		.description('Agent Setup Simulator CLI')
		.configureOutput({
			writeOut: (text) => io.stdout(text.trimEnd()),
			writeErr: (text) => io.stderr(text.trimEnd()),
		})
		.exitOverride()

	program
		.command('estimate')
		.description('Run quick estimate mode')
		.option('-f, --file <path>', 'JSON/YAML setup file')
		.option('-p, --prompt <text>', 'Natural language setup prompt')
		.option('--seed <number>', 'Deterministic seed', '42')
		.action(async (options) => {
			const input = await loadInput(options)
			const result = runSimulation({
				input,
				mode: 'quick',
				options: {
					seed: Number(options.seed),
				},
			})
			io.stdout(formatResult(result))
		})

	program
		.command('simulate')
		.description('Run deep or stress simulation')
		.option('-f, --file <path>', 'JSON/YAML setup file')
		.option('-p, --prompt <text>', 'Natural language setup prompt')
		.option('-m, --mode <mode>', 'deep|stress', 'deep')
		.option('--seed <number>', 'Deterministic seed', '42')
		.option('--iterations <number>', 'Override iteration count')
		.option('--calibration-runs <number>', 'Reference calibration runs (1-10)')
		.option('--no-calibration', 'Disable reference-data calibration')
		.action(async (options) => {
			const input = await loadInput(options)
			const mode = toMode(options.mode, ['deep', 'stress'])
			const result = runSimulation({
				input,
				mode,
				options: {
					seed: Number(options.seed),
					iterations: options.iterations ? Number(options.iterations) : undefined,
					calibrationRuns: options.calibrationRuns ? Number(options.calibrationRuns) : undefined,
					disableCalibration: options.calibration === false,
				},
			})
			io.stdout(formatResult(result))
		})

	program
		.command('compare')
		.description('Compare baseline vs variant setup')
		.requiredOption('--baseline <path>', 'Baseline setup file path')
		.requiredOption('--variant <path>', 'Variant setup file path')
		.option('-m, --mode <mode>', 'quick|deep|stress', 'quick')
		.option('--seed <number>', 'Deterministic seed', '42')
		.option('--iterations <number>', 'Override iteration count')
		.option('--calibration-runs <number>', 'Reference calibration runs (1-10)')
		.option('--no-calibration', 'Disable reference-data calibration')
		.action(async (options) => {
			const mode = toMode(options.mode, ['quick', 'deep', 'stress'])
			const baseline = await readFile(path.resolve(process.cwd(), options.baseline), 'utf8')
			const variant = await readFile(path.resolve(process.cwd(), options.variant), 'utf8')
			const result = runComparison({
				baseline,
				variant,
				mode,
				options: {
					seed: Number(options.seed),
					iterations: options.iterations ? Number(options.iterations) : undefined,
					calibrationRuns: options.calibrationRuns ? Number(options.calibrationRuns) : undefined,
					disableCalibration: options.calibration === false,
				},
			})
			io.stdout(formatComparison(result))
		})

	try {
		await program.parseAsync(argv)
	} catch (error) {
		if (error instanceof CommanderError && error.code === 'commander.helpDisplayed') {
			return
		}
		throw error
	}
}

if (import.meta.main) {
	runCli().catch((error) => {
		const message = error instanceof Error ? error.message : 'CLI failure'
		console.error(message)
		process.exitCode = 1
	})
}
