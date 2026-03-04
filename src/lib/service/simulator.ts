import { compareSetups, simulateSetup } from '@/lib/engine'
import { buildOptimizedVariant } from '@/lib/engine/optimize'
import { parseSetupInput } from '@/lib/input'
import type { ComparisonResult, SetupConfig, SimulationMode, SimulationOptions, SimulationResult } from '@/lib/types'

export interface RunSimulationInput {
	input: unknown
	mode: SimulationMode
	options?: SimulationOptions
}

export interface CompareSimulationInput {
	baseline: unknown
	variant: unknown
	mode: SimulationMode
	options?: SimulationOptions
}

export const resolveSetup = (input: unknown): SetupConfig => {
	return parseSetupInput(input)
}

export const runSimulation = ({ input, mode, options }: RunSimulationInput): SimulationResult => {
	const setup = resolveSetup(input)
	return simulateSetup(setup, mode, options)
}

export const runComparison = ({
	baseline,
	variant,
	mode,
	options,
}: CompareSimulationInput): ComparisonResult => {
	const baselineSetup = resolveSetup(baseline)
	const variantSetup = resolveSetup(variant)
	return compareSetups(baselineSetup, variantSetup, mode, options)
}

export const runOptimizedComparison = ({
	input,
	mode,
	options,
}: RunSimulationInput): ComparisonResult => {
	const baselineSetup = resolveSetup(input)
	const baselineResult = simulateSetup(baselineSetup, mode, options)
	const variantSetup = buildOptimizedVariant(baselineSetup, baselineResult.recommendations)
	const variantResult = simulateSetup(variantSetup, mode, options)
	return {
		...compareSetups(baselineSetup, variantSetup, mode, options),
		baseline: baselineResult,
		variant: variantResult,
	}
}
